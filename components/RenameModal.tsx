import React, { useState, useEffect, useRef } from 'react';
import { AudioFile, ID3Tags } from '../types';
import { generatePath } from '../utils/filenameUtils';

interface RenameModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newPattern: string) => void;
  currentPattern: string;
  exampleFile?: AudioFile;
}

const placeholders: (keyof Omit<ID3Tags, 'albumCoverUrl' | 'mood' | 'comments'>)[] = ['artist', 'title', 'album', 'year', 'genre'];

const RenameModal: React.FC<RenameModalProps> = ({ isOpen, onClose, onSave, currentPattern, exampleFile }) => {
  const [pattern, setPattern] = useState(currentPattern);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPattern(currentPattern);
    }
  }, [isOpen, currentPattern]);

  const handleSave = () => {
    onSave(pattern);
    onClose();
  };

  const insertPlaceholder = (placeholder: string) => {
    const text = `[${placeholder}]`;
    const input = inputRef.current;
    if (!input) return;

    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const newPattern = pattern.substring(0, start) + text + pattern.substring(end);
    
    setPattern(newPattern);
    
    // Focus and set cursor position after placeholder
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  if (!isOpen) return null;

  const exampleTags: ID3Tags = exampleFile?.fetchedTags || exampleFile?.originalTags || {
      artist: 'Przykładowy Artysta',
      title: 'Tytuł Utworu',
      album: 'Nazwa Albumu',
      year: '2024',
      genre: 'Pop'
  };
  const exampleFilename = exampleFile?.file.name || 'przyklad.mp3';
  const preview = generatePath(pattern, exampleTags, exampleFilename);


  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 w-full max-w-2xl mx-4 transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Ustaw szablon zmiany nazw</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          Stwórz schemat, według którego będą generowane nowe nazwy plików. Możesz używać ukośnika `/` do tworzenia folderów.
        </p>
        
        <div>
          <label htmlFor="pattern" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            Szablon nazwy
          </label>
          <input
            ref={inputRef}
            type="text"
            id="pattern"
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            className="mt-1 block w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-indigo-500 sm:text-sm font-mono"
            placeholder="[artist] - [title]"
          />
        </div>

        <div className="mt-3">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Wstaw znacznik:</p>
            <div className="flex flex-wrap gap-2">
                {placeholders.map(p => (
                    <button 
                        key={p} 
                        onClick={() => insertPlaceholder(p)}
                        className="px-2 py-1 text-xs font-mono bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-md hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
                    >
                        [{p}]
                    </button>
                ))}
            </div>
        </div>

        <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-900 rounded-md">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Podgląd:</p>
            <p className="text-sm text-indigo-600 dark:text-indigo-400 font-mono break-all mt-1" title={preview}>{preview}</p>
        </div>


        <div className="flex justify-end space-x-4 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600">Anuluj</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-md hover:bg-indigo-500">Zapisz szablon</button>
        </div>
      </div>
       <style>{`.animate-fade-in-scale { animation: fade-in-scale 0.2s ease-out forwards; } @keyframes fade-in-scale { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }`}</style>
    </div>
  );
};

export default RenameModal;
