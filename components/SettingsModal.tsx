import React, { useState, useEffect } from 'react';
// Fix: Correct import path
import { ApiKeys } from '../services/aiService';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (keys: ApiKeys) => void;
  currentKeys: ApiKeys;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, currentKeys }) => {
  const [grokApiKey, setGrokApiKey] = useState('');
  const [openAIApiKey, setOpenAIApiKey] = useState('');

  useEffect(() => {
    if (isOpen) {
      setGrokApiKey(currentKeys.grok || '');
      setOpenAIApiKey(currentKeys.openai || '');
    }
  }, [isOpen, currentKeys]);

  const handleSave = () => {
    onSave({
      grok: grokApiKey.trim(),
      openai: openAIApiKey.trim(),
    });
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 transition-opacity duration-300"
      aria-modal="true"
      role="dialog"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 transform transition-all duration-300 scale-95 opacity-0 animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Ustawienia Kluczy API</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Klucze API są przechowywane bezpiecznie w Twojej przeglądarce i nigdy nie są wysyłane poza Twoje urządzenie. Klucz API Gemini jest konfigurowany za pomocą zmiennej środowiskowej i nie jest tutaj wymagany.
        </p>
        <div className="space-y-4">
          <div>
            <label htmlFor="grokApiKey" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Klucz API Grok
            </label>
            <input
              type="password"
              id="grokApiKey"
              value={grokApiKey}
              onChange={(e) => setGrokApiKey(e.target.value)}
              className="mt-1 block w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-indigo-500 sm:text-sm"
              placeholder="Wprowadź swój klucz API Grok"
            />
             <a href="https://console.groq.com/keys" target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline mt-1 inline-block">
                Zdobądź klucz API Grok
             </a>
          </div>
          <div>
            <label htmlFor="openAIApiKey" className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Klucz API OpenAI
            </label>
            <input
              type="password"
              id="openAIApiKey"
              value={openAIApiKey}
              onChange={(e) => setOpenAIApiKey(e.target.value)}
              className="mt-1 block w-full bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm py-2 px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-indigo-500 sm:text-sm"
              placeholder="Wprowadź swój klucz API OpenAI"
            />
             <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-500 hover:underline mt-1 inline-block">
                Zdobądź klucz API OpenAI
             </a>
          </div>
        </div>
        <div className="flex justify-end space-x-4 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 focus:ring-slate-500"
          >
            Anuluj
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-md hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-slate-900 focus:ring-indigo-500"
          >
            Zapisz klucze
          </button>
        </div>
      </div>
      <style>{`
        @keyframes fade-in-scale {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-fade-in-scale { animation: fade-in-scale 0.2s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default SettingsModal;
