'use client';

import { useEffect, useState, useCallback } from 'react';

export interface NextSprintDraftSettings {
    sprintFilters: string[];
}

export function useNextSprintDraftSettings(activeSprint: string) {
    const [selectedSprintNumbers, setSelectedSprintNumbers] = useState<Set<string>>(new Set());
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const res = await fetch('/api/next-sprint-draft-settings');
                if (!res.ok) {
                    // If settings don't exist yet, fall back to default.
                    applyDefault();
                    return;
                }
                const data = (await res.json()) as NextSprintDraftSettings | null;
                if (cancelled) return;

                if (!data || !Array.isArray(data.sprintFilters) || data.sprintFilters.length === 0) {
                    applyDefault();
                    return;
                }

                setSelectedSprintNumbers(new Set(data.sprintFilters.map(String)));
                setLoaded(true);
            } catch {
                if (!cancelled) {
                    applyDefault();
                }
            }
        }

        function applyDefault() {
            const current = parseInt(activeSprint, 10);
            const defaults = new Set<string>();
            if (!isNaN(current)) {
                defaults.add(String(current));
                defaults.add(String(current + 1));
                defaults.add(String(current + 2));
            }
            setSelectedSprintNumbers(defaults);
            setLoaded(true);
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [activeSprint]);

    const updateSelectedSprintNumbers = useCallback((next: Set<string>) => {
        setSelectedSprintNumbers(next);
        const payload: NextSprintDraftSettings = {
            sprintFilters: Array.from(next),
        };
        fetch('/api/next-sprint-draft-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        }).catch((err) => {
            console.error('Failed to persist next sprint draft settings', err);
        });
    }, []);

    return {
        selectedSprintNumbers,
        setSelectedSprintNumbers: updateSelectedSprintNumbers,
        loaded,
    };
}

