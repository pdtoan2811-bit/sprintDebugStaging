import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// We reuse the same db.json that /api/data uses so webhooks are centrally stored.
const DATA_FILE_PATH = path.join(process.cwd(), 'data', 'db.json');
const WEBHOOK_KEY = 'sprint_relay_person_webhooks';

async function getPersonWebhookUrl(person: string): Promise<string | null> {
    try {
        const file = await fs.readFile(DATA_FILE_PATH, 'utf-8');
        const data = JSON.parse(file);
        const raw = data?.[WEBHOOK_KEY];

        if (!raw) return null;

        let map: Record<string, string> | null = null;

        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed === 'object') {
                    map = parsed as Record<string, string>;
                }
            } catch {
                map = null;
            }
        } else if (typeof raw === 'object') {
            map = raw as Record<string, string>;
        }

        if (!map) return null;

        return map[person] ?? null;
    } catch {
        return null;
    }
}

export async function POST(req: NextRequest) {
    try {
        const payload = await req.json();
        const person = payload?.person as string | undefined;

        if (!person) {
            return NextResponse.json(
                { success: false, error: 'Missing person in payload' },
                { status: 400 }
            );
        }

        const webhookUrl = await getPersonWebhookUrl(person);

        if (!webhookUrl) {
            return NextResponse.json(
                { success: false, error: `No webhook configured for person: ${person}` },
                { status: 400 }
            );
        }

        const res = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            return NextResponse.json(
                {
                    success: false,
                    status: res.status,
                    statusText: res.statusText,
                    body: text,
                },
                { status: 500 }
            );
        }

        // Try to parse JSON response, but don't require it
        let data: unknown = null;
        try {
            data = await res.json();
        } catch {
            // ignore non-JSON responses
        }

        return NextResponse.json({ success: true, data });
    } catch (error) {
        console.error('Error sending to Lark webhook:', error);
        return NextResponse.json(
            {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        );
    }
}

