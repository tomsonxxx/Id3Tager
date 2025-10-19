
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// Components
import FileDropzone from './components/FileDropzone';
import FileListItem from './components/FileListItem';
import WelcomeScreen from './components/WelcomeScreen';
import Footer from './components/Footer';
import ThemeToggle from './components/ThemeToggle';
import SettingsModal from './components/SettingsModal';
import EditTagsModal from './components/EditTagsModal';
import RenameModal from './components/RenameModal';
import ConfirmationModal from './components/ConfirmationModal';
import BatchEditModal from './components/BatchEditModal';
import PostDownloadModal from './components/PostDownloadModal';
import AlbumCoverModal from './components/AlbumCoverModal';
import HeaderToolbar from './components/HeaderToolbar';
import PreviewChangesModal from './components/PreviewChangesModal'; // Nowy import

// Types
import { AudioFile, ProcessingState, ID3Tags } from './types';
import { AIProvider, ApiKeys, fetchTagsForFile, fetchTagsForBatch } from './services/aiService';

// Utils
import { readID3Tags, applyTags, saveFileDirectly, isTagWritingSupported } from './utils/audioUtils';
import { generatePath } from './utils/filenameUtils';
import { sortFiles, SortKey } from './utils/sortingUtils';
import { exportFilesToCsv } from './utils/csvUtils';

// These libraries are expected to be available globally (e.g., included via <script> tags)
declare const uuid: { v4: () => string; };
declare const JSZip: any;
declare const saveAs: any;

const MAX_CONCURRENT_REQUESTS = 3;
// Add 'audio/mp4' which is the standard MIME type for M4A files.
const SUPPORTED_FORMATS = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/flac', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/x-ms-wma'];

interface RenamePreview {
    originalName: string;
    newName: string;
    isTooLong: boolean;
}

type ModalState = 
  | { type: 'none' }
  | { type: 'edit'; fileId: string }
  | { type: 'rename' }
  | { type: 'delete'; fileId: string | 'selected' | 'all' }
  | { type: 'settings' }
  | { type: 'batch-edit' }
  | { type: 'post-download'; count: number }
  | { type: 'zoom-cover', imageUrl: string }
  | { type: 'preview-changes'; title: string; confirmationText: string; previews: RenamePreview[]; onConfirm: () => void; };

// This interface defines which parts of the AudioFile can be safely stored in JSON.
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
  fileName: string; // from file.name
  fileType: string; // from file.type
}

// Helper function to recursively get all files from a directory handle
async function* getFilesRecursively(entry: any): AsyncGenerator<{ file: File, handle: any, path: string }> {
    if (entry.kind === 'file') {
        const file = await entry.getFile();
        if (SUPPORTED_FORMATS.includes(file.type)) {
            // For root files, path is just the name.
            yield { file, handle: entry, path: entry.name };
        }
    } else if (entry.kind === 'directory') {
        for await (const handle of entry.values()) {
            // Pass down the current path to build the relative path
            for await (const nestedFile of getFilesRecursively(handle)) {
                 yield { ...nestedFile, path: `${entry.name}/${nestedFile.path}` };
            }
        }
    }
}


