'use client';

import React, { useMemo, useState } from 'react';
import { TaskAnalysis } from '@/lib/types';
import { isBottleneckStatus, getStatusSeverity } from '@/lib/workflow-engine';
import { Badge } from '../ui/badge';
import {
    AlertTriangle,
    ArrowUpDown,
    CheckCircle2,
    ChevronRight,
    Clock,
    ListTodo,
    Pin,
    RefreshCw,
    Target,
    User,
    Zap,
} from 'lucide-react';

interface TaskOverviewProps {
    analyses: Record<string, TaskAnalysis>;
    highRiskIds: Set<string>;
    onTaskClick: (taskId: string) => void;
}

type SortKey = 'taskId' | 'status' | 'risk' | 'person' | 'stale' | 'blocking' | 'goal';

export function TaskOverview({ analyses, highRiskIds, onTaskClick }: TaskOverviewProps) {
    const [sortKey, setSortKey] = useState<SortKey>('risk');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

    const tasks = useMemo(() => {
        const all = Object.values(analyses);

        const riskOrder: Record<string, number> = { critical: 3, elevated: 2, normal: 1 };

        const sorted = [...all].sort((a, b) => {
            // High risk pinned always goes first
            const aHR = highRiskIds.has(a.taskId) ? 1 : 0;
            const bHR = highRiskIds.has(b.taskId) ? 1 : 0;
            if (aHR !== bHR) return bHR - aHR;

            let cmp = 0;
            switch (sortKey) {
                case 'taskId':
                    cmp = a.taskId.localeCompare(b.taskId);
                    break;
                case 'status':
                    cmp = a.currentStatus.localeCompare(b.currentStatus);
                    break;
                case 'risk':
                    cmp = (riskOrder[a.riskLevel] ?? 0) - (riskOrder[b.riskLevel] ?? 0);
                    break;
                case 'person':
                    cmp = a.currentPerson.localeCompare(b.currentPerson);
                    break;
                case 'stale':
                    cmp = a.staleDurationMs - b.staleDurationMs;
                    break;
                case 'blocking':
                    const aBlocked = a.blockedBy ? 1 : 0;
                    const bBlocked = b.blockedBy ? 1 : 0;
                    cmp = aBlocked - bBlocked || (a.blockedBy ?? '').localeCompare(b.blockedBy ?? '');
                    break;
                case 'goal':
                    const aMetGoal = a.sprintGoal && a.currentStatus === a.sprintGoal ? 1 : 0;
                    const bMetGoal = b.sprintGoal && b.currentStatus === b.sprintGoal ? 1 : 0;
                    cmp = aMetGoal - bMetGoal;
                    break;
            }
            return sortDir === 'desc' ? -cmp : cmp;
        });

        return sorted;
    }, [analyses, highRiskIds, sortKey, sortDir]);

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    const SortHeader = ({ label, sortKeyName, className = '' }: { label: string; sortKeyName: SortKey; className?: string }) => (
        <button
            onClick={() => toggleSort(sortKeyName)}
            className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold cursor-pointer hover:text-zinc-200 transition-colors ${sortKey === sortKeyName ? 'text-blue-400' : 'text-zinc-500'} ${className}`}
        >
            {label}
            <ArrowUpDown className="w-2.5 h-2.5" />
        </button>
    );

    const stats = useMemo(() => {
        const total = tasks.length;
        const highRisk = tasks.filter(t => highRiskIds.has(t.taskId)).length;
        const stale = tasks.filter(t => t.isStale).length;
        const metGoal = tasks.filter(t => t.sprintGoal && t.currentStatus === t.sprintGoal).length;
        const blocked = tasks.filter(t => t.blockedBy).length;
        return { total, highRisk, stale, metGoal, blocked };
    }, [tasks, highRiskIds]);

    if (tasks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-48 text-zinc-500 bg-zinc-950/30 rounded-xl border border-zinc-800/50">
                <ListTodo className="w-10 h-10 mb-3 opacity-50" />
                <p className="text-sm">No tasks to display</p>
                <p className="text-xs mt-1 text-zinc-600">Tasks will appear here once data is loaded</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Tasks Table */}
            <div className="overflow-x-auto border border-zinc-800/50 rounded-xl">
                {/* Table Header */}
                <table className="w-full min-w-[1170px] table-fixed">
                    <thead>
                        <tr className="bg-zinc-900/50 border-b border-zinc-800/50">
                            <th className="w-[40px] px-2 py-3">
                                <span className="sr-only">Pin</span>
                            </th>
                            <th className="w-[90px] px-3 py-3 text-left">
                                <SortHeader label="Task ID" sortKeyName="taskId" />
                            </th>
                            <th className="w-[280px] px-3 py-3 text-left">
                                <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Task Name</span>
                            </th>
                            <th className="w-[140px] px-3 py-3 text-left">
                                <SortHeader label="Person" sortKeyName="person" />
                            </th>
                            <th className="w-[150px] px-3 py-3 text-left">
                                <SortHeader label="Status" sortKeyName="status" />
                            </th>
                            <th className="w-[130px] px-3 py-3 text-left">
                                <SortHeader label="Sprint Goal" sortKeyName="goal" />
                            </th>
                            <th className="w-[110px] px-3 py-3 text-left">
                                <SortHeader label="Risk" sortKeyName="risk" />
                            </th>
                            <th className="w-[70px] px-3 py-3 text-left">
                                <SortHeader label="Stale" sortKeyName="stale" />
                            </th>
                            <th className="w-[140px] px-3 py-3 text-left">
                                <SortHeader label="Blocked By" sortKeyName="blocking" />
                            </th>
                            <th className="w-[30px] px-2 py-3">
                                <span className="sr-only">Action</span>
                            </th>
                        </tr>
                    </thead>
                </table>

                {/* Table Body */}
                <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full min-w-[1170px] table-fixed">
                        <tbody className="divide-y divide-zinc-900/50">
                            {tasks.map((task) => {
                                const isHR = highRiskIds.has(task.taskId);
                                const severity = getStatusSeverity(task.currentStatus);
                                const isBottleneck = isBottleneckStatus(task.currentStatus);
                                const metGoal = task.sprintGoal && task.currentStatus === task.sprintGoal;

                                return (
                                    <tr
                                        key={task.taskId}
                                        onClick={() => onTaskClick(task.taskId)}
                                        className={`transition-all cursor-pointer group ${
                                            metGoal
                                                ? 'bg-emerald-950/10 hover:bg-emerald-950/20 border-l-2 border-emerald-500'
                                                : isHR
                                                    ? 'bg-red-950/20 hover:bg-red-950/30 border-l-2 border-red-500'
                                                    : 'hover:bg-zinc-800/30'
                                        }`}
                                    >
                                        {/* Pin */}
                                        <td className="w-[40px] px-2 py-3 align-top">
                                            <div className="flex justify-center pt-1">
                                                {isHR && <Pin className="w-3.5 h-3.5 text-red-500 fill-red-500" />}
                                            </div>
                                        </td>

                                        {/* Task ID */}
                                        <td className="w-[90px] px-3 py-3 align-top">
                                            <span className="font-mono text-[11px] text-zinc-400 break-all">{task.taskId}</span>
                                        </td>

                                        {/* Task Name */}
                                        <td className="w-[280px] px-3 py-3 align-top">
                                            <span className="text-xs text-zinc-200 break-words leading-relaxed group-hover:text-white transition-colors">
                                                {task.taskName}
                                            </span>
                                        </td>

                                        {/* Person */}
                                        <td className="w-[140px] px-3 py-3 align-top">
                                            <span className="text-xs text-zinc-300 break-words font-mono">{task.currentPerson || '—'}</span>
                                        </td>

                                        {/* Status */}
                                        <td className="w-[150px] px-3 py-3 align-top">
                                            <span
                                                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-mono font-semibold ${
                                                    severity === 'critical'
                                                        ? 'bg-red-950 text-red-300 border-red-800 animate-pulse'
                                                        : severity === 'high'
                                                            ? 'bg-amber-950 text-amber-300 border-amber-800 animate-pulse'
                                                            : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                                                }`}
                                            >
                                                {isBottleneck && <Zap className="w-2.5 h-2.5 mr-1" />}
                                                {task.currentStatus}
                                            </span>
                                        </td>

                                        {/* Sprint Goal */}
                                        <td className="w-[130px] px-3 py-3 align-top">
                                            {task.sprintGoal ? (
                                                <div className="flex items-center gap-1.5">
                                                    {metGoal ? (
                                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                                    ) : (
                                                        <Target className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                                                    )}
                                                    <span className={`text-[10px] font-mono break-words ${metGoal ? 'text-emerald-400' : 'text-zinc-500'}`}>
                                                        {task.sprintGoal}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-zinc-600 font-mono">—</span>
                                            )}
                                        </td>

                                        {/* Risk */}
                                        <td className="w-[110px] px-3 py-3 align-top">
                                            {task.riskLevel === 'critical' ? (
                                                <Badge variant="destructive" className="gap-1 text-[9px] px-1.5">
                                                    <RefreshCw className="w-2.5 h-2.5" />
                                                    DOOM ×{task.doomLoopCount || task.reprocessCount}
                                                </Badge>
                                            ) : task.riskLevel === 'elevated' ? (
                                                <Badge className="gap-1 text-[9px] px-1.5 bg-amber-900/80 text-amber-200 border-amber-700">
                                                    <AlertTriangle className="w-2.5 h-2.5" />
                                                    ELEVATED
                                                </Badge>
                                            ) : (
                                                <span className="text-[10px] text-zinc-600 font-mono">—</span>
                                            )}
                                        </td>

                                        {/* Stale */}
                                        <td className="w-[70px] px-3 py-3 align-top">
                                            {task.isStale ? (
                                                <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                                                    <Clock className="w-2.5 h-2.5" />
                                                    {Math.floor(task.staleDurationMs / 3600000)}h
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-zinc-600 font-mono">—</span>
                                            )}
                                        </td>

                                        {/* Blocked By */}
                                        <td className="w-[140px] px-3 py-3 align-top">
                                            {task.blockedBy ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-950/50 border border-orange-800 text-[10px] text-orange-300">
                                                    <User className="w-2.5 h-2.5" />
                                                    {task.blockedBy}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-zinc-600 font-mono">—</span>
                                            )}
                                        </td>

                                        {/* Chevron indicator */}
                                        <td className="w-[30px] px-2 py-3 align-top">
                                            <div className="flex justify-center pt-1">
                                                <ChevronRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Summary Stats */}
            <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                <span>Total: <span className="text-zinc-300 font-mono">{stats.total}</span> tasks</span>
                <span>|</span>
                <span>High Risk: <span className="text-red-400 font-mono">{stats.highRisk}</span></span>
                <span>|</span>
                <span>Stale: <span className="text-amber-400 font-mono">{stats.stale}</span></span>
                <span>|</span>
                <span>Blocked: <span className="text-orange-400 font-mono">{stats.blocked}</span></span>
                <span>|</span>
                <span>Met Goal: <span className="text-emerald-400 font-mono">{stats.metGoal}</span></span>
            </div>
        </div>
    );
}
