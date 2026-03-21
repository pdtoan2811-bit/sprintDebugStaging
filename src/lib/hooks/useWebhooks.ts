import { useState, useEffect, useCallback } from 'react';

export type WebhookMapping = Record<string, string>;

export function useWebhooks() {
    const [webhooks, setWebhooks] = useState<WebhookMapping>({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchWebhooks = useCallback(async () => {
        try {
            const res = await fetch('/api/webhooks');
            if (!res.ok) throw new Error('Failed to fetch webhooks');
            const data = await res.json();
            setWebhooks(data);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchWebhooks();
    }, [fetchWebhooks]);

    const updateWebhook = async (person: string, url: string) => {
        // Optimistic update
        const prevWebhooks = { ...webhooks };
        const newWebhooks = { ...webhooks };
        if (!url) {
            delete newWebhooks[person];
        } else {
            newWebhooks[person] = url;
        }
        setWebhooks(newWebhooks);

        try {
            const res = await fetch('/api/webhooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [person]: url || null }),
            });
            if (!res.ok) throw new Error('Failed to update webhook');
            const { data } = await res.json();
            if (data) {
                setWebhooks(data);
            }
        } catch (err) {
            console.error('Failed to update webhook, reverting...', err);
            setWebhooks(prevWebhooks);
            setError(err instanceof Error ? err.message : 'Unknown error');
        }
    };

    return { webhooks, isLoading, error, updateWebhook, fetchWebhooks };
}
