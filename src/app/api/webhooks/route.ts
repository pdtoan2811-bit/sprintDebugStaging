import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_FILE_PATH = path.join(process.cwd(), 'data', 'db.json');
const WEBHOOK_KEY = 'sprint_relay_person_webhooks';

async function getWebhooks(): Promise<Record<string, string>> {
    try {
        const file = await fs.readFile(DATA_FILE_PATH, 'utf-8');
        const data = JSON.parse(file);
        const raw = data?.[WEBHOOK_KEY];

        if (!raw) return {};

        if (typeof raw === 'string') {
            try {
                return JSON.parse(raw);
            } catch {
                return {};
            }
        }
        return raw as Record<string, string>;
    } catch {
        return {};
    }
}

export async function GET() {
    const webhooks = await getWebhooks();
    return NextResponse.json(webhooks);
}

export async function POST(req: NextRequest) {
    try {
        const updates = await req.json();
        const file = await fs.readFile(DATA_FILE_PATH, 'utf-8');
        const data = JSON.parse(file);
        
        let currentWebhooks = await getWebhooks();
        const newWebhooks = { ...currentWebhooks };

        for (const [person, url] of Object.entries(updates)) {
            if (url === null || url === '') {
                delete newWebhooks[person];
            } else {
                newWebhooks[person] = url as string;
            }
        }

        data[WEBHOOK_KEY] = JSON.stringify(newWebhooks);
        await fs.writeFile(DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');

        return NextResponse.json({ success: true, data: newWebhooks });
    } catch (error) {
        console.error('Error updating webhooks:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}
