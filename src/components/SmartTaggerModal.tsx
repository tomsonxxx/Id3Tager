
import React, { useState, useEffect } from 'react';
import { AudioFile, ID3Tags } from '../types';
import { fetchTagsForFile } from '../services/aiService';
import { useSettings } from '../hooks/useSettings';
import AlbumCover from './AlbumCover';

interface SmartTaggerModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: AudioFile;
  onApply: (tags: ID3Tags) => void;
}

const TagComparisonRow: React.FC<{ label: string; original?: string | number; suggested?: string | number }> = ({ label, original, suggested }) => {
  const isDifferent = original !== suggested && suggested !== undefined && suggested !== '';
  
  return (
    <div className="grid grid-cols-3 gap-4 py-2 border-b border-slate-200 dark:border-slate-700 last:border-0 text-sm">
      <div className="font-semibold text-slate-500 dark:text-slate-400">{label}</div>
      <div className="text-slate-600 dark:text-slate-300 truncate" title={String(original)}>{original || '-'}</div>
      <div className={`truncate font-medium ${isDifferent ? 'text-green-600 dark:text-green-400' : 'text-slate-600 dark:text-slate-300'}`} title={String(suggested)}>
        {suggested || '-'}
      </div>
    </div>
  );
};

const SmartTaggerModal: React.FC<SmartTaggerModalProps> = ({ isOpen, onClose, file, onApply }) => {
  const { apiKeys, aiProvider, analysisSettings } = useSettings();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedTags, setSuggestedTags] = useState<ID3Tags | null>(null);

  useEffect(() => {
    if (isOpen && file) {
      analyzeTrack();
    }
  }, [isOpen, file.id]);

  const analyzeTrack = async () => {
    setLoading(true);
    setError(null);
    setSuggestedTags(null);

    try {
      // Use existing service logic which handles API calls and retries
      const result = await fetchTagsForFile(
        file,
        aiProvider, 
        apiKeys, 
        analysisSettings
      );
      setSuggestedTags(result);
    } catch (err: any) {
      setError(err.message || "Wystąpił błąd podczas analizy AI.");
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (suggestedTags) {
      onApply(suggestedTags);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-panel w-full max-w-4xl rounded-2xl p-0 overflow-hidden flex flex-col max-h-[90vh] animate-fade-in-scale" onClick={e => e.stopPropagation()}>
        
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex justify-between items-center">
          <div className="flex items-center">
            <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 mr-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Smart Tagger AI</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">Analiza pojedynczego utworu</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto p-6 bg-white dark:bg-slate-950">
          
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300">AI analizuje utwór...</p>
              <p className="text-sm text-slate-500">Przeszukiwanie baz danych i analiza akustyczna</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Błąd analizy</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-2 max-w-md">{error}</p>
              <button onClick={analyzeTrack} className="mt-6 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">Spróbuj ponownie</button>
            </div>
          ) : suggestedTags ? (
            <div className="flex flex-col lg:flex-row gap-8">
              
              {/* Left: Covers */}
              <div className="lg:w-1/3 flex flex-col gap-6">
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                  <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 text-center">Obecna okładka</h4>
                  <div className="aspect-square relative rounded-lg overflow-hidden shadow-sm">
                    <AlbumCover tags={file.originalTags} className="w-full h-full" />
                  </div>
                </div>
                
                <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 relative overflow-hidden">
                  {suggestedTags.albumCoverUrl && suggestedTags.albumCoverUrl !== file.originalTags.albumCoverUrl && (
                     <div className="absolute top-0 right-0 bg-green-500 text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg z-10">NOWA</div>
                  )}
                  <h4 className="text-xs font-bold text-slate-500 uppercase mb-3 text-center">Sugerowana okładka</h4>
                  <div className="aspect-square relative rounded-lg overflow-hidden shadow-sm">
                    <AlbumCover tags={suggestedTags} className="w-full h-full" />
                  </div>
                </div>
              </div>

              {/* Right: Metadata Comparison */}
              <div className="lg:w-2/3">
                <div className="grid grid-cols-3 gap-4 mb-2 px-2">
                  <div className="text-xs font-bold text-slate-400 uppercase">Pole</div>
                  <div className="text-xs font-bold text-slate-400 uppercase">Oryginał</div>
                  <div className="text-xs font-bold text-green-600 dark:text-green-400 uppercase">Sugestia AI</div>
                </div>
                
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-2">
                  <TagComparisonRow label="Tytuł" original={file.originalTags.title} suggested={suggestedTags.title} />
                  <TagComparisonRow label="Artysta" original={file.originalTags.artist} suggested={suggestedTags.artist} />
                  <TagComparisonRow label="Album" original={file.originalTags.album} suggested={suggestedTags.album} />
                  <TagComparisonRow label="Rok" original={file.originalTags.year} suggested={suggestedTags.year} />
                  <TagComparisonRow label="Gatunek" original={file.originalTags.genre} suggested={suggestedTags.genre} />
                  <TagComparisonRow label="BPM" original={file.originalTags.bpm} suggested={suggestedTags.bpm} />
                  <TagComparisonRow label="Tonacja" original={file.originalTags.initialKey} suggested={suggestedTags.initialKey} />
                  <TagComparisonRow label="Wytwórnia" original={file.originalTags.recordLabel} suggested={suggestedTags.recordLabel} />
                  <TagComparisonRow label="Nr utworu" original={file.originalTags.trackNumber} suggested={suggestedTags.trackNumber} />
                </div>

                {suggestedTags.confidence && (
                    <div className="mt-4 flex items-center justify-end">
                        <span className="text-xs text-slate-500 mr-2">Pewność AI:</span>
                        <span className={`text-xs font-bold px-2 py-1 rounded capitalize ${
                            suggestedTags.confidence === 'high' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                            suggestedTags.confidence === 'medium' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' :
                            'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                        }`}>
                            {suggestedTags.confidence}
                        </span>
                    </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
            Anuluj
          </button>
          <button 
            onClick={handleApply}
            disabled={!suggestedTags || loading}
            className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold rounded-lg shadow-neon hover:shadow-neon-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          >
            Zastosuj zmiany
          </button>
        </div>

      </div>
    </div>
  );
};

export default SmartTaggerModal;