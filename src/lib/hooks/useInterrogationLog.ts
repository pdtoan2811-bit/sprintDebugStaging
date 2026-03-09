'use client';

import { useState, useEffect, useCallback } from 'react';
import { InterrogationLogEntry } from '../types';

const STORAGE_KEY = 'sprint_relay_interrogation_logs';

export function useInterrogationLog() {
    const [logs, setLogs] = useState<Record<string, InterrogationLogEntry[]>>({});
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        fetch('/api/data')
            .then(res => res.json())
            .then(data => {
                if (data && data[STORAGE_KEY]) {
                    try {
                        setLogs(JSON.parse(data[STORAGE_KEY] || '{}'));
                    } catch (e) { }
                }
                setIsLoaded(true);
            })
            .catch(() => setIsLoaded(true));
    }, []);

    const persist = useCallback((data: Record<string, InterrogationLogEntry[]>) => {
        fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [STORAGE_KEY]: JSON.stringify(data) })
        }).catch(err => console.error('Failed to save interrogation logs', err));
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
