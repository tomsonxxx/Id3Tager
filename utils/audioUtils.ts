// Fix: Provide full implementation for audio utility functions.
import { ID3Tags } from '../types';

// Assume jsmediatags is loaded globally via a <script> tag
declare const jsmediatags: any;
// Assume ID3Writer is loaded globally via a <script> tag
declare const ID3Writer: any;

export const readID3Tags = (file: File): Promise<ID3Tags> => {
  return new Promise((resolve, reject) => {
    if (typeof jsmediatags === 'undefined') {
      console.warn('jsmediatags library not found. Returning empty tags.');
      return resolve({});
    }

    jsmediatags.read(file, {
      onSuccess: (tag: any) => {
        const tags: ID3Tags = {};
        if (tag.tags.artist) tags.artist = tag.tags.artist;
        if (tag.tags.title) tags.title = tag.tags.title;
        if (tag.tags.album) tags.album = tag.tags.album;
        if (tag.tags.year) tags.year = tag.tags.year;
        if (tag.tags.genre) tags.genre = tag.tags.genre;
        
        // Custom frames might not be parsed by default, but we check common ones
        if (tag.tags.TMOO) tags.mood = tag.tags.TMOO.data;
        if (tag.tags.COMM) tags.comments = tag.tags.COMM.data.text;
        
        if (tag.tags.picture) {
            const { data, format } = tag.tags.picture;
            let base64String = "";
            for (let i = 0; i < data.length; i++) {
                base64String += String.fromCharCode(data[i]);
            }
            tags.albumCoverUrl = `data:${format};base64,${window.btoa(base64String)}`;
        }
        
        resolve(tags);
      },
      onError: (error: any) => {
        console.error('Error reading ID3 tags:', error);
        // Resolve with empty tags on error instead of rejecting, to not block the flow
        resolve({});
      },
    });
  });
};

// Helper to convert base64 data URL to ArrayBuffer
const dataURLToArrayBuffer = (dataURL: string) => {
  const base64 = dataURL.split(',')[1];
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

// Helper function to proxy image URLs to avoid CORS issues
export const proxyImageUrl = (url: string | undefined): string | undefined => {
    if (!url || url.startsWith('data:')) {
        return url;
    }
    // Using a reliable CORS proxy.
    return `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
};

export const applyID3Tags = async (file: File, tags: ID3Tags, onProgress?: (progress: number) => void): Promise<Blob> => {
    if (typeof ID3Writer === 'undefined') {
        throw new Error("Biblioteka do zapisu tagów (ID3Writer) nie została załadowana.");
    }
    
    // js-id3-writer only supports MP3 files.
    if (file.type !== 'audio/mpeg' && file.type !== 'audio/mp3') {
        throw new Error(`Zapis tagów dla typu pliku "${file.type}" nie jest obsługiwany. Obecnie wspierany jest tylko format MP3.`);
    }

    const buffer = await file.arrayBuffer();
    const writer = new ID3Writer(buffer);

    if (tags.title) writer.setFrame('TIT2', tags.title);
    if (tags.artist) writer.setFrame('TPE1', [tags.artist]);
    if (tags.album) writer.setFrame('TALB', tags.album);
    if (tags.year) writer.setFrame('TYER', tags.year);
    if (tags.genre) writer.setFrame('TCON', [tags.genre]);
    if (tags.mood) writer.setFrame('TMOO', tags.mood);
    if (tags.comments) writer.setFrame('COMM', { description: 'Comment', text: tags.comments });
    
    // Handle album cover
    if (tags.albumCoverUrl) {
        try {
            let coverBuffer: ArrayBuffer;
            if (tags.albumCoverUrl.startsWith('data:')) {
                coverBuffer = dataURLToArrayBuffer(tags.albumCoverUrl);
            } else {
                onProgress?.(0);
                const proxiedUrl = proxyImageUrl(tags.albumCoverUrl);
                const response = await fetch(proxiedUrl!);
                if (!response.ok) {
                    throw new Error(`Nie udało się pobrać okładki: ${response.statusText}`);
                }

                if (!response.body) {
                    coverBuffer = await response.arrayBuffer();
                } else {
                    const contentLength = Number(response.headers.get('content-length'));
                    if (!contentLength) {
                        console.warn("Brak nagłówka content-length, nie można śledzić postępu pobierania okładki.");
                        coverBuffer = await response.arrayBuffer();
                    } else {
                        const reader = response.body.getReader();
                        let receivedLength = 0;
                        const chunks: Uint8Array[] = [];
                        while(true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            chunks.push(value);
                            receivedLength += value.length;
                            onProgress?.(Math.round((receivedLength / contentLength) * 100));
                        }
                        
                        const chunksAll = new Uint8Array(receivedLength);
                        let position = 0;
                        for(let chunk of chunks) {
                            chunksAll.set(chunk, position);
                            position += chunk.length;
                        }
                        coverBuffer = chunksAll.buffer;
                    }
                }
            }
            onProgress?.(100);
            writer.setFrame('APIC', {
                type: 3, // 'Cover (front)'
                data: coverBuffer,
                description: 'Cover',
            });
        } catch (error) {
            console.warn("Nie można przetworzyć okładki albumu:", error);
            onProgress?.(100); // Ensure progress completes even on error
        }
    }

    writer.addTag();
    return writer.getBlob();
};