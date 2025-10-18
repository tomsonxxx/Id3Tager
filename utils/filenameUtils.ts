import { ID3Tags } from '../types';

export const generatePath = (
  pattern: string,
  tags: ID3Tags,
  originalFilename: string
): string => {
  const extension = originalFilename.split('.').pop()?.toLowerCase() || 'mp3';
  
  // Get the most complete set of tags available
  const effectiveTags = { ...tags };

  let newName = pattern
    .replace(/\[artist\]/gi, effectiveTags.artist || 'Unknown Artist')
    .replace(/\[album\]/gi, effectiveTags.album || 'Unknown Album')
    .replace(/\[title\]/gi, effectiveTags.title || 'Unknown Title')
    .replace(/\[year\]/gi, effectiveTags.year || '0000')
    .replace(/\[genre\]/gi, effectiveTags.genre || 'Unknown Genre');

  // Sanitize filename to remove invalid characters for filenames and paths
  // This regex handles both Windows and Unix-like systems for each path segment.
  const sanitizePart = (part: string) => part.trim().replace(/[\\?%*:|"<>]/g, '-').replace(/^\.+/, '').trim();
  
  // Sanitize each part of the path separately
  const sanitizedPath = newName.split('/').map(sanitizePart).join('/');
  
  return `${sanitizedPath}.${extension}`;
};
