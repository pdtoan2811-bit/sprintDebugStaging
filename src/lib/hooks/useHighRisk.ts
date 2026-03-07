'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'sprint_relay_high_risk';

export function useHighRisk() {
    const [highRiskIds, setHighRiskIds] = useState<Set<string>>(new Set());
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as string[];
                setHighRiskIds(new Set(parsed));
            }
        } catch (e) {
            console.error('Failed to parse high risk IDs', e);
        }
        setIsLoaded(true);
    }, []);

    const persist = useCallback((ids: Set<string>) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
    }, []);

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
