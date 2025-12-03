
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { AudioFile, ID3Tags } from '../types';
import { getCachedAnalysis, cacheAnalysisResult } from './cacheService';

export type AIProvider = 'gemini' | 'grok' | 'openai';

export interface ApiKeys {
  grok: string;
  openai: string;
}

// --- SYSTEM INSTRUCTIONS ---

const getSystemInstruction = () => {
  return `You are "Lumbago Supervisor", an elite music archivist and DJ librarian AI.
Your goal is to repair, organize, and enrich metadata for music files with professional accuracy, specifically for DJs and collectors.

CAPABILITIES:
1.  **Google Search Grounding:** You MUST use the provided Google Search tool to verify facts. Do not guess release dates or tracklists. Search for "Artist Title Discogs", "Artist Album Beatport", or "Artist Title MusicBrainz" to confirm data.
2.  **DJ Technical Data:** You must attempt to find technical details used by DJs:
    *   **BPM:** Beats Per Minute (Integer).
    *   **Initial Key:** Use Camelot Notation (e.g., "11B", "8A") if available.
    *   **Energy & Danceability:** Estimate these values on a scale of 1-10 based on the track's genre and characteristics.
    *   **Label:** The Record Label for the specific release.
3.  **Context Awareness:** You will receive batches of files grouped by folder. Treat them as a coherent release (Album/EP) unless obvious otherwise. Ensure consistency for 'Album', 'Year', 'Album Artist', 'Genre', and 'Label' across the group.

RULES:
-   **Prioritize Original Releases:** Unless it's explicitly a "Greatest Hits", try to tag against the original studio album or single release.
-   **Format:** Return pure JSON Array.
-   **Confidence:** Set 'confidence' to 'high' ONLY if you verified the data with Google Search.
-   **No Hallucinations:** If a field (like ISRC or Composer) is impossible to find, leave it empty.

SCHEMA EXPLANATION:
-   trackNumber: Format as "X" or "X/Total".
-   isrc: The International Standard Recording Code.
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
    apiKeys: ApiKeys
): Promise<ID3Tags> => {
    // For single file, we wrap it in a pseudo-batch of 1
    const result = await smartBatchAnalyze([{
        id: 'temp', 
        file: new File([], fileName), 
        originalTags: originalTags, 
        state: 'PENDING' 
    } as AudioFile], provider, apiKeys);
    
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
    forceUpdate: boolean = false
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

            const prompt = `
CONTEXT: ${folderContext}
TASK: Analyze these ${chunk.length} audio files.
Use Google Search to confirm details. Look for Beatport, Discogs, or MusicBrainz data for BPM, Key, Energy, and Label.

IMPORTANT: You must return valid JSON ONLY. Output a JSON Array of objects.
Do not use markdown code blocks like \`\`\`json. Just the raw JSON string.

Schema per item:
{
  "originalFilename": "string (EXACT match from input)",
  "artist": "string",
  "title": "string",
  "album": "string",
  "year": "string",
  "genre": "string",
  "bpm": number (integer),
  "initialKey": "string (Camelot)",
  "energy": number (1-10),
  "danceability": number (1-10),
  "recordLabel": "string",
  "albumCoverUrl": "string (URL found via search)",
  "confidence": "high" | "medium" | "low"
}

FILES:
${fileListStr}
            `;

            try {
                const response = await callGeminiWithRetry(() => 
                    ai.models.generateContent({
                        model: "gemini-2.5-flash",
                        contents: prompt,
                        config: {
                            systemInstruction: getSystemInstruction(),
                            tools: [{ googleSearch: {} }], // ENABLE INTERNET ACCESS
                            // CRITICAL: responseMimeType: 'application/json' IS NOT SUPPORTED WITH TOOLS.
                            // We rely on the prompt to enforce JSON structure.
                        }
                    })
                );

                let text = response.text || "[]";
                
                // Sanitize JSON output: remove markdown code blocks if the model ignores the "no markdown" instruction
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

                // Map results back to original files (order isn't guaranteed, use filename)
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
                        
                        // Save to Cache for future use
                        cacheAnalysisResult(originalFile.file, resultTag);
                        
                        finalResultsMap[originalFile.id] = resultTag;
                    } else {
                        // Fallback: return original tags if AI skipped it
                        finalResultsMap[originalFile.id] = originalFile.originalTags;
                    }
                });

            } catch (err) {
                console.error(`Error processing batch group ${groupKey}:`, err);
                // On error, push nulls or originals so we don't crash
                chunk.forEach(f => {
                    finalResultsMap[f.id] = f.originalTags;
                });
            }
        }
    }

    // Return results in the original order
    return files.map(f => finalResultsMap[f.id]);
};

// Re-export for compatibility
export const fetchTagsForBatch = async (files: AudioFile[], provider: AIProvider, keys: ApiKeys) => {
    const tags = await smartBatchAnalyze(files, provider, keys);
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
                // Do NOT set responseMimeType or tools for image generation models like this one
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
