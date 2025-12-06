
import React, { useMemo } from 'react';
import { AudioFile } from '../types';
// @ts-ignore
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, Legend, CartesianGrid } from 'recharts';
// @ts-ignore
import _ from 'lodash';

interface ReportsModalProps {
  isOpen: boolean;
  onClose: () => void;
  files: AudioFile[];
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const StatCard: React.FC<{ title: string; value: string | number; subtitle: string; icon: React.ReactNode; color: string }> = ({ title, value, subtitle, icon, color }) => (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center">
        <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-white mr-4 shadow-lg ${color}`}>
            {icon}
        </div>
        <div>
            <div className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">{title}</div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">{value}</div>
            <div className="text-xs text-slate-400 dark:text-slate-500">{subtitle}</div>
        </div>
    </div>
);

const ReportsModal: React.FC<ReportsModalProps> = ({ isOpen, onClose, files }) => {
  if (!isOpen) return null;

  const stats = useMemo(() => {
    const total = files.length;
    if (total === 0) return null;

    // 1. Quality Analysis (Bitrate/Format)
    const formats = _.countBy(files, (f: AudioFile) => {
        const type = f.file.type;
        if (type.includes('flac') || type.includes('wav')) return 'Lossless (FLAC/WAV)';
        const bitrate = f.fetchedTags?.bitrate || f.originalTags?.bitrate;
        if (bitrate && bitrate >= 320000) return 'MP3 320kbps';
        if (bitrate && bitrate >= 256000) return 'MP3 256kbps';
        if (bitrate && bitrate < 192000) return 'Low Quality (<192)';
        return 'Other/Unknown';
    });
    const qualityData = Object.entries(formats).map(([name, value]) => ({ name, value: value as number }));

    // 2. Tag Health
    const missingBpm = files.filter(f => !f.fetchedTags?.bpm && !f.originalTags?.bpm).length;
    const missingKey = files.filter(f => !f.fetchedTags?.initialKey && !f.originalTags?.initialKey).length;
    const missingArt = files.filter(f => !f.fetchedTags?.albumCoverUrl && !f.originalTags?.albumCoverUrl).length;
    const missingGenre = files.filter(f => !f.fetchedTags?.genre && !f.originalTags?.genre).length;

    const healthData = [
        { name: 'BPM', missing: missingBpm, present: total - missingBpm },
        { name: 'Tonacja', missing: missingKey, present: total - missingKey },
        { name: 'Okładka', missing: missingArt, present: total - missingArt },
        { name: 'Gatunek', missing: missingGenre, present: total - missingGenre },
    ];

    // 3. Years Distribution
    const years = _.groupBy(files, (f: AudioFile) => {
        const y = f.fetchedTags?.year || f.originalTags?.year;
        if (!y) return 'Unknown';
        // Group by decade
        const yearNum = parseInt(y);
        if (isNaN(yearNum)) return 'Unknown';
        return `${Math.floor(yearNum / 10) * 10}s`;
    });
    const yearData = Object.entries(years)
        .map(([name, group]: any) => ({ name, value: group.length }))
        .filter((d: any) => d.name !== 'Unknown')
        .sort((a: any, b: any) => parseInt(a.name) - parseInt(b.name));

    return { total, qualityData, healthData, yearData };
  }, [files]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="glass-panel w-full max-w-6xl h-[90vh] rounded-2xl p-0 animate-fade-in-scale flex flex-col overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-white/50 dark:bg-slate-900/50">
            <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 mr-3 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    Raport Biblioteki
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Analiza {stats?.total || 0} utworów</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>

        {/* Content */}
        {stats && stats.total > 0 ? (
            <div className="flex-grow overflow-y-auto p-6 bg-slate-50/50 dark:bg-slate-950/50">
                
                {/* KPI Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <StatCard 
                        title="Rozmiar Biblioteki" 
                        value={stats.total} 
                        subtitle="wszystkich utworów" 
                        color="bg-gradient-to-br from-indigo-500 to-indigo-600"
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}
                    />
                    <StatCard 
                        title="Braki BPM" 
                        value={stats.healthData.find(d => d.name === 'BPM')?.missing || 0} 
                        subtitle="wymaga analizy" 
                        color="bg-gradient-to-br from-amber-500 to-orange-600"
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                    />
                    <StatCard 
                        title="Braki Tonacji" 
                        value={stats.healthData.find(d => d.name === 'Tonacja')?.missing || 0} 
                        subtitle="do uzupełnienia" 
                        color="bg-gradient-to-br from-purple-500 to-fuchsia-600"
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 6l12-3" /></svg>}
                    />
                    <StatCard 
                        title="Jakość Lossless" 
                        value={stats.qualityData.find(d => d.name.includes('Lossless'))?.value || 0} 
                        subtitle="plików wysokiej jakości" 
                        color="bg-gradient-to-br from-emerald-500 to-green-600"
                        icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    />
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    
                    {/* Quality Chart */}
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase mb-4">Jakość Plików (Format/Bitrate)</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.qualityData}
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {stats.qualityData.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip 
                                        contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    />
                                    <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Tag Health Chart */}
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase mb-4">Zdrowie Metadanych (Wypełnienie)</h3>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.healthData} layout="vertical">
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} opacity={0.1} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={60} tick={{fill: '#94a3b8', fontSize: 12}} />
                                    <Tooltip 
                                        cursor={{fill: 'transparent'}}
                                        contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    />
                                    <Legend />
                                    <Bar dataKey="present" name="Wypełnione" stackId="a" fill="#10b981" radius={[0, 4, 4, 0]} barSize={20} />
                                    <Bar dataKey="missing" name="Brakujące" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Years Chart */}
                    <div className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm col-span-1 lg:col-span-2">
                        <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase mb-4">Rozkład Dekad</h3>
                        <div className="h-56">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.yearData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                                    <XAxis dataKey="name" tick={{fill: '#94a3b8', fontSize: 12}} axisLine={false} tickLine={false} />
                                    <YAxis hide />
                                    <Tooltip 
                                        cursor={{fill: 'rgba(255,255,255,0.05)'}}
                                        contentStyle={{ backgroundColor: '#0f172a', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    />
                                    <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40}>
                                        {stats.yearData.map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={entry.name === 'Unknown' ? '#cbd5e1' : '#6366f1'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                </div>
            </div>
        ) : (
            <div className="flex-grow flex items-center justify-center">
                <div className="text-center">
                    <p className="text-slate-500 dark:text-slate-400">Brak danych do analizy.</p>
                    <button onClick={onClose} className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg">Wróć</button>
                </div>
            </div>
        )}
      </div>
    </div>
  );
};

export default ReportsModal;
