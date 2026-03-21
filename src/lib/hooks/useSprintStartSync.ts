'use client';

import { useState, useCallback } from 'react';
import { SprintStartEntry } from './useSprintStart';

const PRODUCTION_WEBHOOK_URL = 'https://jsg35lsl9g0c.sg.larksuite.com/base/automation/webhook/event/CyknaO0BCwAPxZhhaItlNTN0gEg';

export interface SyncLogEntry {
    taskId: string;
    taskName: string;
    person: string;
    success: boolean;
    error?: string;
    timestamp: string;
}

export interface SyncStatus {
    isSyncing: boolean;
    current: number;
    total: number;
    logs: SyncLogEntry[];
}

export function useSprintStartSync() {
    const [status, setStatus] = useState<SyncStatus>({
        isSyncing: false,
        current: 0,
        total: 0,
        logs: []
    });

    const syncToLark = useCallback(async (sprint: string, entries: SprintStartEntry[]) => {
        if (entries.length === 0) return;

        setStatus({
            isSyncing: true,
            current: 0,
            total: entries.length,
            logs: []
        });

        const numericSprint = sprint.replace(/\D/g, '');
        const nextSprint = String(parseInt(numericSprint) + 1);

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            
            setStatus(prev => ({
                ...prev,
                current: i + 1
            }));

            try {
                const payload = {
                    person: entry.person,
                    currentSprint: numericSprint,
                    nextSprint: nextSprint,
                    webhookUrl: PRODUCTION_WEBHOOK_URL,
                    date: new Date().toISOString().split('T')[0],
                    todos: [
                        {
                            order: 1,
                            taskId: entry.taskId,
                            taskName: entry.taskName,
                            status: entry.confirmedStatus,
                            sprintGoal: entry.confirmedStatus, // User clarified sprintGoal is the target status
                            recordLink: entry.recordLink,
                            tag: entry.confirmedStatus,
                            isMoved: false // This is a "Start Sprint" action, not a "Move" action
                        }
                    ],
                    summary: {
                        total: 1,
                        completed: 0,
                        blocked: 0
                    },
                    isProduction: true
                };

                const res = await fetch('/api/send-todo-webhook', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();

                const logEntry: SyncLogEntry = {
                    taskId: entry.taskId,
                    taskName: entry.taskName,
                    person: entry.person,
                    success: res.ok && data.success,
                    error: res.ok && data.success ? undefined : (data.error || `HTTP ${res.status}`),
                    timestamp: new Date().toISOString()
                };

                setStatus(prev => ({
                    ...prev,
                    logs: [logEntry, ...prev.logs]
                }));

            } catch (error) {
                const logEntry: SyncLogEntry = {
                    taskId: entry.taskId,
                    taskName: entry.taskName,
                    person: entry.person,
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    timestamp: new Date().toISOString()
                };

                setStatus(prev => ({
                    ...prev,
                    logs: [logEntry, ...prev.logs]
                }));
            }

            // Small delay to prevent overwhelming the receiver/rate limits
            if (i < entries.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 300));
            }
        }

        setStatus(prev => ({
            ...prev,
            isSyncing: false
        }));
    }, []);

    const resetSync = useCallback(() => {
        setStatus({
            isSyncing: false,
            current: 0,
            total: 0,
            logs: []
        });
    }, []);

    return {
        ...status,
        syncToLark,
        resetSync
    };
}
