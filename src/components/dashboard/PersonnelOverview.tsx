'use client';

import React from 'react';
import { PersonSummary, TaskAnalysis } from '@/lib/types';
import { isBottleneckStatus, getStatusSeverity } from '@/lib/workflow-engine';
import { Badge } from '../ui/badge';
import {
    AlertTriangle,
    Clock,
    RefreshCw,
    Shield,
    Zap,
} from 'lucide-react';

interface PersonnelOverviewProps {
    summaries: PersonSummary[];
    highRiskIds: Set<string>;
    onTaskClick: (taskId: string) => void;
}

// ── Status Priority for sorting ──────────────────────────────────
// Reprocess > Waiting to Integrate > In Process > Not Started > others > Staging Passed
const STATUS_SORT_PRIORITY: Record<string, number> = {
    'Reprocess': 1,
    'Waiting to Integrate': 2,
    'In Process': 3,
    'Not Started': 4,
    // others default to 5
    'Staging Passed': 6,
    'Completed': 7,
};

function getStatusPriority(status: string): number {
    return STATUS_SORT_PRIORITY[status] ?? 5;
}

function sortTasks(tasks: TaskAnalysis[]): TaskAnalysis[] {
    return [...tasks].sort((a, b) => {
        // Primary: status priority (lower number = higher priority)
        const priorityDiff = getStatusPriority(a.currentStatus) - getStatusPriority(b.currentStatus);
        if (priorityDiff !== 0) return priorityDiff;
        // Secondary: stale hours descending (more stale = first)
        return b.staleDurationMs - a.staleDurationMs;
    });
}

// ── Status priority dot color ────────────────────────────────────
function priorityDotColor(status: string): string {
    const p = getStatusPriority(status);
    if (p === 1) return 'bg-red-500';       // Reprocess
    if (p === 2) return 'bg-amber-500';     // Waiting to Integrate
    if (p === 3) return 'bg-blue-500';      // In Process
    if (p === 4) return 'bg-zinc-500';      // Not Started
    if (p >= 6) return 'bg-emerald-500';    // Staging Passed / Completed
    return 'bg-zinc-600';                   // others
}

function riskBadge(analysis: TaskAnalysis) {
    if (analysis.riskLevel === 'critical') {
        return (
            <Badge variant="destructive" className="gap-1 text-[10px]">
                <RefreshCw className="w-2.5 h-2.5" />
                DOOM LOOP ×{analysis.doomLoopCount || analysis.reprocessCount}
            </Badge>
        );
    }
    if (analysis.riskLevel === 'elevated') {
        return (
            <Badge className="gap-1 text-[10px] bg-amber-900/80 text-amber-200 border-amber-700">
                <AlertTriangle className="w-2.5 h-2.5" />
                ELEVATED
            </Badge>
        );
    }
    return null;
}

