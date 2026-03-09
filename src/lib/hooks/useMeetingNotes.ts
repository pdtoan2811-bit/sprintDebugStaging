'use client';

import { useState, useEffect, useCallback } from 'react';
import { MeetingNote } from '../types';

const STORAGE_KEY = 'sprint_relay_meeting_notes';

export function useMeetingNotes() {
    const [notes, setNotes] = useState<Record<string, MeetingNote[]>>({});
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        fetch('/api/data')
            .then(res => res.json())
            .then(data => {
                if (data && data[STORAGE_KEY]) {
                    try {
                        setNotes(JSON.parse(data[STORAGE_KEY] || '{}'));
                    } catch (e) { }
                }
                setIsLoaded(true);
            })
            .catch(() => setIsLoaded(true));
    }, []);

    const persist = useCallback((data: Record<string, MeetingNote[]>) => {
        fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [STORAGE_KEY]: JSON.stringify(data) })
        }).catch(err => console.error('Failed to save meeting notes', err));
    }, []);

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

    return { notes, addNote, updateNote, deleteNote, getNotesForTask, getAllNotes, isLoaded };
}
