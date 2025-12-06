import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AudioFile, ProcessingState, ID3Tags, Playlist } from '../types';
import { sortFiles, SortConfig } from '../utils/sortingUtils';
import { generatePath } from '../utils/filenameUtils';
import { readID3Tags } from '../utils/audioUtils';

declare const uuid: { v4: () => string; };
const SUPPORTED_FORMATS = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/flac', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/x-ms-wma'];

export interface LibraryFilters {
  search: string;
  bpmMin?: number;
  bpmMax?: number;
  genre?: string;
  key?: string;
  playlistId?: string | null;
}

export const useLibrary = (renamePattern: string) => {
  const [files, setFiles] = useState<AudioFile[]>(() => {
    const saved = localStorage.getItem('audioFiles');
    if (saved) {
      try {
        return JSON.parse(saved).map((f: any) => ({
            ...f,
            file: new File([], f.fileName, { type: f.fileType }),
            handle: null
        }));
      } catch (e) { return []; }
    }
    return [];
  });

  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
      const saved = localStorage.getItem('playlists');
      return saved ? JSON.parse(saved) : [];
  });

  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<SortConfig[]>([]);
  const [filters, setFilters] = useState<LibraryFilters>({ search: '' });
  
  // Restored state for UI handling (e.g. disabling analysis on initial load)
  const [isRestored, setIsRestored] = useState(false);
  const isRestoredRef = useRef(false);

  useEffect(() => {
    if (files.length > 0 && !isRestored && !isRestoredRef.current) {
        isRestoredRef.current = true;
        setIsRestored(true);
    }
  }, [files]);

  // Persistence
  useEffect(() => {
    if (files.length > 0) {
        const serializable = files.map(f => ({
            ...f,
            file: undefined,
            fileName: f.file.name,
            fileType: f.file.type
        }));
        localStorage.setItem('audioFiles', JSON.stringify(serializable));
    }
  }, [files]);

  useEffect(() => {
      localStorage.setItem('playlists', JSON.stringify(playlists));
  }, [playlists]);

  // Actions
  const addFiles = useCallback(async (newFilesData: { file: File, handle?: any, path?: string }[]) => {
    if (typeof uuid === 'undefined') return;
    const valid = newFilesData.filter(i => SUPPORTED_FORMATS.includes(i.file.type) || i.file.name.match(/\.(mp3|wav|flac|m4a)$/i));
    
    setIsRestored(false);
    
    const newFiles = await Promise.all(valid.map(async item => ({
        id: uuid.v4(),
        file: item.file,
        handle: item.handle,
        webkitRelativePath: item.path || item.file.webkitRelativePath,
        state: ProcessingState.PENDING,
        originalTags: await readID3Tags(item.file),
        dateAdded: Date.now(),
        isSelected: false
    })));

    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const updateFile = useCallback((id: string, updates: Partial<AudioFile>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const removeFiles = useCallback((ids: string[]) => {
      setFiles(prev => prev.filter(f => !ids.includes(f.id)));
      setSelectedFileIds(prev => prev.filter(id => !ids.includes(id)));
      setPlaylists(prev => prev.map(pl => ({ ...pl, trackIds: pl.trackIds.filter(tid => !ids.includes(tid)) })));
  }, []);

  const createPlaylist = useCallback((name: string, initialTrackIds: string[] = []) => {
      if (typeof uuid === 'undefined') return;
      setPlaylists(prev => [...prev, {
          id: uuid.v4(),
          name,
          trackIds: initialTrackIds,
          createdAt: Date.now()
      }]);
  }, []);

  const deletePlaylist = useCallback((id: string) => {
      setPlaylists(prev => prev.filter(p => p.id !== id));
  }, []);

  const addToPlaylist = useCallback((pid: string, fids: string[]) => {
      setPlaylists(prev => prev.map(pl => pl.id === pid ? { ...pl, trackIds: Array.from(new Set([...pl.trackIds, ...fids])) } : pl));
  }, []);

  // Filter Logic
  const sortedFiles = useMemo(() => {
      let result = files;
      
      if (filters.playlistId) {
          const pl = playlists.find(p => p.id === filters.playlistId);
          if (pl) result = result.filter(f => pl.trackIds.includes(f.id));
      }

      if (filters.search) {
          const q = filters.search.toLowerCase();
          result = result.filter(f => 
              f.file.name.toLowerCase().includes(q) || 
              f.fetchedTags?.title?.toLowerCase().includes(q) ||
              f.fetchedTags?.artist?.toLowerCase().includes(q)
          );
      }
      
      return sortFiles(result, sortConfig);
  }, [files, filters, playlists, sortConfig]);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const paginatedFiles = useMemo(() => {
      const start = (currentPage - 1) * itemsPerPage;
      return sortedFiles.slice(start, start + itemsPerPage);
  }, [sortedFiles, currentPage, itemsPerPage]);

  return {
      files, setFiles, sortedFiles, paginatedFiles,
      selectedFileIds, activeFileId, activeFile: files.find(f => f.id === activeFileId) || null,
      selectedFiles: files.filter(f => selectedFileIds.includes(f.id)),
      addFiles, updateFile, removeFiles, toggleSelection: (id: string, multi: boolean) => {
          if (multi) setSelectedFileIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
          else setSelectedFileIds(prev => prev.includes(id) && prev.length === 1 ? [] : [id]);
          setActiveFileId(id);
      },
      selectAll: () => setSelectedFileIds(sortedFiles.map(f => f.id)),
      clearSelection: () => setSelectedFileIds([]),
      activateFile: (f: AudioFile) => setActiveFileId(f.id),
      filters, setFilters, availableGenres: [],
      playlists, createPlaylist, deletePlaylist, addToPlaylist,
      sortConfig, setSortConfig,
      isRestored, setIsRestored,
      currentPage, setCurrentPage, totalPages: Math.ceil(sortedFiles.length / itemsPerPage), itemsPerPage, setItemsPerPage
  };
};