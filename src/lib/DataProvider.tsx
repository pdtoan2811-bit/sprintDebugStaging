'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface DataContextValue {
    data: Record<string, string>;
    isLoaded: boolean;
    updateKey: (key: string, value: string | null) => void;
    refetch: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
    const [data, setData] = useState<Record<string, string>>({});
    const [isLoaded, setIsLoaded] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch('/api/data');
            const json = await res.json();
            setData(json || {});
        } catch (err) {
            console.error('Failed to load data', err);
        } finally {
            setIsLoaded(true);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const updateKey = useCallback((key: string, value: string | null) => {
        // Schedule state update after current render to avoid
        // "Cannot update a component while rendering a different component" warnings
        setTimeout(() => {
            setData(prev => {
                const next = { ...prev };
                if (value === null) {
                    delete next[key];
                } else {
                    next[key] = value;
                }
                return next;
            });
        }, 0);

        fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: value })
        }).catch(err => console.error('Failed to save data', err));
    }, []);

    const refetch = useCallback(async () => {
        await fetchData();
    }, [fetchData]);

    return (
        <DataContext.Provider value={{ data, isLoaded, updateKey, refetch }}>
            {children}
        </DataContext.Provider>
    );
}

export function useData() {
    const context = useContext(DataContext);
    if (!context) {
        throw new Error('useData must be used within a DataProvider');
    }
    return context;
}
