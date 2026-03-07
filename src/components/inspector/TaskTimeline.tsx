'use client';

import React, { useMemo, useState } from 'react';
import { TaskAnalysis, StatusHistoryEntry, MeetingNote } from '@/lib/types';
import { isBottleneckStatus, getStatusSeverity } from '@/lib/workflow-engine';
import { Badge } from '../ui/badge';
import { format } from 'date-fns';
import {
    ArrowDown,
    Calendar,
    ChevronDown,
    ChevronUp,
    Clock,
    Edit2,
    MessageSquare,
    Moon,
    OctagonAlert,
    Shield,
    Trash2,
    User,
    Zap,
} from 'lucide-react';
import { calculateWorkingDuration, formatWorkingTime, formatAbsoluteTime } from '@/lib/date-utils';
import { useSprintConfig } from '@/lib/hooks/useSprintConfig';

// ── Duration Formatters ────────────────────────────────────────────

function getDurationColor(ms: number, isOvertime: boolean): string {
    const hours = ms / (1000 * 60 * 60);
    if (!isOvertime) {
        if (hours >= 15) return 'text-red-400'; // >= 2 days
        if (hours >= 7.5) return 'text-amber-400'; // >= 1 day
        if (hours >= 4) return 'text-yellow-300';
    } else {
        if (hours >= 12) return 'text-purple-400';
        if (hours >= 4) return 'text-fuchsia-400';
    }
    return 'text-zinc-400';
}

// ── Color mapping for status dot ──────────────────────────────────

function getStatusDotColor(status: string): string {
    const severity = getStatusSeverity(status);
    if (severity === 'critical') return 'bg-red-500 shadow-red-500/40 shadow-sm';
    if (severity === 'high') return 'bg-amber-500 shadow-amber-500/40 shadow-sm';
    if (status === 'Completed' || status === 'Staging Passed') return 'bg-emerald-500 shadow-emerald-500/40 shadow-sm';
    if (status === 'In Process' || status === 'Testing' || status === 'Bug Fixing') return 'bg-blue-500 shadow-blue-500/30 shadow-sm';
    return 'bg-zinc-500';
}

function getStatusLineColor(status: string): string {
    const severity = getStatusSeverity(status);
    if (severity === 'critical') return 'border-red-800/60';
    if (severity === 'high') return 'border-amber-800/60';
    return 'border-zinc-800/60';
}

// ── Unified Event Types ───────────────────────────────────────────

type TimelineEvent =
    | { kind: 'status'; entry: StatusHistoryEntry; durationMs: number; workingMs: number; offHoursMs: number; isOvertime: boolean; visualMs: number; isLast: boolean; index: number }
    | { kind: 'note'; note: MeetingNote };

function parseLocalDateLocal(dateStr: string): Date | null {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return null;
    const [y, m, d] = parts;
    return new Date(Number(y), Number(m) - 1, Number(d));
}

function getStatusBgColor(status: string, isOvertime: boolean): string {
    if (isOvertime) return 'bg-purple-600';
    const lower = status.toLowerCase();

    if (lower.includes('completed') || lower.includes('passed')) return 'bg-emerald-500';
    if (lower.includes('testing') || lower.includes('qa')) return 'bg-cyan-500';
    if (lower.includes('ready for test')) return 'bg-teal-500';
    if (lower.includes('in process') || lower.includes('dev')) return 'bg-blue-500';
    if (lower.includes('bug') || lower.includes('fail') || lower.includes('reprocess')) return 'bg-rose-500';

    // Fallback severity check
    if (lower.includes('block') || lower.includes('critical')) return 'bg-red-500';
    if (lower.includes('high')) return 'bg-amber-500';

    return 'bg-zinc-600';
}

interface TaskTimelineProps {
    taskAnalysis: TaskAnalysis;
    meetingNotes: MeetingNote[];
    onEditNote: (note: MeetingNote) => void;
    onDeleteNote: (id: string) => void;
}

