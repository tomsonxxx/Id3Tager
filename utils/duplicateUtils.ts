import { AudioFile, ID3Tags } from '../types';

/**
 * Normalizes a string for comparison by converting to lowercase and removing extra whitespace.
 * @param str The string to normalize.
 * @returns The normalized string.
 */
const normalize = (str: string | undefined): string => {
    return str ? str.toLowerCase().trim().replace(/\s+/g, ' ') : '';
};

/**
 * Generates a consistent "fingerprint" for a track based on its most important tags.
 * This is used to identify potential duplicates.
 * @param tags The ID3Tags of the file.
 * @returns A string fingerprint.
 */
const generateFingerprint = (tags: ID3Tags): string => {
    const artist = normalize(tags.artist || tags.albumArtist);
    const title = normalize(tags.title);
    const album = normalize(tags.album);

    // If we have at least artist and title, we can create a fingerprint.
    if (artist && title) {
        return `${artist}|${title}|${album}`;
    }

    // Fallback if essential tags are missing, fingerprint will be empty
    // and this track won't be considered for duplication checks.
    return '';
};


/**
 * Scans a list of audio files and groups them into sets of duplicates.
 * @param files The array of AudioFile objects to scan.
 * @returns A Map where keys are unique set IDs and values are arrays of duplicate AudioFiles.
 */
export const findDuplicateSets = (files: AudioFile[]): Map<string, AudioFile[]> => {
    const fingerprintMap = new Map<string, AudioFile[]>();

    // Group files by their fingerprint
    files.forEach(file => {
        const tags = file.fetchedTags || file.originalTags;
        const fingerprint = generateFingerprint(tags);

        // Only process files that have a valid fingerprint
        if (fingerprint) {
            if (!fingerprintMap.has(fingerprint)) {
                fingerprintMap.set(fingerprint, []);
            }
            fingerprintMap.get(fingerprint)!.push(file);
        }
    });

    const duplicateSets = new Map<string, AudioFile[]>();
    
    // Filter out groups with only one file and assign a unique ID to each duplicate set
    for (const [fingerprint, groupedFiles] of fingerprintMap.entries()) {
        if (groupedFiles.length > 1) {
            // Use a simple but effective unique ID for the set
            const setId = `dup-${fingerprint.replace(/[^a-z0-9]/gi, '')}`.slice(0, 50);
            duplicateSets.set(setId, groupedFiles);
        }
    }

    return duplicateSets;
};
