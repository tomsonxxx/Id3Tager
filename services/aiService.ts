// Fix: Provide full implementation for the AI service using Gemini API.
import { GoogleGenAI, Type } from "@google/genai";
import { AudioFile, ID3Tags } from '../types';

export type AIProvider = 'gemini' | 'grok' | 'openai';

export interface ApiKeys {
  grok: string;
  openai: string;
}

const getSystemInstruction = () => {
  return `You are an expert music archivist with access to a vast database of music information, equivalent to searching across major portals like MusicBrainz, Discogs, AllMusic, Spotify, and Apple Music.
Your task is to identify the song from the provided filename and any existing tags, and then provide the most accurate and complete ID3 tag information possible.
- Analyze the filename and existing tags to identify the track.
- Search your knowledge base for the definitive artist, title, album, release year, and genre.
- Determine the overall 'mood' of the song (e.g., energetic, melancholic, calm, epic).
- Provide brief 'comments' about the song (e.g., "Classic 80s rock anthem with a memorable guitar solo.").
- VERY IMPORTANT: Prioritize the original studio album the song was first released on. Avoid 'Greatest Hits' compilations, singles, or re-releases unless it's the only available source.
- Find a URL for a high-quality (at least 500x500 pixels) front cover of the album.
- Infer the typical audio properties for this release, such as 'bitrate' (in kbps, e.g., 320) and 'sampleRate' (in Hz, e.g., 44100).
- If you cannot confidently determine a piece of information, leave the corresponding field empty or null. Do not guess.
The response must be in JSON format.`;
};

const singleFileResponseSchema = {
    type: Type.OBJECT,
    properties: {
        artist: { type: Type.STRING, description: "The name of the main artist or band." },
        title: { type: Type.STRING, description: "The official title of the song." },
        album: { type: Type.STRING, description: "The name of the original studio album." },
        year: { type: Type.STRING, description: "The 4-digit release year of the original album or song." },
        genre: { type: Type.STRING, description: "The primary genre of the music." },
        albumCoverUrl: { type: Type.STRING, description: "A direct URL to a high-quality album cover image." },
        mood: { type: Type.STRING, description: "The overall mood or feeling of the song." },
        comments: { type: Type.STRING, description: "Brief interesting facts or description about the song." },
        bitrate: { type: Type.NUMBER, description: "The typical bitrate in kbps for the release (e.g., 320)." },
        sampleRate: { type: Type.NUMBER, description: "The typical sample rate in Hz for the release (e.g., 44100)." },
    },
};

const batchFileResponseSchema = {
    type: Type.ARRAY,
    description: "An array of objects, each containing the tags for a single song from the input list.",
    items: {
        type: Type.OBJECT,
        properties: {
            originalFilename: { type: Type.STRING, description: "The original filename provided in the prompt, used for mapping the results back." },
            ...singleFileResponseSchema.properties
        },
        required: ["originalFilename"],
    }
};


export const fetchTagsForFile = async (
  fileName: string,
  originalTags: ID3Tags,
  provider: AIProvider,
  apiKeys: ApiKeys
): Promise<ID3Tags> => {
  if (provider === 'gemini') {
    // Fix: Per guidelines, API key MUST come from process.env.API_KEY
    if (!process.env.API_KEY) {
      throw new Error("Klucz API Gemini nie jest skonfigurowany w zmiennych środowiskowych (API_KEY).");
    }
    // Fix: Use the correct Gemini API initialization.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const prompt = `Identify this song and provide its tags. Filename: "${fileName}". Existing tags: ${JSON.stringify(originalTags)}.`;
    
    try {
        // Fix: Use the correct method to generate content with JSON response.
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction: getSystemInstruction(),
                responseMimeType: "application/json",
                responseSchema: singleFileResponseSchema,
            },
        });

        // Fix: Access the response text correctly.
        const text = response.text.trim();
        let parsedResponse: Partial<ID3Tags>;

        try {
            parsedResponse = JSON.parse(text);
        } catch (e) {
            console.error("Nie udało się sparsować JSON z Gemini:", text);
            throw new Error("Otrzymano nieprawidłowy format JSON z AI.");
        }

        const mergedTags: ID3Tags = {
            ...originalTags,
            ...parsedResponse
        };

        // Clean up empty strings or nulls from AI response
        Object.keys(mergedTags).forEach(key => {
            const typedKey = key as keyof ID3Tags;
            if (mergedTags[typedKey] === "" || mergedTags[typedKey] === null) {
                delete mergedTags[typedKey];
            }
        });

        return mergedTags;

    } catch (error) {
        console.error("Błąd podczas pobierania tagów z Gemini API:", error);
        if (error instanceof Error) {
           throw new Error(`Błąd Gemini API: ${error.message}`);
        }
        throw new Error("Wystąpił nieznany błąd z Gemini API.");
    }
  } else {
    // Placeholder for other providers
    console.warn(`${provider} provider is not implemented. Returning original tags.`);
    return Promise.resolve(originalTags);
  }
};

export interface BatchResult extends ID3Tags {
    originalFilename: string;
}

export const fetchTagsForBatch = async (
    files: AudioFile[],
    provider: AIProvider,
    apiKeys: ApiKeys
): Promise<BatchResult[]> => {
    if (provider !== 'gemini') {
        throw new Error(`Dostawca ${provider} nie jest obsługiwany w trybie wsadowym.`);
    }
     if (!process.env.API_KEY) {
      throw new Error("Klucz API Gemini nie jest skonfigurowany w zmiennych środowiskowych (API_KEY).");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const fileList = files.map(f => JSON.stringify({ filename: f.file.name, existingTags: f.originalTags })).join(',\n');
    const prompt = `You are a music archivist. I have a batch of audio files that may be from the same album or artist. Please identify each track based on its filename and existing tags, and provide its full ID3 tags. Here is the list of files:\n\n[${fileList}]\n\nReturn your response as a JSON array. Each object in the array should correspond to one of the input files and contain the 'originalFilename' I provided, along with the identified tags: 'artist', 'title', 'album', 'year', 'genre', 'mood', 'comments', 'albumCoverUrl', 'bitrate', and 'sampleRate'. Be consistent with album and artist names across the batch if they seem related.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                systemInstruction: getSystemInstruction(),
                responseMimeType: "application/json",
                responseSchema: batchFileResponseSchema,
            },
        });
        
        const text = response.text.trim();
        const parsedResponse: BatchResult[] = JSON.parse(text);
        
        if (!Array.isArray(parsedResponse)) {
             throw new Error("Odpowiedź AI nie jest w formacie tablicy JSON.");
        }
        
        return parsedResponse;

    } catch (error) {
        console.error("Błąd podczas pobierania tagów wsadowo z Gemini API:", error);
        if (error instanceof Error) {
           throw new Error(`Błąd wsadowy Gemini API: ${error.message}`);
        }
        throw new Error("Wystąpił nieznany błąd wsadowy z Gemini API.");
    }
};