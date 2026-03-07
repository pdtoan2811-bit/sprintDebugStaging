'use client';

import React, { useMemo, useState } from 'react';
import { TaskAnalysis } from '@/lib/types';
import { isBottleneckStatus, getStatusSeverity } from '@/lib/workflow-engine';
import { Badge } from '../ui/badge';
import {
    AlertTriangle,
    ArrowUpDown,
    Clock,
    Pin,
    RefreshCw,
    Zap,
} from 'lucide-react';

interface TaskOverviewProps {
    analyses: Record<string, TaskAnalysis>;
    highRiskIds: Set<string>;
    onTaskClick: (taskId: string) => void;
}

type SortKey = 'taskId' | 'status' | 'risk' | 'person' | 'stale';

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

    const SortHeader = ({ label, sortKeyName }: { label: string; sortKeyName: SortKey }) => (
        <button
            onClick={() => toggleSort(sortKeyName)}
            className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold cursor-pointer hover:text-zinc-200 transition-colors ${sortKey === sortKeyName ? 'text-blue-400' : 'text-zinc-500'
                }`}
        >
            {label}
            <ArrowUpDown className="w-2.5 h-2.5" />
        </button>
    );

    return (
        <div className="w-full overflow-x-auto">
            {/* Table Header */}
            <div className="grid grid-cols-[40px_80px_1fr_130px_140px_100px_80px] gap-2 px-4 py-2 border-b border-zinc-800/50 items-center min-w-[700px]">
                <div /> {/* pin icon col */}
                <SortHeader label="Task ID" sortKeyName="taskId" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Task Name</span>
                <SortHeader label="Person" sortKeyName="person" />
                <SortHeader label="Status" sortKeyName="status" />
                <SortHeader label="Risk" sortKeyName="risk" />
                <SortHeader label="Stale" sortKeyName="stale" />
            </div>

            {/* Table Body */}
            <div className="divide-y divide-zinc-900/50 min-w-[700px]">
                {tasks.map((task) => {
                    const isHR = highRiskIds.has(task.taskId);
                    const severity = getStatusSeverity(task.currentStatus);
                    const isBottleneck = isBottleneckStatus(task.currentStatus);

                    return (
                        <button
                            key={task.taskId}
                            onClick={() => onTaskClick(task.taskId)}
                            className={`w-full text-left grid grid-cols-[40px_80px_1fr_130px_140px_100px_80px] gap-2 px-4 py-3 items-center transition-all cursor-pointer group ${isHR
                                    ? 'bg-red-950/20 hover:bg-red-950/30 border-l-2 border-red-500'
                                    : 'hover:bg-zinc-800/30'
                                }`}
                        >
                            {/* Pin */}
                            <div className="flex justify-center">
                                {isHR && <Pin className="w-3.5 h-3.5 text-red-500 fill-red-500" />}
                            </div>

                            {/* Task ID */}
                            <span className="font-mono text-[11px] text-zinc-400">{task.taskId}</span>

                            {/* Task Name */}
                            <span className="text-xs text-zinc-200 truncate group-hover:text-white transition-colors">
                                {task.taskName}
                            </span>

                            {/* Person */}
                            <span className="text-xs text-zinc-300 truncate font-mono">{task.currentPerson}</span>

                            {/* Status */}
                            <div>
                                <span
                                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-mono font-semibold ${severity === 'critical'
                                            ? 'bg-red-950 text-red-300 border-red-800 animate-pulse'
                                            : severity === 'high'
                                                ? 'bg-amber-950 text-amber-300 border-amber-800 animate-pulse'
                                                : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                                        }`}
                                >
                                    {isBottleneck && <Zap className="w-2.5 h-2.5 mr-1" />}
                                    {task.currentStatus}
                                </span>
                            </div>

                            {/* Risk */}
                            <div>
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
                            </div>

                            {/* Stale */}
                            <div>
                                {task.isStale ? (
                                    <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                                        <Clock className="w-2.5 h-2.5" />
                                        {Math.floor(task.staleDurationMs / 3600000)}h
                                    </span>
                                ) : (
                                    <span className="text-[10px] text-zinc-600 font-mono">—</span>
                                )}
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
