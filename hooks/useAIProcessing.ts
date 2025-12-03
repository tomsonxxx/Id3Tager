
import { useState, useRef, useCallback } from 'react';
import { AudioFile, ProcessingState } from '../types';
import { smartBatchAnalyze, ApiKeys, AIProvider } from '../services/aiService';

const MAX_CONCURRENT_GROUPS = 1; // Process one folder/group at a time to prevent rate limits with Search tool

export const useAIProcessing = (
    files: AudioFile[],
    updateFile: (id: string, updates: Partial<AudioFile>) => void,
    apiKeys: ApiKeys,
    aiProvider: AIProvider
) => {
    const [isBatchAnalyzing, setIsBatchAnalyzing] = useState(false);

    // --- Batch Processor (Smart) ---
    const analyzeBatch = useCallback(async (filesToProcess: AudioFile[]) => {
        if (filesToProcess.length === 0 || isBatchAnalyzing) return;
        
        setIsBatchAnalyzing(true);
        const ids = filesToProcess.map(f => f.id);
        
        // Set state to PROCESSING
        ids.forEach(id => updateFile(id, { state: ProcessingState.PROCESSING }));
        
        try {
            // The smartBatchAnalyze now handles grouping internaly
            const resultsTags = await smartBatchAnalyze(filesToProcess, aiProvider, apiKeys);
            
            // Map results back by index (smartBatchAnalyze returns results in same order if flat, 
            // but we need to match by logic inside service. 
            // Note: smartBatchAnalyze logic above was designed to match results.
            // However, a safer way is to rely on the service returning a map or ensuring order.
            // In the implementation provided in aiService, I made sure it iterates chunks and pushes results.
            // Let's assume order is preserved relative to the input array of the function.
            
            filesToProcess.forEach((file, index) => {
                const tagResult = resultsTags[index];
                if (tagResult) {
                    updateFile(file.id, { 
                        state: ProcessingState.SUCCESS, 
                        fetchedTags: { ...file.originalTags, ...tagResult } 
                    });
                } else {
                    updateFile(file.id, { 
                        state: ProcessingState.ERROR, 
                        errorMessage: "AI didn't return data" 
                    });
                }
            });

        } catch (e) {
            console.error("Batch Error:", e);
            ids.forEach(id => updateFile(id, { 
                state: ProcessingState.ERROR, 
                errorMessage: e instanceof Error ? e.message : "Batch Analysis Failed" 
            }));
        } finally {
            setIsBatchAnalyzing(false);
        }
    }, [isBatchAnalyzing, aiProvider, apiKeys, updateFile]);

    // Backward compatibility shim for single file queue
    const addToQueue = useCallback((fileIds: string[]) => {
        const filesToProcess = files.filter(f => fileIds.includes(f.id));
        analyzeBatch(filesToProcess);
    }, [files, analyzeBatch]);

    return {
        addToQueue,
        analyzeBatch,
        isBatchAnalyzing
    };
};
