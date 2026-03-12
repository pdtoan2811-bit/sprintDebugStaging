import { useState, useEffect, useCallback } from 'react';

export type RoleMapping = Record<string, string>;

export const ROLE_ORDER = ['Tester', 'BE dev', 'FE dev', 'Team Leader', 'Other'] as const;
export type ValidRole = typeof ROLE_ORDER[number];

export function useRoles() {
    const [roles, setRoles] = useState<RoleMapping>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchRoles = useCallback(async () => {
        try {
            const res = await fetch('/api/roles');
            if (!res.ok) throw new Error('Failed to fetch roles');
            const data = await res.json();
            setRoles(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRoles();
    }, [fetchRoles]);

    const updateRole = async (person: string, role: string) => {
        // Optimistic update
        const prevRoles = { ...roles };
        const newRoles = { ...roles };
        if (!role) {
            delete newRoles[person];
        } else {
            newRoles[person] = role;
        }
        setRoles(newRoles);

        try {
            const res = await fetch('/api/roles', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [person]: role || null }),
            });
            if (!res.ok) throw new Error('Failed to update role');
            const { data } = await res.json();
            if (data) {
                setRoles(data);
            }
        } catch (err) {
            console.error('Failed to update role, reverting...', err);
            setRoles(prevRoles);
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
    };

    return { roles, isLoading, error, updateRole, fetchRoles };
}
