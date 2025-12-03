
import React, { useState, useRef } from 'react';

interface XmlConverterModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ConvertedStats {
    tracks: number;
    playlists: number;
    cues: number;
}

const XmlConverterModal: React.FC<XmlConverterModalProps> = ({ isOpen, onClose }) => {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'converting' | 'success' | 'error'>('idle');
  const [stats, setStats] = useState<ConvertedStats | null>(null);
  const [convertedXml, setConvertedXml] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus('idle');
      setStats(null);
      setErrorMsg(null);
    }
  };

  const parseAndConvert = async () => {
    if (!file) return;
    setStatus('parsing');
    setErrorMsg(null);

    try {
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");
        const collection = xmlDoc.getElementsByTagName("COLLECTION")[0];
        const tracks = collection ? collection.getElementsByTagName("TRACK") : [];
        
        let cueCount = 0;
        Array.from(tracks).forEach((track: Element) => {
            cueCount += track.getElementsByTagName("POSITION_MARK").length;
        });

        setStats({
            tracks: tracks.length,
            playlists: xmlDoc.getElementsByTagName("NODE").length,
            cues: cueCount
        });

        setStatus('converting');
        await new Promise(resolve => setTimeout(resolve, 800));

        let vdjOutput = `<?xml version="1.0" encoding="UTF-8"?>\n<DJ_PLAYLISTS Version="1.0">\n<PRODUCT Name="VirtualDJ" Version="8.0" />\n<COLLECTION Entries="${tracks.length}">\n`;

        Array.from(tracks).forEach((track: Element) => {
            const title = track.getAttribute("Name")?.replace(/&/g, '&amp;') || "Unknown";
            const artist = track.getAttribute("Artist")?.replace(/&/g, '&amp;') || "Unknown";
            const path = track.getAttribute("Location")?.replace(/&/g, '&amp;') || "";
            const bpm = track.getAttribute("AverageBpm") || "0";
            const key = track.getAttribute("Tonality") || "";
            const totalTime = track.getAttribute("TotalTime") || "0";

            vdjOutput += ` <SONG FilePath="${path}" FileSize="0" Duration="${totalTime}">\n`;
            vdjOutput += `  <Tags Author="${artist}" Title="${title}" Bpm="${bpm}" Key="${key}" />\n`;
            
            const cues = track.getElementsByTagName("POSITION_MARK");
            Array.from(cues).forEach((cue: Element) => {
                const startSec = parseFloat(cue.getAttribute("Start") || "0");
                const startMs = Math.round(startSec * 1000);
                const name = cue.getAttribute("Name") || "Cue";
                const num = cue.getAttribute("Num") || "0";
                vdjOutput += `  <Poi Pos="${startMs}" Name="${name}" Type="cue" Num="${num}" />\n`;
            });
            vdjOutput += ` </SONG>\n`;
        });
        vdjOutput += `</COLLECTION>\n</DJ_PLAYLISTS>`;
        
        setConvertedXml(vdjOutput);
        setStatus('success');

    } catch (e: any) {
        console.error("XML Error", e);
        setStatus('error');
        setErrorMsg("Błąd parsowania XML.");
    }
  };

  const handleDownload = () => {
      if (!convertedXml || !file) return;
      const blob = new Blob([convertedXml], { type: 'text/xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `VirtualDJ_${file.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-panel w-full max-w-lg rounded-2xl p-6 animate-fade-in-scale" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 mr-2 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                Konwerter XML
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        <div className="space-y-6">
            <div className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${file ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/10' : 'border-slate-300 dark:border-slate-600 hover:border-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'}`} onClick={() => fileInputRef.current?.click()}>
                <input type="file" accept=".xml" onChange={handleFileChange} className="hidden" ref={fileInputRef} />
                {file ? (
                    <div>
                        <p className="font-bold text-slate-900 dark:text-white">{file.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{(file.size / 1024).toFixed(1)} KB</p>
                        {status === 'idle' && <p className="text-xs text-indigo-500 mt-2">Kliknij, aby zmienić</p>}
                    </div>
                ) : (
                    <div>
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Kliknij, aby wgrać XML (Rekordbox)</p>
                        <p className="text-xs text-slate-500 mt-1">Obsługuje tylko format Rekordbox 6</p>
                    </div>
                )}
            </div>

            {status === 'error' && errorMsg && <div className="p-3 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-300 rounded-lg text-sm text-center border border-red-200 dark:border-red-800">{errorMsg}</div>}

            {status === 'success' && stats && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                    <p className="text-sm font-bold text-green-800 dark:text-green-300">Gotowe!</p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1">Przekonwertowano {stats.tracks} utworów.</p>
                    <button onClick={handleDownload} className="mt-3 w-full py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-bold rounded-lg shadow-md transition-colors">Pobierz XML dla VirtualDJ</button>
                </div>
            )}

            {status === 'idle' && file && (
                <button onClick={parseAndConvert} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg transition-transform active:scale-95">Konwertuj</button>
            )}
            {(status === 'parsing' || status === 'converting') && (
                <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden"><div className="bg-indigo-600 h-2 rounded-full animate-pulse w-full"></div></div>
            )}
        </div>
      </div>
    </div>
  );
};

export default XmlConverterModal;
