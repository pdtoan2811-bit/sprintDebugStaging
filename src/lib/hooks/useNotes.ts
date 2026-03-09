'use client';

import { useState, useEffect } from 'react';
import { StandupNote } from '../types';

export function useNotes() {
    const [notes, setNotes] = useState<Record<string, StandupNote>>({});
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        // Load on mount
        fetch('/api/data')
            .then(res => res.json())
            .then(data => {
                if (data && data['sprint_relay_notes']) {
                    try {
                        setNotes(JSON.parse(data['sprint_relay_notes'] || '{}'));
                    } catch (e) { }
                }
                setIsLoaded(true);
            })
            .catch(() => setIsLoaded(true));
    }, []);

    const saveNote = async (note: StandupNote) => {
        // Optimistic update locally
        const updated = { ...notes, [note.id]: note };
        setNotes(updated);

        // Save to file via API
        try {
            await fetch('/api/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ['sprint_relay_notes']: JSON.stringify(updated) })
            });
        } catch (error) {
            console.error('Failed to save notes to API', error);
        }
    };

    const getNote = (id: string) => notes[id];

    return { notes, saveNote, getNote, isLoaded };
}
