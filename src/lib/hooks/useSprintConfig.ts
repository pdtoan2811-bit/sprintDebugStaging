'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'sprint_relay_sprint_config';
const OVERRIDE_KEY = 'sprint_relay_manual_sprint';

export interface SprintConfig {
    number: string;
    startDate: string; // YYYY-MM-DD
    endDate: string;   // YYYY-MM-DD
}

const DEFAULT_CONFIG: SprintConfig[] = [
    { number: '7', startDate: '2026-01-05', endDate: '2026-01-16' },
    { number: '8', startDate: '2026-01-19', endDate: '2026-01-30' },
    { number: '9', startDate: '2026-02-02', endDate: '2026-02-13' },
    { number: '10', startDate: '2026-02-16', endDate: '2026-02-27' },
    { number: '11', startDate: '2026-03-02', endDate: '2026-03-13' },
    { number: '12', startDate: '2026-03-16', endDate: '2026-03-27' },
];

export function useSprintConfig() {
    const [configs, setConfigs] = useState<SprintConfig[]>(DEFAULT_CONFIG);
    const [manualOverride, setManualOverride] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setConfigs(JSON.parse(stored));
            } else {
                setConfigs(DEFAULT_CONFIG);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_CONFIG));
            }

            const override = localStorage.getItem(OVERRIDE_KEY);
            if (override) {
                setManualOverride(override);
            }
        } catch (e) {
            console.error('Failed to load sprint config', e);
        }
        setIsLoaded(true);
    }, []);

    const saveConfigs = useCallback((newConfigs: SprintConfig[]) => {
        setConfigs(newConfigs);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfigs));
    }, []);

    const saveManualOverride = useCallback((sprintNumber: string | null) => {
        setManualOverride(sprintNumber);
        if (sprintNumber) {
            localStorage.setItem(OVERRIDE_KEY, sprintNumber);
        } else {
            localStorage.removeItem(OVERRIDE_KEY);
        }
    }, []);

    const getCurrentSprint = useCallback((): SprintConfig | undefined => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return configs.find((s) => {
            const start = new Date(s.startDate);
            const end = new Date(s.endDate);
            end.setHours(23, 59, 59, 999);
            return today >= start && today <= end;
        });
    }, [configs]);

    const getActiveSprintNumber = useCallback((): string => {
        if (manualOverride === null || manualOverride === 'auto') {
            return getCurrentSprint()?.number || '';
        }
        return manualOverride;
    }, [manualOverride, getCurrentSprint]);

    return { configs, saveConfigs, manualOverride, saveManualOverride, getCurrentSprint, getActiveSprintNumber, isLoaded };
}
