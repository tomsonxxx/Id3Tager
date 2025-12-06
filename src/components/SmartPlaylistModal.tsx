import React, { useState } from 'react';
import { AudioFile } from '../types';
import { generateSmartPlaylist } from '../services/aiService';

interface SmartPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: AudioFile[];
  onCreatePlaylist: (name: string, ids: string[]) => void;
}

const SmartPlaylistModal: React.FC<SmartPlaylistModalProps> = ({ isOpen, onClose, files, onCreatePlaylist }) => {
  const [prompt, setPrompt] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    if (files.length === 0) {
        setError("Biblioteka jest pusta.");
        return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      const result = await generateSmartPlaylist(files, prompt);
      if (result.ids.length === 0) {
          setError("AI nie znalazło pasujących utworów.");
      } else {
          onCreatePlaylist(result.name, result.ids);
          onClose();
      }
    } catch (err: any) {
      setError(err.message || "Błąd AI.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-panel w-full max-w-lg rounded-2xl p-6 animate-fade-in-scale" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4 flex items-center">
            <span className="mr-2">✨</span> Smart Playlist AI (Thinking Mode)
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">
            Opisz vibe, a Gemini 3.0 Pro przeanalizuje Twoją bibliotekę, biorąc pod uwagę BPM, klucz i energię.
        </p>
        <textarea 
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="np. Progresywne techno na otwarcie setu, rosnąca energia..."
            className="w-full h-32 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
            disabled={isProcessing}
        />
        {error && <div className="mt-2 text-red-500 text-sm">{error}</div>}
        <div className="flex justify-end mt-4 gap-2">
            <button onClick={onClose} className="px-4 py-2 text-slate-500 hover:text-white">Anuluj</button>
            <button 
                onClick={handleGenerate}
                disabled={isProcessing || !prompt.trim()}
                className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold shadow-neon hover:shadow-neon-hover disabled:opacity-50"
            >
                {isProcessing ? 'Myślę...' : 'Generuj'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default SmartPlaylistModal;