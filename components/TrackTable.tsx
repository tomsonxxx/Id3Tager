
import React, { useState, useRef, useMemo } from 'react';
import { AudioFile } from '../types';
import { StatusIcon } from './StatusIcon';
import { SortConfig, SortKey } from '../utils/sortingUtils';

interface TrackTableProps {
  files: AudioFile[];
  selectedFileIds: string[];
  activeFileId: string | null;
  onSelect: (id: string, multi: boolean) => void;
  onSelectAll?: () => void;
  onActivate: (file: AudioFile) => void;
  sortConfig: SortConfig[];
  onSort: (config: SortConfig[]) => void;
}

interface ColumnDef {
    id: SortKey | 'select';
    label: string;
    defaultWidth: number;
    minWidth: number;
    isSortable: boolean;
}

const columns: ColumnDef[] = [
    { id: 'select', label: '', defaultWidth: 40, minWidth: 40, isSortable: false },
    { id: 'state', label: 'Status', defaultWidth: 60, minWidth: 50, isSortable: true },
    { id: 'title', label: 'Tytuł', defaultWidth: 250, minWidth: 150, isSortable: true },
    { id: 'artist', label: 'Artysta', defaultWidth: 180, minWidth: 100, isSortable: true },
    { id: 'album', label: 'Album', defaultWidth: 180, minWidth: 100, isSortable: true },
    { id: 'year', label: 'Rok', defaultWidth: 70, minWidth: 60, isSortable: true },
    { id: 'genre', label: 'Gatunek', defaultWidth: 120, minWidth: 80, isSortable: true },
    { id: 'bpm', label: 'BPM', defaultWidth: 60, minWidth: 50, isSortable: true },
    { id: 'key', label: 'Key', defaultWidth: 60, minWidth: 50, isSortable: true },
];

