
export enum ProcessingState {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  DOWNLOADING = 'DOWNLOADING',
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
  bitrate?: number;
  sampleRate?: number;
  trackNumber?: string; // Can be "1" or "1/12"
  albumArtist?: string;
  composer?: string;
  copyright?: string;
  encodedBy?: string;
  originalArtist?: string;
  discNumber?: string; // Can be "1" or "1/2"
  
  // DJ / Technical Fields
  bpm?: number; // Beats Per Minute
  initialKey?: string; // Musical Key (e.g., "11B", "Am")
  energy?: number; // 1-10
  danceability?: number; // 1-10
  
  // Advanced AI Fields
  confidence?: 'high' | 'medium' | 'low'; // AI confidence score
  isrc?: string; // International Standard Recording Code
  releaseType?: 'album' | 'single' | 'compilation' | 'ep' | 'remix';
  recordLabel?: string;
  dataOrigin?: 'ai-inference' | 'google-search' | 'file-metadata';
}

export interface AudioFile {
  id: string;
  file: File;
  state: ProcessingState;
  originalTags: ID3Tags;
  fetchedTags?: ID3Tags;
  newName?: string;
  isSelected?: boolean;
  errorMessage?: string;
  dateAdded: number;
  handle?: any; // FileSystemFileHandle for direct saving
  webkitRelativePath?: string; // The relative path of the file within the directory
  duplicateSetId?: string; // ID to group duplicate files
}

export type GroupKey = 'artist' | 'album' | 'none';
