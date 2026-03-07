'use client';

import { useState, useEffect } from 'react';
import { StandupNote } from '../types';

export function useNotes() {
    const [notes, setNotes] = useState<Record<string, StandupNote>>({});
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('sprint_relay_notes');
        if (stored) {
            try {
                setNotes(JSON.parse(stored));
            } catch (e) {
                console.error('Failed to parse notes from local storage', e);
            }
        }
        setIsLoaded(true);
    }, []);

    const saveNote = (note: StandupNote) => {
        const updated = { ...notes, [note.id]: note };
        setNotes(updated);
        localStorage.setItem('sprint_relay_notes', JSON.stringify(updated));
    };

    const getNote = (id: string) => notes[id];

    return { notes, saveNote, getNote, isLoaded };
}
