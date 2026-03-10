'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface DailyTodoItem {
    taskId: string;
    addedAt: string;
    order: number;
    completedAt?: string;
}

export interface DailyTodoEntry {
    date: string;
    person: string;
    items: DailyTodoItem[];
}

const STORAGE_KEY = 'sprint_relay_daily_todos';
const SAVE_DEBOUNCE_MS = 500;

async function loadFromAPI(): Promise<Record<string, DailyTodoEntry>> {
    try {
        // Use /api/data (same as DataProvider) so we read the same db.json
        const res = await fetch('/api/data');
        if (!res.ok) {
            console.warn('Failed to load daily todos, status:', res.status);
            return {};
        }
        const data = await res.json();
        const raw = data?.[STORAGE_KEY];
        if (raw == null || raw === '') return {};
        if (typeof raw === 'object' && raw !== null) return raw as Record<string, DailyTodoEntry>;
        try {
            return JSON.parse(raw as string) as Record<string, DailyTodoEntry>;
        } catch {
            // Fallback: maybe double-encoded
            try {
                return JSON.parse(JSON.parse(raw as string)) as Record<string, DailyTodoEntry>;
            } catch {
                return {};
            }
        }
    } catch (err) {
        console.error('Failed to load daily todos from API', err);
    }
    return {};
}

async function saveToAPI(data: Record<string, DailyTodoEntry>): Promise<boolean> {
    try {
        const res = await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [STORAGE_KEY]: JSON.stringify(data) }),
        });
        if (!res.ok) {
            console.error('Failed to save daily todos, status:', res.status);
            return false;
        }
        return true;
    } catch (err) {
        console.error('Failed to save daily todos to API', err);
        return false;
    }
}

function getEntryKey(date: string, person: string): string {
    return `${date}__${person}`;
}

export function useDailyTodos() {
    const [entries, setEntries] = useState<Record<string, DailyTodoEntry>>({});
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const pendingEntriesRef = useRef<Record<string, DailyTodoEntry> | null>(null);

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

    const getTodosForPersonDate = useCallback(
        (person: string, date: string): DailyTodoItem[] => {
            const key = getEntryKey(date, person);
            const entry = entries[key];
            return entry?.items || [];
        },
        [entries]
    );

    const addTodo = useCallback(
        (person: string, date: string, taskId: string) => {
            setEntries((prev) => {
                const key = getEntryKey(date, person);
                const existing = prev[key] || { date, person, items: [] };
                
                if (existing.items.some((item) => item.taskId === taskId)) {
                    return prev;
                }

                const maxOrder = existing.items.reduce((max, item) => Math.max(max, item.order), 0);
                const newItem: DailyTodoItem = {
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

    const removeTodo = useCallback(
        (person: string, date: string, taskId: string) => {
            setEntries((prev) => {
                const key = getEntryKey(date, person);
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

    const reorderTodos = useCallback(
        (person: string, date: string, taskIds: string[]) => {
            setEntries((prev) => {
                const key = getEntryKey(date, person);
                const existing = prev[key];
                if (!existing) return prev;

                const itemMap = new Map(existing.items.map((item) => [item.taskId, item]));
                const reorderedItems = taskIds
                    .map((taskId, index) => {
                        const item = itemMap.get(taskId);
                        if (!item) return null;
                        return { ...item, order: index };
                    })
                    .filter((item): item is DailyTodoItem => item !== null);

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

    const toggleTodoComplete = useCallback(
        (person: string, date: string, taskId: string) => {
            setEntries((prev) => {
                const key = getEntryKey(date, person);
                const existing = prev[key];
                if (!existing) return prev;

                return {
                    ...prev,
                    [key]: {
                        ...existing,
                        items: existing.items.map((item) => {
                            if (item.taskId !== taskId) return item;
                            return {
                                ...item,
                                completedAt: item.completedAt ? undefined : new Date().toISOString(),
                            };
                        }),
                    },
                };
            });
        },
        []
    );

    const getHistoricalTodos = useCallback(
        (person: string, daysBack: number = 7): DailyTodoEntry[] => {
            const result: DailyTodoEntry[] = [];
            const today = new Date();
            
            for (let i = 0; i <= daysBack; i++) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                const dateStr = date.toISOString().split('T')[0];
                const key = getEntryKey(dateStr, person);
                const entry = entries[key];
                if (entry && entry.items.length > 0) {
                    result.push(entry);
                }
            }
            
            return result;
        },
        [entries]
    );

    const getAllPersonsWithTodos = useCallback(
        (date: string): string[] => {
            const persons = new Set<string>();
            Object.values(entries).forEach((entry) => {
                if (entry.date === date && entry.items.length > 0) {
                    persons.add(entry.person);
                }
            });
            return Array.from(persons);
        },
        [entries]
    );

    return {
        getTodosForPersonDate,
        addTodo,
        removeTodo,
        reorderTodos,
        toggleTodoComplete,
        getHistoricalTodos,
        getAllPersonsWithTodos,
        loaded,
        saving,
        entries,
    };
}
