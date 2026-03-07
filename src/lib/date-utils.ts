export interface DurationBreakdown {
    workingMs: number;
    offHoursMs: number;
}

function parseLocalDate(dateStr: string): Date | null {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const [y, m, d] = parts;
    return new Date(Number(y), Number(m) - 1, Number(d));
}

/**
 * Calculates the duration split between "Working Hours" (08:30-12:00, 13:30-17:30)
 * and "Off-hours". Working days are defined by falling within the [sprintStart, sprintEnd] inclusive range.
 * If no sprint dates are provided, falls back to Mon-Fri.
 */
export function calculateWorkingDuration(
    startMs: number,
    endMs: number,
    sprintStartDateStr?: string,
    sprintEndDateStr?: string
): DurationBreakdown {
    if (startMs >= endMs) return { workingMs: 0, offHoursMs: 0 };

    const totalMs = endMs - startMs;
    let workingMs = 0;

    const sprintStartMs = sprintStartDateStr ? parseLocalDate(sprintStartDateStr)?.getTime() : null;
    let sprintEndMs = sprintEndDateStr ? parseLocalDate(sprintEndDateStr)?.getTime() : null;
    if (sprintEndMs != null) {
        // Extend to end of the day local time
        sprintEndMs += 86400000 - 1;
    }

    const startObj = new Date(startMs);
    const currentDayObj = new Date(startObj.getFullYear(), startObj.getMonth(), startObj.getDate());

    while (currentDayObj.getTime() <= endMs) {
        const dayStartMs = currentDayObj.getTime();

        const isWorkingDay = (sprintStartMs != null && sprintEndMs != null)
            ? (dayStartMs >= sprintStartMs && dayStartMs <= sprintEndMs)
            : (currentDayObj.getDay() !== 0 && currentDayObj.getDay() !== 6); // Fallback: M-F

        if (isWorkingDay) {
            // Working hours: 08:30-12:00, 13:30-17:30
            const p1Start = dayStartMs + 8.5 * 3600 * 1000;
            const p1End = dayStartMs + 12 * 3600 * 1000;
            const p2Start = dayStartMs + 13.5 * 3600 * 1000;
            const p2End = dayStartMs + 17.5 * 3600 * 1000;

            workingMs += Math.max(0, Math.min(p1End, endMs) - Math.max(p1Start, startMs));
            workingMs += Math.max(0, Math.min(p2End, endMs) - Math.max(p2Start, startMs));
        }

        currentDayObj.setDate(currentDayObj.getDate() + 1);
    }

    return {
        workingMs,
        offHoursMs: totalMs - workingMs,
    };
}

/**
 * Formats working duration assuming a 7.5 hour (27,000,000 ms) workday.
 */
export function formatWorkingTime(workingMs: number): string {
    if (workingMs <= 0) return '0m';
    const totalSec = Math.floor(workingMs / 1000);

    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);

    if (hours > 0) return `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`.trim();
    return `${minutes}m`;
}

/**
 * Formats absolute duration (like off-hours or raw total time) normally.
 */
export function formatAbsoluteTime(ms: number): string {
    if (ms <= 0) return '0m';
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);

    // If it's more than 24 hours, express in 24h days instead of working days
    const days = Math.floor(hours / 24);
    const remainderHours = hours % 24;

    if (days > 0) return `${days}d ${remainderHours > 0 ? `${remainderHours}h` : ''}`.trim();
    if (hours > 0) return `${hours}h ${minutes > 0 ? `${minutes}m` : ''}`.trim();
    return `${minutes}m`;
}
