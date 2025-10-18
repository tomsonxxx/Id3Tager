import React from 'react';
import ActionsDropdown from './ActionsDropdown';

interface BatchActionsToolbarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onProcess: () => void;
  onDownload: () => void;
  onBatchEdit: () => void;
  onDelete: () => void;
  onBatchAnalyze: () => void;
}

const BatchActionsToolbar: React.FC<BatchActionsToolbarProps> = ({
  selectedCount,
  onClearSelection,
  onProcess,
  onDownload,
  onBatchEdit,
  onDelete,
  onBatchAnalyze,
}) => {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-full max-w-xl z-50 animate-slide-up">
      <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-lg rounded-xl shadow-2xl p-3 flex items-center justify-between mx-4 border border-slate-200 dark:border-slate-700">
        <div className="flex items-center">
            <span className="text-sm font-bold bg-indigo-500 text-white rounded-full h-8 w-8 flex items-center justify-center mr-3">{selectedCount}</span>
            <span className="text-slate-700 dark:text-slate-300 font-medium">zaznaczono</span>
            <button onClick={onClearSelection} className="ml-4 text-xs text-indigo-600 dark:text-indigo-400 hover:underline">Wyczyść</button>
        </div>
        <div className="flex items-center space-x-2">
            <ActionsDropdown 
                onProcess={onProcess}
                onDownload={onDownload}
                onBatchEdit={onBatchEdit}
                onDelete={onDelete}
                onBatchAnalyze={onBatchAnalyze}
            />
        </div>
      </div>
    </div>
  );
};

export default BatchActionsToolbar;