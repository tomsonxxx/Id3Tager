import React, { useEffect, useRef, useState } from 'react';
import { AudioFile, ProcessingState } from '../types';
import { StatusIcon } from './StatusIcon';
import AlbumCover from './AlbumCover';
import TagPreviewTooltip from './TagPreviewTooltip';

interface FileListItemProps {
  file: AudioFile;
  onEdit: (file: AudioFile) => void;
  onProcess: (file: AudioFile) => void;
  onDelete: (file: AudioFile) => void;
  onSelectionChange: (fileId: string, isSelected: boolean) => void;
  isEditing: boolean; // Nowy prop
}

const FileListItem: React.FC<FileListItemProps> = ({
  file,
  onEdit,
  onProcess,
  onDelete,
  onSelectionChange,
  isEditing,
}) => {
  const isProcessing = file.state === ProcessingState.PROCESSING || file.state === ProcessingState.DOWNLOADING;
  const hasBeenProcessed = file.state === ProcessingState.SUCCESS || file.state === ProcessingState.ERROR;
  const hasFetchedTags = file.fetchedTags && Object.keys(file.fetchedTags).length > 0;
  
  const displayTags = file.fetchedTags || file.originalTags;
  const displayName = file.newName || file.file.name;
  const hasNewName = !!file.newName && file.newName !== file.file.name;

  const [animationClass, setAnimationClass] = useState('');
  const prevStateRef = useRef<ProcessingState>();

  useEffect(() => {
    const prevState = prevStateRef.current;
    const currentState = file.state;

    if (prevState === ProcessingState.PROCESSING && currentState === ProcessingState.SUCCESS) {
      setAnimationClass('animate-flash-success');
      const timer = setTimeout(() => setAnimationClass(''), 700); // Duration of the animation
      return () => clearTimeout(timer);
    }
    
    if (prevState === ProcessingState.PROCESSING && currentState === ProcessingState.ERROR) {
      setAnimationClass('animate-flash-error');
      const timer = setTimeout(() => setAnimationClass(''), 700); // Duration of the animation
      return () => clearTimeout(timer);
    }

    prevStateRef.current = currentState;
  }, [file.state]);

  const showIndividualActions = isEditing || file.state === ProcessingState.ERROR;

  return (
    <div className={`flex items-center p-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm transition-all duration-200 border ${file.isSelected ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-transparent dark:border-slate-700'} ${animationClass}`}>
      <input 
        type="checkbox"
        checked={!!file.isSelected}
        onChange={(e) => onSelectionChange(file.id, e.target.checked)}
        className="h-5 w-5 rounded bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 mr-4 flex-shrink-0"
      />
      <StatusIcon state={file.state} />
      <div className="relative group">
        <AlbumCover tags={displayTags} />
        {hasFetchedTags && <TagPreviewTooltip originalTags={file.originalTags} fetchedTags={file.fetchedTags} />}
      </div>
      <div className="flex-grow ml-4 overflow-hidden">
        <p className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate" title={displayName}>
            {displayName}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 truncate" title={file.file.name}>
          {hasNewName ? `Oryginalnie: ${file.file.name}` : `Artysta: ${displayTags?.artist || 'Brak'}`}
        </p>
        
        {(file.state === ProcessingState.DOWNLOADING || file.state === ProcessingState.SAVING) && typeof file.downloadProgress === 'number' && (
            <div className="mt-1.5">
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-0.5">
                    <span>Pobieranie okładki...</span>
                    <span>{file.downloadProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1">
                    <div className="bg-indigo-500 h-1 rounded-full transition-all duration-150" style={{ width: `${file.downloadProgress}%` }}></div>
                </div>
            </div>
        )}

        {file.state === ProcessingState.ERROR && (
          <p className="text-xs text-red-500 dark:text-red-400 mt-1 truncate" title={file.errorMessage}>
            {file.errorMessage}
          </p>
        )}
      </div>
      <div className="flex items-center space-x-2 ml-4 flex-shrink-0">
        {!hasBeenProcessed && (
           <button onClick={() => onProcess(file)} disabled={isProcessing} className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 disabled:opacity-50 disabled:cursor-not-allowed" title="Przetwarzaj">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
           </button>
        )}
        {showIndividualActions && (
            <>
                <button onClick={() => onEdit(file)} className="p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400" title="Edytuj tagi">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                </button>
                <button onClick={() => onDelete(file)} className="p-2 rounded-md hover:bg-red-100 dark:hover:bg-red-900/50 text-red-500 dark:text-red-400" title="Usuń">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                </button>
            </>
        )}
      </div>
    </div>
  );
};

export default FileListItem;