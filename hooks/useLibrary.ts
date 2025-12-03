
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AudioFile, ProcessingState, ID3Tags } from '../types';
import { sortFiles, SortConfig } from '../utils/sortingUtils';
import { generatePath } from '../utils/filenameUtils';
import { readID3Tags } from '../utils/audioUtils';

// Helper types for serialization
interface SerializableAudioFile {
  id: string;
  state: ProcessingState;
  originalTags: ID3Tags;
  fetchedTags?: ID3Tags;
  newName?: string;
  isSelected?: boolean;
  errorMessage?: string;
  dateAdded: number;
  webkitRelativePath?: string;
  fileName: string;
  fileType: string;
  duplicateSetId?: string;
}

declare const uuid: { v4: () => string; };
const SUPPORTED_FORMATS = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/flac', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/x-ms-wma'];

export const useLibrary = (renamePattern: string) => {
  // --- Files State ---
  const [files, setFiles] = useState<AudioFile[]>(() => {
    const saved = localStorage.getItem('audioFiles');
    if (saved) {
      try {
        const parsed: SerializableAudioFile[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(f => ({
            ...f,
            file: new File([], f.fileName, { type: f.fileType }), // Empty file blob as placeholder
            handle: null,
          }));
        }
      } catch (e) {
        console.error("Failed to parse audio files", e);
        localStorage.removeItem('audioFiles');
      }
    }
    return [];
  });

  const [isRestored, setIsRestored] = useState(false);
  const isRestoredRef = useRef(false);

  // --- Selection & View State ---
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig[]>([]);

  // --- Effects ---
  
  // Mark as restored on initial load
  useEffect(() => {
    if (files.length > 0 && !isRestored && !isRestoredRef.current) {
        isRestoredRef.current = true;
        setIsRestored(true);
    }
  }, [files]);

  // Persist to LocalStorage
  useEffect(() => {
    if (files.length === 0 && !isRestored) {
        localStorage.removeItem('audioFiles');
        return;
    }
    if (files.length > 0) {
        const serializableFiles: SerializableAudioFile[] = files.map(f => ({
            id: f.id,
            state: f.state,
            originalTags: f.originalTags,
            fetchedTags: f.fetchedTags,
            newName: f.newName,
            isSelected: f.isSelected, 
            errorMessage: f.errorMessage,
            dateAdded: f.dateAdded,
            webkitRelativePath: f.webkitRelativePath,
            fileName: f.file.name,
            fileType: f.file.type,
            duplicateSetId: f.duplicateSetId,
        }));
        localStorage.setItem('audioFiles', JSON.stringify(serializableFiles));
    }
  }, [files, isRestored]);

  // Apply Rename Pattern
  useEffect(() => {
    setFiles(currentFiles => 
        currentFiles.map(file => {
            const tagsToUse = file.fetchedTags || file.originalTags;
            const newName = generatePath(renamePattern, tagsToUse, file.file.name);
            // Only update if changed to avoid unnecessary re-renders
            if (file.newName === newName) return file;
            return { ...file, newName };
        })
    );
  }, [renamePattern]);


  // --- Actions ---

  const addFiles = useCallback(async (newFilesData: { file: File, handle?: any, path?: string }[]) => {
    if (typeof uuid === 'undefined') return;
    const validAudioFiles = newFilesData.filter(item => SUPPORTED_FORMATS.includes(item.file.type));
    if (validAudioFiles.length === 0) return;

    // New real files added, so we are no longer in "Restored" state (where file blobs are empty)
    setIsRestored(false); 
    isRestoredRef.current = false;

    const newAudioFiles: AudioFile[] = await Promise.all(
        validAudioFiles.map(async item => {
            const originalTags = await readID3Tags(item.file);
            return {
                id: uuid.v4(),
                file: item.file,
                handle: item.handle,
                webkitRelativePath: item.path || item.file.webkitRelativePath,
                state: ProcessingState.PENDING,
                originalTags,
                dateAdded: Date.now(),
                isSelected: false
            };
        })
    );

    setFiles(prev => [...prev, ...newAudioFiles]);
  }, []);

  const updateFile = useCallback((id: string, updates: Partial<AudioFile>) => {
    setFiles(prevFiles => prevFiles.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const removeFiles = useCallback((idsToRemove: string[]) => {
      setFiles(prev => prev.filter(f => !idsToRemove.includes(f.id)));
      setSelectedFileIds(prev => prev.filter(id => !idsToRemove.includes(id)));
      if (activeFileId && idsToRemove.includes(activeFileId)) {
          setActiveFileId(null);
      }
  }, [activeFileId]);

  const toggleSelection = useCallback((id: string, multi: boolean) => {
    if (multi) {
        setSelectedFileIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    } else {
        setSelectedFileIds(prev => prev.includes(id) && prev.length === 1 ? [] : [id]);
    }
    setActiveFileId(id);
  }, []);

  const selectAll = useCallback(() => {
      setSelectedFileIds(files.map(f => f.id));
  }, [files]);

  const clearSelection = useCallback(() => {
      setSelectedFileIds([]);
  }, []);

  const activateFile = useCallback((file: AudioFile) => {
      setActiveFileId(file.id);
  }, []);

  // --- Derived State ---
  const sortedFiles = useMemo(() => sortFiles(files, sortConfig), [files, sortConfig]);
  const activeFile = useMemo(() => files.find(f => f.id === activeFileId) || null, [files, activeFileId]);
  const selectedFiles = useMemo(() => files.filter(f => selectedFileIds.includes(f.id)), [files, selectedFileIds]);

  return {
    files,
    setFiles,
    sortedFiles,
    selectedFileIds,
    activeFileId,
    activeFile,
    selectedFiles,
    isRestored,
    sortConfig,
    setSortConfig,
    addFiles,
    updateFile,
    removeFiles,
    toggleSelection,
    selectAll,
    clearSelection,
    activateFile,
    setIsRestored, // Exposed if we need to manually reset (e.g. Directory connect)
    setDirectoryHandle: (handle: any) => {/* Placeholder for directory handle if needed later in library */} 
  };
};