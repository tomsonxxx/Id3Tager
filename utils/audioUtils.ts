// Fix: Provide full implementation for audio utility functions.
import { ID3Tags, AudioFile } from '../types';

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
        if (tag.tags.track) tags.trackNumber = tag.tags.track;
        if (tag.tags.TPE2) tags.albumArtist = tag.tags.TPE2.data;
        if (tag.tags.TCOM) tags.composer = tag.tags.TCOM.data;
        if (tag.tags.TCOP) tags.copyright = tag.tags.TCOP.data;
        if (tag.tags.TENC) tags.encodedBy = tag.tags.TENC.data;
        if (tag.tags.TOPE) tags.originalArtist = tag.tags.TOPE.data;
        if (tag.tags.TPOS) tags.discNumber = tag.tags.TPOS.data;

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
    // Using a more reliable CORS proxy.
    return `https://corsproxy.io/?${encodeURIComponent(url)}`;
};

export const applyID3Tags = async (file: File, tags: ID3Tags): Promise<Blob> => {
    if (typeof ID3Writer === 'undefined') {
        throw new Error("Biblioteka do zapisu tagów (ID3Writer) nie została załadowana.");
    }
    
    // js-id3-writer only supports MP3 files.
    if (file.type !== 'audio/mpeg' && file.type !== 'audio/mp3') {
        throw new Error(`Zapis tagów jest możliwy tylko dla plików MP3. Ten plik ma format '${file.type}'.`);
    }

    const buffer = await file.arrayBuffer();
    const writer = new ID3Writer(buffer);

    if (tags.title) writer.setFrame('TIT2', tags.title);
    if (tags.artist) writer.setFrame('TPE1', [tags.artist]);
    if (tags.album) writer.setFrame('TALB', tags.album);
    if (tags.year) writer.setFrame('TYER', tags.year);
    if (tags.genre) writer.setFrame('TCON', [tags.genre]);
    if (tags.trackNumber) writer.setFrame('TRCK', tags.trackNumber);
    if (tags.albumArtist) writer.setFrame('TPE2', [tags.albumArtist]);
    if (tags.mood) writer.setFrame('TMOO', tags.mood);
    if (tags.comments) writer.setFrame('COMM', { description: 'Comment', text: tags.comments });
    if (tags.composer) writer.setFrame('TCOM', [tags.composer]);
    if (tags.copyright) writer.setFrame('TCOP', tags.copyright);
    if (tags.encodedBy) writer.setFrame('TENC', tags.encodedBy);
    if (tags.originalArtist) writer.setFrame('TOPE', [tags.originalArtist]);
    if (tags.discNumber) writer.setFrame('TPOS', tags.discNumber);
    
    // Handle album cover
    if (tags.albumCoverUrl) {
        try {
            let coverBuffer: ArrayBuffer;
            if (tags.albumCoverUrl.startsWith('data:')) {
                coverBuffer = dataURLToArrayBuffer(tags.albumCoverUrl);
            } else {
                const proxiedUrl = proxyImageUrl(tags.albumCoverUrl);
                const response = await fetch(proxiedUrl!);
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


/**
 * Saves a file directly to the user's filesystem using the File System Access API.
 * Handles writing tags for MP3s and renaming for all file types, including creating subdirectories.
 * @param dirHandle The handle to the root directory for saving.
 * @param audioFile The file object from the application state.
 * @returns An object indicating success and the updated file object for state management.
 */
export const saveFileDirectly = async (
  dirHandle: any, // FileSystemDirectoryHandle
  audioFile: AudioFile
): Promise<{ success: boolean; updatedFile?: AudioFile; errorMessage?: string }> => {
  try {
    const isMp3 = audioFile.file.type === 'audio/mpeg' || audioFile.file.type === 'audio/mp3';
    
    if (!audioFile.handle) {
      throw new Error("Brak referencji do pliku (file handle). Nie można zapisać, ponieważ plik nie pochodzi z trybu bezpośredniego dostępu.");
    }
    
    let blobToSave: Blob;
    let performedTagWrite = false;

    // Only attempt to write ID3 tags for MP3 files that have new tags.
    if (isMp3 && audioFile.fetchedTags) {
      try {
        blobToSave = await applyID3Tags(audioFile.file, audioFile.fetchedTags);
        performedTagWrite = true;
      } catch (tagError) {
        console.warn(`Nie udało się zapisać tagów dla ${audioFile.file.name}, plik zostanie tylko przemianowany. Błąd:`, tagError);
        blobToSave = audioFile.file;
      }
    } else {
      blobToSave = audioFile.file;
    }

    const needsRename = audioFile.newName && audioFile.newName !== audioFile.webkitRelativePath;

    if (!needsRename && !performedTagWrite) {
      return { success: true, updatedFile: audioFile };
    }

    // SCENARIO 1: RENAME / MOVE
    if (needsRename) {
      const newPath = audioFile.newName!;
      const pathParts = newPath.split('/').filter(p => p && p !== '.');
      const filename = pathParts.pop();

      if (!filename) {
          throw new Error(`Wygenerowana nazwa pliku jest nieprawidłowa: ${newPath}`);
      }

      let currentDirHandle = dirHandle;
      for (const part of pathParts) {
        currentDirHandle = await currentDirHandle.getDirectoryHandle(part, { create: true });
      }
      
      const newHandle = await currentDirHandle.getFileHandle(filename, { create: true });
      const writable = await newHandle.createWritable();
      await writable.write(blobToSave);
      await writable.close();
      
      // After successfully creating the new file, remove the old one from its original path.
      try {
        const originalPath = audioFile.webkitRelativePath;
        if (originalPath && originalPath !== newPath) {
             const originalPathParts = originalPath.split('/').filter(p => p);
             const originalFilename = originalPathParts.pop();
             
             if (originalFilename) {
                let parentDirHandle = dirHandle;
                for (const part of originalPathParts) {
                    parentDirHandle = await parentDirHandle.getDirectoryHandle(part, { create: false });
                }
                await parentDirHandle.removeEntry(originalFilename);
             }
        }
      } catch(removeError: any) {
         console.warn(`Wystąpił błąd podczas usuwania oryginalnego pliku '${audioFile.webkitRelativePath}':`, removeError);
      }

      const newFile = await newHandle.getFile();
      return { 
        success: true, 
        updatedFile: { 
            ...audioFile, 
            file: newFile, 
            handle: newHandle, 
            newName: newPath,
            webkitRelativePath: newPath // Update the path for future operations
        }
      };
    
    // SCENARIO 2: OVERWRITE IN PLACE (only tags changed, no rename)
    } else {
      const writable = await audioFile.handle.createWritable({ keepExistingData: false });
      await writable.write(blobToSave);
      await writable.close();
      
      const updatedCoreFile = await audioFile.handle.getFile();
      return { 
        success: true, 
        updatedFile: { ...audioFile, file: updatedCoreFile }
      };
    }
  } catch (err: any) {
    console.error(`Nie udało się zapisać pliku ${audioFile.file.name}:`, err);
    return { success: false, errorMessage: err.message || "Wystąpił nieznany błąd zapisu." };
  }
};
