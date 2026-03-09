'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'sprint_relay_high_risk';

export function useHighRisk() {
    const [highRiskIds, setHighRiskIds] = useState<Set<string>>(new Set());
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        fetch('/api/data')
            .then(res => res.json())
            .then(data => {
                if (data && data[STORAGE_KEY]) {
                    try {
                        const parsed = JSON.parse(data[STORAGE_KEY]) as string[];
                        setHighRiskIds(new Set(parsed));
                    } catch (e) { }
                }
                setIsLoaded(true);
            })
            .catch(() => setIsLoaded(true));
    }, []);

    const persist = useCallback((ids: Set<string>) => {
        fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [STORAGE_KEY]: JSON.stringify(Array.from(ids)) })
        }).catch(err => console.error('Failed to save high risk IDs', err));
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
