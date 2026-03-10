'use client';

import { useState, useEffect, useCallback } from 'react';
import { useData } from '../DataProvider';

const STORAGE_KEY = 'sprint_relay_high_risk';

export function useHighRisk() {
    const { data: sharedData, isLoaded: sharedLoaded, updateKey } = useData();
    const [highRiskIds, setHighRiskIds] = useState<Set<string>>(new Set());
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (!sharedLoaded) return;
        if (sharedData[STORAGE_KEY]) {
            try {
                const parsed = JSON.parse(sharedData[STORAGE_KEY]) as string[];
                setHighRiskIds(new Set(parsed));
            } catch (e) { }
        }
        setIsLoaded(true);
    }, [sharedLoaded, sharedData]);

    const persist = useCallback((ids: Set<string>) => {
        updateKey(STORAGE_KEY, JSON.stringify(Array.from(ids)));
    }, [updateKey]);

    const toggleHighRisk = useCallback((taskId: string) => {
        setHighRiskIds((prev) => {
            const next = new Set(prev);
            if (next.has(taskId)) {
                next.delete(taskId);
            } else {
                next.add(taskId);
            }
            persist(next);
            return next;
        });
    }, [persist]);

    const isHighRisk = useCallback(
        (taskId: string) => highRiskIds.has(taskId),
        [highRiskIds]
    );

    return { highRiskIds, toggleHighRisk, isHighRisk, isLoaded };
}
