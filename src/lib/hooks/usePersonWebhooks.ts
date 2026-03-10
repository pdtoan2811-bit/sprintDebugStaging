'use client';

import { useCallback, useMemo } from 'react';
import { useData } from '@/lib/DataProvider';

const STORAGE_KEY = 'sprint_relay_person_webhooks';

export type PersonWebhookMap = Record<string, string>;

function parseWebhookMap(raw: unknown): PersonWebhookMap {
    if (!raw) return {};

    // Value in db.json may be stored as stringified JSON or as an object
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return parsed as PersonWebhookMap;
            }
        } catch {
            return {};
        }
    }

    if (typeof raw === 'object' && raw !== null) {
        return raw as PersonWebhookMap;
    }

    return {};
}

export function usePersonWebhooks() {
    const { data, updateKey } = useData();

    const map = useMemo<PersonWebhookMap>(() => {
        const raw = data?.[STORAGE_KEY];
        return parseWebhookMap(raw);
    }, [data]);

    const getWebhookForPerson = useCallback(
        (person: string): string | null => {
            return map[person] ?? null;
        },
        [map]
    );

    const setWebhookForPerson = useCallback(
        (person: string, url: string | null) => {
            const next: PersonWebhookMap = { ...map };
            if (!url) {
                delete next[person];
            } else {
                next[person] = url;
            }
            updateKey(STORAGE_KEY, JSON.stringify(next));
        },
        [map, updateKey]
    );

    return {
        map,
        getWebhookForPerson,
        setWebhookForPerson,
    };
}