function statusBadge(status: string) {
    const severity = getStatusSeverity(status);
    const classes: Record<string, string> = {
        normal: 'bg-zinc-800 text-zinc-300 border-zinc-700',
        high: 'bg-amber-950 text-amber-300 border-amber-800 animate-pulse',
        critical: 'bg-red-950 text-red-300 border-red-800 animate-pulse',
    };
    return (
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-mono font-semibold ${classes[severity]}`}>
            {isBottleneckStatus(status) && <Zap className="w-2.5 h-2.5 mr-1" />}
            {status}
        </span>
    );
}

function formatStaleHours(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

// ── Sort person summaries by total stale hours desc, then critical task count desc ──
function sortSummaries(summaries: PersonSummary[]): PersonSummary[] {
    return [...summaries].sort((a, b) => {
        // Total stale duration descending
        const aTotalStale = a.tasks.reduce((sum, t) => sum + t.staleDurationMs, 0);
        const bTotalStale = b.tasks.reduce((sum, t) => sum + t.staleDurationMs, 0);
        if (bTotalStale !== aTotalStale) return bTotalStale - aTotalStale;
        // Critical task count descending
        const aCritical = a.tasks.filter((t) => t.riskLevel === 'critical' || getStatusPriority(t.currentStatus) <= 2).length;
        const bCritical = b.tasks.filter((t) => t.riskLevel === 'critical' || getStatusPriority(t.currentStatus) <= 2).length;
        return bCritical - aCritical;
    });
}

export function PersonnelOverview({ summaries, highRiskIds, onTaskClick }: PersonnelOverviewProps) {
    const sortedSummaries = sortSummaries(summaries);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedSummaries.map((summary) => {
                const hasBlockers = summary.blockingTasks.length > 0;
                const hasCritical = summary.tasks.some((t) => t.riskLevel === 'critical');
                const sortedTasks = sortTasks(summary.tasks);
                const totalStaleMs = summary.tasks.reduce((sum, t) => sum + t.staleDurationMs, 0);

                return (
                    <div
                        key={summary.person}
                        className={`rounded-xl border p-4 transition-all ${hasCritical
                            ? 'border-red-700/60 bg-red-950/20 shadow-[0_0_30px_rgba(239,68,68,0.1)]'
                            : hasBlockers
                                ? 'border-amber-700/40 bg-amber-950/10'
                                : 'border-zinc-800 bg-zinc-950/50'
                            }`}
                    >
                        {/* Person Header */}
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <div className={`w-2.5 h-2.5 rounded-full ${hasCritical ? 'bg-red-500 animate-pulse' : hasBlockers ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
                                    }`} />
                                <h3 className="font-semibold text-zinc-100 text-sm">{summary.person}</h3>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                                <span>{summary.totalTasks} tasks</span>
                                {summary.blockingTasks.length > 0 && (
                                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                                        {summary.blockingTasks.length} blocked
                                    </Badge>
                                )}
                                {totalStaleMs > 0 && (
                                    <span className="flex items-center gap-0.5 text-amber-400">
                                        <Clock className="w-2.5 h-2.5" />
                                        {formatStaleHours(totalStaleMs)} stale
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Priority Suggestion (Use Case 3) */}
                        {summary.suggestion && (
                            <div className="mb-3 px-3 py-2 rounded-lg bg-amber-950/50 border border-amber-800/50 text-amber-200 text-xs flex items-start gap-2">
                                <Shield className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                <span>{summary.suggestion}</span>
                            </div>
                        )}

                        {/* Task List - sorted by status priority then stale hours */}
                        <div className="space-y-2">
                            {sortedTasks.map((task) => {
                                const isHR = highRiskIds.has(task.taskId);
                                return (
                                    <button
                                        key={task.taskId}
                                        onClick={() => onTaskClick(task.taskId)}
                                        className={`w-full text-left rounded-lg border px-3 py-2 transition-all hover:bg-zinc-800/50 cursor-pointer group ${isHR
                                            ? 'border-red-600/50 bg-red-950/30'
                                            : task.isStale
                                                ? 'border-amber-700/30 bg-amber-950/10'
                                                : 'border-zinc-800/50 bg-zinc-900/30'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                {/* Priority dot */}
                                                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDotColor(task.currentStatus)}`} />
                                                {isHR && (
                                                    <span className="text-red-500 text-[10px] font-bold flex-shrink-0">📌</span>
                                                )}
                                                <span className="font-mono text-[10px] text-zinc-400 flex-shrink-0">
                                                    {task.taskId}
                                                </span>
                                                <span className="text-xs text-zinc-200 truncate">
                                                    {task.taskName}
                                                </span>
                                            </div>
                                            {riskBadge(task)}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                            {statusBadge(task.currentStatus)}
                                            {task.isStale && (
                                                <span className="text-[9px] text-amber-400 font-mono flex items-center gap-1">
                                                    <Clock className="w-2.5 h-2.5" />
                                                    STALE {formatStaleHours(task.staleDurationMs)}
                                                </span>
                                            )}
                                            {task.blockedBy && (
                                                <span className="text-[9px] font-mono flex items-center gap-1 bg-red-950/40 text-red-300 px-1.5 py-0.5 rounded border border-red-900/50">
                                                    <span className="opacity-70">Blocked by</span> {task.blockedBy}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
