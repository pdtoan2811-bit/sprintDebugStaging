import { NextRequest, NextResponse } from 'next/server';

const GLOBAL_WEBHOOK_URL = 'https://jsg35lsl9g0c.sg.larksuite.com/base/automation/webhook/event/CyknaO0BCwAPxZhhaItlNTN0gEg';

export async function POST(req: NextRequest) {
    try {
        const payload = await req.json();

        const res = await fetch(GLOBAL_WEBHOOK_URL, {
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
                { status: res.status }
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