export function TaskTimeline({
    taskAnalysis,
    meetingNotes,
    onEditNote,
    onDeleteNote,
}: TaskTimelineProps) {
    const [expanded, setExpanded] = useState(true);
    const [viewMode, setViewMode] = useState<'status' | 'day'>('day');
    const [hoveredId, setHoveredId] = useState<string | null>(null);

    const { getCurrentSprint } = useSprintConfig();
    const activeSprint = getCurrentSprint();

    // Build unified timeline events grouped by date
    const groupedEvents = useMemo(() => {
        const history = taskAnalysis.statusHistory;
        const statusEvents: TimelineEvent[] = history.map((entry, i) => {
            const isLast = i === history.length - 1;
            let endMs = 0;

            if (isLast) {
                const isCompleted = entry.status === 'Completed' || entry.status === 'Staging Passed';
                endMs = isCompleted ? new Date(entry.timestamp).getTime() : Date.now();
            } else {
                endMs = new Date(history[i + 1].timestamp).getTime();
            }

            const startMs = new Date(entry.timestamp).getTime();
            const { workingMs, offHoursMs } = calculateWorkingDuration(
                startMs,
                endMs,
                activeSprint?.startDate,
                activeSprint?.endDate
            );

            const isOvertime = workingMs === 0 && offHoursMs > 0;
            const visualMs = isOvertime ? offHoursMs : workingMs;

            return {
                kind: 'status' as const,
                entry,
                durationMs: endMs - startMs,
                workingMs,
                offHoursMs,
                isOvertime,
                visualMs,
                isLast,
                index: i
            };
        });

        const noteEvents: TimelineEvent[] = meetingNotes.map((note) => ({
            kind: 'note' as const,
            note,
        }));

        // Merge and sort from latest to oldest (descending)
        const all = [...statusEvents, ...noteEvents].sort((a, b) => {
            const tsA = a.kind === 'status' ? new Date(a.entry.timestamp).getTime() : new Date(a.note.createdAt).getTime();
            const tsB = b.kind === 'status' ? new Date(b.entry.timestamp).getTime() : new Date(b.note.createdAt).getTime();
            return tsB - tsA;
        });

        // Group by local date string (e.g. "2023-10-23")
        const groups: Record<string, TimelineEvent[]> = {};
        all.forEach((evt) => {
            const dateObj =
                evt.kind === 'status' ? new Date(evt.entry.timestamp) : new Date(evt.note.createdAt);
            const dateStr = format(dateObj, 'yyyy-MM-dd');
            if (!groups[dateStr]) groups[dateStr] = [];
            groups[dateStr].push(evt);
        });

        // Convert to array sorted by date descending (latest groups on top)
        const sortedDates = Object.keys(groups).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        return sortedDates.map((dateStr) => ({
            date: dateStr,
            events: groups[dateStr],
        }));
    }, [taskAnalysis, meetingNotes]);

    // Compute individual timeline segments for the summary bar and chips
    const timelineSegments = useMemo(() => {
        return taskAnalysis.statusHistory.map((entry, i) => {
            const isLast = i === taskAnalysis.statusHistory.length - 1;
            let endMs = 0;
            if (isLast) {
                const isCompleted = entry.status === 'Completed' || entry.status === 'Staging Passed';
                endMs = isCompleted ? new Date(entry.timestamp).getTime() : Date.now();
            } else {
                endMs = new Date(taskAnalysis.statusHistory[i + 1].timestamp).getTime();
            }
            const startMs = new Date(entry.timestamp).getTime();
            const { workingMs, offHoursMs } = calculateWorkingDuration(
                startMs,
                endMs,
                activeSprint?.startDate,
                activeSprint?.endDate
            );

            const isOvertime = workingMs === 0 && offHoursMs > 0;
            const visualMs = isOvertime ? offHoursMs : workingMs;

            return {
                id: `seg-${i}`,
                status: entry.status,
                startMs,
                endMs,
                dur: endMs - startMs,
                workingMs,
                offHoursMs,
                isOvertime,
                visualMs,
                dateStr: format(new Date(entry.timestamp), 'MMM d'),
            };
        });
    }, [taskAnalysis, activeSprint]);

    const totalVisualMs = useMemo(() => {
        return timelineSegments.reduce((sum, seg) => sum + seg.visualMs, 0);
    }, [timelineSegments]);

    const sprintDays = useMemo(() => {
        if (!activeSprint?.startDate || !activeSprint?.endDate) return [];
        const startObj = parseLocalDateLocal(activeSprint.startDate);
        const endObj = parseLocalDateLocal(activeSprint.endDate);
        if (!startObj || !endObj) return [];

        const days = [];
        const current = new Date(startObj.getFullYear(), startObj.getMonth(), startObj.getDate());
        const end = new Date(endObj.getFullYear(), endObj.getMonth(), endObj.getDate());

        while (current <= end) {
            days.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }
        return days;
    }, [activeSprint]);

    // Aggregate segments for 'By Day' view
    const dailySegments = useMemo(() => {
        return sprintDays.map(dayObj => {
            const dateStr = format(dayObj, 'MMM d');
            const dayStartTs = dayObj.getTime();
            const dayEndTs = dayStartTs + 86400000 - 1; // 24 hours

            let dailyWorkingMs = 0;
            let dailyOffHoursMs = 0;
            const statuses = new Set<string>();

            timelineSegments.forEach(seg => {
                const overlapStart = Math.max(seg.startMs, dayStartTs);
                const overlapEnd = Math.min(seg.endMs, dayEndTs);
                if (overlapStart < overlapEnd) {
                    statuses.add(seg.status);
                    const dayDateStr = format(dayObj, 'yyyy-MM-dd');
                    const { workingMs, offHoursMs } = calculateWorkingDuration(
                        overlapStart,
                        overlapEnd,
                        dayDateStr,
                        dayDateStr
                    );
                    dailyWorkingMs += workingMs;
                    dailyOffHoursMs += offHoursMs;
                }
            });

            const isOvertime = dailyWorkingMs === 0 && dailyOffHoursMs > 0;
            const visualMs = isOvertime ? dailyOffHoursMs : dailyWorkingMs;

            return {
                dateStr,
                workingMs: dailyWorkingMs,
                offHoursMs: dailyOffHoursMs,
                visualMs,
                statuses
            };
        }).filter(d => d.workingMs > 0 || d.offHoursMs > 0);
    }, [timelineSegments, sprintDays]);

    return (
        <div className="space-y-4">
            {/* ── Section Header ── */}
            <div className="flex items-center justify-between w-full">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="flex items-center gap-2 group"
                >
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <h3 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">
                        Timeline Overview
                    </h3>
                    <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors ml-1">
                        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                </button>

                {expanded && (
                    <div className="flex bg-zinc-900 border border-zinc-800 rounded-lg p-0.5 mt-0.5">
                        <button
                            onClick={(e) => { e.stopPropagation(); setViewMode('status'); }}
                            className={`text-[9px] uppercase font-bold px-2 py-1 rounded transition-colors tracking-widest ${viewMode === 'status' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Sequence
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setViewMode('day'); }}
                            className={`text-[9px] uppercase font-bold px-2 py-1 rounded transition-colors tracking-widest ${viewMode === 'day' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
                        >
                            Daily
                        </button>
                    </div>
                )}
            </div>

            {expanded && (
                <>
                    {/* ── Duration Summary Bar ── */}
                    {totalVisualMs > 0 && (
                        <div className="space-y-2 pb-2 border-b border-zinc-800/50">
                            {/* Stacked bar or Daily grid */}
                            {viewMode === 'status' ? (
                                <div className="flex h-3.5 rounded-full overflow-hidden bg-zinc-900 border border-zinc-950 outline outline-1 outline-black shadow-inner shadow-black/80">
                                    {timelineSegments.map((seg, i) => {
                                        const { id, status, visualMs, workingMs, isOvertime, dateStr } = seg;
                                        const pct = (visualMs / Math.max(1, totalVisualMs)) * 100;
                                        if (pct < 0.2) return null;

                                        const bgColor = getStatusBgColor(status, isOvertime);

                                        const isHovered = hoveredId === id;
                                        const isDimmed = hoveredId !== null && !isHovered;

                                        const isNewDate = i === 0 || timelineSegments[i - 1].dateStr !== dateStr;

                                        // For segments longer than a workday, we draw internal markers
                                        const WORKDAY_MS = 27000000; // 7.5 hours
                                        const internalNotches = [];
                                        if (!isOvertime && visualMs > WORKDAY_MS) {
                                            const count = Math.floor(visualMs / WORKDAY_MS);
                                            for (let k = 1; k <= count; k++) {
                                                const pctPos = ((k * WORKDAY_MS) / visualMs) * 100;
                                                if (pctPos < 99) { // Don't draw exactly at the very end
                                                    internalNotches.push({ pctPos, dayCount: k });
                                                }
                                            }
                                        }

                                        return (
                                            <div
                                                key={id}
                                                onMouseEnter={() => setHoveredId(id)}
                                                onMouseLeave={() => setHoveredId(null)}
                                                className={`${bgColor} ${isDimmed ? 'opacity-25 grayscale-[0.5]' : 'opacity-100'} transition-all duration-300 relative group/bar cursor-pointer hover:brightness-125 hover:z-20`}
                                                style={{ width: `${pct}%`, minWidth: pct > 1.5 ? undefined : '2px' }}
                                                title={`${status} (${dateStr}): ${isOvertime ? formatAbsoluteTime(visualMs) + ' Overtime' : formatWorkingTime(workingMs)}`}
                                            >
                                                {isNewDate && i !== 0 && (
                                                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-zinc-950 z-10 box-content px-[0.5px]">
                                                        <div className="w-full h-full bg-white opacity-40"></div>
                                                    </div>
                                                )}
                                                {internalNotches.map((notch, j) => (
                                                    <div
                                                        key={`notch-${j}`}
                                                        className="absolute top-0 bottom-0 w-[2px] bg-black/40 hover:bg-white hover:w-[4px] hover:shadow-[0_0_6px_#fff] z-10 hover:z-20 transition-all cursor-crosshair"
                                                        style={{ left: `${notch.pctPos}%` }}
                                                        title={`Day ${notch.dayCount} of ${status}`}
                                                    />
                                                ))}
                                                {isOvertime && (
                                                    <div className="absolute inset-0 opacity-40 bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,#000_2px,#000_4px)] mix-blend-overlay pointer-events-none" />
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex h-[52px] rounded border border-zinc-800 bg-zinc-900/40 relative isolate overflow-hidden group/grid shadow-inner">
                                    {sprintDays.map((dayObj, dayIdx) => {
                                        const dayStartTs = dayObj.getTime();
                                        const windowStart = dayStartTs + 8.5 * 3600 * 1000;
                                        const windowEnd = dayStartTs + 17.5 * 3600 * 1000;
                                        const windowDur = windowEnd - windowStart;

                                        const formattedDay = format(dayObj, 'MMM d');
                                        const isHoveredDay = hoveredId === formattedDay;
                                        const isDimmedDay = hoveredId !== null && !isHoveredDay;

                                        const todayTs = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
                                        const isToday = dayStartTs === todayTs;

                                        return (
                                            <div
                                                key={dayIdx}
                                                className={`relative flex-1 group/daycol border-r border-zinc-800/60 last:border-r-0 transition-colors cursor-crosshair ${isHoveredDay ? 'bg-blue-900/20 z-10 block' : isToday ? 'bg-zinc-800/30' : 'hover:bg-zinc-800/40'}`}
                                                onMouseEnter={() => setHoveredId(formattedDay)}
                                                onMouseLeave={() => setHoveredId(null)}
                                                title={`${format(dayObj, 'EEEE, MMM d')}\n(8:30 - 17:30 fixed timeline)`}
                                            >
                                                {/* Header for purely visual grouping */}
                                                <div className={`absolute inset-x-0 top-0 h-1.5 transition-colors ${isHoveredDay ? 'bg-blue-500 shadow-[0_0_8px_theme(colors.blue.500)]' : isToday ? 'bg-zinc-500/80' : 'bg-black/30'}`} />

                                                {/* Subtle 2-hour grid lines behind the bars */}
                                                <div className="absolute inset-x-0 bottom-4 top-[6px] flex justify-between pointer-events-none opacity-20 group-hover/grid:opacity-40 transition-opacity">
                                                    {Array.from({ length: 4 }).map((_, i) => (
                                                        <div key={i} className="w-px h-full bg-zinc-400" />
                                                    ))}
                                                </div>

                                                <div className={`absolute top-0 bottom-[18px] left-0 right-0 flex pointer-events-none transition-all duration-300 ${isDimmedDay ? 'opacity-20 grayscale' : 'opacity-100'}`}>
                                                    {timelineSegments.map(seg => {
                                                        const overlapStart = Math.max(seg.startMs, windowStart);
                                                        const overlapEnd = Math.min(seg.endMs, windowEnd);

                                                        if (overlapStart < overlapEnd) {
                                                            const leftPct = ((overlapStart - windowStart) / windowDur) * 100;
                                                            const widthPct = ((overlapEnd - overlapStart) / windowDur) * 100;
                                                            const bgColor = getStatusBgColor(seg.status, seg.isOvertime);

                                                            return (
                                                                <div
                                                                    key={`span-${seg.id}-${dayIdx}`}
                                                                    className={`absolute top-[10px] bottom-0 rounded-[2px] shadow-sm ${bgColor} ${isHoveredDay ? 'ring-1 ring-white/40 shadow-black shadow-md z-10 brightness-110' : ''}`}
                                                                    style={{ left: `${leftPct}%`, width: `${widthPct}%`, minWidth: '1.5px' }}
                                                                />
                                                            );
                                                        }
                                                        return null;
                                                    })}
                                                </div>

                                                {/* Date Label Legend */}
                                                <div className="absolute inset-x-0 bottom-0 h-[18px] bg-zinc-950/80 border-t border-zinc-800/80 flex items-center justify-center">
                                                    <span className={`text-[9px] font-bold tracking-wider uppercase transition-colors ${isHoveredDay ? 'text-blue-400' : isToday ? 'text-zinc-300' : 'text-zinc-500'}`}>
                                                        {format(dayObj, 'MMM d')}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                            {/* Legend chips */}
                            <div className="flex flex-wrap gap-1.5 pt-1.5">
                                {viewMode === 'status' ? (
                                    timelineSegments
                                        .filter(({ visualMs }) => (visualMs / Math.max(1, totalVisualMs)) * 100 >= 1)
                                        .map(({ id, status, workingMs, offHoursMs, visualMs, isOvertime, dateStr }) => {
                                            const isHovered = hoveredId === id;
                                            const isDimmed = hoveredId !== null && !isHovered;

                                            return (
                                                <span
                                                    key={id}
                                                    onMouseEnter={() => setHoveredId(id)}
                                                    onMouseLeave={() => setHoveredId(null)}
                                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-[10px] uppercase tracking-wide cursor-pointer transition-all duration-300 ${isHovered
                                                        ? 'bg-zinc-800 border-zinc-600 shadow-md scale-105 z-10 font-bold'
                                                        : isDimmed
                                                            ? 'bg-zinc-950 border-zinc-900 opacity-40 grayscale-[0.5]'
                                                            : 'bg-zinc-900 border-zinc-800 font-medium'
                                                        }`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full ${isOvertime ? 'bg-purple-500' : getStatusDotColor(status)} shadow-sm`} />
                                                    <span className={isDimmed ? 'text-zinc-600' : 'text-zinc-400'}>
                                                        {status} <span className="text-zinc-600 ml-0.5 opacity-70">({dateStr.split(' ')[1]})</span>
                                                    </span>
                                                    <span className={`font-mono text-[11px] ${isDimmed ? 'text-zinc-600' : getDurationColor(visualMs, isOvertime)}`}>
                                                        {isOvertime ? formatAbsoluteTime(visualMs) : formatWorkingTime(workingMs)}
                                                    </span>
                                                    {isOvertime && (
                                                        <span className={`text-[8px] font-bold ${isDimmed ? 'text-purple-900' : 'text-purple-400'} ml-0.5`}>OVERTIME</span>
                                                    )}
                                                </span>
                                            );
                                        })
                                ) : (
                                    dailySegments
                                        .map(({ dateStr, workingMs, offHoursMs, visualMs, statuses }) => {
                                            const isHovered = hoveredId === dateStr;
                                            const isDimmed = hoveredId !== null && !isHovered;

                                            const isOvertime = workingMs === 0 && offHoursMs > 0;

                                            return (
                                                <span
                                                    key={dateStr}
                                                    onMouseEnter={() => setHoveredId(dateStr)}
                                                    onMouseLeave={() => setHoveredId(null)}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11px] uppercase tracking-wide cursor-pointer transition-all duration-300 ${isHovered
                                                        ? 'bg-zinc-800 border-zinc-600 shadow-md scale-105 z-10 font-bold'
                                                        : isDimmed
                                                            ? 'bg-zinc-950 border-zinc-900 opacity-40 grayscale-[0.5]'
                                                            : 'bg-zinc-900 border-zinc-800 font-medium'
                                                        }`}
                                                >
                                                    <Calendar className={`w-3 h-3 ${isHovered ? 'text-blue-400' : 'text-zinc-500'}`} />
                                                    <span className={isDimmed ? 'text-zinc-500' : 'text-zinc-300'}>{dateStr}</span>
                                                    <span className={`font-mono text-[12px] font-bold ml-1 ${isDimmed ? 'text-zinc-600' : getDurationColor(visualMs, isOvertime)}`}>
                                                        {isOvertime ? formatAbsoluteTime(visualMs) : formatWorkingTime(workingMs)}
                                                    </span>
                                                    {isOvertime && (
                                                        <span className={`text-[9px] font-bold ${isDimmed ? 'text-purple-900' : 'text-purple-400'} ml-0.5`}>OVERTIME</span>
                                                    )}
                                                </span>
                                            );
                                        })
                                )}
                            </div>
                        </div>
                    )}

                    {/* ── Vertical Timeline ── */}
                    <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 pb-2">
                        {groupedEvents.map((group, groupIndex) => {
                            // Parse 'yyyy-MM-dd' + "T00:00:00" or similar to avoid TZ shift
                            // But since the events are local, just use parts
                            const [gy, gm, gd] = group.date.split('-');
                            const dayDate = new Date(Number(gy), Number(gm) - 1, Number(gd));

                            return (
                                <div
                                    key={`day-${group.date}`}
                                    className="relative flex flex-col pt-3 pb-1 -mx-2 px-2 rounded-xl border border-transparent hover:bg-zinc-900/40 hover:border-zinc-800/50 hover:shadow-lg hover:shadow-black/50 transition-all duration-300 group/day"
                                >
                                    {/* ── Day Header ── */}
                                    <div className="flex items-center gap-2 mb-3 px-1">
                                        <div className="bg-zinc-800 h-px flex-1 rounded opacity-50 transition-colors group-hover/day:bg-blue-900/50" />
                                        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-zinc-500 group-hover/day:text-blue-400 transition-colors">
                                            <Calendar className="w-3.5 h-3.5" />
                                            {format(dayDate, 'EEE, MMM d')}
                                        </div>
                                        <div className="bg-zinc-800 h-px flex-1 rounded opacity-50 transition-colors group-hover/day:bg-blue-900/50" />
                                    </div>

                                    {/* ── Day's Events ── */}
                                    {/* Note: ML-5 adds space for the dots, padding left inside the elements connects them */}
                                    <div className="relative ml-[14px] border-l-2 border-zinc-800/40 group-hover/day:border-zinc-700/60 transition-colors space-y-0 pb-1">
                                        {group.events.map((evt, evtIndex) => {
                                            const isLastInGroup = evtIndex === group.events.length - 1;

                                            if (evt.kind === 'status') {
                                                const { entry, durationMs, workingMs, offHoursMs, isOvertime, visualMs, isLast, index } = evt;
                                                const bottleneck = isBottleneckStatus(entry.status);
                                                const dotColor = isOvertime ? 'bg-purple-500 shadow-[0_0_8px_theme(colors.purple.500)]' : getStatusDotColor(entry.status);

                                                // Link to global hover state
                                                const dateStrFragment = format(new Date(entry.timestamp), 'MMM d');
                                                const evtId = `seg-${index}`;
                                                const isHovered = viewMode === 'status' ? hoveredId === evtId : hoveredId === dateStrFragment;
                                                const isDimmed = hoveredId !== null && !isHovered;

                                                return (
                                                    <div
                                                        key={`s-${evt.index}`}
                                                        className={`relative pl-6 pb-5 group/item transition-all duration-300 ${isDimmed ? 'opacity-30 grayscale-[0.3]' : 'opacity-100'} ${isHovered ? 'scale-[1.02] translate-x-1' : ''}`}
                                                        onMouseEnter={() => setHoveredId(viewMode === 'status' ? evtId : dateStrFragment)}
                                                        onMouseLeave={() => setHoveredId(null)}
                                                    >
                                                        {/* Dot on the line */}
                                                        <div
                                                            className={`absolute left-[-6px] top-1 w-[10px] h-[10px] rounded-full border-[2px] border-[#0a0a0a] group-hover/day:border-[#0f0f11] transition-colors ${dotColor} z-10`}
                                                        />

                                                        <div className={`flex items-start justify-between gap-3 ${isHovered ? 'bg-zinc-800/80 shadow-md ring-1 ring-zinc-700/50' : 'bg-black/20 hover:bg-black/40 group-hover/day:bg-transparent'} rounded-lg p-2 -ml-2 -mt-2 transition-all`}>
                                                            <div className="flex-1 min-w-0 pt-0.5">
                                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                                    <span
                                                                        className={`font-mono text-sm leading-none font-bold tracking-tight ${bottleneck
                                                                            ? 'text-amber-300'
                                                                            : entry.status === 'Completed' || entry.status === 'Staging Passed'
                                                                                ? 'text-emerald-300'
                                                                                : 'text-zinc-200'
                                                                            }`}
                                                                    >
                                                                        {entry.status}
                                                                    </span>
                                                                    {bottleneck && (
                                                                        <Badge className="gap-0.5 text-[8px] px-1.5 py-0 bg-amber-900/60 text-amber-200 border-amber-700/50 uppercase">
                                                                            <Zap className="w-2 h-2" />
                                                                            BOTTLENECK
                                                                        </Badge>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center gap-2 mt-1 text-[11px]">
                                                                    <span className="text-zinc-500 font-mono tracking-wider font-medium bg-zinc-900/50 px-1.5 py-0.5 rounded">
                                                                        {format(new Date(entry.timestamp), 'HH:mm')}
                                                                    </span>
                                                                    {entry.person && (
                                                                        <span className="text-zinc-400 flex items-center gap-1 font-medium bg-zinc-900/30 px-1.5 py-0.5 rounded max-w-[120px] truncate">
                                                                            <User className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                                                                            <span className="truncate">{entry.person}</span>
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Duration badge */}
                                                            {durationMs > 0 && (
                                                                <div
                                                                    className={`flex flex-col items-end gap-0.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-mono shrink-0 shadow-sm ${isOvertime
                                                                        ? 'bg-purple-950/30 border-purple-800/40 text-purple-300 shadow-purple-900/10'
                                                                        : durationMs > 48 * 60 * 60 * 1000
                                                                            ? 'bg-red-950/40 border-red-800/50 text-red-300 shadow-red-900/10'
                                                                            : durationMs > 24 * 60 * 60 * 1000
                                                                                ? 'bg-amber-950/40 border-amber-800/50 text-amber-300 shadow-amber-900/10'
                                                                                : 'bg-zinc-900 border-zinc-800 text-zinc-300 shadow-black/40'
                                                                        }`}
                                                                >
                                                                    <div className="flex flex-col items-end">
                                                                        <div className="flex items-center gap-1.5 font-semibold tracking-tight">
                                                                            {isOvertime ? <Moon className="w-3 h-3 text-purple-400" /> : <Clock className="w-3 h-3 text-current opacity-70" />}
                                                                            {isOvertime ? formatAbsoluteTime(visualMs) : formatWorkingTime(workingMs)}
                                                                        </div>
                                                                        {(!isOvertime && offHoursMs > 0 && false /* Hiding off-hours as requested */) && (
                                                                            <span className="text-[9px] text-zinc-500 tracking-wider">+{formatAbsoluteTime(offHoursMs)} off</span>
                                                                        )}
                                                                        {isOvertime && (
                                                                            <span className="text-[9px] text-purple-400/80 tracking-widest uppercase font-bold mt-0.5">Overtime</span>
                                                                        )}
                                                                    </div>
                                                                    {isLast && <span className="text-[9px] text-zinc-500 tracking-wider uppercase mt-1">Current</span>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            // ── Meeting Note Event ──
                                            const { note } = evt;
                                            return (
                                                <div key={`n-${note.id}`} className="relative pl-6 pb-6 mt-1">
                                                    {/* Diamond marker on the line */}
                                                    <div className="absolute left-[-6px] top-1.5 w-2.5 h-2.5 rotate-45 bg-blue-500 border-[2px] border-[#0a0a0a] group-hover/day:border-[#0f0f11] z-10 shadow-sm shadow-blue-500/40 transition-colors" />

                                                    <div
                                                        className={`rounded-xl border p-3 hover:scale-[1.01] transition-all duration-300 shadow-md ${note.isStall
                                                            ? 'border-red-800/40 bg-gradient-to-br from-red-950/30 to-red-950/10 hover:border-red-700/60 shadow-red-900/10'
                                                            : 'border-blue-800/30 bg-gradient-to-br from-blue-950/20 to-blue-950/5 hover:border-blue-700/50 shadow-blue-900/10'
                                                            }`}
                                                    >
                                                        {/* Note header */}
                                                        <div className="flex items-center justify-between mb-2">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[11px] font-bold tracking-wide uppercase text-blue-400 flex items-center gap-1.5">
                                                                    <MessageSquare className="w-3.5 h-3.5" />
                                                                    Meeting Note
                                                                </span>
                                                                <span className="text-[10px] text-zinc-500 font-mono font-medium px-1.5 py-0.5 bg-black/40 rounded">
                                                                    {format(new Date(note.createdAt), 'HH:mm')}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                {note.isStall && (
                                                                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0 gap-1 absolute -top-2.5 right-12 border border-red-900 shadow-sm">
                                                                        <OctagonAlert className="w-2.5 h-2.5" />
                                                                        STALLED
                                                                    </Badge>
                                                                )}
                                                                <button
                                                                    onClick={() => onEditNote(note)}
                                                                    className="p-1 rounded-md text-zinc-500 hover:text-blue-400 hover:bg-blue-950/50 transition-colors"
                                                                >
                                                                    <Edit2 className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button
                                                                    onClick={() => onDeleteNote(note.id)}
                                                                    className="p-1 rounded-md text-zinc-500 hover:text-red-400 hover:bg-red-950/50 transition-colors"
                                                                >
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-2 bg-black/20 rounded-lg p-2.5 border border-white/5">
                                                            {/* Stall reason */}
                                                            {note.isStall && note.stallReason && (
                                                                <div className="text-[12px] text-red-200">
                                                                    <span className="text-red-500 font-bold tracking-wide uppercase text-[10px] mr-1">Why: </span>
                                                                    {note.stallReason}
                                                                </div>
                                                            )}

                                                            {/* Blocked by */}
                                                            {note.blockedBy && (
                                                                <div className="text-[12px] text-zinc-200 flex items-center gap-2 bg-amber-950/20 px-2 py-1.5 rounded-md border border-amber-900/30">
                                                                    <div className="bg-amber-900/50 p-1 rounded">
                                                                        <User className="w-3 h-3 text-amber-400 flex-shrink-0" />
                                                                    </div>
                                                                    <span className="text-zinc-400 text-[11px]">Blocked by</span>
                                                                    <span className="font-bold text-amber-300">{note.blockedBy}</span>
                                                                </div>
                                                            )}

                                                            {/* Solution */}
                                                            {note.solution && (
                                                                <div className="text-[12px] text-emerald-100 flex items-start gap-2 bg-emerald-950/10 px-2 py-1.5 rounded-md border border-emerald-900/20">
                                                                    <div className="bg-emerald-900/40 p-1 rounded mt-0.5">
                                                                        <Shield className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                                                    </div>
                                                                    <div>
                                                                        <span className="block text-emerald-600 font-bold uppercase tracking-wider text-[9px] mb-0.5">Proposed Solution</span>
                                                                        <span className="text-emerald-200/90 leading-snug">{note.solution}</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
