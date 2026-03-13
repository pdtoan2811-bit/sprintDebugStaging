'use client';

import { useEffect, useState, useCallback } from 'react';

export function useNextSprintDrafts() {
    const [draftTaskIds, setDraftTaskIds] = useState<Set<string>>(new Set());
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                const res = await fetch('/api/next-sprint-drafts');
                if (!res.ok) {
                    console.warn('Failed to load next sprint drafts, status:', res.status);
                    return;
                }
                const data = (await res.json()) as Record<string, boolean>;
                if (cancelled) return;
                const ids = new Set<string>();
                Object.entries(data).forEach(([taskId, isDraft]) => {
                    if (isDraft) ids.add(taskId);
                });
                setDraftTaskIds(ids);
            } catch (err) {
                console.error('Failed to load next sprint drafts', err);
            } finally {
                if (!cancelled) setLoaded(true);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, []);

    const refresh = useCallback(async () => {
        try {
            const res = await fetch('/api/next-sprint-drafts');
            if (!res.ok) return;
            const data = (await res.json()) as Record<string, boolean>;
            const ids = new Set<string>();
            Object.entries(data).forEach(([taskId, isDraft]) => {
                if (isDraft) ids.add(taskId);
            });
            setDraftTaskIds(ids);
        } catch (err) {
            console.error('Failed to refresh next sprint drafts', err);
        }
    }, []);

    const setDraft = useCallback(
        async (taskId: string, isDraft: boolean) => {
            try {
                const body: Record<string, boolean> = { [taskId]: isDraft };
                const res = await fetch('/api/next-sprint-drafts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
                if (!res.ok) {
                    console.error('Failed to save draft flag for task', taskId);
                    return;
                }
                // Optimistically update local state
                setDraftTaskIds(prev => {
                    const next = new Set(prev);
                    if (isDraft) next.add(taskId);
                    else next.delete(taskId);
                    return next;
                });
            } catch (err) {
                console.error('Failed to save draft flag for task', taskId, err);
            }
        },
        [],
    );

    return {
        draftTaskIds,
        loaded,
        refresh,
        setDraft,
    };
}

