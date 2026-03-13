'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface NextSprintPlanItem {
    taskId: string;
    addedAt: string;
    order: number;
    targetStatus?: string; // optional sprint goal override
}

export interface NextSprintPlanEntry {
    sprintNumber: string;
    person: string;
    items: NextSprintPlanItem[];
}

const STORAGE_KEY = 'sprint_relay_next_sprint_plan';
const SAVE_DEBOUNCE_MS = 500;

function getEntryKey(sprintNumber: string, person: string): string {
    return `${sprintNumber}__${person}`;
}

async function loadFromAPI(): Promise<Record<string, NextSprintPlanEntry>> {
    try {
        const res = await fetch('/api/data');
        if (!res.ok) {
            console.warn('Failed to load next sprint plans, status:', res.status);
            return {};
        }
        const data = await res.json();
        const raw = data?.[STORAGE_KEY];
        if (raw == null || raw === '') return {};
        if (typeof raw === 'object' && raw !== null) return raw as Record<string, NextSprintPlanEntry>;
        try {
            return JSON.parse(raw as string) as Record<string, NextSprintPlanEntry>;
        } catch {
            try {
                return JSON.parse(JSON.parse(raw as string)) as Record<string, NextSprintPlanEntry>;
            } catch {
                return {};
            }
        }
    } catch (err) {
        console.error('Failed to load next sprint plans from API', err);
    }
    return {};
}

async function saveToAPI(data: Record<string, NextSprintPlanEntry>): Promise<boolean> {
    try {
        const res = await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [STORAGE_KEY]: JSON.stringify(data) }),
        });
        if (!res.ok) {
            console.error('Failed to save next sprint plans, status:', res.status);
            return false;
        }
        return true;
    } catch (err) {
        console.error('Failed to save next sprint plans to API', err);
        return false;
    }
}

export function useNextSprintPlanner() {
    const [entries, setEntries] = useState<Record<string, NextSprintPlanEntry>>({});
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pendingEntriesRef = useRef<Record<string, NextSprintPlanEntry> | null>(null);

    useEffect(() => {
        loadFromAPI().then((data) => {
            setEntries(data);
            setLoaded(true);
        });
    }, []);

    useEffect(() => {
        if (!loaded) return;

        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
        }

        pendingEntriesRef.current = entries;

        saveTimeoutRef.current = setTimeout(async () => {
            if (pendingEntriesRef.current) {
                setSaving(true);
                await saveToAPI(pendingEntriesRef.current);
                setSaving(false);
            }
        }, SAVE_DEBOUNCE_MS);

        return () => {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
            }
        };
    }, [entries, loaded]);

    const getPlansForPersonSprint = useCallback(
        (person: string, sprintNumber: string): NextSprintPlanItem[] => {
            const key = getEntryKey(sprintNumber, person);
            const entry = entries[key];
            return entry?.items || [];
        },
        [entries]
    );

    const addPlan = useCallback(
        (person: string, sprintNumber: string, taskId: string) => {
            setEntries((prev) => {
                const key = getEntryKey(sprintNumber, person);
                const existing = prev[key] || { sprintNumber, person, items: [] };

                if (existing.items.some((item) => item.taskId === taskId)) {
                    return prev;
                }

                const maxOrder = existing.items.reduce((max, item) => Math.max(max, item.order), 0);
                const newItem: NextSprintPlanItem = {
                    taskId,
                    addedAt: new Date().toISOString(),
                    order: maxOrder + 1,
                };

                return {
                    ...prev,
                    [key]: {
                        ...existing,
                        items: [...existing.items, newItem],
                    },
                };
            });
        },
        []
    );

    const removePlan = useCallback(
        (person: string, sprintNumber: string, taskId: string) => {
            setEntries((prev) => {
                const key = getEntryKey(sprintNumber, person);
                const existing = prev[key];
                if (!existing) return prev;

                return {
                    ...prev,
                    [key]: {
                        ...existing,
                        items: existing.items.filter((item) => item.taskId !== taskId),
                    },
                };
            });
        },
        []
    );

    const reorderPlans = useCallback(
        (person: string, sprintNumber: string, taskIds: string[]) => {
            setEntries((prev) => {
                const key = getEntryKey(sprintNumber, person);
                const existing = prev[key];
                if (!existing) return prev;

                const itemMap = new Map(existing.items.map((item) => [item.taskId, item]));
                const reorderedItems = taskIds
                    .map((taskId, index) => {
                        const item = itemMap.get(taskId);
                        if (!item) return null;
                        return { ...item, order: index };
                    })
                    .filter((item): item is NextSprintPlanItem => item !== null);

                return {
                    ...prev,
                    [key]: {
                        ...existing,
                        items: reorderedItems,
                    },
                };
            });
        },
        []
    );

    const clearPlansForSprint = useCallback(
        (sprintNumber: string) => {
            setEntries((prev) => {
                const next = { ...prev };
                Object.keys(next).forEach((key) => {
                    if (key.startsWith(`${sprintNumber}__`)) {
                        delete next[key];
                    }
                });
                return next;
            });
        },
        []
    );

    const getAllPersonsWithPlans = useCallback(
        (sprintNumber: string): string[] => {
            const persons = new Set<string>();
            Object.values(entries).forEach((entry) => {
                if (entry.sprintNumber === sprintNumber && entry.items.length > 0) {
                    persons.add(entry.person);
                }
            });
            return Array.from(persons);
        },
        [entries]
    );

    return {
        getPlansForPersonSprint,
        addPlan,
        removePlan,
        reorderPlans,
        clearPlansForSprint,
        getAllPersonsWithPlans,
        loaded,
        saving,
        entries,
    };
}
