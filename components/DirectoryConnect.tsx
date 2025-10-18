import React from 'react';

interface DirectoryConnectProps {
    onDirectoryConnect: (handle: any) => void;
}

const DirectoryConnect: React.FC<DirectoryConnectProps> = ({ onDirectoryConnect }) => {

    const handleConnect = async () => {
        try {
            // TypeScript doesn't know about this API yet, so we use `as any`
            const handle = await (window as any).showDirectoryPicker();
            onDirectoryConnect(handle);
        } catch (error) {
            // Handle the case where the user cancels the picker
            if ((error as Error).name === 'AbortError') {
                console.log('User cancelled the directory picker.');
            } else {
                console.error('Error connecting to directory:', error);
                alert('Nie udało się otworzyć folderu. Upewnij się, że przyznano odpowiednie uprawnienia w przeglądarce.');
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