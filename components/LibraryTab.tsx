
import React from 'react';
import { AudioFile } from '../types';
import HeaderToolbar from './HeaderToolbar';
import FileListItem from './FileListItem';

interface LibraryTabProps {
  files: AudioFile[];
  sortedFiles: AudioFile[];
  selectedFiles: AudioFile[];
  allFilesSelected: boolean;
  isBatchAnalyzing: boolean;
  isSaving: boolean;
  directoryHandle: any | null;
  isRestored: boolean;
  onToggleSelectAll: () => void;
  onBatchAnalyze: (files: AudioFile[]) => void;
  onBatchAnalyzeAll: () => void;
  onDownloadOrSave: () => void;
  onBatchEdit: () => void; // For HeaderToolbar
  onSingleItemEdit: (fileId: string) => void; // For FileListItem
  onRename: () => void;
  onExportCsv: () => void;
  onDeleteItem: (id: string | 'selected' | 'all') => void;
  onClearAll: () => void;
  onProcessFile: (file: AudioFile) => void;
  onSelectionChange: (fileId: string, isSelected: boolean) => void;
  onTabChange: (tabId: string) => void;
}

const LibraryTab: React.FC<LibraryTabProps> = (props) => {
  if (props.files.length === 0) {
    return (
      <div className="text-center p-10 bg-slate-100 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 animate-fade-in">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-200">Twoja biblioteka jest pusta</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2 mb-4">
          Przejdź do zakładki "Import / Skan", aby dodać pliki audio.
        </p>
        <button
          onClick={() => props.onTabChange('scan')}
          className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-md hover:bg-indigo-500 transition-colors"
        >
          Przejdź do Importu
        </button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
       {props.isRestored && (
            <div className="my-4 p-3 bg-yellow-100 dark:bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-800 dark:text-yellow-300 rounded-r-lg" role="alert">
                <div className="flex justify-between items-center gap-4">
                    <div>
                        <p className="font-bold">Sesja przywrócona</p>
                        <p className="text-sm">Twoja poprzednia lista plików została wczytana. Aby zapisać lub pobrać pliki, musisz je ponownie załadować w zakładce "Import / Skan".</p>
                    </div>
                    <button
                        onClick={props.onClearAll}
                        className="px-3 py-1.5 text-xs font-semibold text-yellow-800 dark:text-yellow-200 bg-yellow-200 dark:bg-yellow-800/60 rounded-md hover:bg-yellow-300 dark:hover:bg-yellow-800/90 transition-colors flex-shrink-0"
                    >
                        Wyczyść listę
                    </button>
                </div>
            </div>
        )}
      <HeaderToolbar
        totalCount={props.files.length}
        selectedCount={props.selectedFiles.length}
        isAnalyzing={props.isBatchAnalyzing}
        isSaving={props.isSaving}
        allSelected={props.allFilesSelected}
        onToggleSelectAll={props.onToggleSelectAll}
        onAnalyze={() => props.onBatchAnalyze(props.selectedFiles)}
        onAnalyzeAll={props.onBatchAnalyzeAll}
        onDownloadOrSave={props.onDownloadOrSave}
        onEdit={props.onBatchEdit}
        onRename={props.onRename}
        onExportCsv={props.onExportCsv}
        onDelete={() => props.onDeleteItem('selected')}
        onClearAll={props.onClearAll}
        isDirectAccessMode={!!props.directoryHandle}
        directoryName={props.directoryHandle?.name}
        isRestored={props.isRestored}
      />
      <div className="space-y-3 mt-4">
        {props.sortedFiles.map(file => (
          <FileListItem 
            key={file.id} 
            file={file} 
            onProcess={props.onProcessFile}
            onEdit={(f) => props.onSingleItemEdit(f.id)}
            onDelete={props.onDeleteItem}
            onSelectionChange={props.onSelectionChange}
          />
        ))}
      </div>
    </div>
  );
};

export default LibraryTab;