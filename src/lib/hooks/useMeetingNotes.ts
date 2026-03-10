'use client';

import { useState, useEffect, useCallback } from 'react';
import { MeetingNote } from '../types';
import { useData } from '../DataProvider';

const STORAGE_KEY = 'sprint_relay_meeting_notes';

export interface BlockerInfo {
    taskId: string;
    noteId: string;
    blockedBy: string;
    stallReason: string;
    solution: string;
    date: string;
    createdAt: string;
}

export function useMeetingNotes() {
    const { data: sharedData, isLoaded: sharedLoaded, updateKey } = useData();
    const [notes, setNotes] = useState<Record<string, MeetingNote[]>>({});
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        if (!sharedLoaded) return;
        if (sharedData[STORAGE_KEY]) {
            try {
                setNotes(JSON.parse(sharedData[STORAGE_KEY] || '{}'));
            } catch (e) { }
        }
        setIsLoaded(true);
    }, [sharedLoaded, sharedData]);

    const persist = useCallback((data: Record<string, MeetingNote[]>) => {
        updateKey(STORAGE_KEY, JSON.stringify(data));
    }, [updateKey]);

    const addNote = useCallback((note: MeetingNote) => {
        setNotes((prev) => {
            const taskNotes = prev[note.taskId] ? [...prev[note.taskId], note] : [note];
            const next = { ...prev, [note.taskId]: taskNotes };
            persist(next);
            return next;
        });
    }, [persist]);

    const updateNote = useCallback((note: MeetingNote) => {
        setNotes((prev) => {
            const taskNotes = prev[note.taskId] || [];
            const nextTaskNotes = taskNotes.map((n) => (n.id === note.id ? note : n));
            const next = { ...prev, [note.taskId]: nextTaskNotes };
            persist(next);
            return next;
        });
    }, [persist]);

    const deleteNote = useCallback((taskId: string, noteId: string) => {
        setNotes((prev) => {
            const taskNotes = prev[taskId] || [];
            const nextTaskNotes = taskNotes.filter((n) => n.id !== noteId);
            const next = { ...prev, [taskId]: nextTaskNotes };
            persist(next);
            return next;
        });
    }, [persist]);

    const getNotesForTask = useCallback(
        (taskId: string): MeetingNote[] => notes[taskId] ?? [],
        [notes]
    );

    const getAllNotes = useCallback(
        (): Record<string, MeetingNote[]> => notes,
        [notes]
    );

    const getLatestNote = useCallback(
        (taskId: string): MeetingNote | null => {
            const taskNotes = notes[taskId];
            if (!taskNotes || taskNotes.length === 0) return null;
            return [...taskNotes].sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )[0];
        },
        [notes]
    );

    const getLatestBlocker = useCallback(
        (taskId: string): BlockerInfo | null => {
            const latest = getLatestNote(taskId);
            if (!latest || !latest.isStall) return null;
            return {
                taskId: latest.taskId,
                noteId: latest.id,
                blockedBy: latest.blockedBy,
                stallReason: latest.stallReason,
                solution: latest.solution,
                date: latest.date,
                createdAt: latest.createdAt,
            };
        },
        [getLatestNote]
    );

    const removeBlockerFromLatest = useCallback(
        (taskId: string): boolean => {
            const latest = getLatestNote(taskId);
            if (!latest) return false;

            const updatedNote: MeetingNote = {
                ...latest,
                isStall: false,
                blockedBy: '',
                stallReason: '',
            };

            setNotes((prev) => {
                const taskNotes = prev[taskId] || [];
                const nextTaskNotes = taskNotes.map((n) =>
                    n.id === latest.id ? updatedNote : n
                );
                const next = { ...prev, [taskId]: nextTaskNotes };
                persist(next);
                return next;
            });

            return true;
        },
        [getLatestNote, persist]
    );

    const getAllBlockers = useCallback(
        (): BlockerInfo[] => {
            const blockers: BlockerInfo[] = [];
            for (const taskId of Object.keys(notes)) {
                const blocker = getLatestBlocker(taskId);
                if (blocker) {
                    blockers.push(blocker);
                }
            }
            return blockers.sort(
                (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            );
        },
        [notes, getLatestBlocker]
    );

    return {
        notes,
        addNote,
        updateNote,
        deleteNote,
        getNotesForTask,
        getAllNotes,
        isLoaded,
        getLatestNote,
        getLatestBlocker,
        removeBlockerFromLatest,
        getAllBlockers,
    };
}
