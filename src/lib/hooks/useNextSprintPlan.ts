import { useState, useEffect, useCallback } from 'react';

export interface DraftTask {
    taskId: string;
    targetSprint: string;
    targetStatus: string;
    targetSprintGoal: string;
    order: number;
}

const STORAGE_KEY = 'next_sprint_plan_v2';

export function useNextSprintPlan(activeSprint: string) {
    // drafted tasks by taskId for the whole sprint
    const [drafts, setDrafts] = useState<Record<string, DraftTask>>({}); 
    const [isLoading, setIsLoading] = useState(true);

    const fetchDrafts = useCallback(async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/data');
            if (!res.ok) throw new Error('Failed to fetch data');
            const data = await res.json();
            
            const sprintKey = `${STORAGE_KEY}_${activeSprint}`;
            if (data[sprintKey]) {
                setDrafts(data[sprintKey]);
            } else {
                setDrafts({});
            }
        } catch (error) {
            console.error('Error loading next sprint drafts:', error);
            setDrafts({});
        } finally {
            setIsLoading(false);
        }
    }, [activeSprint]);

    useEffect(() => {
        if (activeSprint) {
            fetchDrafts();
        }
    }, [fetchDrafts, activeSprint]);

    const saveDraftsToDb = async (newDrafts: Record<string, DraftTask>) => {
        try {
            const sprintKey = `${STORAGE_KEY}_${activeSprint}`;
            await fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [sprintKey]: newDrafts }),
            });
        } catch (error) {
            console.error('Error saving next sprint drafts:', error);
        }
    };

    const addDraft = useCallback((draft: Omit<DraftTask, 'order'>) => {
        setDrafts(prev => {
            if (prev[draft.taskId]) return prev; // Already drafted
            
            const newOrder = Object.keys(prev).length;
            const newDrafts = {
                ...prev,
                [draft.taskId]: { ...draft, order: newOrder }
            };
            saveDraftsToDb(newDrafts);
            return newDrafts;
        });
    }, [activeSprint]);

    const removeDraft = useCallback((taskId: string) => {
        setDrafts(prev => {
            if (!prev[taskId]) return prev;
            
            const newDrafts = { ...prev };
            delete newDrafts[taskId];
            
            // Reorder
            const sortedArray = Object.values(newDrafts).sort((a,b) => a.order - b.order);
            const reorderedDrafts: Record<string, DraftTask> = {};
            sortedArray.forEach((d, i) => {
                reorderedDrafts[d.taskId] = { ...d, order: i };
            });

            saveDraftsToDb(reorderedDrafts);
            return reorderedDrafts;
        });
    }, [activeSprint]);

    const updateDraft = useCallback((taskId: string, updates: Partial<DraftTask>) => {
        setDrafts(prev => {
            if (!prev[taskId]) return prev;
            const newDrafts = {
                ...prev,
                [taskId]: { ...prev[taskId], ...updates }
            };
            saveDraftsToDb(newDrafts);
            return newDrafts;
        });
    }, [activeSprint]);

    const bulkUpdateDrafts = useCallback((updates: Partial<DraftTask>, taskIds?: string[]) => {
        setDrafts(prev => {
            const newDrafts = { ...prev };
            const idsToUpdate = taskIds || Object.keys(prev);
            
            idsToUpdate.forEach(taskId => {
                if (newDrafts[taskId]) {
                    newDrafts[taskId] = { ...newDrafts[taskId], ...updates };
                }
            });
            saveDraftsToDb(newDrafts);
            return newDrafts;
        });
    }, [activeSprint]);

    // get an ordered array of drafted tasks
    const getDraftsArray = useCallback((): DraftTask[] => {
        return Object.values(drafts).sort((a, b) => a.order - b.order);
    }, [drafts]);

    return {
        drafts,
        isLoading,
        addDraft,
        removeDraft,
        updateDraft,
        bulkUpdateDrafts,
        getDraftsArray,
    };
}
