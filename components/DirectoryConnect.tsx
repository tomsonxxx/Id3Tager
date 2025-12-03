import React, { useState } from 'react';

declare global {
    interface Window {
        showDirectoryPicker?: (options?: any) => Promise<any>;
    }
}

interface DirectoryConnectProps {
    onDirectoryConnect: (handle: any) => void;
}

const DirectoryConnect: React.FC<DirectoryConnectProps> = ({ onDirectoryConnect }) => {
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleConnect = async () => {
        setErrorMessage(null);
        try {
            // 1. Try AI Studio brokered API
            // Cast to any to avoid type conflict with existing AIStudio definition
            const aistudioPicker = (window as any).aistudio?.showDirectoryPicker;
            if (typeof aistudioPicker === 'function') {
                const handle = await aistudioPicker({ mode: 'readwrite' });
                onDirectoryConnect(handle);
                return;
            }
    
            // 2. Try Standard Browser API
            // We wrap this in a specific try/catch because accessing the property might throw in some sandboxes
            if (typeof window.showDirectoryPicker === 'function') {
                const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                onDirectoryConnect(handle);
                return;
            }
    
            throw new Error("Twoja przeglądarka nie obsługuje File System Access API.");
    
        } catch (error: any) {
            // Handle User Cancellation
            if (error.name === 'AbortError') {
                return; 
            }
    
            // Handle Security/Iframe Restrictions
            // Chrome throws 'SecurityError' if inside a cross-origin iframe
            if (error.name === 'SecurityError' || error.message?.includes('Cross origin') || error.message?.includes('frame')) {
                console.error('Directory Access Blocked:', error);
                setErrorMessage(
                    "⚠️ Bezpośredni dostęp do folderów jest zablokowany przez zabezpieczenia przeglądarki w tym trybie (np. w oknie podglądu). " +
                    "Aby użyć tej funkcji, otwórz aplikację w nowej, pełnej karcie lub użyj metody 'Przeciągnij i Upuść' powyżej."
                );
            } else {
                console.error('Directory Connect Error:', error);
                setErrorMessage(`Nie udało się połączyć: ${error.message || "Nieznany błąd"}`);
            }
        }
    };

    return (
        <div className="flex flex-col items-center justify-center p-6 bg-slate-100 dark:bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700">
            <div className="flex items-center text-indigo-600 dark:text-indigo-400 mb-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    <path stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 11V7m0 8v-2" />
                </svg>
                 <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">Tryb Folderu (Eksperymentalny)</h3>
            </div>
            <p className="max-w-md text-xs text-center text-slate-500 dark:text-slate-400 mb-4">
                Edytuj pliki bezpośrednio na dysku bez tworzenia kopii ZIP. Wymaga przeglądarki opartej na Chromium (Chrome, Edge, Brave).
            </p>
            
            {errorMessage && (
                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-xs rounded-md border border-amber-200 dark:border-amber-800 max-w-md text-center">
                    {errorMessage}
                </div>
            )}

            <button
                onClick={handleConnect}
                className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-500 shadow-md transition-all active:scale-95"
            >
                Wybierz Folder
            </button>
        </div>
    );
};

export default DirectoryConnect;