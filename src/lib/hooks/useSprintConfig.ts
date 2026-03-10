'use client';

import { useState, useEffect, useCallback } from 'react';
import { useData } from '../DataProvider';

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
    const { data: sharedData, isLoaded: sharedLoaded, updateKey, refetch: refetchShared } = useData();
    const [configs, setConfigs] = useState<SprintConfig[]>(DEFAULT_CONFIG);
    const [manualOverride, setManualOverride] = useState<string | null>(null);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (!sharedLoaded) return;
        try {
            const raw = sharedData[STORAGE_KEY];
            if (raw) {
                const parsed = JSON.parse(raw || '[]');
                setConfigs(Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_CONFIG);
            } else {
                setConfigs(DEFAULT_CONFIG);
            }

            if (sharedData[OVERRIDE_KEY]) {
                setManualOverride(sharedData[OVERRIDE_KEY]);
            } else {
                setManualOverride(null);
            }
        } catch (e) {
            setConfigs(DEFAULT_CONFIG);
        }
        setIsLoaded(true);
    }, [sharedLoaded, sharedData]);

    const saveConfigs = useCallback(async (newConfigs: SprintConfig[]) => {
        setConfigs(newConfigs);
        updateKey(STORAGE_KEY, JSON.stringify(newConfigs));
    }, [updateKey]);

    const saveManualOverride = useCallback(async (sprintNumber: string | null) => {
        setManualOverride(sprintNumber);
        updateKey(OVERRIDE_KEY, sprintNumber);
    }, [updateKey]);

    /** Saves both config and override in one request to avoid race (one POST overwriting the other). */
    const saveSprintSettings = useCallback(async (newConfigs: SprintConfig[], newOverride: string | null) => {
        const body: Record<string, string | null> = {
            [STORAGE_KEY]: JSON.stringify(newConfigs),
            [OVERRIDE_KEY]: newOverride ?? null,
        };
        const res = await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) throw new Error('Failed to save sprint settings');
        setConfigs(newConfigs);
        setManualOverride(newOverride);
        await refetchShared();
    }, [refetchShared]);

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

    const refetch = useCallback(() => {
        refetchShared();
    }, [refetchShared]);

    return { configs, saveConfigs, manualOverride, saveManualOverride, saveSprintSettings, getCurrentSprint, getActiveSprintNumber, isLoaded, refetch };
}
