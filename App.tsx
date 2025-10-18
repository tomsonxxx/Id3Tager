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

// Types
import { AudioFile, ProcessingState, ID3Tags } from './types';
import { AIProvider, ApiKeys, fetchTagsForFile, fetchTagsForBatch } from './services/aiService';

// Utils
import { readID3Tags, applyID3Tags, saveFileDirectly } from './utils/audioUtils';
import { generatePath } from './utils/filenameUtils';
import { sortFiles, SortKey } from './utils/sortingUtils';
import { exportFilesToCsv } from './utils/csvUtils';

// These libraries are expected to be available globally (e.g., included via <script> tags)
declare const uuid: { v4: () => string; };
declare const JSZip: any;
declare const saveAs: any;

const MAX_CONCURRENT_REQUESTS = 3;
const SUPPORTED_FORMATS = ['audio/mpeg', 'audio/mp3', 'audio/flac', 'audio/wav', 'audio/ogg', 'audio/m4a'];


type ModalState = 
  | { type: 'none' }
  | { type: 'edit'; fileId: string }
  | { type: 'rename' }
  | { type: 'delete'; fileId: string | 'selected' | 'all' }
  | { type: 'settings' }
  | { type: 'batch-edit' }
  | { type: 'post-download'; count: number }
  | { type: 'zoom-cover', imageUrl: string };

