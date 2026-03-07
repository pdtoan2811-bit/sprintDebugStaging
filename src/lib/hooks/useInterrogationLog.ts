'use client';

import { useState, useEffect, useCallback } from 'react';
import { InterrogationLogEntry } from '../types';

const STORAGE_KEY = 'sprint_relay_interrogation_logs';

export function useInterrogationLog() {
    const [logs, setLogs] = useState<Record<string, InterrogationLogEntry[]>>({});
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setLogs(JSON.parse(stored));
            }
        } catch (e) {
            console.error('Failed to parse interrogation logs', e);
        }
        setIsLoaded(true);
    }, []);

    const persist = useCallback((data: Record<string, InterrogationLogEntry[]>) => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }, []);

    const addLogEntry = useCallback((taskId: string, text: string) => {
        const entry: InterrogationLogEntry = {
            id: `${taskId}_${Date.now()}`,
            taskId,
            timestamp: new Date().toISOString(),
            text,
        };

        setLogs((prev) => {
            const taskLogs = prev[taskId] ? [...prev[taskId], entry] : [entry];
            const next = { ...prev, [taskId]: taskLogs };
            persist(next);
            return next;
        });
    }, [persist]);

    const getLogsForTask = useCallback(
        (taskId: string): InterrogationLogEntry[] => logs[taskId] ?? [],
        [logs]
    );

    return { logs, addLogEntry, getLogsForTask, isLoaded };
}
