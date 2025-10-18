// Fix: Provide full implementation for application types.
export enum ProcessingState {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  DOWNLOADING = 'DOWNLOADING',
  SAVING = 'SAVING', // Nowy stan
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export interface ID3Tags {
  artist?: string;
  title?: string;
  album?: string;
  year?: string;
  genre?: string;
  albumCoverUrl?: string;
  mood?: string;
  comments?: string;
}

export interface AudioFile {
  id: string;
  file: File;
  state: ProcessingState;
  originalTags: ID3Tags;
  handle?: FileSystemFileHandle; // Referencja do pliku na dysku
  fetchedTags?: ID3Tags;
  newName?: string;
  isSelected?: boolean;
  errorMessage?: string;
  dateAdded: number;
  downloadProgress?: number; // Postęp pobierania okładki (0-100)
}

// Typ dla danych przechowywanych w localStorage (bez obiektów File i Handle)
export type SerializableAudioFile = Omit<AudioFile, 'file' | 'handle'>;


export type GroupKey = 'artist' | 'album' | 'none';