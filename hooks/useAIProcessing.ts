
import { useState, useRef, useCallback } from 'react';
import { AudioFile, ProcessingState } from '../types';
import { fetchTagsForFile, fetchTagsForBatch, ApiKeys, AIProvider } from '../services/aiService';

const MAX_CONCURRENT_REQUESTS = 3;

export const useAIProcessing = (
    files: AudioFile[],
    updateFile: (id: string, updates: Partial<AudioFile>) => void,
    apiKeys: ApiKeys,
    aiProvider: AIProvider
) => {
    const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);
    const processingQueueRef = useRef<string[]>([]);
    const activeRequestsRef = useRef(0);

    // --- Single File Queue Processor ---
    const processQueue = useCallback(async () => {
        if (activeRequestsRef.current >= MAX_CONCURRENT_REQUESTS || processingQueueRef.current.length === 0) {
            return;
        }

        const fileIdToProcess = processingQueueRef.current.shift();
        if (!fileIdToProcess) return;

        const fileToProcess = files.find(f => f.id === fileIdToProcess);
        if (!fileToProcess || fileToProcess.state !== ProcessingState.PENDING) {
            processQueue(); // Skip if file missing or not pending
            return;
        }

        activeRequestsRef.current++;
        updateFile(fileIdToProcess, { state: ProcessingState.PROCESSING });

        try {
            const fetchedTags = await fetchTagsForFile(fileToProcess.file.name, fileToProcess.originalTags, aiProvider, apiKeys);
            updateFile(fileIdToProcess, { state: ProcessingState.SUCCESS, fetchedTags });
        } catch (error) {
            updateFile(fileIdToProcess, { state: ProcessingState.ERROR, errorMessage: error instanceof Error ? error.message : "Błąd" });
        } finally {
            activeRequestsRef.current--;
            processQueue();
        }
    }, [files, aiProvider, apiKeys, updateFile]);

    const addToQueue = useCallback((fileIds: string[]) => {
        processingQueueRef.current.push(...fileIds);
        // Kickstart the queue if we have capacity
        for(let i=0; i < MAX_CONCURRENT_REQUESTS; i++) {
             processQueue();
        }
    }, [processQueue]);


    // --- Batch Processor ---
    const analyzeBatch = useCallback(async (filesToProcess: AudioFile[]) => {
        if (filesToProcess.length === 0 || isBatchAnalyzing) return;
        setIsBatchAnalyzing(true);
        const ids = filesToProcess.map(f => f.id);
        
        // Mark all as processing
        ids.forEach(id => updateFile(id, { state: ProcessingState.PROCESSING }));
        
        try {
            const results = await fetchTagsForBatch(filesToProcess, aiProvider, apiKeys);
            const resultsMap = new Map(results.map(r => [r.originalFilename, r]));

            ids.forEach(id => {
                const file = filesToProcess.find(f => f.id === id);
                if (file) {
                    const result = resultsMap.get(file.file.name);
                    if (result) {
                        // eslint-disable-next-line @typescript-eslint/no-unused-vars
                        const { originalFilename, ...fetchedTags } = result;
                        updateFile(id, { state: ProcessingState.SUCCESS, fetchedTags: { ...file.originalTags, ...fetchedTags } });
                    } else {
                        updateFile(id, { state: ProcessingState.ERROR, errorMessage: "Brak danych AI" });
                    }
                }
            });
        } catch (e) {
            ids.forEach(id => updateFile(id, { state: ProcessingState.ERROR, errorMessage: e instanceof Error ? e.message : "Błąd wsadowy" }));
        } finally {
            setIsBatchAnalyzing(false);
        }
    }, [isBatchAnalyzing, aiProvider, apiKeys, updateFile]);

    return {
        addToQueue,
        analyzeBatch,
        isBatchAnalyzing
    };
};
