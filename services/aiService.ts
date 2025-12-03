
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AudioFile, ID3Tags, AnalysisSettings } from '../types';
import { getCachedAnalysis, cacheAnalysisResult } from './cacheService';

export type AIProvider = 'gemini' | 'grok' | 'openai';

export interface ApiKeys {
  grok: string;
  openai: string;
}

// --- SYSTEM INSTRUCTIONS ---

const getSystemInstruction = (settings?: AnalysisSettings) => {
  const modeInstruction = settings?.mode === 'creative' 
    ? "You are allowed to be more interpretive with genres and moods." 
    : "Be strict and factual. Do not hallucinate.";

  return `You are "Lumbago Supervisor", an elite music archivist and DJ librarian AI.
Your goal is to repair, organize, and enrich metadata for music files with professional accuracy, specifically for DJs and collectors.

CAPABILITIES:
1.  **Google Search Grounding:** You MUST use the provided Google Search tool to verify facts. Do not guess release dates or tracklists. Search for "Artist Title Discogs", "Artist Album Beatport", or "Artist Title MusicBrainz" to confirm data.
2.  **Context Awareness:** You will receive batches of files grouped by folder. Treat them as a coherent release (Album/EP) unless obvious otherwise. Ensure consistency for 'Album', 'Year', 'Album Artist', 'Genre', and 'Label' across the group.

RULES:
-   ${modeInstruction}
-   **Prioritize Original Releases:** Unless it's explicitly a "Greatest Hits", try to tag against the original studio album or single release.
-   **Format:** Return pure JSON Array.
-   **Confidence:** Set 'confidence' to 'high' ONLY if you verified the data with Google Search.
-   **No Hallucinations:** If a field (like ISRC or Composer) is impossible to find, leave it empty.

SCHEMA EXPLANATION:
-   trackNumber: Format as "X" or "X/Total".
-   initialKey: Camelot notation (e.g., "11B").
-   energy: 1 (Chill) to 10 (Banger).
-   danceability: 1 (Ambient) to 10 (Club).
`;
};

// --- HELPER FUNCTIONS ---

const callGeminiWithRetry = async (
    apiCall: () => Promise<GenerateContentResponse>,
    maxRetries = 3
): Promise<GenerateContentResponse> => {
    let lastError: Error | null = null;
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await apiCall();
        } catch (error: any) {
            lastError = error;
            // Don't retry on 400s (bad request) or auth errors, only 500s or network
            if (error.status === 400 || error.status === 401 || error.status === 403) throw error;
            
            console.warn(`Gemini API Error (Attempt ${i + 1}/${maxRetries}):`, error.message);
            const delay = Math.pow(2, i) * 1000 + (Math.random() * 500);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw lastError || new Error("API call failed after retries");
};

// --- CORE ANALYZER ---

export const fetchTagsForFile = async (
    fileName: string,
    originalTags: ID3Tags,
    provider: AIProvider,
    apiKeys: ApiKeys,
    settings?: AnalysisSettings
): Promise<ID3Tags> => {
    // For single file, we wrap it in a pseudo-batch of 1
    const result = await smartBatchAnalyze([{
        id: 'temp', 
        file: new File([], fileName), 
        originalTags: originalTags, 
        state: 'PENDING' 
    } as AudioFile], provider, apiKeys, false, settings);
    
    return result[0] || originalTags;
};

/**
 * SMART BATCH ANALYZER
 * Groups files by directory context to save tokens and ensure consistency.
 * Implements Caching Strategy to save tokens on repeated calls.
 */