const App: React.FC = () => {
    const [files, setFiles] = useState<AudioFile[]>([]);
    const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
    const [directoryHandle, setDirectoryHandle] = useState<any | null>(null);
    
    // --- State with Auto-saving to localStorage ---
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

    // Effect to update filenames whenever the pattern or tags change
    useEffect(() => {
        setFiles(currentFiles => 
            currentFiles.map(file => {
                if (file.fetchedTags) {
                    const newName = generatePath(renamePattern, file.fetchedTags, file.file.name);
                    return { ...file, newName };
                }
                return file;
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

    const addFilesToQueue = useCallback(async (filesToAdd: { file: File, handle?: any }[]) => {
        if (typeof uuid === 'undefined') {
            alert("Błąd krytyczny: Biblioteka 'uuid' nie została załadowana. Odśwież stronę.");
            return;
        }
    
        const validAudioFiles = filesToAdd.filter(item => SUPPORTED_FORMATS.includes(item.file.type));
        
        if (validAudioFiles.length === 0) {
            throw new Error("Żaden z podanych plików nie jest obsługiwanym plikiem audio.");
        }
    
        const newAudioFiles: AudioFile[] = await Promise.all(
            validAudioFiles.map(async item => {
                const originalTags = await readID3Tags(item.file);
                return {
                    id: uuid.v4(),
                    file: item.file,
                    handle: item.handle, // Store the file handle
                    state: ProcessingState.PENDING,
                    originalTags,
                    dateAdded: Date.now(),
                };
            })
        );
    
        setFiles(prev => [...prev, ...newAudioFiles]);
        
        processingQueueRef.current.push(...newAudioFiles.map(f => f.id));
        for(let i=0; i<MAX_CONCURRENT_REQUESTS; i++) {
            processQueue();
        }
    }, [processQueue]);

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
        setDirectoryHandle(handle);
        setFiles([]); // Clear previous files
        
        try {
            const filesToProcess: { file: File, handle: any }[] = [];
            for await (const entry of handle.values()) {
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    if (SUPPORTED_FORMATS.includes(file.type)) {
                        filesToProcess.push({ file: file, handle: entry });
                    }
                }
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
            
            if (!blob.type.startsWith('audio/')) {
                throw new Error(`Pobrany plik nie jest plikiem audio. Wykryty typ: ${blob.type || 'nieznany'}`);
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

    const handleSaveApiKeys = (keys: ApiKeys) => {
        setApiKeys(keys);
        setModalState({ type: 'none' });
    };

    const handleDelete = (fileId: string | 'selected' | 'all') => {
        if (fileId === 'all') {
            setFiles([]);
            setDirectoryHandle(null); // Disconnect from folder if clearing all
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
        setRenamePattern(newPattern);
        setModalState({ type: 'none' });
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

    const handleDownloadOrSave = async () => {
        if (directoryHandle) {
            await handleSaveDirectly();
        } else {
            await handleDownloadZip();
        }
    };

    const handleSaveDirectly = async () => {
        const filesToSave = selectedFiles.filter(f => f.state === ProcessingState.SUCCESS && f.handle);
        if (filesToSave.length === 0) {
            alert("Nie wybrano pomyślnie przetworzonych plików do zapisania.");
            return;
        }

        const fileIdsToSave = filesToSave.map(f => f.id);
        setFiles(files => files.map(f => fileIdsToSave.includes(f.id) ? { ...f, state: ProcessingState.DOWNLOADING } : f));
    
        let successCount = 0;
        for (const audioFile of filesToSave) {
            const result = await saveFileDirectly(directoryHandle, audioFile);
            if (result.success && result.updatedFile) {
                updateFileState(audioFile.id, { ...result.updatedFile, state: ProcessingState.SUCCESS });
                successCount++;
            } else {
                updateFileState(audioFile.id, { state: ProcessingState.ERROR, errorMessage: result.errorMessage });
            }
        }
    
        alert(`Zapisano pomyślnie ${successCount} z ${filesToSave.length} plików.`);

        // Revert any remaining DOWNLOADING states
        setFiles(files => files.map(f => {
            if (f.state === ProcessingState.DOWNLOADING) {
               return { ...f, state: ProcessingState.SUCCESS };
            }
            return f;
        }));
    };

    const handleDownloadZip = async () => {
        if (selectedFiles.length === 0) return;

        const filesToDownload = selectedFiles.filter(f => f.state === ProcessingState.SUCCESS || f.state === ProcessingState.ERROR);
        const successfulFiles = filesToDownload.filter(f => f.state === ProcessingState.SUCCESS);

        if (successfulFiles.length === 0) {
            alert("Nie wybrano żadnych pomyślnie przetworzonych plików do pobrania.");
            return;
        }

        const nonMp3Files = successfulFiles.filter(f => f.file.type !== 'audio/mpeg' && f.file.type !== 'audio/mp3');
        if (nonMp3Files.length > 0) {
            const shouldContinue = confirm(
                `Uwaga: Tagi dla ${nonMp3Files.length} plików (innych niż MP3) nie zostaną zapisane, ale pliki zostaną przemianowane i dołączone do archiwum. Czy chcesz kontynuować?`
            );
            if (!shouldContinue) return;
        }

        const downloadableFileIds = successfulFiles.map(f => f.id);
        setFiles(files => files.map(f => downloadableFileIds.includes(f.id) ? { ...f, state: ProcessingState.DOWNLOADING } : f));

        try {
            if (typeof JSZip === 'undefined' || typeof saveAs === 'undefined') {
                throw new Error("Biblioteki do pobierania plików (JSZip, FileSaver) nie zostały załadowane.");
            }

            const zip = new JSZip();
            
            for (const audioFile of successfulFiles) {
                try {
                    const isMp3 = audioFile.file.type === 'audio/mpeg' || audioFile.file.type === 'audio/mp3';
                    if (isMp3) {
                        const blob = await applyID3Tags(audioFile.file, audioFile.fetchedTags!);
                        zip.file(audioFile.newName!, blob);
                    } else {
                        // For non-MP3s, add the original file with the new name
                        zip.file(audioFile.newName!, audioFile.file);
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : "Błąd podczas zapisu tagów.";
                    updateFileState(audioFile.id, { state: ProcessingState.ERROR, errorMessage });
                }
            }

            const successfullyProcessedCount = Object.keys(zip.files).length;
            if (successfullyProcessedCount > 0) {
                const zipBlob = await zip.generateAsync({ type: 'blob' });
                saveAs(zipBlob, 'tagged-music.zip');
                setModalState({ type: 'post-download', count: successfullyProcessedCount });
            } else {
                alert("Nie udało się przetworzyć żadnego z wybranych plików. Sprawdź komunikaty o błędach.");
            }
        } catch (e) {
            alert(`Wystąpił błąd krytyczny podczas tworzenia archiwum ZIP: ${e instanceof Error ? e.message : e}`);
        } finally {
             setFiles(files => files.map(f => {
                if (downloadableFileIds.includes(f.id) && f.state === ProcessingState.DOWNLOADING) {
                   return { ...f, state: ProcessingState.SUCCESS };
                }
                return f;
            }));
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

    const handleBatchAnalyze = async () => {
        if (selectedFiles.length === 0 || isBatchAnalyzing) return;
        
        const filesToProcess = selectedFiles;
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
                             <HeaderToolbar
                                totalCount={files.length}
                                selectedCount={selectedFiles.length}
                                isProcessing={isBatchAnalyzing}
                                allSelected={allFilesSelected}
                                onToggleSelectAll={handleToggleSelectAll}
                                onAnalyze={handleBatchAnalyze}
                                onDownloadOrSave={handleDownloadOrSave}
                                onEdit={() => setModalState({ type: 'batch-edit' })}
                                onRename={() => setModalState({ type: 'rename' })}
                                onExportCsv={handleExportCsv}
                                onDelete={() => setModalState({ type: 'delete', fileId: 'selected' })}
                                onClearAll={() => setModalState({ type: 'delete', fileId: 'all' })}
                                isDirectAccessMode={!!directoryHandle}
                                directoryName={directoryHandle?.name}
                            />
                            <div className="space-y-3 mt-4">
                                {sortedFiles.map(file => (
                                    <FileListItem 
                                        key={file.id} 
                                        file={file} 
                                        onProcess={handleProcessFile}
                                        onEdit={(f) => setModalState({ type: 'edit', fileId: f.id })}
                                        onDelete={(f) => setModalState({ type: 'delete', fileId: f.id })}
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
            {modalState.type === 'settings' && <SettingsModal isOpen={true} onClose={() => setModalState({ type: 'none' })} onSave={handleSaveApiKeys} currentKeys={apiKeys} />}
            {modalState.type === 'edit' && modalFile && <EditTagsModal isOpen={true} onClose={() => setModalState({ type: 'none' })} onSave={(tags) => handleSaveTags(modalFile.id, tags)} file={modalFile} onManualSearch={handleManualSearch} onZoomCover={(imageUrl) => setModalState({ type: 'zoom-cover', imageUrl })} />}
            {modalState.type === 'rename' && <RenameModal isOpen={true} onClose={() => setModalState({ type: 'none' })} onSave={handleSaveRenamePattern} currentPattern={renamePattern} exampleFile={files.find(f => f.fetchedTags)} />}
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
        </div>
    );
};

export default App;