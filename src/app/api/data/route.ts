import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

// Define path to our data store relative to the project root
const DATA_FILE_PATH = path.join(process.cwd(), 'data', 'db.json');

// Helper to ensure file exists and read it
async function getDbData() {
    try {
        const data = await fs.readFile(DATA_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        // If file doesn't exist or is invalid JSON, return empty object
        return {};
    }
}

// GET: Return entire db.json contents
export async function GET() {
    const data = await getDbData();
    return NextResponse.json(data);
}

// POST: Update specific keys in db.json
export async function POST(request: Request) {
    try {
        const updates = await request.json();

        // Ensure data folder exists
        const dataDir = path.dirname(DATA_FILE_PATH);
        try {
            await fs.mkdir(dataDir, { recursive: true });
        } catch (e) { }

        const currentData = await getDbData();

        // Merge updates
        const newData = { ...currentData };

        // Updates should be passed as { key1: value1, key2: value2 }
        for (const [key, value] of Object.entries(updates)) {
            if (value === null) {
                delete newData[key]; // allow for deletion if needed
            } else {
                newData[key] = value;
            }
        }

        // Write back to file
        await fs.writeFile(DATA_FILE_PATH, JSON.stringify(newData, null, 2), 'utf-8');

        return NextResponse.json({ success: true, data: newData });
    } catch (error) {
        console.error('Error writing to db.json:', error);
        return NextResponse.json({ success: false, error: 'Failed to write data' }, { status: 500 });
    }
}

// DELETE: Clears specific keys or the whole file
export async function DELETE(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const clearAll = searchParams.get('all') === 'true';

        if (clearAll) {
            await fs.writeFile(DATA_FILE_PATH, '{}', 'utf-8');
            return NextResponse.json({ success: true, cleared: true });
        }

        return NextResponse.json({ success: false, error: 'Provide ?all=true to clear' }, { status: 400 });
    } catch (error) {
        return NextResponse.json({ success: false, error: 'Failed to delete data' }, { status: 500 });
    }
}
