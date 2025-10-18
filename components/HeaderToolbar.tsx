import React from 'react';

interface HeaderToolbarProps {
  totalCount: number;
  selectedCount: number;
  isProcessing: boolean;
  isSaving: boolean;
  allSelected: boolean;
  canSaveChanges: boolean;
  onToggleSelectAll: () => void;
  onAnalyze: () => void;
  onSaveChanges: () => void;
  onDownload: () => void;
  onEdit: () => void;
  onRename: () => void;
  onDelete: () => void;
  onClearAll: () => void;
}

const ActionButton: React.FC<{
  onClick: () => void;
  disabled: boolean;
  isLoading?: boolean;
  title: string;
  children: React.ReactNode;
  isDanger?: boolean;
}> = ({ onClick, disabled, isLoading = false, title, children, isDanger = false }) => {
  const baseClasses = "px-3 py-1.5 text-xs font-semibold rounded-md flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-slate-900";
  const colorClasses = isDanger
    ? "text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 hover:bg-red-200 dark:hover:bg-red-900/80 disabled:bg-red-100/50 dark:disabled:bg-red-900/30 focus:ring-red-500"
    : "text-indigo-600 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-900/50 hover:bg-indigo-200 dark:hover:bg-indigo-900/80 disabled:bg-indigo-100/50 dark:disabled:bg-indigo-900/30 focus:ring-indigo-500";
  const disabledClasses = "disabled:cursor-not-allowed disabled:text-slate-400 dark:disabled:text-slate-600";
  
  return (
    <button
      onClick={onClick}
      disabled={disabled || isLoading}
      title={title}
      className={`${baseClasses} ${colorClasses} ${disabledClasses}`}
    >
      {isLoading ? <span className="btn-spinner !mr-2 h-4 w-4"></span> : children}
    </button>
  );
};

const HeaderToolbar: React.FC<HeaderToolbarProps> = ({
  totalCount,
  selectedCount,
  isProcessing,
  isSaving,
  allSelected,
  canSaveChanges,
  onToggleSelectAll,
  onAnalyze,
  onSaveChanges,
  onDownload,
  onEdit,
  onRename,
  onDelete,
  onClearAll
}) => {
  const hasSelection = selectedCount > 0;
  const anyActionInProgress = isProcessing || isSaving;

  return (
    <div className="p-3 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Kolejka ({totalCount})</h2>
                {totalCount > 0 && (
                  <button
                      onClick={onToggleSelectAll}
                      disabled={anyActionInProgress}
                      className="px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/50 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-900/80 transition-colors disabled:opacity-50"
                  >
                      {allSelected ? 'Odznacz wszystko' : 'Zaznacz wszystko'}
                  </button>
                )}
            </div>
            <div className="flex items-center flex-wrap gap-2">
                <ActionButton
                    onClick={onAnalyze}
                    disabled={!hasSelection || anyActionInProgress}
                    isLoading={isProcessing}
                    title="Analizuj zaznaczone pliki"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                    {isProcessing ? 'Analizuję...' : 'Analizuj'}
                </ActionButton>
                 <ActionButton
                    onClick={onSaveChanges}
                    disabled={!canSaveChanges || anyActionInProgress}
                    isLoading={isSaving}
                    title="Zapisz zmiany w oryginalnych plikach"
                >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
                    {isSaving ? 'Zapisuję...' : 'Zapisz'}
                </ActionButton>
                 <ActionButton
                    onClick={onDownload}
                    disabled={!hasSelection || anyActionInProgress}
                    title="Pobierz zaznaczone pliki jako ZIP"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    Pobierz
                </ActionButton>
                <ActionButton
                    onClick={onEdit}
                    disabled={!hasSelection || anyActionInProgress}
                    title="Edytuj masowo zaznaczone pliki"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" /></svg>
                    Edytuj
                </ActionButton>
                <ActionButton
                    onClick={onRename}
                    disabled={anyActionInProgress}
                    title="Ustaw szablon zmiany nazw dla wszystkich plików"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
                    Zmień nazwy
                </ActionButton>
                 <ActionButton
                    onClick={onDelete}
                    disabled={!hasSelection || anyActionInProgress}
                    title="Usuń zaznaczone pliki z kolejki"
                    isDanger
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                    Usuń
                </ActionButton>
                {totalCount > 0 && (
                    <>
                    <div className="border-l border-slate-300 dark:border-slate-600 h-6 mx-2"></div>
                    <button 
                        onClick={onClearAll}
                        title="Wyczyść całą kolejkę"
                        disabled={anyActionInProgress}
                        className="px-3 py-1.5 text-xs font-semibold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/50 rounded-md hover:bg-red-200 dark:hover:bg-red-900/80 transition-colors disabled:opacity-50"
                    >
                        Wyczyść wszystko
                    </button>
                    </>
                )}
            </div>
        </div>
    </div>
  );
};

export default HeaderToolbar;
