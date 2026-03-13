import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Separate data store for next sprint draft flags.
// This intentionally does NOT touch the existing db.json.
const DRAFTS_FILE_PATH = path.join(process.cwd(), 'data', 'next-sprint-drafts.json');

type DraftMap = Record<string, boolean>;

async function readDrafts(): Promise<DraftMap> {
    try {
        const raw = await fs.readFile(DRAFTS_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            return parsed as DraftMap;
        }
        return {};
    } catch {
        return {};
    }
}

async function writeDrafts(data: DraftMap): Promise<void> {
    const dir = path.dirname(DRAFTS_FILE_PATH);
    try {
        await fs.mkdir(dir, { recursive: true });
    } catch {
        // ignore
    }
    await fs.writeFile(DRAFTS_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

// GET: return full draft map
export async function GET() {
    const drafts = await readDrafts();
    return NextResponse.json(drafts);
}

// POST: merge updates. Body should be { [taskId: string]: boolean }.
// true  -> mark as draft
// false -> clear draft flag
export async function POST(request: Request) {
    try {
        const updates = await request.json() as DraftMap;
        const current = await readDrafts();

        const next: DraftMap = { ...current };
        Object.entries(updates).forEach(([taskId, isDraft]) => {
            if (!taskId) return;
            if (!isDraft) {
                delete next[taskId];
            } else {
                next[taskId] = true;
            }
        });

        await writeDrafts(next);
        return NextResponse.json({ success: true, drafts: next });
    } catch (error) {
        console.error('Error writing next-sprint-drafts.json:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to write drafts' },
            { status: 500 },
        );
    }
}

