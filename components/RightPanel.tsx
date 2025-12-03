
import React, { useMemo } from 'react';
import { AudioFile } from '../types';
import AlbumCover from './AlbumCover';
// @ts-ignore
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, Legend } from 'recharts';
// @ts-ignore
import _ from 'lodash';

interface RightPanelProps {
  file: AudioFile | null;
  allFiles: AudioFile[];
  onClose: () => void;
  onRenamePatternSettings: () => void;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#64748b'];

const DetailRow: React.FC<{ label: string; value: string | number | undefined }> = ({ label, value }) => (
    <div className="py-2 border-b border-slate-200 dark:border-slate-800 last:border-0">
        <dt className="text-xs text-slate-500 dark:text-slate-500 uppercase tracking-wide mb-1">{label}</dt>
        <dd className="text-sm font-medium text-slate-900 dark:text-slate-200 break-words">{value || '-'}</dd>
    </div>
);

const ProgressBar: React.FC<{ label: string; value: number | undefined; color: string }> = ({ label, value, color }) => {
    const safeValue = Math.min(Math.max(value || 0, 0), 10);
    return (
        <div className="py-2">
            <div className="flex justify-between mb-1">
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{label}</span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{safeValue}/10</span>
            </div>
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                <div className={`h-2 rounded-full ${color}`} style={{ width: `${(safeValue / 10) * 100}%` }}></div>
            </div>
        </div>
    );
};

const RightPanel: React.FC<RightPanelProps> = ({ file, allFiles, onRenamePatternSettings }) => {
  
  // -- Statistics Calculation --
  const stats = useMemo(() => {
    if (allFiles.length === 0) return null;

    // 1. Genres
    const genreCounts = _.countBy(allFiles, (f: AudioFile) => {
        const g = (f.fetchedTags?.genre || f.originalTags?.genre || 'Nieznany').toLowerCase();
        // Capitalize first letter
        return g.charAt(0).toUpperCase() + g.slice(1);
    });
    
    const genreData = Object.entries(genreCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a: any, b: any) => b.value - a.value)
        .slice(0, 8); // Top 8

    // 2. Decades
    const yearCounts = _.countBy(allFiles, (f: AudioFile) => {
        const y = f.fetchedTags?.year || f.originalTags?.year;
        return y ? y.substring(0, 3) + '0s' : 'Nieznany';
    });

    const yearData = Object.entries(yearCounts)
        .map(([name, value]) => ({ name, value }))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));

    // 3. BPM Ranges
    const bpmGroups = {
        'Slow (<100)': 0,
        'Mid (100-119)': 0,
        'House (120-129)': 0,
        'Trance (130-139)': 0,
        'Fast (140+)': 0
    };

    allFiles.forEach(f => {
        const bpm = f.fetchedTags?.bpm || f.originalTags?.bpm;
        if (!bpm) return;
        const val = typeof bpm === 'string' ? parseInt(bpm, 10) : bpm;
        if (isNaN(val)) return;
        
        if (val < 100) bpmGroups['Slow (<100)']++;
        else if (val < 120) bpmGroups['Mid (100-119)']++;
        else if (val < 130) bpmGroups['House (120-129)']++;
        else if (val < 140) bpmGroups['Trance (130-139)']++;
        else bpmGroups['Fast (140+)']++;
    });

    const bpmData = Object.entries(bpmGroups)
        .map(([name, value]) => ({ name, value }))
        .filter((item: any) => item.value > 0);

