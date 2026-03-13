import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Separate data store for next sprint draft *settings* (e.g., filters).
// This intentionally does NOT touch the existing db.json.
const SETTINGS_FILE_PATH = path.join(process.cwd(), 'data', 'next-sprint-draft-settings.json');

interface DraftSettings {
    sprintFilters: string[];
}

async function readSettings(): Promise<DraftSettings | null> {
    try {
        const raw = await fs.readFile(SETTINGS_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            return parsed as DraftSettings;
        }
        return null;
    } catch {
        return null;
    }
}

async function writeSettings(data: DraftSettings): Promise<void> {
    const dir = path.dirname(SETTINGS_FILE_PATH);
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch {
        // ignore
    }
    await fs.writeFile(SETTINGS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// GET: return settings or null
export async function GET() {
    const settings = await readSettings();
    return NextResponse.json(settings);
}

// POST: replace settings. Body should be DraftSettings.
export async function POST(request: Request) {
    try {
        const body = (await request.json()) as DraftSettings;
        if (!body || !Array.isArray(body.sprintFilters)) {
            return NextResponse.json(
                { success: false, error: 'Invalid draft settings payload' },
                { status: 400 },
            );
        }
        await writeSettings({ sprintFilters: body.sprintFilters });
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error writing next-sprint-draft-settings.json:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to write draft settings' },
            { status: 500 },
        );
    }
}

