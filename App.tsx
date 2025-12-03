
import React, { useState, useEffect, useCallback } from 'react';

// Components
import FileDropzone from './components/FileDropzone';
import SettingsModal from './components/SettingsModal';
import RenameModal from './components/RenameModal';
import BatchEditModal from './components/BatchEditModal';
import PostDownloadModal from './components/PostDownloadModal';
import PreviewChangesModal from './components/PreviewChangesModal';
import DuplicateResolverModal from './components/DuplicateResolverModal';
import XmlConverterModal from './components/XmlConverterModal'; 
import ToastContainer, { Toast, ToastType } from './components/ToastContainer';

// New Components (Library View)
import Sidebar from './components/Sidebar';
import TrackTable from './components/TrackTable';
import TrackGrid from './components/TrackGrid'; 
import RightPanel from './components/RightPanel';
import PlayerDock from './components/PlayerDock';
import LibraryToolbar from './components/LibraryToolbar';
import FilterBar from './components/FilterBar'; 
import WelcomeScreen from './components/WelcomeScreen';
import ContextMenu, { ContextMenuAction } from './components/ContextMenu'; 

// Hooks
import { useLibrary } from './hooks/useLibrary';
import { useSettings } from './hooks/useSettings';
import { useAIProcessing } from './hooks/useAIProcessing';

// Utils
import { applyTags, saveFileDirectly, isTagWritingSupported } from './utils/audioUtils';
import { ProcessingState, AudioFile } from './types';
import { findDuplicateSets } from './utils/duplicateUtils';
import { exportFilesToCsv } from './utils/csvUtils';

// Declare libs
declare const JSZip: any;
declare const saveAs: any;
declare const uuid: { v4: () => string; };

const SUPPORTED_FORMATS = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/flac', 'audio/wav', 'audio/ogg', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/x-ms-wma'];

type ModalState = 
  | { type: 'none' }
  | { type: 'settings' }
  | { type: 'rename' }
  | { type: 'batch-edit' }
  | { type: 'post-download'; count: number }
  | { type: 'preview-changes'; title: string; confirmationText: string; previews: any[]; onConfirm: () => void; }
  | { type: 'import' }
  | { type: 'duplicates'; sets: Map<string, AudioFile[]> }
  | { type: 'xml-converter' }; 

async function* getFilesRecursively(entry: any): AsyncGenerator<{ file: File, handle: any, path: string }> {
    if (entry.kind === 'file') {
        const file = await entry.getFile();
        if (SUPPORTED_FORMATS.includes(file.type)) {
            yield { file, handle: entry, path: entry.name };
        }
    } else if (entry.kind === 'directory') {
        for await (const handle of entry.values()) {
            for await (const nestedFile of getFilesRecursively(handle)) {
                 yield { ...nestedFile, path: `${entry.name}/${nestedFile.path}` };
            }
        }
    }
}