const App: React.FC = () => {
    const isRestoredRef = useRef(false);
    const [isRestored, setIsRestored] = useState(false);
    
    const [files, setFiles] = useState<AudioFile[]>(() => {
        const saved = localStorage.getItem('audioFiles');
        if (saved) {
            try {
                const parsed: SerializableAudioFile[] = JSON.parse(saved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    isRestoredRef.current = true; // Mark that we are restoring from storage
                    return parsed.map(f => ({
                        ...f,
                        // Create a dummy file object; it's needed for type consistency but has no content.
                        file: new File([], f.fileName, { type: f.fileType }),
                        handle: null, // FileSystem handles cannot be stored in localStorage.
                    }));
                }
            } catch (e) {
                console.error("Nie udało się sparsować plików audio z localStorage", e);
                localStorage.removeItem('audioFiles');
            }
        }
        return [];
    });

    const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [savingFileId, setSavingFileId] = useState<string | null>(null);
    const [directoryHandle, setDirectoryHandle] = useState<any | null>(null);
    
    // --- State with Auto-saving to localStorage ---
    // The following state variables are automatically loaded from and saved to localStorage
    // to persist user settings across sessions.
    const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'dark');
    
    const [apiKeys, setApiKeys] = useState<ApiKeys>(() => {
        const saved = localStorage.getItem('apiKeys');
        return saved ? JSON.parse(saved) : { grok: '', openai: '' };
    });
    
    const [aiProvider, setAiProvider] = useState<AIProvider>(() => (localStorage.getItem('aiProvider') as AIProvider) || 'gemini');
    
    const [sortKey, setSortKey] = useState<SortKey>(() => (localStorage.getItem('sortKey') as SortKey) || 'dateAdded');
    
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() => (localStorage.getItem('sortDirection') as 'asc' | 'desc') || 'asc');

    const [renamePattern, setRenamePattern] = useState<string>(() => localStorage.getItem('renamePattern') || '[artist] - [title]');

    const [modalState, setModalState] = useState<ModalState>({ type: 'none' });

    const processingQueueRef = useRef<string[]>([]);
    const activeRequestsRef = useRef(0);

    // --- Auto-saving Effects ---
    useEffect(() => {
        if (isRestoredRef.current) {
            setIsRestored(true);
            isRestoredRef.current = false;
        }
    }, []);
    
    useEffect(() => {
        localStorage.setItem('theme', theme);
        document.documentElement.className = theme;
    }, [theme]);
    
    useEffect(() => {
        localStorage.setItem('apiKeys', JSON.stringify(apiKeys));
    }, [apiKeys]);
    
    useEffect(() => {
        localStorage.setItem('aiProvider', aiProvider);
    }, [aiProvider]);

    useEffect(() => {
        localStorage.setItem('sortKey', sortKey);
    }, [sortKey]);

    useEffect(() => {
        localStorage.setItem('sortDirection', sortDirection);
    }, [sortDirection]);

    useEffect(() => {
        localStorage.setItem('renamePattern', renamePattern);
    }, [renamePattern]);

    // This effect persists the file list to localStorage whenever it changes.
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
            }));
            localStorage.setItem('audioFiles', JSON.stringify(serializableFiles));
        }
    }, [files, isRestored]);

    // Effect to update filenames whenever the pattern or tags change
    useEffect(() => {
        setFiles(currentFiles => 
            currentFiles.map(file => {
                const tagsToUse = file.fetchedTags || file.originalTags;
                const newName = generatePath(renamePattern, tagsToUse, file.file.name);
                return { ...file, newName };
            })
        );
    }, [renamePattern, files.map(f => f.fetchedTags).join(',')]);
    
    const updateFileState = useCallback((id: string, updates: Partial<AudioFile>) => {
        setFiles(prevFiles => prevFiles.map(f => f.id === id ? { ...f, ...updates } : f));
    }, []);

    const processQueue = useCallback(async () => {
        if (activeRequestsRef.current >= MAX_CONCURRENT_REQUESTS || processingQueueRef.current.length === 0) {
            return;
        }

        const fileIdToProcess = processingQueueRef.current.shift();
        if (!fileIdToProcess) return;

        const fileToProcess = files.find(f => f.id === fileIdToProcess);
        if (!fileToProcess || fileToProcess.state !== ProcessingState.PENDING) {
            processQueue();
            return;
        }

        activeRequestsRef.current++;
        updateFileState(fileIdToProcess, { state: ProcessingState.PROCESSING });

        try {
            const fetchedTags = await fetchTagsForFile(fileToProcess.file.name, fileToProcess.originalTags, aiProvider, apiKeys);
            updateFileState(fileIdToProcess, { state: ProcessingState.SUCCESS, fetchedTags });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Wystąpił nieznany błąd";
            updateFileState(fileIdToProcess, { state: ProcessingState.ERROR, errorMessage });
        } finally {
            activeRequestsRef.current--;
            processQueue();
        }
    }, [files, aiProvider, apiKeys, updateFileState]);

    const handleClearAndReset = () => {
        setFiles([]);
        setIsRestored(false);
        setDirectoryHandle(null);
    };

    const addFilesToQueue = useCallback(async (filesToAdd: { file: File, handle?: any, path?: string }[]) => {
        if (typeof uuid === 'undefined') {
            alert("Błąd krytyczny: Biblioteka 'uuid' nie została załadowana. Odśwież stronę.");
            return;
        }
    
        const validAudioFiles = filesToAdd.filter(item => SUPPORTED_FORMATS.includes(item.file.type));
        
        if (validAudioFiles.length === 0) {
            const attemptedTypes = filesToAdd.map(f => f.file.type || 'nieznany').join(', ');
            throw new Error(`Żaden z podanych plików nie jest obsługiwanym formatem audio. Wykryte typy: ${attemptedTypes}`);
        }
        
        setIsRestored(false); // Adding new files creates a fresh session.
    
        const newAudioFiles: AudioFile[] = await Promise.all(
            validAudioFiles.map(async item => {
                const originalTags = await readID3Tags(item.file);
                return {
                    id: uuid.v4(),
                    file: item.file,
                    handle: item.handle, // Store the file handle
                    webkitRelativePath: item.path || item.file.webkitRelativePath, // Store relative path for direct mode
                    state: ProcessingState.PENDING,
                    originalTags,
                    dateAdded: Date.now(),
                };
            })
        );
    
        setFiles(prev => [...prev, ...newAudioFiles]);
        
        // Don't auto-process in direct access mode. Let user initiate.
        if (!directoryHandle) {
            processingQueueRef.current.push(...newAudioFiles.map(f => f.id));
            for(let i=0; i<MAX_CONCURRENT_REQUESTS; i++) {
                processQueue();
            }
        }
    }, [processQueue, directoryHandle]);

    const handleFilesSelected = useCallback(async (selectedFiles: FileList) => {
        try {
             const fileList = Array.from(selectedFiles).map(f => ({ file: f }));
            await addFilesToQueue(fileList);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Wystąpił nieznany błąd.";
            alert(`Błąd podczas dodawania plików: ${errorMessage}`);
        }
    }, [addFilesToQueue]);

    const handleDirectoryConnect = useCallback(async (handle: any) => {
        setIsRestored(false); // A new connection always starts a fresh session.
        setDirectoryHandle(handle);
        setFiles([]); // Clear previous files
        
        try {
            const filesToProcess: { file: File, handle: any, path: string }[] = [];
            for await (const fileData of getFilesRecursively(handle)) {
                filesToProcess.push(fileData);
            }
            await addFilesToQueue(filesToProcess);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Wystąpił nieznany błąd.";
            alert(`Błąd podczas wczytywania plików z folderu: ${errorMessage}`);
            setDirectoryHandle(null);
        }
    }, [addFilesToQueue]);

    const handleUrlSubmitted = async (url: string) => {
        if (!url) return;
    
        try {
            const proxyUrl = 'https://api.allorigins.win/raw?url=';
            const response = await fetch(proxyUrl + encodeURIComponent(url));
    
            if (!response.ok) {
                throw new Error(`Nie udało się pobrać pliku: ${response.status} ${response.statusText}`);
            }
    
            const blob = await response.blob();
            
            if (!SUPPORTED_FORMATS.some(format => blob.type.startsWith(format.split('/')[0]))) {
                 throw new Error(`Pobrany plik nie jest obsługiwanym plikiem audio. Wykryty typ: ${blob.type || 'nieznany'}`);
            }
    
            let filename = 'remote_file.mp3';
            try {
                const urlPath = new URL(url).pathname;
                const lastSegment = urlPath.substring(urlPath.lastIndexOf('/') + 1);
                if (lastSegment) {
                    filename = decodeURIComponent(lastSegment);
                }
            } catch (e) {
                console.warn("Could not parse filename from URL, using default.", e);
            }
    
            const file = new File([blob], filename, { type: blob.type });
    
            await addFilesToQueue([{ file }]);
    
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Wystąpił nieznany błąd.';
            alert(`Błąd podczas przetwarzania adresu URL: ${errorMessage}`);
            throw error;
        }
    };
    
    const handleProcessFile = useCallback((file: AudioFile) => {
        if (!processingQueueRef.current.includes(file.id)) {
            processingQueueRef.current.push(file.id);
        }
        processQueue();
    }, [processQueue]);
    
    const sortedFiles = useMemo(() => sortFiles([...files], sortKey, sortDirection), [files, sortKey, sortDirection]);
    const selectedFiles = useMemo(() => files.filter(f => f.isSelected), [files]);
    const allFilesSelected = useMemo(() => files.length > 0 && files.every(f => f.isSelected), [files]);
    const isProcessing = useMemo(() => files.some(f => f.state === ProcessingState.PROCESSING || f.state === ProcessingState.DOWNLOADING), [files]);
    const modalFile = useMemo(() => {
        if (modalState.type === 'edit') {
            return files.find(f => f.id === modalState.fileId);
        }
        return undefined;
    }, [modalState, files]);

    const handleSelectionChange = (fileId: string, isSelected: boolean) => {
        updateFileState(fileId, { isSelected });
    };

    const handleToggleSelectAll = () => {
        const shouldSelectAll = !allFilesSelected;
        setFiles(prevFiles => prevFiles.map(f => ({ ...f, isSelected: shouldSelectAll })));
    };

    const handleSaveSettings = (keys: ApiKeys, provider: AIProvider) => {
        setApiKeys(keys);
        setAiProvider(provider);
        setModalState({ type: 'none' });
    };

    const handleDelete = (fileId: string) => {
        if (fileId === 'all') {
            handleClearAndReset();
        } else if (fileId === 'selected') {
            setFiles(files => files.filter(f => !f.isSelected));
        } else {
            setFiles(files => files.filter(f => f.id !== fileId));
        }
        setModalState({ type: 'none' });
    };

    const handleSaveTags = (fileId: string, tags: ID3Tags) => {
        updateFileState(fileId, { fetchedTags: tags });
        setModalState({ type: 'none' });
    };

    const handleApplyTags = async (fileId: string, tags: ID3Tags) => {
        if (!directoryHandle) {
            alert("Funkcja 'Zastosuj zmiany' jest dostępna tylko w trybie bezpośredniego dostępu do folderu.");
            return;
        }

        const fileToProcess = files.find(f => f.id === fileId);
        if (!fileToProcess || !fileToProcess.handle) {
             alert("Nie można zapisać tego pliku. Brak odniesienia do pliku (file handle).");
            return;
        }

        setSavingFileId(fileId);
        
        // Create a temporary updated file object for the save operation, including the new tags
        const tempUpdatedFile = { ...fileToProcess, fetchedTags: tags };

        try {
            const result = await saveFileDirectly(directoryHandle, tempUpdatedFile);
            
            if (result.success && result.updatedFile) {
                // The result contains the fully updated file object (new File, new handle etc.)
                updateFileState(fileId, { ...result.updatedFile, state: ProcessingState.SUCCESS });
                setModalState({ type: 'none' }); // Close modal on success
            } else {
                updateFileState(fileId, { 
                    state: ProcessingState.ERROR, 
                    errorMessage: result.errorMessage,
                    fetchedTags: tags // Keep the user's edits in the UI even on failure
                });
                alert(`Nie udało się zapisać pliku: ${result.errorMessage}`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Wystąpił nieznany błąd podczas zapisu.";
            updateFileState(fileId, { state: ProcessingState.ERROR, errorMessage, fetchedTags: tags });
            alert(`Wystąpił błąd krytyczny podczas zapisu: ${errorMessage}`);
        } finally {
            setSavingFileId(null);
        }
    };
    
    const handleManualSearch = async (query: string, file: AudioFile) => {
        updateFileState(file.id, { state: ProcessingState.PROCESSING });
        try {
            const fetchedTags = await fetchTagsForFile(query, file.originalTags, aiProvider, apiKeys);
            updateFileState(file.id, { state: ProcessingState.SUCCESS, fetchedTags });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Wystąpił nieznany błąd";
            updateFileState(file.id, { state: ProcessingState.ERROR, errorMessage });
            throw error;
        }
    };

    const handleSaveRenamePattern = (newPattern: string) => {
        const filesToPreview = selectedFiles.length > 0 ? selectedFiles : files.slice(0, 5);
        if (filesToPreview.length === 0) {
            setRenamePattern(newPattern);
            setModalState({ type: 'none' });
            return;
        }

        const previews = filesToPreview.map(file => {
            const newName = generatePath(newPattern, file.fetchedTags || file.originalTags, file.file.name);
            return {
                originalName: file.webkitRelativePath || file.file.name,
                newName: newName,
                isTooLong: newName.length > 255
            };
        });

        const handleConfirm = () => {
            setRenamePattern(newPattern);
            setModalState({ type: 'none' });
        };
        
        setModalState({
            type: 'preview-changes',
            title: 'Potwierdź zmianę szablonu nazw',
            confirmationText: 'Zostanie ustawiony nowy szablon nazw plików. Poniżej znajduje się podgląd dla kilku plików. Czy chcesz kontynuować?',
            previews: previews,
            onConfirm: handleConfirm
        });
    };

    const handleBatchEditSave = (tagsToApply: Partial<ID3Tags>) => {
        setFiles(files => files.map(f => {
            if (f.isSelected) {
                const newFetchedTags = { ...f.fetchedTags, ...tagsToApply };
                Object.keys(tagsToApply).forEach(key => {
                    const typedKey = key as keyof ID3Tags;
                    if(tagsToApply[typedKey] === '') {
                        delete newFetchedTags[typedKey];
                    }
                });
                return { ...f, fetchedTags: newFetchedTags };
            }
            return f;
        }));
        setModalState({ type: 'none' });
    };

    const executeDownloadOrSave = async () => {
        if (directoryHandle) {
            await handleSaveDirectly();
        } else {
            await handleDownloadZip();
        }
    };

    const handleDownloadOrSave = async () => {
        const filesToProcess = selectedFiles.length > 0 ? selectedFiles : [];
        if (filesToProcess.length === 0) {
            alert("Nie wybrano żadnych plików do zapisania lub pobrania.");
            return;
        }

        const previews = filesToProcess.map(file => {
            const newName = file.newName || file.file.name;
            const oldName = file.webkitRelativePath || file.file.name;
            return {
                originalName: oldName,
                newName: newName,
                isTooLong: newName.length > 255
            };
        }).filter(p => p.originalName !== p.newName);

        if (previews.length === 0) {
            await executeDownloadOrSave();
            return;
        }

        const handleConfirm = () => {
            setModalState({ type: 'none' });
            setTimeout(() => executeDownloadOrSave(), 50);
        };

        setModalState({
            type: 'preview-changes',
            title: `Potwierdź ${directoryHandle ? 'zapis i zmianę nazw' : 'pobieranie ze zmianą nazw'}`,
            confirmationText: `Nazwy ${previews.length} z ${selectedFiles.length} zaznaczonych plików zostaną zmienione zgodnie z szablonem przed zapisaniem. Czy chcesz kontynuować?`,
            previews: previews,
            onConfirm: handleConfirm
        });
    };

    const handleSaveDirectly = async () => {
        const filesToSave = selectedFiles.filter(f => f.handle);
        if (filesToSave.length === 0) {
            alert("Nie wybrano żadnych plików do zapisania lub pliki nie pochodzą z trybu bezpośredniego dostępu.");
            return;
        }
        
        setIsSaving(true);
        const fileIdsToSave = filesToSave.map(f => f.id);
        setFiles(files => files.map(f => fileIdsToSave.includes(f.id) ? { ...f, state: ProcessingState.DOWNLOADING } : f));
    
        try {
            const results = await Promise.all(
                filesToSave.map(file => saveFileDirectly(directoryHandle, file))
            );

            let successCount = 0;
            const updates = new Map<string, Partial<AudioFile>>();

            results.forEach((result, index) => {
                const originalFile = filesToSave[index];
                if (result.success && result.updatedFile) {
                    successCount++;
                    updates.set(originalFile.id, { ...result.updatedFile, state: ProcessingState.SUCCESS, isSelected: false });
                } else {
                    updates.set(originalFile.id, { state: ProcessingState.ERROR, errorMessage: result.errorMessage });
                }
            });

            setFiles(currentFiles => 
                currentFiles.map(file => {
                    if (updates.has(file.id)) {
                        return { ...file, ...updates.get(file.id) };
                    }
                    return file;
                })
            );
        
            alert(`Zapisano pomyślnie ${successCount} z ${filesToSave.length} plików.`);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDownloadZip = async () => {
        if (selectedFiles.length === 0) return;

        const filesToDownload = selectedFiles;
        const successfulFiles = filesToDownload.filter(f => f.state === ProcessingState.SUCCESS || f.state === ProcessingState.PENDING);

        if (successfulFiles.length === 0) {
            alert("Nie wybrano żadnych pomyślnie przetworzonych plików do pobrania.");
            return;
        }

        const unsupportedTagFiles = successfulFiles.filter(f => !isTagWritingSupported(f.file));
        if (unsupportedTagFiles.length > 0) {
            const fileTypes = [...new Set(unsupportedTagFiles.map(f => f.file.name.split('.').pop()?.toUpperCase()))].join(', ');
            const shouldContinue = confirm(
                `Uwaga: Tagi dla ${unsupportedTagFiles.length} plików (typu: ${fileTypes}) nie zostaną zapisane, ale pliki zostaną przemianowane i dołączone do archiwum. Czy chcesz kontynuować?`
            );
            if (!shouldContinue) return;
        }

        setIsSaving(true);
        const downloadableFileIds = successfulFiles.map(f => f.id);
        setFiles(files => files.map(f => downloadableFileIds.includes(f.id) ? { ...f, state: ProcessingState.DOWNLOADING } : f));

        try {
            if (typeof JSZip === 'undefined' || typeof saveAs === 'undefined') {
                throw new Error("Biblioteki do pobierania plików (JSZip, FileSaver) nie zostały załadowane.");
            }

            const zip = new JSZip();
            const errorUpdates = new Map<string, Partial<AudioFile>>();
            
            await Promise.all(successfulFiles.map(async (audioFile) => {
                // FIX: Generate the final filename inside this function for robustness.
                const finalName = generatePath(renamePattern, audioFile.fetchedTags || audioFile.originalTags, audioFile.file.name) || audioFile.file.name;

                try {
                    if (isTagWritingSupported(audioFile.file) && audioFile.fetchedTags) {
                        const blob = await applyTags(audioFile.file, audioFile.fetchedTags);
                        zip.file(finalName, blob);
                    } else {
                        zip.file(finalName, audioFile.file);
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Błąd podczas zapisu tagów.";
                    errorUpdates.set(audioFile.id, { state: ProcessingState.ERROR, errorMessage });
                }
            }));

            const successfullyProcessedCount = Object.keys(zip.files).length;
            if (successfullyProcessedCount > 0) {
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                saveAs(zipBlob, 'tagged-music.zip');
                setModalState({ type: 'post-download', count: successfullyProcessedCount });
            } else {
                alert("Nie udało się przetworzyć żadnego z wybranych plików. Sprawdź komunikaty o błędach.");
            }

             setFiles(files => files.map(f => {
                if (errorUpdates.has(f.id)) {
                   return { ...f, ...errorUpdates.get(f.id) };
                }
                if (downloadableFileIds.includes(f.id) && f.state === ProcessingState.DOWNLOADING) {
                   return { ...f, state: ProcessingState.SUCCESS };
                }
                return f;
            }));

        } catch (e) {
            alert(`Wystąpił błąd krytyczny podczas tworzenia archiwum ZIP: ${e instanceof Error ? e.message : e}`);
            // Revert all to SUCCESS if the zip process fails catastrophically
            setFiles(files => files.map(f => downloadableFileIds.includes(f.id) ? { ...f, state: ProcessingState.SUCCESS } : f));
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleExportCsv = () => {
        if (files.length === 0) {
            alert("Brak plików do wyeksportowania.");
            return;
        }

        try {
            if (typeof saveAs === 'undefined') {
                alert("Błąd krytyczny: Biblioteka do pobierania plików (FileSaver) nie została załadowana. Odśwież stronę.");
                return;
            }

            const csvData = exportFilesToCsv(files);
            const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            saveAs(blob, `id3-tagger-export-${timestamp}.csv`);
        } catch (error) {
            console.error("Failed to export CSV", error);
            alert(`Wystąpił błąd podczas eksportowania pliku CSV: ${error instanceof Error ? error.message : String(error)}`);
        }
    };


    const handlePostDownloadRemove = () => {
        setFiles(files => files.filter(f => !f.isSelected));
        setModalState({ type: 'none' });
    };

    const handleBatchAnalyze = async (filesToProcess: AudioFile[]) => {
        if (filesToProcess.length === 0 || isBatchAnalyzing) return;

        const fileIdsToProcess = filesToProcess.map(f => f.id);

        setIsBatchAnalyzing(true);
        setFiles(prev => prev.map(f => fileIdsToProcess.includes(f.id) ? { ...f, state: ProcessingState.PROCESSING } : f));
        
        try {
            const results = await fetchTagsForBatch(filesToProcess, aiProvider, apiKeys);
            
            const resultsMap = new Map(results.map(r => [r.originalFilename, r]));

            setFiles(prev => prev.map(f => {
                if (fileIdsToProcess.includes(f.id)) {
                    const result = resultsMap.get(f.file.name);
                    if (result) {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { originalFilename, ...fetchedTags } = result;
                        return {
                            ...f,
                            state: ProcessingState.SUCCESS,
                            fetchedTags: { ...f.originalTags, ...fetchedTags }
                        };
                    }
                    return { ...f, state: ProcessingState.ERROR, errorMessage: "Nie znaleziono dopasowania w odpowiedzi AI." };
                }
                return f;
            }));

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Wystąpił nieznany błąd podczas analizy wsadowej.";
            setFiles(prev => prev.map(f => fileIdsToProcess.includes(f.id) ? { ...f, state: ProcessingState.ERROR, errorMessage } : f));
        } finally {
            setIsBatchAnalyzing(false);
        }
    };
    
    const handleBatchAnalyzeAll = () => {
        const filesToAnalyze = files.filter(f => f.state !== ProcessingState.SUCCESS);
        if (filesToAnalyze.length === 0) {
            alert("Wszystkie pliki zostały już pomyślnie przetworzone.");
            return;
        }
        handleBatchAnalyze(filesToAnalyze);
    };

    const filesForRenamePreview = selectedFiles.length > 0 ? selectedFiles : files.slice(0, 5);

    return (
        <div className="bg-slate-50 dark:bg-slate-900 min-h-screen font-sans text-slate-800 dark:text-slate-200">
            <main className="container mx-auto px-4 py-8">
                <header className="flex justify-between items-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Inteligentny Tagger ID3</h1>
                    <div className="flex items-center space-x-2">
                         <ThemeToggle theme={theme} setTheme={setTheme} />
                         <button onClick={() => setModalState({ type: 'settings' })} className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Ustawienia">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                         </button>
                    </div>
                </header>

                {files.length === 0 ? (
                    <WelcomeScreen onDirectoryConnect={handleDirectoryConnect}>
                        <FileDropzone onFilesSelected={handleFilesSelected} onUrlSubmitted={handleUrlSubmitted} isProcessing={isProcessing} />
                    </WelcomeScreen>
                ) : (
                    <>
                        <FileDropzone onFilesSelected={handleFilesSelected} onUrlSubmitted={handleUrlSubmitted} isProcessing={isProcessing} />
                        <div className="mt-8">
                             {isRestored && (
                                <div className="my-4 p-3 bg-yellow-100 dark:bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-800 dark:text-yellow-300 rounded-r-lg" role="alert">
                                    <div className="flex justify-between items-center gap-4">
                                        <div>
                                            <p className="font-bold">Sesja przywrócona</p>
                                            <p className="text-sm">Twoja poprzednia lista plików została wczytana. Aby zapisać lub pobrać pliki, musisz je ponownie załadować.</p>
                                        </div>
                                        <button
                                            onClick={handleClearAndReset}
                                            className="px-3 py-1.5 text-xs font-semibold text-yellow-800 dark:text-yellow-200 bg-yellow-200 dark:bg-yellow-800/60 rounded-md hover:bg-yellow-300 dark:hover:bg-yellow-800/90 transition-colors flex-shrink-0"
                                        >
                                            Wyczyść listę
                                        </button>
                                    </div>
                                </div>
                            )}
                             <HeaderToolbar
                                totalCount={files.length}
                                selectedCount={selectedFiles.length}
                                isAnalyzing={isBatchAnalyzing}
                                isSaving={isSaving}
                                allSelected={allFilesSelected}
                                onToggleSelectAll={handleToggleSelectAll}
                                onAnalyze={() => handleBatchAnalyze(selectedFiles)}
                                onAnalyzeAll={handleBatchAnalyzeAll}
                                onDownloadOrSave={handleDownloadOrSave}
                                onEdit={() => setModalState({ type: 'batch-edit' })}
                                onRename={() => setModalState({ type: 'rename' })}
                                onExportCsv={handleExportCsv}
                                onDelete={() => setModalState({ type: 'delete', fileId: 'selected' })}
                                onClearAll={() => setModalState({ type: 'delete', fileId: 'all' })}
                                isDirectAccessMode={!!directoryHandle}
                                directoryName={directoryHandle?.name}
                                isRestored={isRestored}
                            />
                            <div className="space-y-3 mt-4">
                                {sortedFiles.map(file => (
                                    <FileListItem 
                                        key={file.id} 
                                        file={file} 
                                        onProcess={handleProcessFile}
                                        onEdit={(f) => setModalState({ type: 'edit', fileId: f.id })}
                                        onDelete={(id) => handleDelete(id)}
                                        onSelectionChange={handleSelectionChange}
                                    />
                                ))}
                            </div>
                        </div>
                    </>
                )}
                <Footer />
            </main>
            
            {/* --- Modals --- */}
            {modalState.type === 'settings' && <SettingsModal isOpen={true} onClose={() => setModalState({ type: 'none' })} onSave={handleSaveSettings} currentKeys={apiKeys} currentProvider={aiProvider} />}
            {modalState.type === 'edit' && modalFile && <EditTagsModal isOpen={true} onClose={() => setModalState({ type: 'none' })} onSave={(tags) => handleSaveTags(modalFile.id, tags)} onApply={(tags) => handleApplyTags(modalFile.id, tags)} isApplying={savingFileId === modalFile.id} isDirectAccessMode={!!directoryHandle} file={modalFile} onManualSearch={handleManualSearch} onZoomCover={(imageUrl) => setModalState({ type: 'zoom-cover', imageUrl })} />}
            {modalState.type === 'rename' && <RenameModal isOpen={true} onClose={() => setModalState({ type: 'none' })} onSave={handleSaveRenamePattern} currentPattern={renamePattern} files={filesForRenamePreview} />}
            {modalState.type === 'delete' && (
                <ConfirmationModal 
                    isOpen={true} 
                    onCancel={() => setModalState({ type: 'none' })}
                    onConfirm={() => handleDelete(modalState.fileId)}
                    title="Potwierdź usunięcie"
                >
                    {`Czy na pewno chcesz usunąć ${modalState.fileId === 'all' ? 'wszystkie pliki' : modalState.fileId === 'selected' ? `${selectedFiles.length} zaznaczone pliki` : 'ten plik'} z kolejki? Tej operacji nie można cofnąć.`}
                </ConfirmationModal>
            )}
            {modalState.type === 'batch-edit' && <BatchEditModal isOpen={true} onClose={() => setModalState({ type: 'none' })} onSave={handleBatchEditSave} files={selectedFiles} />}
            {modalState.type === 'post-download' && <PostDownloadModal isOpen={true} onKeep={() => setModalState({ type: 'none' })} onRemove={handlePostDownloadRemove} count={modalState.count} />}
            {modalState.type === 'zoom-cover' && <AlbumCoverModal isOpen={true} onClose={() => setModalState({ type: 'none' })} imageUrl={modalState.imageUrl} />}
            {modalState.type === 'preview-changes' && (
                <PreviewChangesModal
                    isOpen={true}
                    onCancel={() => setModalState({ type: 'none' })}
                    onConfirm={modalState.onConfirm}
                    title={modalState.title}
                    previews={modalState.previews}
                >
                    {modalState.confirmationText}
                </PreviewChangesModal>
            )}
        </div>
    );
};

export default App;
