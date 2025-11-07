import { ID3Tags, AudioFile, ProcessingState } from '../types';

// Assume jsmediatags is loaded globally via a <script> tag
declare const jsmediatags: any;
// Assume ID3Writer is loaded globally via a <script> tag (for MP3)
declare const ID3Writer: any;
// Assume mp4TagWriter is loaded globally via a <script> tag (for M4A/MP4)
declare const mp4TagWriter: any;


/**
 * Checks if writing tags is supported for a given file type.
 * MP3 support is provided by 'js-id3-writer'.
 * M4A/MP4 support is provided by 'mp4-tag-writer'.
 * @param file The file to check.
 * @returns True if tag writing is supported, false otherwise.
 */
export const isTagWritingSupported = (file: File): boolean => {
    const supportedMimeTypes = [
        'audio/mpeg', // MP3
        'audio/mp3',
        'audio/mp4',  // M4A / MP4
        'audio/x-m4a'
    ];
    return supportedMimeTypes.includes(file.type);
};

export const readID3Tags = (file: File): Promise<ID3Tags> => {
  return new Promise((resolve, reject) => {
    if (typeof jsmediatags === 'undefined') {
      console.warn('jsmediatags library not found. Returning empty tags.');
      return resolve({});
    }
    
    // FIX: Proactively skip reading tags for WAV files. The jsmediatags library
    // does not support the RIFF info chunk format used by WAV files, which causes
    // a 'tagFormat' error. By skipping it, we avoid the error and proceed smoothly.
    const lowerCaseName = file.name.toLowerCase();
    if (file.type.startsWith('audio/wav') || file.type.startsWith('audio/x-wav') || lowerCaseName.endsWith('.wav') || lowerCaseName.endsWith('.wave')) {
        console.log(`Pomijanie odczytu tagów dla pliku WAV (${file.name}), ponieważ format nie jest w pełni obsługiwany przez bibliotekę odczytującą.`);
        return resolve({});
    }

    jsmediatags.read(file, {
      onSuccess: (tag: any) => {
        // jsmediatags attempts to unify tags, so we can check for common properties
        // regardless of the underlying format (ID3, Vorbis comment, MP4 atoms, etc.)
        const tags: ID3Tags = {};
        const tagData = tag.tags;

        if (tagData.title) tags.title = tagData.title;
        if (tagData.artist) tags.artist = tagData.artist;
        if (tagData.album) tags.album = tagData.album;
        if (tagData.year) tags.year = tagData.year;
        if (tagData.genre) tags.genre = tagData.genre;
        if (tagData.track) tags.trackNumber = tagData.track;
        if (tagData.comment) tags.comments = typeof tagData.comment === 'string' ? tagData.comment : tagData.comment.text;
        
        // Handling specific frames that might not be unified
        // TPE2 is Album Artist
        if (tagData.TPE2?.data) tags.albumArtist = tagData.TPE2.data;
        else if(tagData.ALBUMARTIST) tags.albumArtist = tagData.ALBUMARTIST; // For Vorbis comments (FLAC)

        // TPOS is Disc Number
        if (tagData.TPOS?.data) tags.discNumber = tagData.TPOS.data;
        else if(tagData.DISCNUMBER) tags.discNumber = tagData.DISCNUMBER;
        
        // Other specific frames
        if (tagData.TCOM?.data) tags.composer = tagData.TCOM.data;
        else if(tagData.COMPOSER) tags.composer = tagData.COMPOSER;

        if (tagData.TCOP?.data) tags.copyright = tagData.TCOP.data;
        else if(tagData.COPYRIGHT) tags.copyright = tagData.COPYRIGHT;
        
        if (tagData.TENC?.data) tags.encodedBy = tagData.TENC.data;
        if (tagData.TOPE?.data) tags.originalArtist = tagData.TOPE.data;
        if (tagData.TMOO?.data) tags.mood = tagData.TMOO.data; // Mood frame
        
        if (tagData.picture) {
            const { data, format } = tagData.picture;
            let base64String = "";
            for (let i = 0; i < data.length; i++) {
                base64String += String.fromCharCode(data[i]);
            }
            tags.albumCoverUrl = `data:${format};base64,${window.btoa(base64String)}`;
        }
        
        resolve(tags);
      },
      onError: (error: any) => {
        const errorType = error.type || 'Unknown';
        const errorInfo = error.info || 'No additional info';
        console.error(`Błąd podczas odczytu tagów z pliku ${file.name}: Typ błędu: ${errorType}, Info: ${errorInfo}`, error);
        // Resolve with empty tags on error to not block the flow
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
    return `https://corsproxy.io/?${encodeURIComponent(url)}`;
};


/**
 * Applies tags to an MP3 file using ID3Writer.
 * @param fileBuffer The ArrayBuffer of the MP3 file.
 * @param tags The tags to apply.
 * @returns An ArrayBuffer of the tagged MP3 file.
 */
const applyID3TagsToFile = async (fileBuffer: ArrayBuffer, tags: ID3Tags): Promise<ArrayBuffer> => {
    if (typeof ID3Writer === 'undefined') {
        throw new Error("Biblioteka do zapisu tagów MP3 (ID3Writer) nie została załadowana.");
    }
    const writer = new ID3Writer(fileBuffer);

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
    
    if (tags.albumCoverUrl) {
        try {
            let coverBuffer: ArrayBuffer;
            if (tags.albumCoverUrl.startsWith('data:')) {
                coverBuffer = dataURLToArrayBuffer(tags.albumCoverUrl);
            } else {
                const proxiedUrl = proxyImageUrl(tags.albumCoverUrl);
                const response = await fetch(proxiedUrl!);
                if (!response.ok) throw new Error(`Nie udało się pobrać okładki: ${response.statusText}`);
                coverBuffer = await response.arrayBuffer();
            }
            writer.setFrame('APIC', {
                type: 3, // 'Cover (front)'
                data: coverBuffer,
                description: 'Cover',
            });
        } catch (error) {
            console.warn(`Nie można przetworzyć okładki albumu z URL: '${tags.albumCoverUrl}'. Błąd:`, error);
        }
    }

    writer.addTag();
    return writer.arrayBuffer;
};

/**
 * Applies tags to an M4A/MP4 file using mp4-tag-writer.
 * @param fileBuffer The ArrayBuffer of the M4A/MP4 file.
 * @param tags The tags to apply.
 * @returns An ArrayBuffer of the tagged M4A/MP4 file.
 */
const applyMP4TagsToFile = async (fileBuffer: ArrayBuffer, tags: ID3Tags): Promise<ArrayBuffer> => {
    if (typeof mp4TagWriter === 'undefined') {
        throw new Error("Biblioteka do zapisu tagów M4A/MP4 (mp4-tag-writer) nie została załadowana.");
    }

    const writer = mp4TagWriter.create(fileBuffer);
    
    // Map ID3Tags to MP4 atoms
    if (tags.title) writer.setTag('©nam', tags.title);
    if (tags.artist) writer.setTag('©ART', tags.artist);
    if (tags.album) writer.setTag('©alb', tags.album);
    if (tags.year) writer.setTag('©day', tags.year);
    if (tags.genre) writer.setTag('©gen', tags.genre);
    if (tags.comments) writer.setTag('©cmt', tags.comments);
    if (tags.albumArtist) writer.setTag('aART', tags.albumArtist);
    if (tags.composer) writer.setTag('©wrt', tags.composer);
    if (tags.copyright) writer.setTag('cprt', tags.copyright);
    if (tags.encodedBy) writer.setTag('©enc', tags.encodedBy);
    
    // NEW: Add custom tags for 'mood' and 'originalArtist' for better compatibility with iTunes.
    // These are stored in generic "----" atoms with a reverse-DNS mean and a name.
    if (tags.mood) {
        writer.setTag('----', { mean: 'com.apple.iTunes', name: 'MOOD', data: tags.mood });
    }
    if (tags.originalArtist) {
        writer.setTag('----', { mean: 'com.apple.iTunes', name: 'ORIGINAL ARTIST', data: tags.originalArtist });
    }

    // Track and Disc numbers are special cases
    if (tags.trackNumber) {
        const parts = String(tags.trackNumber).split('/');
        const number = parseInt(parts[0], 10) || 0;
        const total = parts.length > 1 ? parseInt(parts[1], 10) : 0;
        writer.setTag('trkn', [number, total]);
    }
     if (tags.discNumber) {
        const parts = String(tags.discNumber).split('/');
        const number = parseInt(parts[0], 10) || 0;
        const total = parts.length > 1 ? parseInt(parts[1], 10) : 0;
        writer.setTag('disk', [number, total]);
    }
    
    if (tags.albumCoverUrl) {
         try {
            let coverBuffer: ArrayBuffer;
            if (tags.albumCoverUrl.startsWith('data:')) {
                coverBuffer = dataURLToArrayBuffer(tags.albumCoverUrl);
            } else {
                const proxiedUrl = proxyImageUrl(tags.albumCoverUrl);
                const response = await fetch(proxiedUrl!);
                if (!response.ok) throw new Error(`Nie udało się pobrać okładki: ${response.statusText}`);
                coverBuffer = await response.arrayBuffer();
            }
            writer.setTag('covr', coverBuffer);
        } catch (error) {
            console.warn(`Nie można przetworzyć okładki albumu dla M4A z URL: '${tags.albumCoverUrl}'. Błąd:`, error);
        }
    }

    return writer.write();
};

/**
 * Applies tags to an audio file, automatically detecting the format (MP3 or M4A/MP4).
 * @param file The original audio file.
 * @param tags The tags to apply.
 * @returns A Blob of the new file with tags applied.
 */
export const applyTags = async (file: File, tags: ID3Tags): Promise<Blob> => {
    if (!isTagWritingSupported(file)) {
        throw new Error(`Zapis tagów dla typu pliku '${file.type}' nie jest obsługiwany. Aplikacja wspiera MP3 i M4A/MP4.\n\nOperacje takie jak zmiana nazwy pliku będą działać poprawnie. Do edycji tagów w innych formatach zalecamy użycie dedykowanego oprogramowania, np. MusicBrainz Picard.`);
    }

    const fileBuffer = await file.arrayBuffer();
    let taggedBuffer: ArrayBuffer;

    const fileType = file.type;
    if (fileType === 'audio/mpeg' || fileType === 'audio/mp3') {
        taggedBuffer = await applyID3TagsToFile(fileBuffer, tags);
    } else if (fileType === 'audio/mp4' || fileType === 'audio/x-m4a') {
        taggedBuffer = await applyMP4TagsToFile(fileBuffer, tags);
    } else {
        // This case should be caught by the initial check, but is here for safety.
        throw new Error(`Nieoczekiwany typ pliku: ${fileType}`);
    }
    
    return new Blob([taggedBuffer], { type: file.type });
};


/**
 * Saves a file directly to the user's filesystem using the File System Access API.
 * This is the "brain" for saving, which intelligently decides whether to write tags
 * based on the file format.
 * @param dirHandle The handle to the root directory for saving.
 * @param audioFile The file object from the application state.
 * @returns An object indicating success and the updated file object for state management.
 */
export const saveFileDirectly = async (
  dirHandle: any, // FileSystemDirectoryHandle
  audioFile: AudioFile
): Promise<{ success: boolean; updatedFile?: AudioFile; errorMessage?: string }> => {
  try {
    const supportsTagWriting = isTagWritingSupported(audioFile.file);
    
    if (!audioFile.handle) {
      throw new Error("Brak referencji do pliku (file handle). Nie można zapisać, ponieważ plik nie pochodzi z trybu bezpośredniego dostępu.");
    }
    
    let blobToSave: Blob = audioFile.file;
    let performedTagWrite = false;

    // Intelligent Tag Writing: Only attempt to write tags for supported files.
    // For other formats (like FLAC), we proceed with just renaming/moving.
    if (supportsTagWriting && audioFile.fetchedTags) {
      try {
        blobToSave = await applyTags(audioFile.file, audioFile.fetchedTags);
        performedTagWrite = true;
      } catch (tagError) {
        console.warn(`Nie udało się zapisać tagów dla ${audioFile.file.name}, plik zostanie tylko przemianowany. Błąd:`, tagError);
        // Fallback to original blob if tagging fails
        blobToSave = audioFile.file;
      }
    }

    const needsRename = audioFile.newName && audioFile.newName !== audioFile.webkitRelativePath;

    // If no changes are needed (no rename and no tags written), we can skip.
    if (!needsRename && !performedTagWrite) {
      return { success: true, updatedFile: audioFile };
    }

    // --- RENAME / MOVE LOGIC (for all file types) ---
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
      
      // After successfully creating the new file, remove the old one.
      // If removal fails, we log a warning but still consider the operation a success
      // because the new file has been created.
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
         // Log a warning but do not treat this as a failure of the entire save operation.
         // The new file has been created successfully. The old file might just need manual cleanup.
         console.warn(`Nowy plik został pomyślnie zapisany w '${newPath}', ale nie udało się usunąć oryginalnego pliku '${audioFile.webkitRelativePath}'. Może być konieczne ręczne usunięcie. Błąd:`, removeError);
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
    
    // --- OVERWRITE IN PLACE (only tags changed for supported formats, no rename) ---
    } else if (performedTagWrite) {
      const writable = await audioFile.handle.createWritable({ keepExistingData: false });
      await writable.write(blobToSave);
      await writable.close();
      
      const updatedCoreFile = await audioFile.handle.getFile();
      return { 
        success: true, 
        updatedFile: { ...audioFile, file: updatedCoreFile }
      };
    }

    // Should not be reached, but as a fallback
    return { success: true, updatedFile: audioFile };

  } catch (err: any) {
    console.error(`Nie udało się zapisać pliku ${audioFile.file.name}:`, err);
    return { success: false, errorMessage: err.message || "Wystąpił nieznany błąd zapisu." };
  }
};