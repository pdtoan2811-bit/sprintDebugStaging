'use client';

import { useMemo, useState } from 'react';
import { PersonTimeline, TimelineSegment, TaskAnalysis } from '@/lib/types';
import { format } from 'date-fns';

// ── Status colour map ──────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    'Not Started': { bg: 'bg-zinc-700', border: 'border-zinc-600', text: 'text-zinc-300' },
    'In Process': { bg: 'bg-blue-700', border: 'border-blue-500', text: 'text-blue-100' },
    'Waiting to Integrate': { bg: 'bg-amber-700', border: 'border-amber-500', text: 'text-amber-100' },
    'Reviewing': { bg: 'bg-purple-700', border: 'border-purple-500', text: 'text-purple-100' },
    'Ready for Test': { bg: 'bg-cyan-700', border: 'border-cyan-500', text: 'text-cyan-100' },
    'Testing': { bg: 'bg-teal-700', border: 'border-teal-500', text: 'text-teal-100' },
    'Reprocess': { bg: 'bg-red-700', border: 'border-red-500', text: 'text-red-100' },
    'Bug Fixing': { bg: 'bg-orange-700', border: 'border-orange-500', text: 'text-orange-100' },
    'Staging Passed': { bg: 'bg-emerald-700', border: 'border-emerald-500', text: 'text-emerald-100' },
    'Completed': { bg: 'bg-green-700', border: 'border-green-500', text: 'text-green-100' },
};

function getStatusColor(status: string) {
    return STATUS_COLORS[status] ?? { bg: 'bg-zinc-600', border: 'border-zinc-500', text: 'text-zinc-200' };
}

function formatDuration(ms: number): string {
    const hours = Math.floor(ms / 3_600_000);
    const mins = Math.floor((ms % 3_600_000) / 60_000);
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
}

// ── Props ──────────────────────────────────────────────────────────
interface PersonnelSwimlaneProps {
    data: PersonTimeline[];
    analyses: Record<string, TaskAnalysis>;
    highRiskIds: Set<string>;
    onSegmentClick: (segment: TimelineSegment) => void;
}

// ── Component ──────────────────────────────────────────────────────
export function PersonnelSwimlane({
    data,
    analyses,
    highRiskIds,
    onSegmentClick,
}: PersonnelSwimlaneProps) {
    const [hoveredSegId, setHoveredSegId] = useState<string | null>(null);

    // Compute overall time bounds
    const { minTime, maxTime, totalMs } = useMemo(() => {
        let min = Infinity;
        let max = -Infinity;
        data.forEach((lane) => {
            lane.segments.forEach((seg) => {
                const s = seg.startTime.getTime();
                const e = seg.endTime.getTime();
                if (s < min) min = s;
                if (e > max) max = e;
            });
        });
        if (min === Infinity) return { minTime: Date.now(), maxTime: Date.now(), totalMs: 1 };
        return { minTime: min, maxTime: max, totalMs: max - min || 1 };
    }, [data]);

    // Build day tick marks
    const dayTicks = useMemo(() => {
        const ticks: { label: string; pct: number }[] = [];
        const start = new Date(minTime);
        start.setHours(0, 0, 0, 0);
        const cur = new Date(start);
        while (cur.getTime() <= maxTime) {
            const pct = ((cur.getTime() - minTime) / totalMs) * 100;
            if (pct >= 0 && pct <= 100) {
                ticks.push({ label: format(cur, 'MMM d'), pct });
            }
            cur.setDate(cur.getDate() + 1);
        }
        return ticks;
    }, [minTime, maxTime, totalMs]);

    if (data.length === 0) {
        return (
            <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
                No timeline data available for this sprint.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <div className="min-w-[800px]">

                {/* ── Day header ── */}
                <div className="flex items-end mb-2 pl-[160px] relative h-6">
                    <div className="flex-1 relative">
                        {dayTicks.map((tick) => (
                            <span
                                key={tick.label}
                                style={{ left: `${tick.pct}%` }}
                                className="absolute -translate-x-1/2 text-[10px] font-mono text-zinc-500 whitespace-nowrap"
                            >
                                {tick.label}
                            </span>
                        ))}
                    </div>
                </div>

                {/* ── Swimlanes ── */}
                <div className="flex flex-col gap-1">
                    {data.map((lane) => (
                        <div key={lane.person} className="flex items-center gap-2 group">
                            {/* Person label */}
                            <div className="w-[152px] shrink-0 text-right pr-2">
                                <span className="text-xs font-medium text-zinc-400 truncate block">{lane.person}</span>
                            </div>

                            {/* Track */}
                            <div className="flex-1 relative h-8 bg-zinc-900 rounded overflow-hidden border border-zinc-800">
                                {/* Day grid lines */}
                                {dayTicks.map((tick) => (
                                    <div
                                        key={tick.label}
                                        style={{ left: `${tick.pct}%` }}
                                        className="absolute top-0 bottom-0 w-px bg-zinc-800/60"
                                    />
                                ))}

                                {/* Segments */}
                                {lane.segments.map((seg) => {
                                    const left = ((seg.startTime.getTime() - minTime) / totalMs) * 100;
                                    const width = (seg.durationMs / totalMs) * 100;
                                    const colors = getStatusColor(seg.status);
                                    const isHovered = hoveredSegId === seg.id;
                                    const isHighRisk = highRiskIds.has(seg.taskId);
                                    const analysis = analyses[seg.taskId];

                                    return (
                                        <button
                                            key={seg.id}
                                            style={{
                                                left: `${left}%`,
                                                width: `${Math.max(width, 0.4)}%`,
                                            }}
                                            className={`
                        absolute top-1 bottom-1 rounded transition-all cursor-pointer
                        border ${colors.bg} ${colors.border}
                        ${isHovered ? 'z-20 brightness-125 ring-1 ring-white/20' : 'z-10'}
                        ${isHighRisk ? 'ring-1 ring-red-400' : ''}
                      `}
                                            onClick={() => onSegmentClick(seg)}
                                            onMouseEnter={() => setHoveredSegId(seg.id)}
                                            onMouseLeave={() => setHoveredSegId(null)}
                                            title={`${seg.taskName} · ${seg.status} · ${formatDuration(seg.durationMs)}`}
                                        >
                                            {/* Label – only show if wide enough */}
                                            {width > 5 && (
                                                <span className={`absolute inset-0 flex items-center px-1 text-[9px] font-mono truncate ${colors.text}`}>
                                                    {seg.taskId}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Status legend ── */}
                <div className="mt-4 flex flex-wrap gap-2 pl-[160px]">
                    {Object.entries(STATUS_COLORS).map(([status, colors]) => (
                        <div key={status} className="flex items-center gap-1">
                            <div className={`w-2.5 h-2.5 rounded-sm ${colors.bg} border ${colors.border}`} />
                            <span className="text-[10px] text-zinc-500">{status}</span>
                        </div>
                    ))}
                </div>

            </div>
        </div>
    );
}