    return { genreData, yearData, bpmData, total: allFiles.length };
  }, [allFiles]);


  // -- No File Selected View (Library Stats) --
  if (!file) {
      return (
          <aside className="w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full overflow-y-auto">
             <div className="p-6">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2 text-indigo-500" viewBox="0 0 20 20" fill="currentColor"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" /></svg>
                    Statystyki Biblioteki
                </h2>
                
                {stats && stats.total > 0 ? (
                    <div className="space-y-8">
                        {/* Summary */}
                        <div className="grid grid-cols-2 gap-4">
                             <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-center">
                                <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{stats.total}</div>
                                <div className="text-xs text-slate-500">Utworów</div>
                             </div>
                             <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-lg text-center cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition" onClick={onRenamePatternSettings}>
                                <div className="flex justify-center mb-1">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                </div>
                                <div className="text-xs text-slate-500">Wzór Nazw</div>
                             </div>
                        </div>

                        {/* Genres Chart */}
                        {stats.genreData.length > 0 && (
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Gatunki</h3>
                                <div className="h-48 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={stats.genreData}
                                                innerRadius={40}
                                                outerRadius={70}
                                                paddingAngle={5}
                                                dataKey="value"
                                            >
                                                {stats.genreData.map((entry: any, index: number) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip 
                                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff', fontSize: '12px' }} 
                                                itemStyle={{ color: '#fff' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                                <div className="flex flex-wrap gap-2 justify-center">
                                    {stats.genreData.slice(0, 4).map((entry: any, index: number) => (
                                        <div key={entry.name} className="flex items-center text-xs text-slate-500">
                                            <div className="w-2 h-2 rounded-full mr-1" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                            {entry.name}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* BPM Ranges Chart */}
                         {stats.bpmData.length > 0 && (
                            <div>
                                <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">Zakresy BPM</h3>
                                <div className="h-40 w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={stats.bpmData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" width={80} tick={{fontSize: 9, fill: '#94a3b8'}} interval={0} />
                                            <Tooltip 
                                                cursor={{fill: 'rgba(255,255,255,0.05)'}}
                                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff', fontSize: '12px' }} 
                                            />
                                            <Bar dataKey="value" fill="#10b981" radius={[0, 4, 4, 0]} barSize={12} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-10">
                        <p className="text-slate-500">Dodaj utwory, aby zobaczyć statystyki.</p>
                    </div>
                )}
             </div>
          </aside>
      );
  }

  // -- Single File Selected View --
  const tags = file.fetchedTags || file.originalTags || {};

  return (
    <aside className="w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col h-full overflow-y-auto">
      <div className="p-6">
        <div className="aspect-square w-full bg-slate-200 dark:bg-slate-800 rounded-lg overflow-hidden shadow-lg mb-6 relative group">
            <AlbumCover tags={tags} className="w-full h-full" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                 <span className="text-white text-xs font-bold uppercase tracking-wider">Podgląd</span>
            </div>
        </div>

        <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-tight mb-1">{tags.title || file.file.name}</h2>
        <p className="text-indigo-600 dark:text-indigo-400 font-medium text-lg mb-4">{tags.artist || 'Nieznany wykonawca'}</p>

        <div className="mb-6">
            <ProgressBar label="Energia" value={tags.energy} color="bg-orange-500" />
            <ProgressBar label="Taneczność" value={tags.danceability} color="bg-purple-500" />
        </div>

        <dl className="mt-2">
            <DetailRow label="Album" value={tags.album} />
            <DetailRow label="Gatunek" value={tags.genre} />
            <DetailRow label="Rok" value={tags.year} />
            <div className="grid grid-cols-2 gap-4">
                <DetailRow label="BPM" value={tags.bpm} />
                <DetailRow label="Klucz" value={tags.initialKey} />
            </div>
            
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-2">Szczegóły Pliku</h3>
                <div className="grid grid-cols-2 gap-4">
                     <DetailRow label="Rozmiar" value={`${(file.file.size / (1024*1024)).toFixed(2)} MB`} />
                     <DetailRow label="Typ" value={file.file.type.split('/')[1]?.toUpperCase() || 'AUDIO'} />
                </div>
                <div className="mt-2 text-xs text-slate-400 truncate" title={file.webkitRelativePath}>
                    {file.webkitRelativePath || file.file.name}
                </div>
            </div>
        </dl>
      </div>
    </aside>
  );
};

export default RightPanel;