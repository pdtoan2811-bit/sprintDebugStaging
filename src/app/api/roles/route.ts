import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export type RoleMapping = Record<string, string>;

const ROLES_FILE_PATH = path.join(process.cwd(), 'data', 'roles.json');

async function getRolesData(): Promise<RoleMapping> {
    try {
        const data = await fs.readFile(ROLES_FILE_PATH, 'utf-8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

export async function GET() {
    const data = await getRolesData();
    return NextResponse.json(data);
}

export async function POST(request: Request) {
    try {
        const updates: RoleMapping = await request.json();

        const dataDir = path.dirname(ROLES_FILE_PATH);
        try {
            await fs.mkdir(dataDir, { recursive: true });
        } catch { }

        const currentData = await getRolesData();
        const newData = { ...currentData };

        for (const [key, value] of Object.entries(updates)) {
            if (value === null || value === '') {
                delete newData[key];
            } else {
                newData[key] = value;
            }
        }

        await fs.writeFile(ROLES_FILE_PATH, JSON.stringify(newData, null, 2), 'utf-8');

        return NextResponse.json({ success: true, data: newData });
    } catch (error) {
        console.error('Error in POST /api/roles:', error);
        return NextResponse.json({ success: false, error: 'Failed to write data' }, { status: 500 });
    }
}
