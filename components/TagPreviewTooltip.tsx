// Fix: Provide full implementation for the TagPreviewTooltip component.
import React from 'react';
import { ID3Tags } from '../types';

interface TagPreviewTooltipProps {
  tags: ID3Tags;
}

const TagPreviewTooltip: React.FC<TagPreviewTooltipProps> = ({ tags }) => {
  return (
    <div className="absolute z-10 w-72 p-3 -mt-20 ml-16 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
      <h4 className="font-bold text-slate-900 dark:text-white truncate">{tags.title || 'Brak tytułu'}</h4>
      <p className="text-sm text-slate-600 dark:text-slate-300 truncate">{tags.artist || 'Brak wykonawcy'}</p>
      <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{tags.album || 'Brak albumu'}</p>
      <div className="flex justify-between text-xs text-slate-400 dark:text-slate-500 mt-2">
        <span>{tags.year || '----'}</span>
        <span>{tags.genre || 'Brak gatunku'}</span>
      </div>
    </div>
  );
};

export default TagPreviewTooltip;