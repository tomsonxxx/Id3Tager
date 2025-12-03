
import React from 'react';
import { LibraryFilters } from '../hooks/useLibrary';

interface FilterBarProps {
  filters: LibraryFilters;
  onFilterChange: (newFilters: LibraryFilters) => void;
  onClearFilters: () => void;
  availableGenres: string[];
}

const FilterBar: React.FC<FilterBarProps> = ({ filters, onFilterChange, onClearFilters, availableGenres }) => {
  const handleChange = (key: keyof LibraryFilters, value: string | number) => {
    onFilterChange({ ...filters, [key]: value });
  };

  const hasActiveFilters = filters.bpmMin || filters.bpmMax || filters.genre || filters.key;

  return (
    <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-2 flex flex-wrap items-center gap-4 transition-all animate-fade-in">
      
      {/* BPM Filter */}
      <div className="flex items-center space-x-2">
        <span className="text-xs font-semibold text-slate-500 uppercase">BPM</span>
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden">
            <input 
                type="number" 
                placeholder="Min" 
                className="w-14 p-1.5 text-xs bg-transparent text-center focus:outline-none dark:text-white"
                value={filters.bpmMin || ''}
                onChange={(e) => handleChange('bpmMin', e.target.value ? parseInt(e.target.value) : '')}
            />
            <span className="text-slate-400">-</span>
            <input 
                type="number" 
                placeholder="Max" 
                className="w-14 p-1.5 text-xs bg-transparent text-center focus:outline-none dark:text-white"
                value={filters.bpmMax || ''}
                onChange={(e) => handleChange('bpmMax', e.target.value ? parseInt(e.target.value) : '')}
            />
        </div>
      </div>

      {/* Genre Filter */}
      <div className="flex items-center space-x-2">
        <span className="text-xs font-semibold text-slate-500 uppercase">Gatunek</span>
        <select 
            className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs rounded-md py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={filters.genre || ''}
            onChange={(e) => handleChange('genre', e.target.value)}
        >
            <option value="">Wszystkie</option>
            {availableGenres.map(g => (
                <option key={g} value={g}>{g}</option>
            ))}
        </select>
      </div>

      {/* Key Filter */}
      <div className="flex items-center space-x-2">
        <span className="text-xs font-semibold text-slate-500 uppercase">Klucz</span>
        <input 
            type="text" 
            placeholder="np. 11A" 
            className="w-20 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs rounded-md py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            value={filters.key || ''}
            onChange={(e) => handleChange('key', e.target.value)}
        />
      </div>

      {/* Clear Button */}
      {hasActiveFilters && (
          <button 
            onClick={onClearFilters}
            className="ml-auto text-xs text-red-500 hover:text-red-700 font-medium flex items-center"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            Wyczyść filtry
          </button>
      )}
    </div>
  );
};

export default FilterBar;
