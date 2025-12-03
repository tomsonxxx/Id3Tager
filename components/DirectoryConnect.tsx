
import React, { useState } from 'react';

interface DirectoryConnectProps {
    onDirectoryConnect: (handle: any) => void;
}

const DirectoryConnect: React.FC<DirectoryConnectProps> = ({ onDirectoryConnect }) => {
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const handleConnect = async () => {
        setErrorMessage(null);
        try {
            // First, try the brokered API provided by the platform (e.g., AI Studio)
            const aistudioPicker = (window as any).aistudio?.showDirectoryPicker;
            if (typeof aistudioPicker === 'function') {
                const handle = await aistudioPicker({ mode: 'readwrite' });
                onDirectoryConnect(handle);
                return;
            }
    
            // If the brokered API isn't found, try the standard browser API.
            // This will work in a normal browser tab. If it fails in a sandboxed iframe,
            // the catch block will handle the resulting SecurityError.
            if (typeof (window as any).showDirectoryPicker === 'function') {
                const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
                onDirectoryConnect(handle);
                return;
            }
    
            // If neither API is available, the feature is not supported.
            throw new Error("Funkcja wyboru folderu nie jest obsługiwana w tej przeglądarce.");
    
        } catch (error) {
            const err = error as Error;
    
            // User cancelling the picker is a normal operation, not an error.
            if (err.name === 'AbortError') {
                console.log('User cancelled the directory picker.');
                return;
            }
    
            // Specifically handle the SecurityError that occurs in sandboxed iframes.
            if (err.name === 'SecurityError' || err.message?.includes('Cross origin sub frames')) {
                console.error('SecurityError while showing directory picker:', err);
                setErrorMessage("Dostęp bezpośredni do plików jest zablokowany w tym środowisku (np. podgląd w ramce/iframe). Użyj standardowego importu (przeciągnij i upuść) powyżej.");
            } else {
                // Handle other potential errors.
                console.error('Error connecting to directory:', err);
                setErrorMessage(`Nie udało się otworzyć folderu: ${err.message || "Wystąpił nieznany błąd."}`);
            }
        }
    };

    return (
        <div className="flex flex-col items-center justify-center p-6 bg-slate-100 dark:bg-slate-800/50 rounded-lg">
            <div className="flex items-center text-indigo-600 dark:text-indigo-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mr-3" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    <path stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 11V7m0 8v-2" />
                </svg>
                 <h3 className="text-xl font-bold text-slate-800 dark:text-slate-200">Tryb Bezpośredniego Dostępu</h3>
            </div>
            <p className="max-w-md mt-2 text-sm text-center text-slate-600 dark:text-slate-400">
                Połącz się z lokalnym folderem, aby edytować pliki bezpośrednio na dysku — bez potrzeby pobierania i rozpakowywania archiwów ZIP.
            </p>
            
            {errorMessage && (
                <div className="mt-4 p-3 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm rounded-md border border-red-200 dark:border-red-800 max-w-md text-center">
                    {errorMessage}
                </div>
            )}

            <button
                onClick={handleConnect}
                className="mt-4 px-6 py-2 font-bold text-white bg-indigo-600 rounded-md hover:bg-indigo-500 transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-50 dark:focus:ring-offset-slate-900 focus:ring-indigo-500"
            >
                Połącz z Folderem
            </button>
        </div>
    );
};

export default DirectoryConnect;
