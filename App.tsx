
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';

// Components
import FileDropzone from './components/FileDropzone';
import FileListItem from './components/FileListItem';
import WelcomeScreen from './components/WelcomeScreen';
import Footer from './components/Footer';
import ThemeToggle from './components/ThemeToggle';
import SettingsModal from './components/SettingsModal';
// Fix: Correct import paths after creating the files
import EditTagsModal from './components/EditTagsModal';
import RenameModal from './components/RenameModal';
import ConfirmationModal from './components/ConfirmationModal';
import BatchActionsToolbar from './components/BatchActionsToolbar';
import BatchEditModal from './components/BatchEditModal';
import PostDownloadModal from './components/PostDownloadModal';
import AlbumCoverModal from './components/AlbumCoverModal';
import { GeminiIcon } from './components/icons/GeminiIcon';
import { GrokIcon } from './components/icons/GrokIcon';
import { OpenAIIcon } from './components/icons/OpenAIIcon';

// Types
// Fix: Correct import paths after creating the files
import { AudioFile, ProcessingState, ID3Tags, GroupKey } from './types';
import { AIProvider, ApiKeys, fetchTagsForFile, fetchTagsForBatch } from './services/aiService';

// Utils
// Fix: Correct import paths after creating the files
import { readID3Tags, applyID3Tags } from './utils/audioUtils';
import { generatePath } from './utils/filenameUtils';
import { sortFiles, SortKey } from './utils/sortingUtils';

// These libraries are expected to be available globally (e.g., included via <script> tags)
declare const uuid: { v4: () => string; };
declare const JSZip: any;
declare const saveAs: any;

const MAX_CONCURRENT_REQUESTS = 3;

type ModalState = 
  | { type: 'none' }
  | { type: 'edit'; fileId: string }
  | { type: 'rename' } // Rename modal is now global, not for a specific file
  | { type: 'delete'; fileId: string | 'selected' | 'all' }
  | { type: 'settings' }
  | { type: 'batch-edit' }
  | { type: 'post-download'; count: number }
  | { type: 'zoom-cover', imageUrl: string };

