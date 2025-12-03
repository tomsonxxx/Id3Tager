
import React, { useState, useEffect } from 'react';

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
    const [isIframe, setIsIframe] = useState(false);

    useEffect(() => {
        // Detect if running inside an iframe to warn user proactively
        try {
            if (window.self !== window.top) {
                setIsIframe(true);
            }
        } catch (e) {
            // Accessing window.top can throw Cross-Origin error itself, implying we are in an iframe
            setIsIframe(true);
        }
    }, []);

    const handleConnect = async () => {
        setErrorMessage(null);
        
        // Use type assertion to access aistudio which might be defined globally with a specific type
        const aiStudio = (window as any).aistudio;

        // Proactive check for iframe environment to avoid console errors if possible.
        // We skip this check if aistudio is present, as it might wrap the API correctly.
        if (isIframe && !aiStudio) { 
             setErrorMessage(
                "⚠️ Tryb bezpośredniego dostępu do folderów jest zablokowany przez zabezpieczenia przeglądarki w oknach podglądu (iframe). " +
                "Aby skorzystać z tej funkcji, otwórz aplikację w nowej, pełnej karcie przeglądarki."
            );
            return;
        }

        try {
            // 1. Try AI Studio brokered API
            if (aiStudio && aiStudio.showDirectoryPicker) {
                const handle = await aiStudio.showDirectoryPicker({ mode: 'readwrite' });
                onDirectoryConnect(handle);
                return;
            }
    
            // 2. Try Standard Browser API
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
            if (error.name === 'SecurityError' || error.message?.includes('Cross origin') || error.message?.includes('frame')) {
                console.error('Directory Access Blocked:', error);
                setErrorMessage(
                    "⚠️ Bezpośredni dostęp do folderów jest zablokowany przez przeglądarkę w tym trybie. " +
                    "Otwórz aplikację w osobnej karcie lub użyj importu plików (Drag & Drop) powyżej."
                );
            } else {
                console.error('Directory Connect Error:', error);
                setErrorMessage(`Nie udało się połączyć: ${error.message || "Nieznany błąd"}`);
            }
        }
    };

    const aiStudio = (window as any).aistudio;

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
                className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-500 shadow-md transition-all active:scale-95 flex items-center"
            >
                {isIframe && !aiStudio && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2 text-indigo-200" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8.257 3.099c.636-1.21 2.852-1.21 3.488 0l6.233 11.896c.64 1.223-.453 2.755-1.744 2.755H3.768c-1.291 0-2.384-1.532-1.744-2.755L8.257 3.099zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-4a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
                    </svg>
                )}
                Wybierz Folder
            </button>
        </div>
    );
};

export default DirectoryConnect;
