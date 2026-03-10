import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const DATA_FILE_PATH = path.join(process.cwd(), 'data', 'db.json');

async function getDbData(): Promise<Record<string, string>> {
    try {
        const data = await fs.readFile(DATA_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

async function saveDbData(data: Record<string, string>): Promise<void> {
    const dataDir = path.dirname(DATA_FILE_PATH);
    try {
        await fs.mkdir(dataDir, { recursive: true });
    } catch { }
    await fs.writeFile(DATA_FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    const data = await getDbData();

    if (key) {
        const value = data[key];
        return NextResponse.json({ key, value: value ?? null });
    }

    return NextResponse.json(data);
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { key, value } = body;

        if (!key) {
            return NextResponse.json({ success: false, error: 'Key is required' }, { status: 400 });
        }

        const data = await getDbData();

        if (value === null || value === undefined) {
            delete data[key];
        } else {
            data[key] = value;
        }

        await saveDbData(data);

        return NextResponse.json({ success: true, key, value: data[key] ?? null });
    } catch (error) {
        console.error('Error in POST /api/db:', error);
        return NextResponse.json({ success: false, error: 'Failed to save data' }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const key = searchParams.get('key');

        if (!key) {
            return NextResponse.json({ success: false, error: 'Key is required' }, { status: 400 });
        }

        const data = await getDbData();
        delete data[key];
        await saveDbData(data);

        return NextResponse.json({ success: true, deleted: key });
    } catch (error) {
        console.error('Error in DELETE /api/db:', error);
        return NextResponse.json({ success: false, error: 'Failed to delete data' }, { status: 500 });
    }
}