const App: React.FC = () => {
    const [files, setFiles] = useState<AudioFile[]>([]);
    
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
    }, [renamePattern, files.map(f => f.fetchedTags).join(',')]); // A bit of a hack to detect changes in tags
    
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
            processQueue(); // Try next one
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

    const addFilesToQueue = useCallback(async (filesToAdd: File[]) => {
        if (typeof uuid === 'undefined') {
            alert("Błąd krytyczny: Biblioteka 'uuid' nie została załadowana. Odśwież stronę.");
            return;
        }

        const validAudioFiles = filesToAdd.filter(file => file.type.startsWith('audio/'));
        
        if (validAudioFiles.length === 0) {
            throw new Error("Żaden z podanych plików nie jest obsługiwanym plikiem audio.");
        }

        const newAudioFiles: AudioFile[] = await Promise.all(
            validAudioFiles.map(async file => {
                const originalTags = await readID3Tags(file);
                return {
                    id: uuid.v4(),
                    file,
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
            await addFilesToQueue(Array.from(selectedFiles));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "Wystąpił nieznany błąd.";
            alert(`Błąd podczas dodawania plików: ${errorMessage}`);
        }
    }, [addFilesToQueue]);

    const handleUrlSubmitted = async (url: string) => {
        if (!url) return;
    
        try {
            // Using a proxy to bypass CORS issues, which is common for remote resources.
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
    
            await addFilesToQueue([file]);
    
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Wystąpił nieznany błąd.';
            alert(`Błąd podczas przetwarzania adresu URL: ${errorMessage}`);
            // Re-throw so the child component can stop its loading indicator
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
            throw error; // Re-throw to inform modal
        }
    };

    const handleSaveRenamePattern = (newPattern: string) => {
        setRenamePattern(newPattern);
        setModalState({ type: 'none' });
    };

    const handleBatchEditSave = (tagsToApply: Partial<ID3Tags>) => {
        setFiles(files => files.map(f => {
            if (f.isSelected) {
                return { ...f, fetchedTags: { ...f.fetchedTags, ...tagsToApply } };
            }
            return f;
        }));
        setModalState({ type: 'none' });
    };

    const handleDownload = async () => {
        if (selectedFiles.length === 0) return;

        const filesToDownload = selectedFiles.filter(f => f.state === ProcessingState.SUCCESS);
        if (filesToDownload.length === 0) return;

        setFiles(files => files.map(f =>
            filesToDownload.some(fd => fd.id === f.id) ? { ...f, state: ProcessingState.DOWNLOADING } : f
        ));

        try {
            if (typeof JSZip === 'undefined' || typeof saveAs === 'undefined') {
                alert("Błąd krytyczny: Biblioteki do pobierania plików (JSZip, FileSaver) nie zostały załadowane. Odśwież stronę.");
                throw new Error("JSZip or FileSaver library not found.");
            }

            const zip = new JSZip();
            
            for (const audioFile of filesToDownload) {
                try {
                    const blob = await applyID3Tags(audioFile.file, audioFile.fetchedTags!);
                    zip.file(audioFile.newName!, blob);
                    // Update state back to success after processing, in case it was re-processed
                    updateFileState(audioFile.id, { state: ProcessingState.SUCCESS });
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
                alert("Nie udało się przetworzyć żadnego z wybranych plików. Sprawdź komunikaty o błędach przy każdym pliku.");
                // Revert downloading state for all files since nothing was downloaded
                filesToDownload.forEach(f => updateFileState(f.id, { state: ProcessingState.SUCCESS }));
            }
        } catch (e) {
            console.error("Download failed", e);
            alert(`Wystąpił błąd krytyczny podczas tworzenia archiwum ZIP: ${e instanceof Error ? e.message : e}`);
            filesToDownload.forEach(f => updateFileState(f.id, { state: ProcessingState.SUCCESS }));
        }
    };

    const handlePostDownloadRemove = () => {
        setFiles(files => files.filter(f => !f.isSelected));
        setModalState({ type: 'none' });
    };

    const openRenameModal = () => {
        setModalState({ type: 'rename' });
    }

    const handleBatchAnalyze = async () => {
        if (selectedFiles.length === 0) return;
        
        const filesToProcess = selectedFiles;
        const fileIdsToProcess = filesToProcess.map(f => f.id);

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
                    <WelcomeScreen>
                        <FileDropzone onFilesSelected={handleFilesSelected} onUrlSubmitted={handleUrlSubmitted} isProcessing={isProcessing} />
                    </WelcomeScreen>
                ) : (
                    <>
                        <FileDropzone onFilesSelected={handleFilesSelected} onUrlSubmitted={handleUrlSubmitted} isProcessing={isProcessing} />
                        <div className="mt-8">
                             <div className="flex justify-between items-center mb-4">
                                <div className="flex items-center space-x-4">
                                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Kolejka plików ({files.length})</h2>
                                    <button 
                                        onClick={handleToggleSelectAll}
                                        className="px-3 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-900/80 transition-colors"
                                    >
                                        {allFilesSelected ? 'Odznacz wszystko' : 'Zaznacz wszystko'}
                                    </button>
                                     <button 
                                        onClick={openRenameModal}
                                        className="px-3 py-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-900/80 transition-colors flex items-center"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                                        Zmień nazwy
                                    </button>
                                </div>
                                <button onClick={() => setModalState({ type: 'delete', fileId: 'all' })} className="px-3 py-1 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 rounded-md hover:bg-red-200 dark:hover:bg-red-900/80 transition-colors">Wyczyść wszystko</button>
                            </div>
                            <div className="space-y-3">
                                {sortedFiles.map(file => (
                                    <FileListItem 
                                        key={file.id} 
                                        file={file} 
                                        onProcess={handleProcessFile}
                                        onEdit={(f) => setModalState({ type: 'edit', fileId: f.id })}
                                        onRename={() => {}} // This is now handled globally
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

            {selectedFiles.length > 0 && (
                <BatchActionsToolbar 
                    selectedCount={selectedFiles.length}
                    onClearSelection={() => setFiles(fs => fs.map(f => ({ ...f, isSelected: false })))}
                    onProcess={() => selectedFiles.forEach(handleProcessFile)}
                    onDownload={handleDownload}
                    onBatchEdit={() => setModalState({ type: 'batch-edit' })}
                    onDelete={() => setModalState({ type: 'delete', fileId: 'selected' })}
                    onBatchAnalyze={handleBatchAnalyze}
                />
            )}
            
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