export const smartBatchAnalyze = async (
    files: AudioFile[],
    provider: AIProvider,
    apiKeys: ApiKeys,
    forceUpdate: boolean = false,
    settings?: AnalysisSettings
): Promise<ID3Tags[]> => {
    if (provider !== 'gemini') {
        throw new Error("Only Gemini supports advanced Smart Batching currently.");
    }
    if (!process.env.API_KEY) {
        throw new Error("Missing Gemini API_KEY.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const finalResultsMap: Record<string, ID3Tags> = {};
    const filesToFetch: AudioFile[] = [];

    // 1. Check Cache First (Optimization)
    if (!forceUpdate) {
        files.forEach(f => {
            const cached = getCachedAnalysis(f.file);
            if (cached) {
                finalResultsMap[f.id] = cached;
            } else {
                filesToFetch.push(f);
            }
        });
    } else {
        // If forcing update, process all files
        files.forEach(f => filesToFetch.push(f));
    }

    // If everything is cached, return immediately
    if (filesToFetch.length === 0) {
        return files.map(f => finalResultsMap[f.id]);
    }

    // 2. Group remaining files by folder (Context Grouping)
    const groups: Record<string, AudioFile[]> = {};
    filesToFetch.forEach(f => {
        const pathParts = f.webkitRelativePath?.split('/') || [];
        const parentFolder = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') : 'root';
        if (!groups[parentFolder]) groups[parentFolder] = [];
        groups[parentFolder].push(f);
    });

    // 3. Process each group via API
    const groupKeys = Object.keys(groups);
    for (const groupKey of groupKeys) {
        const groupFiles = groups[groupKey];
        
        // Split huge folders into chunks of 20 to avoid output token limits
        const CHUNK_SIZE = 20;
        for (let i = 0; i < groupFiles.length; i += CHUNK_SIZE) {
            const chunk = groupFiles.slice(i, i + CHUNK_SIZE);
            
            // Construct Prompt
            const fileListStr = chunk.map(f => {
                const existing = f.originalTags.artist ? `${f.originalTags.artist} - ${f.originalTags.title}` : '';
                return `- Filename: "${f.file.name}" | Hints: ${existing}`;
            }).join('\n');

            const folderContext = groupKey !== 'root' ? `These files are in folder: "${groupKey}". Use this to infer Album/Artist.` : "These files are loose/flat files.";

            // Dynamic Schema Construction based on Settings
            const fields = settings?.fields || { bpm: true, key: true, genre: true, year: true, label: true, energy: true, danceability: true, mood: true, isrc: false };
            
            let schemaJson = `
{
  "originalFilename": "string (EXACT match from input)",
  "artist": "string",
  "title": "string",
  "album": "string",`;
            
            if (fields.year) schemaJson += `\n  "year": "string",`;
            if (fields.genre) schemaJson += `\n  "genre": "string",`;
            if (fields.bpm) schemaJson += `\n  "bpm": number (integer),`;
            if (fields.key) schemaJson += `\n  "initialKey": "string (Camelot)",`;
            if (fields.energy) schemaJson += `\n  "energy": number (1-10),`;
            if (fields.danceability) schemaJson += `\n  "danceability": number (1-10),`;
            if (fields.mood) schemaJson += `\n  "mood": "string",`;
            if (fields.label) schemaJson += `\n  "recordLabel": "string",`;
            if (fields.isrc) schemaJson += `\n  "isrc": "string",`;

            schemaJson += `\n  "albumCoverUrl": "string (URL found via search)",
  "confidence": "high" | "medium" | "low"
}`;

            const prompt = `
CONTEXT: ${folderContext}
TASK: Analyze these ${chunk.length} audio files.
Use Google Search to confirm details. Look for Beatport, Discogs, or MusicBrainz data.

IMPORTANT: You must return valid JSON ONLY. Output a JSON Array of objects.
Do not use markdown code blocks like \`\`\`json. Just the raw JSON string.

Requested Schema per item:
${schemaJson}

FILES:
${fileListStr}
            `;

            try {
                // Determine model based on mode
                let modelName = "gemini-2.5-flash";
                if (settings?.mode === 'accurate') {
                    // Could switch to Pro if available/needed, staying on Flash for now but with different params
                    // modelName = "gemini-1.5-pro"; 
                }

                const response = await callGeminiWithRetry(() => 
                    ai.models.generateContent({
                        model: modelName,
                        contents: prompt,
                        config: {
                            systemInstruction: getSystemInstruction(settings),
                            tools: [{ googleSearch: {} }], // ENABLE INTERNET ACCESS
                            temperature: settings?.mode === 'creative' ? 0.7 : 0.1,
                        }
                    })
                );

                let text = response.text || "[]";
                
                // Sanitize JSON output: remove markdown code blocks
                text = text.replace(/```json\n?/g, '').replace(/```/g, '').trim();

                let parsed: any[] = [];
                try {
                    parsed = JSON.parse(text);
                } catch(e) {
                    console.error("JSON Parse Error", text);
                    // Attempt to extract array if buried in text
                    const match = text.match(/\[.*\]/s);
                    if (match) {
                        try {
                            parsed = JSON.parse(match[0]);
                        } catch(e2) {
                            console.error("Failed to recover JSON", e2);
                        }
                    }
                }

                if (!Array.isArray(parsed)) {
                    console.warn("AI response was not an array", parsed);
                    parsed = [];
                }

                // Map results back to original files
                chunk.forEach(originalFile => {
                    const match = parsed.find((p: any) => p.originalFilename === originalFile.file.name);
                    if (match) {
                        // Cleanup empty fields
                        Object.keys(match).forEach(key => {
                            if (match[key] === null || match[key] === "") delete match[key];
                        });
                        delete match.originalFilename;
                        
                        const resultTag: ID3Tags = { 
                            ...match, 
                            dataOrigin: forceUpdate ? 'google-search' : 'ai-inference' 
                        };
                        
                        // Save to Cache
                        cacheAnalysisResult(originalFile.file, resultTag);
                        
                        finalResultsMap[originalFile.id] = resultTag;
                    } else {
                        // Fallback
                        finalResultsMap[originalFile.id] = originalFile.originalTags;
                    }
                });

            } catch (err) {
                console.error(`Error processing batch group ${groupKey}:`, err);
                chunk.forEach(f => {
                    finalResultsMap[f.id] = f.originalTags;
                });
            }
        }
    }

    return files.map(f => finalResultsMap[f.id]);
};

// Re-export for compatibility
export const fetchTagsForBatch = async (files: AudioFile[], provider: AIProvider, keys: ApiKeys, settings?: AnalysisSettings) => {
    const tags = await smartBatchAnalyze(files, provider, keys, false, settings);
    return tags.map((t, idx) => ({ ...t, originalFilename: files[idx].file.name }));
};

// --- IMAGE GENERATION ---

export const generateCoverArt = async (prompt: string, size: '1K' | '2K'): Promise<string> => {
    if (!process.env.API_KEY) {
        throw new Error("Brak klucza API Gemini.");
    }

    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-image-preview',
            contents: {
                parts: [{ text: prompt }],
            },
            config: {
                imageConfig: {
                    aspectRatio: "1:1",
                    imageSize: size
                },
            },
        });

        // Parse response to find the image part
        if (response.candidates && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData && part.inlineData.data) {
                    return `data:image/png;base64,${part.inlineData.data}`;
                }
            }
        }
        
        throw new Error("Model nie zwrócił danych obrazu.");

    } catch (error: any) {
        console.error("Image Generation Error:", error);
        throw new Error(error.message || "Nie udało się wygenerować okładki.");
    }
};
