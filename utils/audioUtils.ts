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

export const applyID3Tags = async (file: File, tags: ID3Tags): Promise<Blob> => {
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
    
    // Handle album cover
    if (tags.albumCoverUrl) {
        try {
            let coverBuffer: ArrayBuffer;
            if (tags.albumCoverUrl.startsWith('data:')) {
                coverBuffer = dataURLToArrayBuffer(tags.albumCoverUrl);
            } else {
                // Using a CORS proxy for external URLs. This is unreliable and for demonstration only.
                // A proper implementation would use a server-side proxy.
                const proxyUrl = 'https://api.allorigins.win/raw?url=';
                const response = await fetch(proxyUrl + encodeURIComponent(tags.albumCoverUrl));
                if (!response.ok) {
                    throw new Error(`Nie udało się pobrać okładki: ${response.statusText}`);
                }
                coverBuffer = await response.arrayBuffer();
            }
            writer.setFrame('APIC', {
                type: 3, // 'Cover (front)'
                data: coverBuffer,
                description: 'Cover',
            });
        } catch (error) {
            console.warn("Nie można przetworzyć okładki albumu:", error);
            // Don't let a failed cover download stop the whole process.
            // The rest of the tags will still be written.
        }
    }

    writer.addTag();
    return writer.getBlob();
};