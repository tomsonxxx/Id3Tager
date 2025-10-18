
import React, { useCallback, useState, useRef } from 'react';

// Fix: Augment React's type definitions to include the non-standard 'webkitdirectory' 
// property for the input element, which allows selecting directories.
// Switched to global module augmentation to resolve module lookup issues.
declare global {
  namespace React {
    interface InputHTMLAttributes<T> {
      webkitdirectory?: string;
    }
  }
  // Fix: Add type definition for the non-standard File System Access API
  // to resolve the call signature error on `window.showOpenFilePicker`.
  interface Window {
    showOpenFilePicker(options?: {
        multiple?: boolean;
        types?: {
            description: string;
            accept: Record<string, string[]>;
        }[];
    }): Promise<FileSystemFileHandle[]>;
  }
}
interface FileDropzoneProps {
  onFileHandlesSelected: (handles: FileSystemFileHandle[]) => void;
  onUrlSubmitted: (url: string) => Promise<void>;
  isProcessing: boolean;
}

const FileDropzone: React.FC<FileDropzoneProps> = ({ onFileHandlesSelected, onUrlSubmitted, isProcessing }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const [url, setUrl] = useState('');
  const [isUrlProcessing, setIsUrlProcessing] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.items) {
      const handles: FileSystemFileHandle[] = [];
      for (const item of e.dataTransfer.items) {
          if (item.kind === 'file') {
              const handle = await (item as any).getAsFileSystemHandle();
              if (handle) {
                  handles.push(handle);
              }
          }
      }
      if (handles.length > 0) {
        onFileHandlesSelected(handles);
      }
    }
  }, [onFileHandlesSelected]);

 const handleFileSelectClick = async () => {
    if ('showOpenFilePicker' in window) {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [{
            description: 'Audio Files',
            accept: {
              'audio/mpeg': ['.mp3'],
              'audio/flac': ['.flac'],
              'audio/wav': ['.wav'],
              'audio/ogg': ['.ogg'],
              'audio/mp4': ['.m4a'],
            }
          }]
        });
        onFileHandlesSelected(handles);
      } catch (err) {
        console.info('User cancelled file picker');
      }
    } else {
      // Fallback for older browsers
      alert("Twoja przeglądarka nie wspiera nowoczesnego API dostępu do plików. Niektóre funkcje, jak zapis bezpośredni, mogą być niedostępne.");
    }
  };
  
  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || isProcessing || isUrlProcessing) return;

    setIsUrlProcessing(true);
    try {
      await onUrlSubmitted(url);
      setUrl(''); // Clear on success
    } catch (error) {
      // The parent component (App.tsx) will show an alert.
    } finally {
      setIsUrlProcessing(false);
    }
  };

  const activeClasses = isDragActive ? 'border-indigo-400 bg-slate-200 dark:bg-slate-700' : 'border-slate-400 dark:border-slate-600';

  return (
    <div
      className={`relative flex flex-col items-center justify-center w-full max-w-4xl p-8 mx-auto mt-8 border-2 border-dashed rounded-lg transition-colors duration-300 ${activeClasses} ${isProcessing ? 'cursor-not-allowed opacity-50' : ''}`}
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
    >
      <div onClick={isProcessing ? undefined : handleFileSelectClick} className="flex flex-col items-center justify-center text-center cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" className="w-16 h-16 mb-4 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-xl font-semibold text-slate-700 dark:text-slate-300">Przeciągnij i upuść pliki audio tutaj</p>
        <p className="text-slate-600 dark:text-slate-500">lub kliknij, aby je wybrać</p>
      </div>
      <p className="mt-4 text-xs text-slate-500 dark:text-slate-600">Obsługiwane formaty: MP3, FLAC, WAV, OGG, M4A</p>

        <div className="relative flex items-center w-full my-6">
            <div className="flex-grow border-t border-slate-300 dark:border-slate-700"></div>
            <span className="flex-shrink mx-4 text-slate-400 dark:text-slate-500 text-sm">LUB</span>
            <div className="flex-grow border-t border-slate-300 dark:border-slate-700"></div>
        </div>
        
        <form onSubmit={handleUrlSubmit} className="w-full z-10">
            <div className="flex items-center space-x-2">
                <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="Wklej adres URL do pliku audio..."
                    disabled={isProcessing || isUrlProcessing}
                    className="flex-grow bg-slate-100 dark:bg-slate-900/50 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm"
                    required
                />
                <button
                    type="submit"
                    disabled={isProcessing || isUrlProcessing || !url}
                    className="px-4 py-2 text-sm h-[40px] w-[140px] font-bold text-white bg-indigo-600 rounded-md hover:bg-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed flex items-center justify-center"
                >
                    {isUrlProcessing ? <span className="btn-spinner !mr-0"></span> : 'Przetwarzaj URL'}
                </button>
            </div>
        </form>

    </div>
  );
};

export default FileDropzone;