const App: React.FC = () => {
    // --- State Management via Hooks ---
    const { 
        theme, setTheme, apiKeys, setApiKeys, aiProvider, setAiProvider, renamePattern, setRenamePattern,
        analysisSettings, setAnalysisSettings
    } = useSettings();

    const {
        files, setFiles, sortedFiles, paginatedFiles,
        selectedFileIds, activeFileId, activeFile, selectedFiles,
        isRestored, sortConfig, setSortConfig,
        addFiles, updateFile, removeFiles, toggleSelection, selectAll, clearSelection, activateFile,
        setIsRestored,
        filters, setFilters, availableGenres,
        playlists, createPlaylist, deletePlaylist, addToPlaylist,
        currentPage, totalPages, setCurrentPage, itemsPerPage, setItemsPerPage
    } = useLibrary(renamePattern);

    const { 
        analyzeBatch, isBatchAnalyzing 
    } = useAIProcessing(files, updateFile, apiKeys, aiProvider, analysisSettings);

    // --- Local App State ---
    const [isSaving, setIsSaving] = useState(false);
    const [directoryHandle, setDirectoryHandle] = useState<any | null>(null);
    const [modalState, setModalState] = useState<ModalState>({ type: 'none' });
    const [toasts, setToasts] = useState<Toast[]>([]);
    
    // View State
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const [showFilters, setShowFilters] = useState(false);

    // Context Menu State
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, targetId: string } | null>(null);

    // --- Toast Helpers ---
    const addToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = typeof uuid !== 'undefined' ? uuid.v4() : Date.now().toString();
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // --- Keyboard Shortcuts ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
                return;
            }

            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedFileIds.length > 0 && modalState.type === 'none') {
                    if (confirm(`Usunąć ${selectedFileIds.length} plików z biblioteki?`)) {
                        removeFiles(selectedFileIds);
                        addToast(`Usunięto ${selectedFileIds.length} plików`, 'success');
                    }
                }
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                selectAll();
            }

            if (e.key === 'Escape') {
                if (modalState.type !== 'none') {
                    setModalState({ type: 'none' });
                } else if (contextMenu) {
                    setContextMenu(null);
                } else if (selectedFileIds.length > 0) {
                    clearSelection();
                } else if (showFilters) {
                    setShowFilters(false);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedFileIds, modalState, contextMenu, removeFiles, selectAll, clearSelection, showFilters, addToast]);


    // --- Handlers ---

    const handleFilesSelected = async (fileList: FileList) => {
        const filesToAdd = Array.from(fileList).map(f => ({ file: f }));
        await addFiles(filesToAdd);
        addToast(`Dodano ${filesToAdd.length} plików`, 'success');
    };

    const handleDirectoryConnect = async (handle: any) => {
        setIsRestored(false);
        setDirectoryHandle(handle);
        setFiles([]);
        try {
            const filesToProcess = [];
            for await (const fileData of getFilesRecursively(handle)) {
                filesToProcess.push(fileData);
            }
            await addFiles(filesToProcess);
            addToast(`Wczytano folder: ${handle.name}`, 'success');
        } catch (error) {
            addToast(`Błąd odczytu folderu: ${error}`, 'error');
        }
    };
    
    const handleUrlSubmitted = async (url: string) => {
        try {
            const proxyUrl = 'https://api.allorigins.win/raw?url=';
            const response = await fetch(proxyUrl + encodeURIComponent(url));
            if (!response.ok) throw new Error("Network error");
            const blob = await response.blob();
            const file = new File([blob], 'remote.mp3', { type: blob.type });
            await addFiles([{ file }]);
            addToast('Pobrano plik z URL', 'success');
        } catch(e) { 
            addToast("Błąd pobierania URL", 'error'); 
        }
    };

    const handleDownloadOrSave = async () => {
        const targetFiles = selectedFiles.length > 0 ? selectedFiles : files;
        if (targetFiles.length === 0) return;

        const previews = targetFiles.map(file => {
             const newName = file.newName || file.file.name;
             const oldName = file.webkitRelativePath || file.file.name;
             return { originalName: oldName, newName, isTooLong: newName.length > 255 };
        }).filter(p => p.originalName !== p.newName);

        const execute = () => executeDownloadOrSave(targetFiles);

        if (previews.length === 0) {
            await execute();
        } else {
            setModalState({
                type: 'preview-changes',
                title: directoryHandle ? 'Potwierdź zapis' : 'Potwierdź pobieranie',
                confirmationText: 'Pliki zostaną zmienione zgodnie z szablonem.',
                previews,
                onConfirm: () => {
                    setModalState({ type: 'none' });
                    setTimeout(execute, 50);
                }
            });
        }
    };

    const executeDownloadOrSave = async (targetFiles: AudioFile[]) => {
        if (directoryHandle) {
             setIsSaving(true);
             const ids = targetFiles.map(f => f.id);
             setFiles(files => files.map(f => ids.includes(f.id) ? { ...f, state: ProcessingState.DOWNLOADING } : f));
             
             let successCount = 0;
             let errorCount = 0;

             for (const file of targetFiles) {
                 const res = await saveFileDirectly(directoryHandle, file);
                 if (res.success && res.updatedFile) {
                     updateFile(file.id, { ...res.updatedFile, state: ProcessingState.SUCCESS });
                     successCount++;
                 } else {
                     updateFile(file.id, { state: ProcessingState.ERROR, errorMessage: res.errorMessage });
                     errorCount++;
                 }
             }
             setIsSaving(false);
             if (errorCount > 0) {
                 addToast(`Zapisano ${successCount} plików. Błędy: ${errorCount}`, 'info');
             } else {
                 addToast("Zapis zakończony pomyślnie.", 'success');
             }
        } else {
             handleDownloadZip(targetFiles);
        }
    };

    const handleDownloadZip = async (targetFiles: AudioFile[]) => {
        setIsSaving(true);
        try {
             if (typeof JSZip === 'undefined' || typeof saveAs === 'undefined') throw new Error("Biblioteki ZIP nie zostały załadowane");
             const zip = new JSZip();
             
             for (const file of targetFiles) {
                  let blob: Blob = file.file;
                  if (isTagWritingSupported(file.file)) {
                      try {
                          blob = await applyTags(file.file, file.fetchedTags || file.originalTags);
                      } catch (tagError) {
                          console.warn(`Skipping tagging for ZIP for ${file.file.name}:`, tagError);
                          blob = file.file;
                      }
                  }
                  zip.file(file.newName || file.file.name, blob); 
             }
             
             const content = await zip.generateAsync({type:"blob"});
             saveAs(content, "music.zip");
             setModalState({ type: 'post-download', count: targetFiles.length });
        } catch(e) { 
            console.error(e);
            addToast("Błąd tworzenia archiwum ZIP", 'error'); 
        }
        setIsSaving(false);
    };

    const handleFindDuplicates = () => {
        if (files.length < 2) {
            addToast("Dodaj więcej plików, aby wyszukać duplikaty.", 'info');
            return;
        }
        const sets = findDuplicateSets(files);
        if (sets.size === 0) {
            addToast("Nie znaleziono duplikatów w bibliotece.", 'success');
            return;
        }
        setModalState({ type: 'duplicates', sets });
    };

    const handleExportCsv = () => {
        if (files.length === 0) return;
        try {
            const csvContent = exportFilesToCsv(files);
            const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
            saveAs(blob, "lumbago_library_export.csv");
            addToast("Wyeksportowano plik CSV", 'success');
        } catch (e) {
            console.error("Export CSV failed", e);
            addToast("Wystąpił błąd podczas eksportu CSV.", 'error');
        }
    };

    const handleCreatePlaylist = () => {
        const name = prompt("Podaj nazwę nowej playlisty:");
        if (name && name.trim()) {
            createPlaylist(name.trim());
            addToast(`Utworzono playlistę "${name}"`, 'success');
        }
    };

    const handleContextMenu = (e: React.MouseEvent, fileId: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, targetId: fileId });
        
        if (!selectedFileIds.includes(fileId)) {
            toggleSelection(fileId, false);
        }
    };

    // New handlers for Sidebar
    const handleShowRecentlyAdded = () => {
        setSortConfig([{ key: 'dateAdded', direction: 'desc' }]);
        setFilters(prev => ({ ...prev, playlistId: null }));
        addToast('Pokaż ostatnio dodane', 'info');
    };

    const getContextMenuActions = (): ContextMenuAction[] => {
        if (!contextMenu) return [];
        const isMultiSelect = selectedFileIds.length > 1;
        const targetFile = files.find(f => f.id === contextMenu.targetId);
        const filesToAddIds = selectedFileIds.length > 0 ? selectedFileIds : [contextMenu.targetId];
        
        const actions: ContextMenuAction[] = [
            {
                label: isMultiSelect ? `Przetwarzaj zaznaczone (${selectedFileIds.length})` : 'Przetwarzaj (AI)',
                icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500" viewBox="0 0 20 20" fill="currentColor"><path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" /></svg>,
                onClick: () => analyzeBatch(selectedFileIds.length > 0 ? selectedFiles : (targetFile ? [targetFile] : [])),
                disabled: isBatchAnalyzing
            },
            {
                label: 'Edytuj Tagi',
                icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-500" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>,
                onClick: () => {
                    if (selectedFileIds.length > 1) {
                        setModalState({ type: 'batch-edit' });
                    } else if (targetFile) {
                        activateFile(targetFile);
                    }
                }
            },
            {
                label: 'Dodaj do Playlisty',
                icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>,
                onClick: () => {}, 
                subMenu: playlists.length > 0 
                    ? playlists.map(pl => ({
                        label: pl.name,
                        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor"><path d="M18 3a1 1 0 00-1.196-.98l-10 2A1 1 0 006 5v9.114A4.369 4.369 0 005 14c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V7.82l8-1.6v5.894A4.37 4.37 0 0015 12c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2V3z" /></svg>,
                        onClick: () => {
                            addToPlaylist(pl.id, filesToAddIds);
                            addToast(`Dodano do playlisty "${pl.name}"`, 'success');
                        }
                    }))
                    : [{ label: 'Brak playlist (Utwórz nową)', icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-300" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" /></svg>, onClick: handleCreatePlaylist }]
            },
            {
                label: 'Znajdź Duplikaty',
                icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor"><path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" /></svg>,
                onClick: handleFindDuplicates,
                divider: true
            },
            {
                label: 'Pobierz / Zapisz',
                icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-600" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>,
                onClick: handleDownloadOrSave,
                disabled: isSaving
            },
            {
                label: 'Usuń',
                icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>,
                onClick: () => {
                    if (confirm('Usunąć?')) {
                        removeFiles(selectedFileIds.length > 0 ? selectedFileIds : [contextMenu.targetId]);
                        addToast('Usunięto pliki', 'info');
                    }
                },
                isDanger: true,
                divider: true
            }
        ];
        return actions;
    };

    return (
        <div className="flex h-screen bg-slate-50 dark:bg-slate-950 font-sans overflow-hidden">
            
            <Sidebar 
                totalFiles={files.length} 
                playlists={playlists}
                activePlaylistId={filters.playlistId || null}
                onPlaylistSelect={(id) => setFilters(prev => ({ ...prev, playlistId: id }))}
                onCreatePlaylist={handleCreatePlaylist}
                onDeletePlaylist={(id) => {
                    if (confirm('Usunąć playlistę?')) {
                        deletePlaylist(id);
                        addToast('Usunięto playlistę', 'info');
                    }
                }}
                onShowRecentlyAdded={handleShowRecentlyAdded}
                onShowDuplicates={handleFindDuplicates}
                onShowXmlConverter={() => setModalState({ type: 'xml-converter' })}
                onShowReports={() => addToast('Raporty AI dostępne wkrótce (Faza 2)', 'info')}
            />

            <div className="flex-grow flex flex-col min-w-0">
                
                <LibraryToolbar 
                    onImport={() => setModalState({ type: 'import' })}
                    onSettings={() => setModalState({ type: 'settings' })}
                    onAnalyzeAll={() => analyzeBatch(files.filter(f => f.state !== ProcessingState.SUCCESS || !f.fetchedTags?.bpm || !f.fetchedTags?.genre))}
                    onAnalyzeSelected={() => analyzeBatch(selectedFiles, false)}
                    onForceAnalyzeSelected={() => analyzeBatch(selectedFiles, true)}
                    onEdit={() => setModalState({ type: 'batch-edit' })}
                    onExport={() => handleDownloadOrSave()}
                    onDelete={() => {
                        if(confirm('Usunąć zaznaczone pliki?')) {
                            removeFiles(selectedFileIds);
                            addToast('Usunięto pliki', 'info');
                        }
                    }}
                    onClearAll={() => {
                        if(confirm('Wyczyścić bibliotekę?')) {
                            setFiles([]);
                            addToast('Wyczyszczono bibliotekę', 'success');
                        }
                    }}
                    onRename={() => setModalState({ type: 'rename' })}
                    onFindDuplicates={handleFindDuplicates}
                    onExportCsv={handleExportCsv}
                    onConvertXml={() => setModalState({ type: 'xml-converter' })}
                    
                    selectedCount={selectedFileIds.length}
                    totalCount={files.length}
                    allSelected={files.length > 0 && selectedFileIds.length === files.length}
                    onToggleSelectAll={() => selectedFileIds.length === files.length ? clearSelection() : selectAll()}
                    
                    theme={theme}
                    setTheme={setTheme}
                    isProcessing={isBatchAnalyzing || isSaving}
                    isDirectAccessMode={!!directoryHandle}
                    directoryName={directoryHandle?.name}
                    isRestored={isRestored}

                    searchQuery={filters.search}
                    onSearchChange={(q) => setFilters(prev => ({ ...prev, search: q }))}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    showFilters={showFilters}
                    onToggleFilters={() => setShowFilters(!showFilters)}
                />

                {showFilters && (
                    <FilterBar 
                        filters={filters}
                        onFilterChange={setFilters}
                        onClearFilters={() => setFilters({ search: filters.search })}
                        availableGenres={availableGenres}
                    />
                )}

                {files.length === 0 ? (
                    <div className="flex-grow overflow-y-auto p-8 flex flex-col items-center justify-center">
                        <WelcomeScreen onDirectoryConnect={handleDirectoryConnect}>
                             <FileDropzone onFilesSelected={handleFilesSelected} onUrlSubmitted={handleUrlSubmitted} isProcessing={false} />
                        </WelcomeScreen>
                    </div>
                ) : (
                    <>
                        {viewMode === 'list' ? (
                            <TrackTable 
                                files={paginatedFiles}
                                selectedFileIds={selectedFileIds}
                                activeFileId={activeFileId}
                                onSelect={toggleSelection}
                                onSelectAll={selectAll}
                                onActivate={activateFile}
                                sortConfig={sortConfig}
                                onSort={setSortConfig}
                                onContextMenu={handleContextMenu}
                                currentPage={currentPage}
                                totalPages={totalPages}
                                onPageChange={setCurrentPage}
                                itemsPerPage={itemsPerPage}
                                onItemsPerPageChange={setItemsPerPage}
                            />
                        ) : (
                            <TrackGrid 
                                files={paginatedFiles}
                                selectedFileIds={selectedFileIds}
                                activeFileId={activeFileId}
                                onSelect={toggleSelection}
                                onActivate={activateFile}
                            />
                        )}
                    </>
                )}

                <PlayerDock activeFile={activeFile} onUpdateFile={updateFile} />
            </div>

            <RightPanel 
                file={activeFile} 
                allFiles={files}
                onClose={() => activateFile(null as any)} 
                onRenamePatternSettings={() => setModalState({ type: 'rename' })}
                onActivateFile={activateFile}
            />

            {contextMenu && (
                <ContextMenu 
                    x={contextMenu.x}
                    y={contextMenu.y}
                    actions={getContextMenuActions()}
                    onClose={() => setContextMenu(null)}
                />
            )}

            <ToastContainer toasts={toasts} removeToast={removeToast} />

            {/* Modals - Wrapped with backdrop-blur through classes inside components */}
            {modalState.type === 'import' && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-10 animate-fade-in" onClick={() => setModalState({ type: 'none' })}>
                    <div className="glass-panel rounded-xl p-8 max-w-4xl w-full" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-bold dark:text-white mb-6">Importuj utwory</h2>
                        <FileDropzone onFilesSelected={(f) => { handleFilesSelected(f); setModalState({ type: 'none' }); }} onUrlSubmitted={handleUrlSubmitted} isProcessing={false} />
                        <div className="mt-4 text-center">
                             <button onClick={() => setModalState({ type: 'none' })} className="text-slate-500 hover:text-white transition-colors">Anuluj</button>
                        </div>
                    </div>
                </div>
            )}
            
            {modalState.type === 'settings' && (
                <SettingsModal 
                    isOpen={true} 
                    onClose={() => setModalState({ type: 'none' })} 
                    onSave={(k, p, as) => { 
                        setApiKeys(k); 
                        setAiProvider(p); 
                        setAnalysisSettings(as); 
                        setModalState({type: 'none'}); 
                        addToast('Zapisano ustawienia', 'success'); 
                    }} 
                    currentKeys={apiKeys} 
                    currentProvider={aiProvider}
                    currentAnalysisSettings={analysisSettings}
                />
            )}
            {modalState.type === 'batch-edit' && <BatchEditModal isOpen={true} onClose={() => setModalState({ type: 'none' })} onSave={(tags) => { 
                const ids = selectedFileIds;
                ids.forEach(id => updateFile(id, { fetchedTags: { ...(files.find(f => f.id === id)?.fetchedTags || {}), ...tags } }));
                setModalState({ type: 'none' });
                addToast('Zaktualizowano tagi', 'success');
            }} files={selectedFiles} />}
            {modalState.type === 'preview-changes' && <PreviewChangesModal isOpen={true} {...modalState} onCancel={() => setModalState({type:'none'})} >{modalState.confirmationText}</PreviewChangesModal>}
            {modalState.type === 'post-download' && <PostDownloadModal isOpen={true} onRemove={() => { removeFiles(selectedFileIds); setModalState({type:'none'}); addToast('Wyczyszczono kolejkę', 'info'); }} onKeep={() => setModalState({type:'none'})} count={modalState.count} />}
            {modalState.type === 'rename' && <RenameModal isOpen={true} onClose={() => setModalState({type: 'none'})} onSave={(pattern) => { setRenamePattern(pattern); setModalState({type: 'none'}); addToast('Zapisano wzorzec nazw', 'success'); }} currentPattern={renamePattern} files={files} />}
            
            {modalState.type === 'duplicates' && (
                <DuplicateResolverModal 
                    isOpen={true}
                    onClose={() => setModalState({ type: 'none' })}
                    duplicateSets={modalState.sets}
                    onRemoveFiles={(idsToRemove) => {
                        removeFiles(idsToRemove);
                        setModalState({ type: 'none' });
                        addToast(`Rozwiązano duplikaty (usunięto ${idsToRemove.length})`, 'success');
                    }}
                />
            )}

            {modalState.type === 'xml-converter' && (
                <XmlConverterModal 
                    isOpen={true}
                    onClose={() => setModalState({ type: 'none' })}
                />
            )}
        </div>
    );
};

export default App;
