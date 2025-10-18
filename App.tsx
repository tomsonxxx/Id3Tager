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
import { AudioFile, ProcessingState, ID3Tags, SerializableAudioFile } from './types';
import { AIProvider, ApiKeys, fetchTagsForFile, fetchTagsForBatch, BatchResult } from './services/aiService';

// Utils
import { readID3Tags, applyID3Tags } from './utils/audioUtils';
import { generatePath } from './utils/filenameUtils';
import { sortFiles, SortKey } from './utils/sortingUtils';
import { get, set, del, clear } from './utils/db'; // DB utils

declare const uuid: { v4: () => string; };
declare const JSZip: any;
declare const saveAs: any;

// Fix: Augment the FileSystemFileHandle interface to include the `queryPermission`
// method, which is part of the File System Access API but may be missing from
// default TypeScript DOM typings.
declare global {
  interface FileSystemFileHandle {
    queryPermission(descriptor?: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  }
}

const MAX_CONCURRENT_REQUESTS = 3;

type ModalState = 
  | { type: 'none' }
  | { type: 'edit'; fileId: string }
  | { type: 'rename' }
  | { type: 'delete'; fileId: string | 'selected' | 'all' }
  | { type: 'settings' }
  | { type: 'batch-edit' }
  | { type: 'post-download'; count: number }
  | { type: 'zoom-cover', imageUrl: string }
  | { type: 'confirm-save' };

const APP_STATE_KEY = 'appState';

const App: React.FC = () => {
    const [files, setFiles] = useState<AudioFile[]>([]);
    const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isRestoring, setIsRestoring] = useState(true);
    const [isEditing, setIsEditing] = useState(false); // Nowy stan
    
    const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as 'light' | 'dark') || 'dark');
    const [apiKeys, setApiKeys] = useState<ApiKeys>(() => JSON.parse(localStorage.getItem('apiKeys') || '{"grok":"","openai":""}'));
    const [aiProvider, setAiProvider] = useState<AIProvider>(() => (localStorage.getItem('aiProvider') as AIProvider) || 'gemini');
    const [sortKey, setSortKey] = useState<SortKey>(() => (localStorage.getItem('sortKey') as SortKey) || 'dateAdded');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(() => (localStorage.getItem('sortDirection') as 'asc' | 'desc') || 'asc');
    const [renamePattern, setRenamePattern] = useState<string>(() => localStorage.getItem('renamePattern') || '[artist] - [title]');
    const [modalState, setModalState] = useState<ModalState>({ type: 'none' });

    const processingQueueRef = useRef<string[]>([]);
    const activeRequestsRef = useRef(0);

    // --- State Persistence ---

    useEffect(() => {
        if (isRestoring) return;
        const serializableFiles: SerializableAudioFile[] = files.map(({ file, handle, ...rest }) => rest);
        const appState = { files: serializableFiles };
        localStorage.setItem(APP_STATE_KEY, JSON.stringify(appState));
        files.forEach(f => { if (f.handle) { set(`handle_${f.id}`, f.handle); } });
    }, [files, isRestoring]);

    useEffect(() => {
        const restoreState = async () => {
            try {
                const savedStateJSON = localStorage.getItem(APP_STATE_KEY);
                if (!savedStateJSON) return;
                const savedState = JSON.parse(savedStateJSON);
                const savedFiles: SerializableAudioFile[] = savedState.files || [];
                if (savedFiles.length > 0) {
                    const restoredFiles: AudioFile[] = [];
                    for (const savedFile of savedFiles) {
                        try {
                            const handle = await get<FileSystemFileHandle>(`handle_${savedFile.id}`);
                            if (handle && await handle.queryPermission({ mode: 'readwrite' }) === 'granted') {
                                const file = await handle.getFile();
                                restoredFiles.push({ ...savedFile, file, handle });
                            }
                        } catch (e) { console.error(`Nie udało się przywrócić pliku: ${savedFile.id}`, e); }
                    }
                    setFiles(restoredFiles);
                    processingQueueRef.current = restoredFiles.filter(f => f.state === ProcessingState.PENDING).map(f => f.id);
                    processQueue();
                }
            } catch (error) {
                console.error("Błąd przywracania stanu:", error);
                localStorage.removeItem(APP_STATE_KEY);
                clear();
            } finally {
                setIsRestoring(false);
            }
        };
        restoreState();
    }, []);

    // --- Settings Persistence ---
    useEffect(() => { localStorage.setItem('theme', theme); document.documentElement.className = theme; }, [theme]);
    useEffect(() => { localStorage.setItem('apiKeys', JSON.stringify(apiKeys)); }, [apiKeys]);
    useEffect(() => { localStorage.setItem('aiProvider', aiProvider); }, [aiProvider]);
    useEffect(() => { localStorage.setItem('sortKey', sortKey); }, [sortKey]);
    useEffect(() => { localStorage.setItem('sortDirection', sortDirection); }, [sortDirection]);
    useEffect(() => { localStorage.setItem('renamePattern', renamePattern); }, [renamePattern]);

    // --- Derived State & Memos ---
    const sortedFiles = useMemo(() => sortFiles([...files], sortKey, sortDirection), [files, sortKey, sortDirection]);
    const selectedFiles = useMemo(() => files.filter(f => f.isSelected), [files]);
    const canSaveChanges = useMemo(() => selectedFiles.some(f => f.state === ProcessingState.SUCCESS && f.handle), [selectedFiles]);
    const allSelected = useMemo(() => files.length > 0 && selectedFiles.length === files.length, [files, selectedFiles]);

    // --- Core Logic ---

    const updateFileState = useCallback((id: string, updates: Partial<AudioFile>) => {
        setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
    }, []);
    
    const toggleEditMode = () => setIsEditing(prev => !prev);

    const processQueue = useCallback(async () => {
        while (activeRequestsRef.current < MAX_CONCURRENT_REQUESTS && processingQueueRef.current.length > 0) {
            const fileId = processingQueueRef.current.shift();
            if (!fileId) continue;

            const fileToProcess = files.find(f => f.id === fileId);
            if (!fileToProcess || fileToProcess.state !== ProcessingState.PENDING) continue;
            
            activeRequestsRef.current++;
            updateFileState(fileId, { state: ProcessingState.PROCESSING });
            
            try {
                const fetchedTags = await fetchTagsForFile(fileToProcess.file.name, fileToProcess.originalTags, aiProvider, apiKeys);
                updateFileState(fileId, {
                    state: ProcessingState.SUCCESS,
                    fetchedTags,
                    newName: generatePath(renamePattern, fetchedTags, fileToProcess.file.name),
                });
            } catch (error) {
                console.error("Błąd przetwarzania pliku:", error);
                updateFileState(fileId, { state: ProcessingState.ERROR, errorMessage: error instanceof Error ? error.message : String(error) });
            } finally {
                activeRequestsRef.current--;
                processQueue();
            }
        }
    }, [files, updateFileState, aiProvider, apiKeys, renamePattern]);

    const addFilesByHandles = async (handles: FileSystemFileHandle[]) => {
        const newFiles: AudioFile[] = [];
        for (const handle of handles) {
            if (handle.kind !== 'file') continue;
            try {
                const file = await handle.getFile();
                if (files.some(f => f.file.name === file.name && f.file.size === file.size)) continue;
                const originalTags = await readID3Tags(file);
                newFiles.push({
                    id: uuid.v4(),
                    file,
                    handle,
                    state: ProcessingState.PENDING,
                    originalTags,
                    isSelected: true,
                    dateAdded: Date.now(),
                });
            } catch (error) {
                console.error("Błąd dodawania pliku:", error);
                alert(`Nie można dodać pliku "${handle.name}": ${error instanceof Error ? error.message : 'Nieznany błąd'}`);
            }
        }
        if (newFiles.length > 0) {
            setFiles(prev => [...prev, ...newFiles]);
            processingQueueRef.current.push(...newFiles.map(f => f.id));
            setTimeout(processQueue, 100);
        }
    };
    
    // --- Event Handlers ---

    const handleBatchAnalyze = async () => {
        if (selectedFiles.length === 0 || isBatchAnalyzing) return;
        setIsBatchAnalyzing(true);
        selectedFiles.forEach(f => updateFileState(f.id, { state: ProcessingState.PROCESSING }));
        try {
            const results: BatchResult[] = await fetchTagsForBatch(selectedFiles, aiProvider, apiKeys);
            results.forEach(result => {
                const fileToUpdate = selectedFiles.find(f => f.file.name === result.originalFilename);
                if (fileToUpdate) {
                    const { originalFilename, ...fetchedTags } = result;
                    updateFileState(fileToUpdate.id, {
                        state: ProcessingState.SUCCESS,
                        fetchedTags,
                        newName: generatePath(renamePattern, fetchedTags, fileToUpdate.file.name),
                    });
                }
            });
            // Mark files not in result as errored
            selectedFiles.forEach(f => {
                if (!results.some(r => r.originalFilename === f.file.name)) {
                    updateFileState(f.id, { state: ProcessingState.ERROR, errorMessage: "AI nie zwróciło tagów dla tego pliku." });
                }
            });
        } catch (error) {
            console.error("Błąd analizy wsadowej:", error);
            selectedFiles.forEach(f => updateFileState(f.id, { state: ProcessingState.ERROR, errorMessage: error instanceof Error ? error.message : String(error) }));
        } finally {
            setIsBatchAnalyzing(false);
        }
    };

    const handleSaveChanges = async () => {
        const filesToSave = selectedFiles.filter(f => f.state === ProcessingState.SUCCESS && f.handle);
        if (filesToSave.length === 0) {
            alert("Brak zaznaczonych i pomyślnie przetworzonych plików z uprawnieniami do zapisu.");
            return;
        }

        setIsSaving(true);
        let successCount = 0;
        for (const file of filesToSave) {
            updateFileState(file.id, { state: ProcessingState.SAVING, downloadProgress: 0 });
            try {
                const onProgress = (progress: number) => updateFileState(file.id, { downloadProgress: progress });
                const blobWithTags = await applyID3Tags(file.file, file.fetchedTags || {}, onProgress);
                const writable = await file.handle!.createWritable();
                await writable.write(blobWithTags);
                await writable.close();
                updateFileState(file.id, { state: ProcessingState.SUCCESS, downloadProgress: undefined });
                successCount++;
            } catch (error) {
                console.error(`Błąd zapisu pliku ${file.file.name}:`, error);
                updateFileState(file.id, { state: ProcessingState.ERROR, errorMessage: `Błąd zapisu: ${error instanceof Error ? error.message : 'Nieznany błąd'}`, downloadProgress: undefined });
            }
        }
        setIsSaving(false);
        alert(`Pomyślnie zapisano zmiany w ${successCount} z ${filesToSave.length} plików.`);
    };

    const handleDownloadSelected = async () => {
        const filesToDownload = selectedFiles.filter(f => f.state === ProcessingState.SUCCESS);
        if (filesToDownload.length === 0) return;
        
        filesToDownload.forEach(f => updateFileState(f.id, { state: ProcessingState.DOWNLOADING, downloadProgress: 0 }));

        if (filesToDownload.length === 1) {
            const file = filesToDownload[0];
            const onProgress = (progress: number) => updateFileState(file.id, { downloadProgress: progress });
            const blob = await applyID3Tags(file.file, file.fetchedTags!, onProgress);
            saveAs(blob, file.newName || file.file.name);
            updateFileState(file.id, { state: ProcessingState.SUCCESS, downloadProgress: undefined });
        } else {
            const zip = new JSZip();
            for (const file of filesToDownload) {
                const onProgress = (progress: number) => updateFileState(file.id, { downloadProgress: progress });
                const blob = await applyID3Tags(file.file, file.fetchedTags!, onProgress);
                zip.file(file.newName || file.file.name, blob);
                updateFileState(file.id, { state: ProcessingState.SUCCESS, downloadProgress: undefined });
            }
            const content = await zip.generateAsync({ type: 'blob' });
            saveAs(content, 'TaggedMusic.zip');
        }
        setModalState({ type: 'post-download', count: filesToDownload.length });
    };

    const handleDelete = (fileId: string | 'selected' | 'all') => {
        let idsToDelete: string[] = [];
        if (fileId === 'selected') idsToDelete = selectedFiles.map(f => f.id);
        else if (fileId === 'all') idsToDelete = files.map(f => f.id);
        else idsToDelete = [fileId];

        idsToDelete.forEach(id => del(`handle_${id}`));
        setFiles(prev => prev.filter(f => !idsToDelete.includes(f.id)));
        processingQueueRef.current = processingQueueRef.current.filter(id => !idsToDelete.includes(id));
        setModalState({ type: 'none' });
    };
    
    // --- Render ---

    if (isRestoring) {
        return <div className="flex justify-center items-center h-screen text-lg">Przywracanie sesji...</div>;
    }

    return (
        <div className="min-h-screen flex flex-col font-sans">
            <main className="flex-grow container mx-auto px-4 py-8">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center">
                        <img src="/vite.svg" alt="logo" className="h-8 w-8 mr-3"/>
                        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Inteligentny Tagger ID3</h1>
                    </div>
                    <div className="flex items-center space-x-2">
                        <ThemeToggle theme={theme} setTheme={setTheme} />
                        <button onClick={() => setModalState({ type: 'settings' })} className="p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Ustawienia API">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 16v-2m8-6h-2M4 12H2m18 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </button>
                    </div>
                </div>
                
                {files.length === 0 ? (
                    <WelcomeScreen>
                        <FileDropzone onFileHandlesSelected={addFilesByHandles} onUrlSubmitted={async () => alert("Przetwarzanie z URL nie jest jeszcze zaimplementowane.")} isProcessing={isBatchAnalyzing} />
                    </WelcomeScreen>
                ) : (
                    <div className="space-y-4">
                        <HeaderToolbar
                            totalCount={files.length}
                            selectedCount={selectedFiles.length}
                            isProcessing={isBatchAnalyzing}
                            isSaving={isSaving}
                            canSaveChanges={canSaveChanges}
                            allSelected={allSelected}
                            isEditing={isEditing}
                            onToggleEditMode={toggleEditMode}
                            onToggleSelectAll={() => {
                                const targetState = !allSelected;
                                setFiles(fs => fs.map(f => ({...f, isSelected: targetState})))
                            }}
                            onAnalyze={handleBatchAnalyze}
                            onSaveChanges={() => setModalState({type: 'confirm-save'})}
                            onDownload={handleDownloadSelected}
                            onEdit={() => setModalState({ type: 'batch-edit' })}
                            onRename={() => setModalState({ type: 'rename' })}
                            onDelete={() => setModalState({ type: 'delete', fileId: 'selected' })}
                            onClearAll={() => setModalState({ type: 'delete', fileId: 'all' })}
                        />
                        <div className="space-y-2">
                            {sortedFiles.map(file => (
                                <FileListItem
                                    key={file.id}
                                    file={file}
                                    onEdit={(f) => setModalState({ type: 'edit', fileId: f.id })}
                                    onProcess={(f) => {
                                        processingQueueRef.current.unshift(f.id);
                                        processQueue();
                                    }}
                                    onDelete={(f) => setModalState({ type: 'delete', fileId: f.id })}
                                    onSelectionChange={(id, selected) => updateFileState(id, { isSelected: selected })}
                                    isEditing={isEditing}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </main>
            <Footer />

            {/* Modals */}
            <EditTagsModal
                isOpen={modalState.type === 'edit'}
                onClose={() => setModalState({ type: 'none' })}
                onSave={(tags) => {
                    if (modalState.type === 'edit') {
                        updateFileState(modalState.fileId, { fetchedTags: tags, newName: generatePath(renamePattern, tags, files.find(f => f.id === modalState.fileId)!.file.name) });
                        setModalState({ type: 'none' });
                    }
                }}
                file={files.find(f => f.id === (modalState as any).fileId)!}
                onManualSearch={async (query, file) => {
                    updateFileState(file.id, { state: ProcessingState.PROCESSING });
                    try {
                        const fetchedTags = await fetchTagsForFile(query, file.originalTags, aiProvider, apiKeys);
                         updateFileState(file.id, { state: ProcessingState.SUCCESS, fetchedTags, newName: generatePath(renamePattern, fetchedTags, file.file.name) });
                    } catch (e) {
                        updateFileState(file.id, { state: ProcessingState.ERROR, errorMessage: e instanceof Error ? e.message : String(e) });
                        throw e; // Re-throw to be caught in the modal
                    }
                }}
                onZoomCover={(imageUrl) => setModalState({ type: 'zoom-cover', imageUrl })}
            />
            <RenameModal isOpen={modalState.type === 'rename'} onClose={() => setModalState({ type: 'none' })} onSave={setRenamePattern} currentPattern={renamePattern} exampleFile={files.find(f => f.fetchedTags)} />
            <ConfirmationModal 
                isOpen={modalState.type === 'delete'}
                onCancel={() => setModalState({ type: 'none' })}
                onConfirm={() => handleDelete((modalState as any).fileId)}
                title="Potwierdź usunięcie"
            >
                Czy na pewno chcesz usunąć {(modalState as any).fileId === 'selected' ? `${selectedFiles.length} zaznaczonych plików` : (modalState as any).fileId === 'all' ? 'wszystkie pliki' : 'ten plik'} z kolejki?
            </ConfirmationModal>
            <ConfirmationModal
                isOpen={modalState.type === 'confirm-save'}
                onCancel={() => setModalState({ type: 'none' })}
                onConfirm={() => { handleSaveChanges(); setModalState({type: 'none'}); }}
                title="Zapisać zmiany?"
            >
                Ta operacja nadpisze oryginalne pliki na Twoim dysku. Zmiany będą nieodwracalne. Czy na pewno chcesz kontynuować?
            </ConfirmationModal>
            <BatchEditModal isOpen={modalState.type === 'batch-edit'} onClose={() => setModalState({ type: 'none' })} onSave={(tags) => {
                selectedFiles.forEach(f => {
                    const newTags = { ...(f.fetchedTags || f.originalTags), ...tags };
                    updateFileState(f.id, { fetchedTags: newTags, newName: generatePath(renamePattern, newTags, f.file.name) });
                });
                setModalState({ type: 'none' });
            }} files={selectedFiles} />
            <SettingsModal isOpen={modalState.type === 'settings'} onClose={() => setModalState({ type: 'none' })} onSave={setApiKeys} currentKeys={apiKeys} />
            <PostDownloadModal isOpen={modalState.type === 'post-download'} count={(modalState as any).count || 0} onKeep={() => setModalState({type: 'none'})} onRemove={() => handleDelete('selected')} />
            <AlbumCoverModal isOpen={modalState.type === 'zoom-cover'} onClose={() => setModalState({type: 'none'})} imageUrl={(modalState as any).imageUrl} />
        </div>
    );
};

export default App;