const TrackTable: React.FC<TrackTableProps> = ({ 
    files, 
    selectedFileIds, 
    activeFileId, 
    onSelect, 
    onSelectAll,
    onActivate,
    sortConfig,
    onSort
}) => {
  // Column Resizing State
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => 
    columns.reduce((acc, col) => ({ ...acc, [col.id]: col.defaultWidth }), {})
  );
  const resizingRef = useRef<{ id: string, startX: number, startWidth: number } | null>(null);

  const allSelected = useMemo(() => files.length > 0 && selectedFileIds.length === files.length, [files.length, selectedFileIds.length]);
  const isIndeterminate = useMemo(() => selectedFileIds.length > 0 && selectedFileIds.length < files.length, [files.length, selectedFileIds.length]);

  // Sorting Handler
  const handleHeaderClick = (e: React.MouseEvent, key: string, isSortable: boolean) => {
      if (!isSortable) return;
      // Ignore click if resizing
      if ((e.target as HTMLElement).classList.contains('resizer')) return;

      const sortKey = key as SortKey;
      const existingIndex = sortConfig.findIndex(s => s.key === sortKey);
      let newConfig = [...sortConfig];

      if (e.shiftKey) {
          // Multi-sort: Append or toggle
          if (existingIndex >= 0) {
             if (newConfig[existingIndex].direction === 'asc') {
                 newConfig[existingIndex].direction = 'desc';
             } else {
                 newConfig.splice(existingIndex, 1);
             }
          } else {
              newConfig.push({ key: sortKey, direction: 'asc' });
          }
      } else {
          // Single sort: Replace
          if (existingIndex >= 0 && sortConfig.length === 1) {
              // Toggle direction if it's the only sort key
              newConfig = [{ key: sortKey, direction: newConfig[existingIndex].direction === 'asc' ? 'desc' : 'asc' }];
          } else {
              newConfig = [{ key: sortKey, direction: 'asc' }];
          }
      }
      onSort(newConfig);
  };

  // Resize Handlers
  const handleResizeStart = (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      resizingRef.current = {
          id,
          startX: e.clientX,
          startWidth: columnWidths[id]
      };
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
  };

  const handleResizeMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { id, startX, startWidth } = resizingRef.current;
      const diff = e.clientX - startX;
      const col = columns.find(c => c.id === id);
      const minWidth = col ? col.minWidth : 50;
      
      setColumnWidths(prev => ({
          ...prev,
          [id]: Math.max(minWidth, startWidth + diff)
      }));
  };

  const handleResizeEnd = () => {
      resizingRef.current = null;
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
  };

  const handleRowClick = (e: React.MouseEvent, id: string) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    onSelect(id, e.ctrlKey || e.metaKey || e.shiftKey);
  };

  const handleCheckboxChange = (id: string) => {
      onSelect(id, true);
  };

  const handleSelectAllChange = () => {
      if (onSelectAll) onSelectAll();
  }

  if (files.length === 0) {
      return null;
  }

  return (
    <div className="flex-grow overflow-auto bg-white dark:bg-slate-900 select-none">
      <div style={{ minWidth: '100%', width: 'fit-content' }}>
        {/* Header Row */}
        <div className="flex sticky top-0 bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 z-10 shadow-sm">
            {columns.map(col => {
                const sortIndex = sortConfig.findIndex(s => s.key === col.id);
                const sortState = sortIndex >= 0 ? sortConfig[sortIndex] : null;
                
                return (
                    <div 
                        key={col.id}
                        className={`relative px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center group bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${!col.isSortable ? 'cursor-default' : 'cursor-pointer'}`}
                        style={{ width: columnWidths[col.id], flexShrink: 0 }}
                        onClick={(e) => handleHeaderClick(e, col.id, col.isSortable)}
                    >
                        {col.id === 'select' ? (
                            <input 
                                type="checkbox"
                                checked={allSelected}
                                ref={input => { if (input) input.indeterminate = isIndeterminate; }}
                                onChange={handleSelectAllChange}
                                className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                        ) : (
                            <span className="truncate flex-grow">{col.label}</span>
                        )}
                        
                        {sortState && (
                            <div className="flex items-center ml-1 text-indigo-600 dark:text-indigo-400">
                                {sortConfig.length > 1 && (
                                    <span className="text-[10px] mr-0.5 font-bold">{sortIndex + 1}</span>
                                )}
                                {sortState.direction === 'asc' ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                )}
                            </div>
                        )}
                        
                        <div 
                            className="resizer absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-indigo-500 z-20 opacity-0 group-hover:opacity-100"
                            onMouseDown={(e) => handleResizeStart(e, col.id)}
                        />
                    </div>
                );
            })}
        </div>

        {/* Rows */}
        <div className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
            {files.map((file) => {
                const isSelected = selectedFileIds.includes(file.id);
                const isActive = activeFileId === file.id;
                const tags = file.fetchedTags || file.originalTags || {};
                const displayName = file.newName || file.file.name;

                return (
                <div 
                    key={file.id}
                    onClick={(e) => handleRowClick(e, file.id)}
                    onDoubleClick={() => onActivate(file)}
                    className={`
                        flex items-center group cursor-pointer transition-colors text-sm
                        ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/30' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}
                        ${isActive ? 'bg-indigo-100 dark:bg-indigo-900/50' : ''}
                    `}
                >
                    <div className="px-4 py-2 flex-shrink-0 flex items-center justify-center" style={{ width: columnWidths['select'] }}>
                        <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleCheckboxChange(file.id)}
                            className="h-4 w-4 rounded bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                    </div>

                     <div className="px-4 py-2 flex-shrink-0" style={{ width: columnWidths['state'] }}>
                        <div className="scale-75 origin-left">
                            <StatusIcon state={file.state} />
                        </div>
                    </div>
                    <div className="px-4 py-2 flex-shrink-0 truncate" style={{ width: columnWidths['title'] }}>
                        <div className="flex flex-col truncate">
                            <span className={`font-medium truncate ${isActive || isSelected ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-900 dark:text-white'}`}>
                                {tags.title || displayName}
                            </span>
                        </div>
                    </div>
                    <div className="px-4 py-2 flex-shrink-0 truncate text-slate-600 dark:text-slate-300" style={{ width: columnWidths['artist'] }}>
                        {tags.artist || <span className="text-slate-400 italic">Nieznany</span>}
                    </div>
                     <div className="px-4 py-2 flex-shrink-0 truncate text-slate-500 dark:text-slate-400" style={{ width: columnWidths['album'] }}>
                        {tags.album || '-'}
                    </div>
                    <div className="px-4 py-2 flex-shrink-0 truncate text-slate-500 dark:text-slate-400" style={{ width: columnWidths['year'] }}>
                        {tags.year || '-'}
                    </div>
                    <div className="px-4 py-2 flex-shrink-0 truncate text-slate-500 dark:text-slate-400" style={{ width: columnWidths['genre'] }}>
                         {tags.genre ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                                {tags.genre}
                            </span>
                        ) : '-'}
                    </div>
                    <div className="px-4 py-2 flex-shrink-0 truncate text-slate-500 dark:text-slate-400 font-mono text-xs" style={{ width: columnWidths['bpm'] }}>
                        {tags.bpm || '-'}
                    </div>
                     <div className="px-4 py-2 flex-shrink-0 truncate text-slate-500 dark:text-slate-400 font-mono text-xs" style={{ width: columnWidths['key'] }}>
                        {tags.initialKey || '-'}
                    </div>
                </div>
                );
            })}
        </div>
      </div>
    </div>
  );
};

export default TrackTable;
