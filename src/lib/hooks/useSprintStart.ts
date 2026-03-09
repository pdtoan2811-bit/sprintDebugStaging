'use client';

import { useState, useEffect, useCallback } from 'react';
import { RawLogEvent } from '../types';

const STORAGE_KEY = 'sprint_relay_sprint_start';

export interface SprintStartEntry {
    taskId: string;
    taskName: string;
    person: string;
    module: string;
    screen: string;
    recordLink: string;
    autoDetectedStatus: string;
    confirmedStatus: string;
    isOverridden: boolean;
    autoDetectedTimestamp: string;
}

export interface SprintStartOverrides {
    [sprintNumber: string]: {
        [taskId: string]: string;
    };
}

export function useSprintStart() {
    const [overrides, setOverrides] = useState<SprintStartOverrides>({});
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        fetch('/api/data')
            .then(res => res.json())
            .then(data => {
                if (data && data[STORAGE_KEY]) {
                    try {
                        const parsed = JSON.parse(data[STORAGE_KEY]) as SprintStartOverrides;
                        setOverrides(parsed);
                    } catch (e) {
                        console.error('Failed to parse sprint start overrides', e);
                    }
                }
                setIsLoaded(true);
            })
            .catch(() => setIsLoaded(true));
    }, []);

    const persist = useCallback((data: SprintStartOverrides) => {
        fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [STORAGE_KEY]: JSON.stringify(data) })
        }).catch(err => console.error('Failed to save sprint start overrides', err));
    }, []);

    const getSprintStartSnapshot = useCallback((sprint: string, logs: RawLogEvent[]): SprintStartEntry[] => {
        if (!sprint || !logs || logs.length === 0) {
            return [];
        }

        const sprintStr = String(sprint).trim();
        
        const taskEarliestLog = new Map<string, RawLogEvent>();

        for (const log of logs) {
            const logSprint = String(log.sprint || '').trim();
            const status = String(log.status || '').trim();
            
            if (!logSprint || !status) continue;

            const existing = taskEarliestLog.get(log.taskId);
            if (!existing) {
                taskEarliestLog.set(log.taskId, log);
            } else {
                const existingTime = new Date(existing.timestamp).getTime();
                const currentTime = new Date(log.timestamp).getTime();
                if (currentTime < existingTime) {
                    taskEarliestLog.set(log.taskId, log);
                }
            }
        }

        const sprintOverrides = overrides[sprintStr] || {};

        const entries: SprintStartEntry[] = [];
        taskEarliestLog.forEach((log, taskId) => {
            const overriddenStatus = sprintOverrides[taskId];
            const autoDetectedStatus = String(log.status || 'Not Started').trim();

            entries.push({
                taskId,
                taskName: log.taskName || '',
                person: log.person || '',
                module: log.module || '',
                screen: log.screen || '',
                recordLink: log.recordLink || '',
                autoDetectedStatus,
                confirmedStatus: overriddenStatus ?? autoDetectedStatus,
                isOverridden: overriddenStatus !== undefined && overriddenStatus !== autoDetectedStatus,
                autoDetectedTimestamp: log.timestamp,
            });
        });

        return entries.sort((a, b) => a.taskId.localeCompare(b.taskId));
    }, [overrides]);

    const saveOverride = useCallback((sprint: string, taskId: string, newStatus: string) => {
        setOverrides(prev => {
            const next = {
                ...prev,
                [sprint]: {
                    ...(prev[sprint] || {}),
                    [taskId]: newStatus,
                }
            };
            persist(next);
            return next;
        });
    }, [persist]);

    const bulkSaveOverrides = useCallback((sprint: string, entries: { taskId: string; status: string }[]) => {
        setOverrides(prev => {
            const sprintOverrides = { ...(prev[sprint] || {}) };
            for (const entry of entries) {
                sprintOverrides[entry.taskId] = entry.status;
            }
            const next = {
                ...prev,
                [sprint]: sprintOverrides,
            };
            persist(next);
            return next;
        });
    }, [persist]);

    const clearOverride = useCallback((sprint: string, taskId: string) => {
        setOverrides(prev => {
            const sprintOverrides = { ...(prev[sprint] || {}) };
            delete sprintOverrides[taskId];
            const next = {
                ...prev,
                [sprint]: sprintOverrides,
            };
            persist(next);
            return next;
        });
    }, [persist]);

    const clearAllOverrides = useCallback((sprint: string) => {
        setOverrides(prev => {
            const next = { ...prev };
            delete next[sprint];
            persist(next);
            return next;
        });
    }, [persist]);

    const confirmAllAsOverrides = useCallback((sprint: string, entries: SprintStartEntry[]) => {
        setOverrides(prev => {
            const sprintOverrides: Record<string, string> = {};
            for (const entry of entries) {
                sprintOverrides[entry.taskId] = entry.confirmedStatus;
            }
            const next = {
                ...prev,
                [sprint]: sprintOverrides,
            };
            persist(next);
            return next;
        });
    }, [persist]);

    return {
        overrides,
        isLoaded,
        getSprintStartSnapshot,
        saveOverride,
        bulkSaveOverrides,
        clearOverride,
        clearAllOverrides,
        confirmAllAsOverrides,
    };
}
