
import React, { useState, useEffect } from 'react';
import { AIProvider, ApiKeys } from '../services/aiService';
import { GeminiIcon } from './icons/GeminiIcon';
import { GrokIcon } from './icons/GrokIcon';
import { OpenAIIcon } from './icons/OpenAIIcon';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (keys: ApiKeys, provider: AIProvider) => void;
  currentKeys: ApiKeys;
  currentProvider: AIProvider;
}

const providerOptions: { id: AIProvider, name: string, Icon: React.FC<React.SVGProps<SVGSVGElement>> }[] = [
    { id: 'gemini', name: 'Google Gemini', Icon: GeminiIcon },
    { id: 'grok', name: 'Grok', Icon: GrokIcon },
    { id: 'openai', name: 'OpenAI', Icon: OpenAIIcon }
];

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSave, currentKeys, currentProvider }) => {
  const [grokApiKey, setGrokApiKey] = useState('');
  const [openAIApiKey, setOpenAIApiKey] = useState('');
  const [provider, setProvider] = useState<AIProvider>(currentProvider);

  useEffect(() => {
    if (isOpen) {
      setGrokApiKey(currentKeys.grok || '');
      setOpenAIApiKey(currentKeys.openai || '');
      setProvider(currentProvider);
    }
  }, [isOpen, currentKeys, currentProvider]);

  const handleSave = () => {
    onSave({
      grok: grokApiKey.trim(),
      openai: openAIApiKey.trim(),
    }, provider);
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
      onClick={onClose}
    >
      <div
        className="glass-panel w-full max-w-lg rounded-2xl p-6 text-left align-middle transition-all animate-fade-in-scale"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">Ustawienia</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
        
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
          Wszystkie klucze API są przechowywane lokalnie w Twojej przeglądarce.
        </p>

        {/* AI Provider Selection */}
        <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Dostawca AI
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {providerOptions.map(({ id, name, Icon }) => (
                    <div key={id}>
                        <input
                            type="radio"
                            id={id}
                            name="aiProvider"
                            value={id}
                            checked={provider === id}
                            onChange={() => setProvider(id)}
                            className="sr-only peer"
                        />
                        <label
                            htmlFor={id}
                            className={`flex items-center justify-center p-3 w-full text-sm font-medium text-center rounded-lg cursor-pointer transition-all border ${
                                provider === id
                                ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 shadow-sm ring-1 ring-indigo-500'
                                : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                        >
                            <Icon className="w-5 h-5 mr-2" />
                            {name}
                        </label>
                    </div>
                ))}
            </div>
        </div>

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
              className="mt-1 block w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-600 rounded-lg py-2 px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
              placeholder="Wprowadź klucz..."
            />
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
              className="mt-1 block w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-300 dark:border-slate-600 rounded-lg py-2 px-3 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
              placeholder="Wprowadź klucz..."
            />
          </div>
        </div>
        <div className="flex justify-end space-x-4 mt-8 pt-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
          >
            Anuluj
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 shadow-lg shadow-indigo-500/20 transition-all active:scale-95"
          >
            Zapisz
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
