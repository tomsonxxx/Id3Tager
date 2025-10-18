
// Fix: Correct import path
import { AudioFile, ProcessingState } from '../types';

export type SortKey = 'dateAdded' | 'originalName' | 'newName' | 'state';

// Fix: Add the missing `SAVING` state to the `stateOrder` map to satisfy the
// `Record<ProcessingState, number>` type and ensure correct sorting logic.
const stateOrder: Record<ProcessingState, number> = {
  [ProcessingState.PROCESSING]: 1,
  [ProcessingState.DOWNLOADING]: 2,
  [ProcessingState.SAVING]: 3,
  [ProcessingState.PENDING]: 4,
  [ProcessingState.SUCCESS]: 5,
  [ProcessingState.ERROR]: 6,
};

export const sortFiles = (
  files: AudioFile[],
  key: SortKey,
  direction: 'asc' | 'desc'
): AudioFile[] => {
  const sorted = files.sort((a, b) => {
    let comparison = 0;

    switch (key) {
      case 'dateAdded':
        comparison = a.dateAdded - b.dateAdded;
        break;
      case 'originalName':
        comparison = a.file.name.localeCompare(b.file.name, undefined, { numeric: true, sensitivity: 'base' });
        break;
      case 'newName':
        const nameA = a.newName || a.file.name;
        const nameB = b.newName || b.file.name;
        comparison = nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
        break;
      case 'state':
        comparison = stateOrder[a.state] - stateOrder[b.state];
        break;
    }

    return comparison;
  });

  return direction === 'asc' ? sorted : sorted.reverse();
};
