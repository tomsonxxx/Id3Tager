
import React, { useState, useEffect, useRef } from 'react';
import { AudioFile } from '../types';
import AlbumCover from './AlbumCover';

interface PlayerDockProps {
  activeFile: AudioFile | null;
}

const PlayerDock: React.FC<PlayerDockProps> = ({ activeFile }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Sprawdź, czy plik ma zawartość (nie jest "duchem" przywróconym z localStorage)
  const isPlayable = activeFile && activeFile.file.size > 0;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (activeFile && isPlayable) {
      const objectUrl = URL.createObjectURL(activeFile.file);
      
      const playAudio = async () => {
          try {
              audio.src = objectUrl;
              await audio.play();
              setIsPlaying(true);
          } catch (error: any) {
              // Ignoruj błędy przerwania (szybkie przełączanie)
              if (error.name !== 'AbortError') {
                  console.warn("Auto-play failed:", error.message);
                  setIsPlaying(false);
              }
          }
      };

      playAudio();

      return () => {
          URL.revokeObjectURL(objectUrl);
      };
    } else {
        // Reset odtwarzacza
        audio.pause();
        setIsPlaying(false);
        setProgress(0);
        // Czyste usuwanie źródła, aby uniknąć błędów w konsoli "The element has no supported sources"
        audio.removeAttribute('src');
        audio.load();
    }
  }, [activeFile?.id, isPlayable]); // Zależność od ID, aby przeładować przy zmianie utworu

  const togglePlay = () => {
    const audio = audioRef.current;
    if (audio && isPlayable) {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        audio.play()
            .then(() => setIsPlaying(true))
            .catch(e => console.error("Play failed:", e));
      }
    }
  };

  const handleTimeUpdate = () => {
      if (audioRef.current && audioRef.current.duration) {
          const current = audioRef.current.currentTime;
          const total = audioRef.current.duration;
          setProgress((current / total) * 100);
      }
  };

  const tags = activeFile?.fetchedTags || activeFile?.originalTags;

  return (
    <div className="h-20 bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center px-4 flex-shrink-0 z-20">
      <audio 
        ref={audioRef} 
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => setIsPlaying(false)}
        onError={(e) => {
            // Logowanie błędów tylko jeśli src jest ustawione (unikanie błędów przy czyszczeniu)
            if (audioRef.current?.getAttribute('src')) {
                console.error("Audio error:", e.currentTarget.error);
                setIsPlaying(false);
            }
        }}
      />
      
      {/* Track Info */}
      <div className="flex items-center w-1/4 min-w-[200px]">
        {activeFile ? (
            <>
                <AlbumCover tags={tags} className="w-12 h-12 rounded shadow-sm mr-3" />
                <div className="overflow-hidden">
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {tags?.title || activeFile.file.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {!isPlayable ? (
                            <span className="text-amber-600 dark:text-amber-500 font-medium" title="Plik został przywrócony z sesji, ale dane audio są niedostępne. Załaduj plik ponownie.">Plik niedostępny (odświeżony)</span>
                        ) : (
                            tags?.artist || 'Unknown Artist'
                        )}
                    </div>
                </div>
            </>
        ) : (
            <div className="text-xs text-slate-400 italic">Brak aktywnego utworu</div>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-col items-center justify-center flex-grow max-w-2xl px-4">
        <div className="flex items-center space-x-6 mb-1">
             <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" disabled={!isPlayable}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" /></svg>
             </button>
             <button 
                onClick={togglePlay}
                disabled={!isPlayable}
                className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center hover:bg-indigo-500 shadow-md transition-transform transform active:scale-95 disabled:bg-slate-400 disabled:cursor-not-allowed"
             >
                {isPlaying ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 pl-0.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
                )}
             </button>
             <button className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" disabled={!isPlayable}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798l-5.445-3.63z" /></svg>
             </button>
        </div>
        {/* Progress Bar Mockup */}
        <div className="w-full h-1 bg-slate-300 dark:bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }}></div>
        </div>
      </div>

      {/* Volume / Extra */}
      <div className="w-1/4 flex justify-end items-center space-x-2 text-slate-400">
         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0117 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.414z" clipRule="evenodd" /></svg>
         <div className="w-20 h-1 bg-slate-300 dark:bg-slate-700 rounded-full">
             <div className="w-2/3 h-full bg-slate-500 dark:bg-slate-400 rounded-full"></div>
         </div>
      </div>
    </div>
  );
};

export default PlayerDock;
