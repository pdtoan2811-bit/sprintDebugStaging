'use client';

import React, { useState, useMemo } from 'react';
import { RawLogEvent, TaskMovement, PersonDailyMovement, WORKFLOW_STATUSES, DailyMovementSummary } from '@/lib/types';
import { useDailyMovement } from '@/lib/hooks/useDailyMovement';
import { Badge } from '../ui/badge';
import { format, subDays, isToday, isYesterday, isBefore, startOfDay } from 'date-fns';
import { useRoles, ROLE_ORDER, ValidRole } from '@/lib/hooks/useRoles';
import { useDailyTodos } from '@/lib/hooks/useDailyTodos';
import {
    Activity,
    AlertTriangle,
    ArrowDown,
    ArrowRight,
    ArrowUp,
    Calendar,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Clock,
    Minus,
    Sparkles,
    TrendingDown,
    TrendingUp,
    User,
    Users,
    Zap,
} from 'lucide-react';

interface DailyRecapViewProps {
    rawLogs: RawLogEvent[];
    sprintStartDate?: string;
    onTaskClick: (taskId: string) => void;
}

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

function StatusBadge({ status }: { status: string | null }) {
    if (!status) {
        return (
            <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-mono font-semibold bg-zinc-900 text-zinc-500 border-zinc-700">
                N/A
            </span>
        );
    }
    const colors = getStatusColor(status);
    return (
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-mono font-semibold ${colors.bg} ${colors.text} ${colors.border}`}>
            {status}
        </span>
    );
}

function MovementArrow({ type }: { type: 'forward' | 'backward' | 'same' | 'new' }) {
    switch (type) {
        case 'forward':
        case 'new':
            return <ArrowRight className="w-3 h-3 text-emerald-400 mx-1 flex-shrink-0" />;
        case 'backward':
            return <ArrowRight className="w-3 h-3 text-red-400 mx-1 flex-shrink-0" />;
        case 'same':
            return <ArrowRight className="w-3 h-3 text-zinc-500 mx-1 flex-shrink-0" />;
    }
}

function StatusChainDisplay({ movement }: { movement: TaskMovement }) {
    const isRegression = movement.movementType === 'backward';
    const { statusChain, isNewTask } = movement;

    if (statusChain.length === 0) {
        return (
            <div className="flex items-center flex-wrap gap-1">
                <StatusBadge status={movement.endStatus} />
            </div>
        );
    }

    if (statusChain.length === 1 && isNewTask) {
        return (
            <div className="flex items-center flex-wrap gap-1">
                <StatusBadge status={statusChain[0].status} />
                <span className="text-[9px] text-zinc-500 ml-1">(created)</span>
            </div>
        );
    }

    return (
        <div className="flex items-center flex-wrap gap-0.5">
            {!isNewTask && movement.startStatus && (
                <>
                    <StatusBadge status={movement.startStatus} />
                    {statusChain.length > 0 && (
                        <MovementArrow type={isRegression ? 'backward' : 'forward'} />
                    )}
                </>
            )}
            {statusChain.map((transition, idx) => (
                <React.Fragment key={`${transition.status}-${idx}`}>
                    <StatusBadge status={transition.status} />
                    {idx < statusChain.length - 1 && (
                        <MovementArrow type={isRegression ? 'backward' : 'forward'} />
                    )}
                </React.Fragment>
            ))}
            {isRegression && (
                <Badge variant="destructive" className="ml-2 text-[9px] gap-1">
                    <AlertTriangle className="w-2.5 h-2.5" />
                    Regression
                </Badge>
            )}
        </div>
    );
}

interface TaskMovementCardProps {
    movement: TaskMovement;
    onTaskClick: (taskId: string) => void;
    showMovementType?: boolean;
}

function TaskMovementCard({ movement, onTaskClick, showMovementType = true }: TaskMovementCardProps) {
    const isRegression = movement.movementType === 'backward';

    return (
        <button
            onClick={() => onTaskClick(movement.taskId)}
            className={`w-full text-left rounded-lg border px-3 py-2.5 transition-all group cursor-pointer ${
                isRegression
                    ? 'border-red-700/50 bg-red-950/20 hover:border-red-600/70 hover:bg-red-950/30'
                    : 'border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700/70 hover:bg-zinc-800/50'
            }`}
        >
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="font-mono text-[10px] text-zinc-400 flex-shrink-0">
                        {movement.taskId}
                    </span>
                    <span className="text-xs text-zinc-200 truncate">
                        {movement.taskName}
                    </span>
                </div>
                <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
            </div>

            {showMovementType && <StatusChainDisplay movement={movement} />}

            <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500">
                <span className="flex items-center gap-1">
                    <Activity className="w-2.5 h-2.5" />
                    {movement.eventCount} event{movement.eventCount !== 1 ? 's' : ''}
                </span>
                {movement.lastEventTime && (
                    <span className="flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        Last: {format(new Date(movement.lastEventTime), 'HH:mm')}
                    </span>
                )}
            </div>
        </button>
    );
}

interface PersonCardProps {
    personData: PersonDailyMovement;
    onTaskClick: (taskId: string) => void;
    defaultExpanded?: boolean;
}

function PersonCard({ personData, onTaskClick, defaultExpanded = false }: PersonCardProps) {
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        forward: defaultExpanded || personData.movedForward.length > 0,
        backward: defaultExpanded || personData.movedBackward.length > 0,
        same: defaultExpanded && personData.sameWithEvents.length > 0,
        noChange: false,
    });

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const hasBackward = personData.movedBackward.length > 0;
    const hasForward = personData.movedForward.length > 0;
    const hasSame = personData.sameWithEvents.length > 0;
    const hasNoChange = personData.noChange.length > 0;

    const personStatus = hasBackward
        ? 'regression'
        : hasForward
            ? 'progress'
            : hasSame
                ? 'activity'
                : 'stalled';

    const borderColor = {
        regression: 'border-red-700/60',
        progress: 'border-emerald-700/60',
        activity: 'border-amber-700/60',
        stalled: 'border-zinc-800',
    }[personStatus];

    const bgColor = {
        regression: 'bg-red-950/10',
        progress: 'bg-emerald-950/10',
        activity: 'bg-amber-950/10',
        stalled: 'bg-zinc-950/50',
    }[personStatus];

    const dotColor = {
        regression: 'bg-red-500 animate-pulse',
        progress: 'bg-emerald-500',
        activity: 'bg-amber-500',
        stalled: 'bg-zinc-500',
    }[personStatus];

    return (
        <div className={`rounded-xl border p-4 transition-all ${borderColor} ${bgColor}`}>
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/50">
                <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${dotColor}`} />
                    <h3 className="font-semibold text-zinc-100">{personData.person}</h3>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono flex-wrap">
                    <Badge className="bg-blue-950/50 text-blue-300 border-blue-800/50 gap-1">
                        <Zap className="w-2.5 h-2.5" />
                        {personData.totalEventsOnDay} events
                    </Badge>
                    {personData.forwardCount > 0 && (
                        <Badge className="bg-emerald-950/50 text-emerald-300 border-emerald-800/50 gap-1">
                            <TrendingUp className="w-2.5 h-2.5" />
                            {personData.forwardCount} forward
                        </Badge>
                    )}
                    {personData.backwardCount > 0 && (
                        <Badge className="bg-red-950/50 text-red-300 border-red-800/50 gap-1">
                            <TrendingDown className="w-2.5 h-2.5" />
                            {personData.backwardCount} backward
                        </Badge>
                    )}
                    {personData.sameWithEvents.length > 0 && (
                        <Badge className="bg-amber-950/50 text-amber-300 border-amber-800/50 gap-1">
                            <Activity className="w-2.5 h-2.5" />
                            {personData.sameWithEvents.length} activity
                        </Badge>
                    )}
                    {personData.noChange.length > 0 && (
                        <Badge className="bg-zinc-800/50 text-zinc-400 border-zinc-700/50">
                            {personData.noChange.length} unchanged
                        </Badge>
                    )}
                </div>
            </div>

            <div className="space-y-3">
                {/* Moved Forward Section */}
                {hasForward && (
                    <div>
                        <button
                            onClick={() => toggleSection('forward')}
                            className="flex items-center gap-2 mb-2 text-emerald-400 hover:text-emerald-300 transition-colors w-full"
                        >
                            {expandedSections.forward ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                            )}
                            <TrendingUp className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-semibold uppercase">
                                Moved Forward ({personData.movedForward.length})
                            </span>
                        </button>
                        {expandedSections.forward && (
                            <div className="space-y-1.5 ml-5">
                                {personData.movedForward.map(tm => (
                                    <TaskMovementCard
                                        key={tm.taskId}
                                        movement={tm}
                                        onTaskClick={onTaskClick}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Moved Backward Section */}
                {hasBackward && (
                    <div>
                        <button
                            onClick={() => toggleSection('backward')}
                            className="flex items-center gap-2 mb-2 text-red-400 hover:text-red-300 transition-colors w-full"
                        >
                            {expandedSections.backward ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                            )}
                            <TrendingDown className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-semibold uppercase">
                                Moved Backward ({personData.movedBackward.length})
                            </span>
                        </button>
                        {expandedSections.backward && (
                            <div className="space-y-1.5 ml-5">
                                {personData.movedBackward.map(tm => (
                                    <TaskMovementCard
                                        key={tm.taskId}
                                        movement={tm}
                                        onTaskClick={onTaskClick}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Same With Events Section */}
                {hasSame && (
                    <div>
                        <button
                            onClick={() => toggleSection('same')}
                            className="flex items-center gap-2 mb-2 text-amber-400 hover:text-amber-300 transition-colors w-full"
                        >
                            {expandedSections.same ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                            )}
                            <Activity className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-semibold uppercase">
                                Activity, Same Status ({personData.sameWithEvents.length})
                            </span>
                        </button>
                        {expandedSections.same && (
                            <div className="space-y-1.5 ml-5">
                                {personData.sameWithEvents.map(tm => (
                                    <TaskMovementCard
                                        key={tm.taskId}
                                        movement={tm}
                                        onTaskClick={onTaskClick}
                                        showMovementType={false}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* No Change Section */}
                {hasNoChange && (
                    <div>
                        <button
                            onClick={() => toggleSection('noChange')}
                            className="flex items-center gap-2 mb-2 text-zinc-500 hover:text-zinc-400 transition-colors w-full"
                        >
                            {expandedSections.noChange ? (
                                <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5" />
                            )}
                            <Minus className="w-3.5 h-3.5" />
                            <span className="text-[11px] font-semibold uppercase">
                                No Change ({personData.noChange.length})
                            </span>
                        </button>
                        {expandedSections.noChange && (
                            <div className="space-y-1.5 ml-5">
                                {personData.noChange.map(tm => (
                                    <div
                                        key={tm.taskId}
                                        onClick={() => onTaskClick(tm.taskId)}
                                        className="w-full text-left rounded-lg border px-3 py-2 cursor-pointer border-zinc-800/30 bg-zinc-900/20 hover:border-zinc-700/50 hover:bg-zinc-800/30 transition-colors group"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <span className="font-mono text-[10px] text-zinc-500 flex-shrink-0">
                                                    {tm.taskId}
                                                </span>
                                                <span className="text-xs text-zinc-400 truncate">
                                                    {tm.taskName}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <StatusBadge status={tm.endStatus} />
                                                <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

interface SquadTodoRow {
    movement: TaskMovement;
    people: string[];
}

interface SquadSharedTasksTableProps {
    rows: SquadTodoRow[];
    onTaskClick: (taskId: string) => void;
}

function SquadSharedTasksTable({ rows, onTaskClick }: SquadSharedTasksTableProps) {
    const sortedRows = [...rows].sort((a, b) => {
        const order: Record<string, number> = { forward: 0, same: 1, 'no-change': 2, backward: 3, new: 4 };
        return (order[a.movement.movementType] ?? 99) - (order[b.movement.movementType] ?? 99);
    });

    if (sortedRows.length === 0) {
        return (
            <div className="text-center py-12 text-zinc-500">
                <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No shared squad tasks for this day.</p>
                <p className="text-sm mt-1">
                    We only list tasks that all selected people touched today.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-sm font-semibold text-zinc-100 mb-0.5">
                        Today&apos;s shared squad tasks
                    </h2>
                    <p className="text-[11px] text-zinc-500">
                        Each row is a task that all selected people worked on today.
                    </p>
                </div>
                <Badge className="bg-indigo-950/40 border-indigo-700/60 text-indigo-200 text-[10px] px-2 py-1">
                    {sortedRows.length} shared task{sortedRows.length !== 1 ? 's' : ''}
                </Badge>
            </div>

            <div className="overflow-x-auto border border-zinc-800/60 rounded-xl bg-zinc-950/40">
                <table className="w-full min-w-[720px] text-xs">
                    <thead className="bg-zinc-900/60 border-b border-zinc-800/60">
                        <tr>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                Task
                            </th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                People on this task
                            </th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                                Movement today
                            </th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500 w-[90px]">
                                Events
                            </th>
                            <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500 w-[36px]">
                                {/* chevron */}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-900/70">
                        {sortedRows.map(row => {
                            const tm = row.movement;
                            const people = row.people;
                            const isForward = tm.movementType === 'forward';
                            const isBackward = tm.movementType === 'backward';
                            const isSame = tm.movementType === 'same';
                            const isNoChange = tm.movementType === 'no-change';

                            const movementLabel = isForward
                                ? 'Moved forward'
                                : isBackward
                                    ? 'Regressed'
                                    : isSame
                                        ? 'Activity, same status'
                                        : isNoChange
                                            ? 'No movement'
                                            : 'New task';

                            const movementColor = isForward
                                ? 'text-emerald-300'
                                : isBackward
                                    ? 'text-red-300'
                                    : isSame
                                        ? 'text-amber-300'
                                        : 'text-zinc-400';

                            return (
                                <tr
                                    key={tm.taskId}
                                    onClick={() => onTaskClick(tm.taskId)}
                                    className="hover:bg-zinc-900/80 cursor-pointer transition-colors"
                                >
                                    <td className="px-3 py-2 align-top">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-mono text-[11px] text-zinc-400">
                                                {tm.taskId}
                                            </span>
                                            <span className="text-xs text-zinc-100 line-clamp-2">
                                                {tm.taskName}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                        <div className="flex flex-wrap gap-1">
                                            {people.map(p => (
                                                <span
                                                    key={p}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-[11px] text-zinc-200"
                                                >
                                                    <User className="w-3 h-3 text-zinc-500" />
                                                    {p}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                        <div className="flex flex-col gap-0.5">
                                            <span className={`text-[11px] font-semibold ${movementColor}`}>
                                                {movementLabel}
                                            </span>
                                            <StatusChainDisplay movement={tm} />
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                        <div className="flex flex-col gap-0.5 text-[11px] text-zinc-400">
                                            <span>{tm.eventCount} event{tm.eventCount !== 1 ? 's' : ''}</span>
                                            {tm.lastEventTime && (
                                                <span className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    Last: {format(new Date(tm.lastEventTime), 'HH:mm')}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 align-top">
                                        <div className="flex justify-center pt-2">
                                            <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export function DailyRecapView({ rawLogs, sprintStartDate, onTaskClick }: DailyRecapViewProps) {
    const [selectedDate, setSelectedDate] = useState<Date>(() => subDays(new Date(), 1));
    const [selectedPersonsFilter, setSelectedPersonsFilter] = useState<Set<string>>(new Set());
    const [viewMode, setViewMode] = useState<'recap' | 'squad'>('recap');
    const { roles } = useRoles();
    const { getTodosForPersonDate } = useDailyTodos();

    const movementData = useDailyMovement(rawLogs, selectedDate);

    const filteredMovementData = useMemo(() => {
        if (selectedPersonsFilter.size === 0) {
            return movementData;
        }

        const filteredPersons = movementData.personMovements.filter((p: PersonDailyMovement) => selectedPersonsFilter.has(p.person));

        const distinctForward = new Set<string>();
        const distinctBackward = new Set<string>();
        const distinctSame = new Set<string>();
        const distinctNoChange = new Set<string>();

        filteredPersons.forEach((p: PersonDailyMovement) => {
            p.movedForward.forEach((tm: TaskMovement) => distinctForward.add(tm.taskId));
            p.movedBackward.forEach((tm: TaskMovement) => distinctBackward.add(tm.taskId));
            p.sameWithEvents.forEach((tm: TaskMovement) => distinctSame.add(tm.taskId));
            p.noChange.forEach((tm: TaskMovement) => distinctNoChange.add(tm.taskId));
        });

        let topMover: string | null = null;
        let maxForward = 0;
        filteredPersons.forEach((p: PersonDailyMovement) => {
            if (p.forwardCount > maxForward) {
                maxForward = p.forwardCount;
                topMover = p.person;
            }
        });

        // Compute Shared Tasks: tasks touched by >= 2 distinct persons in the selected filter
        const taskPersonCounts: Record<string, Set<string>> = {};
        const allFilteredTaskMovements: Record<string, TaskMovement> = {};

        filteredPersons.forEach((p: PersonDailyMovement) => {
            const allTasksForPerson = [
                ...p.movedForward,
                ...p.movedBackward,
                ...p.sameWithEvents,
                ...p.noChange,
            ];

            allTasksForPerson.forEach((tm: TaskMovement) => {
                if (!taskPersonCounts[tm.taskId]) {
                    taskPersonCounts[tm.taskId] = new Set();
                }
                taskPersonCounts[tm.taskId].add(p.person);
                // Keep one reference of the movement object for rendering
                allFilteredTaskMovements[tm.taskId] = tm;
            });
        });

        const sharedTaskIds = Object.keys(taskPersonCounts).filter((taskId: string) => taskPersonCounts[taskId].size === selectedPersonsFilter.size);
        
        const sharedSquadData: PersonDailyMovement | null = sharedTaskIds.length > 0 && selectedPersonsFilter.size > 1 ? {
            person: 'Shared Squad Progress',
            movedForward: [],
            movedBackward: [],
            sameWithEvents: [],
            noChange: [],
            totalTasks: sharedTaskIds.length,
            forwardCount: 0,
            backwardCount: 0,
            totalEventsOnDay: 0,
            urgencyScore: 0,
        } : null;

        if (sharedSquadData) {
            sharedTaskIds.forEach(taskId => {
                const tm = allFilteredTaskMovements[taskId];
                sharedSquadData.totalEventsOnDay += tm.eventCount;

                switch (tm.movementType) {
                    case 'forward':
                        sharedSquadData.movedForward.push(tm);
                        sharedSquadData.forwardCount++;
                        break;
                    case 'backward':
                        sharedSquadData.movedBackward.push(tm);
                        sharedSquadData.backwardCount++;
                        break;
                    case 'same':
                        sharedSquadData.sameWithEvents.push(tm);
                        break;
                    case 'no-change':
                        sharedSquadData.noChange.push(tm);
                        break;
                }
            });
        }

        // Return augmented object
        return {
            ...movementData,
            totalForward: distinctForward.size,
            totalBackward: distinctBackward.size,
            totalSameWithEvents: distinctSame.size,
            totalNoChange: distinctNoChange.size,
            totalTasksWithMovement: new Set([
                ...distinctForward,
                ...distinctBackward,
                ...distinctSame,
            ]).size,
            topMover,
            personMovements: filteredPersons,
            sharedSquadData: sharedSquadData,
        } as DailyMovementSummary & { sharedSquadData: PersonDailyMovement | null };
    }, [movementData, selectedPersonsFilter]);

    const sortedAllPersons = useMemo(() => {
        const persons = movementData.personMovements.map((p: PersonDailyMovement) => p.person);
        return persons.sort((a: string, b: string) => {
            const roleA = roles[a] || 'Other';
            const roleB = roles[b] || 'Other';
            const indexA = ROLE_ORDER.indexOf(roleA as ValidRole);
            const indexB = ROLE_ORDER.indexOf(roleB as ValidRole);
            const posA = indexA === -1 ? 99 : indexA;
            const posB = indexB === -1 ? 99 : indexB;
            if (posA !== posB) return posA - posB;
            return a.localeCompare(b);
        });
    }, [movementData.personMovements, roles]);

    const canGoBack = useMemo(() => {
        if (!sprintStartDate) return true;
        const sprintStart = startOfDay(new Date(sprintStartDate));
        return isBefore(sprintStart, startOfDay(selectedDate));
    }, [selectedDate, sprintStartDate]);

    const canGoForward = !isToday(selectedDate);

    const navigateDate = (direction: 'prev' | 'next') => {
        setSelectedDate(prev => {
            const newDate = new Date(prev);
            newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
            if (direction === 'next' && isToday(newDate)) return new Date();
            if (direction === 'next' && newDate > new Date()) return prev;
            if (direction === 'prev' && sprintStartDate && isBefore(newDate, new Date(sprintStartDate))) {
                return prev;
            }
            return newDate;
        });
    };

    const quickDateOptions = [
        { label: 'Yesterday', date: subDays(new Date(), 1), active: isYesterday(selectedDate) },
        { label: '2 days ago', date: subDays(new Date(), 2), active: false },
        { label: '3 days ago', date: subDays(new Date(), 3), active: false },
    ];

    const getDateLabel = () => {
        if (isToday(selectedDate)) return 'Today';
        if (isYesterday(selectedDate)) return 'Yesterday';
        return format(selectedDate, 'EEEE, MMM d');
    };

    return (
        <div className="space-y-4">
            {/* Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-800/50">
                {/* Day Selector */}
                <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-zinc-700 bg-zinc-900 p-0.5">
                        <button
                            onClick={() => navigateDate('prev')}
                            disabled={!canGoBack}
                            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-2 px-3 py-1">
                            <Calendar className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-medium text-zinc-200 min-w-[140px] text-center">
                                {getDateLabel()}
                            </span>
                        </div>
                        <button
                            onClick={() => navigateDate('next')}
                            disabled={!canGoForward}
                            className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Quick Date Options */}
                    <div className="flex items-center gap-1">
                        {quickDateOptions.map(opt => (
                            <button
                                key={opt.label}
                                onClick={() => setSelectedDate(opt.date)}
                                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                                    format(selectedDate, 'yyyy-MM-dd') === format(opt.date, 'yyyy-MM-dd')
                                        ? 'bg-blue-600 text-white'
                                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-col gap-1 items-end">
                    {/* Summary Stats */}
                    <div className="flex items-center gap-3 text-[10px]">
                        <div className="flex items-center gap-1 text-emerald-400">
                            <TrendingUp className="w-3 h-3" />
                            <span className="font-mono">{filteredMovementData.totalForward} forward</span>
                        </div>
                        <div className="flex items-center gap-1 text-red-400">
                            <TrendingDown className="w-3 h-3" />
                            <span className="font-mono">{filteredMovementData.totalBackward} backward</span>
                        </div>
                        <div className="flex items-center gap-1 text-amber-400">
                            <Activity className="w-3 h-3" />
                            <span className="font-mono">{filteredMovementData.totalSameWithEvents} same</span>
                        </div>
                        <div className="flex items-center gap-1 text-zinc-500">
                            <Minus className="w-3 h-3" />
                            <span className="font-mono">{filteredMovementData.totalNoChange} unchanged</span>
                        </div>
                        {filteredMovementData.topMover && (
                            <div className="flex items-center gap-1 text-blue-400 border-l border-zinc-700 pl-3 ml-1">
                                <User className="w-3 h-3" />
                                <span className="font-mono">Top: {filteredMovementData.topMover}</span>
                            </div>
                        )}
                    </div>

                    {/* View Mode Toggle */}
                    <div className="inline-flex items-center rounded-full bg-zinc-900 border border-zinc-700 p-0.5 text-[10px]">
                        <button
                            onClick={() => setViewMode('recap')}
                            className={`px-3 py-1 rounded-full font-semibold uppercase tracking-wide transition-colors ${
                                viewMode === 'recap'
                                    ? 'bg-blue-600 text-white shadow-sm shadow-blue-900/40'
                                    : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                        >
                            Daily Recap
                        </button>
                        <button
                            onClick={() => setViewMode('squad')}
                            className={`px-3 py-1 rounded-full font-semibold uppercase tracking-wide transition-colors ${
                                viewMode === 'squad'
                                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-900/40'
                                    : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                        >
                            Squad Shared To‑Do
                        </button>
                    </div>
                </div>
            </div>

            {/* Personnel Selector Row */}
            {movementData.personMovements.length > 0 && (
                <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-800 flex flex-col gap-2 flex-shrink-0">
                    <div className="flex items-center gap-2 mb-1">
                        <Users className="w-4 h-4 text-indigo-400" />
                        <span className="font-semibold text-zinc-200 text-sm">
                            Pick people to track as a squad
                        </span>
                    </div>
                    <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                        {sortedAllPersons.map((person: string) => {
                            const isSelected = selectedPersonsFilter.has(person);
                            return (
                                <button
                                    key={person}
                                    onClick={() => {
                                        const next = new Set(selectedPersonsFilter);
                                        if (isSelected) next.delete(person);
                                        else next.add(person);
                                        setSelectedPersonsFilter(next);
                                    }}
                                    className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
                                        isSelected 
                                            ? 'bg-indigo-600 border-indigo-500 text-white shadow-[0_0_10px_rgba(79,70,229,0.3)]'
                                            : 'bg-zinc-900/80 border-zinc-700/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                                    }`}
                                >
                                    <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white/80' : 'bg-zinc-600'}`} />
                                    <span className="text-sm font-medium">{person}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Summary Card */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className={`px-4 py-3 rounded-xl flex flex-col border ${
                    filteredMovementData.totalTasksWithMovement > 0 ? 'bg-blue-950/20 border-blue-800/50' : 'bg-zinc-950 border-zinc-800'
                }`}>
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
                        <Zap className="w-3 h-3 text-blue-400" /> Total Activity
                    </span>
                    <span className={`text-2xl font-bold font-mono mt-1 ${filteredMovementData.totalTasksWithMovement > 0 ? 'text-blue-300' : 'text-zinc-100'}`}>
                        {filteredMovementData.totalTasksWithMovement}
                    </span>
                </div>
                <div className={`px-4 py-3 rounded-xl flex flex-col border ${
                    filteredMovementData.totalForward > 0 ? 'bg-emerald-950/20 border-emerald-800/50' : 'bg-zinc-950 border-zinc-800'
                }`}>
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-emerald-400" /> Forward
                    </span>
                    <span className={`text-2xl font-bold font-mono mt-1 ${filteredMovementData.totalForward > 0 ? 'text-emerald-300' : 'text-zinc-100'}`}>
                        {filteredMovementData.totalForward}
                    </span>
                </div>
                <div className={`px-4 py-3 rounded-xl flex flex-col border ${
                    filteredMovementData.totalBackward > 0 ? 'bg-red-950/20 border-red-800/50' : 'bg-zinc-950 border-zinc-800'
                }`}>
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
                        <TrendingDown className="w-3 h-3 text-red-400" /> Backward
                    </span>
                    <span className={`text-2xl font-bold font-mono mt-1 ${filteredMovementData.totalBackward > 0 ? 'text-red-300' : 'text-zinc-100'}`}>
                        {filteredMovementData.totalBackward}
                    </span>
                </div>
                <div className={`px-4 py-3 rounded-xl flex flex-col border ${
                    filteredMovementData.totalSameWithEvents > 0 ? 'bg-amber-950/20 border-amber-800/50' : 'bg-zinc-950 border-zinc-800'
                }`}>
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
                        <Activity className="w-3 h-3 text-amber-400" /> Same Status
                    </span>
                    <span className={`text-2xl font-bold font-mono mt-1 ${filteredMovementData.totalSameWithEvents > 0 ? 'text-amber-300' : 'text-zinc-100'}`}>
                        {filteredMovementData.totalSameWithEvents}
                    </span>
                </div>
                <div className={`px-4 py-3 rounded-xl flex flex-col border bg-zinc-950 border-zinc-800`}>
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
                        <Minus className="w-3 h-3" /> No Change
                    </span>
                    <span className="text-2xl font-bold font-mono mt-1 text-zinc-100">
                        {filteredMovementData.totalNoChange}
                    </span>
                </div>
            </div>

            {/* Person / Squad Cards */}
            {viewMode === 'recap' ? (
                filteredMovementData.personMovements.length === 0 ? (
                    <div className="text-center py-12 text-zinc-500">
                        <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No task data found for {getDateLabel()}</p>
                        <p className="text-sm mt-1">Try selecting a different date or different squad members</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6">
                        {/* Optional Shared Squad Progress */}
                        {filteredMovementData.sharedSquadData && (
                            <div className="w-full">
                                <h2 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                                    <Users className="w-4 h-4 text-indigo-400" />
                                    Shared Effort ({filteredMovementData.sharedSquadData.totalTasks} Tasks)
                                </h2>
                                <PersonCard
                                    personData={filteredMovementData.sharedSquadData}
                                    onTaskClick={onTaskClick}
                                    defaultExpanded={true}
                                />
                            </div>
                        )}

                        <div className="w-full">
                            {filteredMovementData.sharedSquadData && (
                                <h2 className="text-sm font-semibold text-zinc-400 mb-3 uppercase tracking-wider flex items-center gap-2">
                                    <User className="w-4 h-4 text-zinc-500" />
                                    Individual Contributions
                                </h2>
                            )}
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {filteredMovementData.personMovements.map((personData: PersonDailyMovement, idx: number) => (
                                    <PersonCard
                                        key={personData.person}
                                        personData={personData}
                                        onTaskClick={onTaskClick}
                                        defaultExpanded={idx < 3 && !filteredMovementData.sharedSquadData}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )
            ) : (
                <div className="flex flex-col gap-6">
                    {(() => {
                        const dateStr = format(selectedDate, 'yyyy-MM-dd');
                        const squadPersons = filteredMovementData.personMovements;

                        const todoTaskMap = new Map<string, Set<string>>();
                        squadPersons.forEach(personData => {
                            const todos = getTodosForPersonDate(personData.person, dateStr);
                            todos.forEach(item => {
                                if (!todoTaskMap.has(item.taskId)) {
                                    todoTaskMap.set(item.taskId, new Set());
                                }
                                todoTaskMap.get(item.taskId)!.add(personData.person);
                            });
                        });

                        const sharedTodoTaskIds = Array.from(todoTaskMap.entries())
                            .filter(([_, persons]) => persons.size >= selectedPersonsFilter.size)
                            .map(([taskId]) => taskId);

                        if (sharedTodoTaskIds.length === 0) {
                            return (
                                <div className="text-center py-12 text-zinc-500">
                                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                                    <p className="font-semibold text-zinc-300">
                                        No shared to-do items for this squad today
                                    </p>
                                    <p className="text-sm mt-1 text-zinc-500">
                                        Pick at least two people above. We&apos;ll list tasks that appear on all of their to-do lists for {getDateLabel()}.
                                    </p>
                                </div>
                            );
                        }

                        const movementByTaskId = new Map<string, TaskMovement>();
                        movementData.personMovements.forEach(personData => {
                            const all = [
                                ...personData.movedForward,
                                ...personData.movedBackward,
                                ...personData.sameWithEvents,
                                ...personData.noChange,
                            ];
                            all.forEach(tm => {
                                if (!movementByTaskId.has(tm.taskId)) {
                                    movementByTaskId.set(tm.taskId, tm);
                                }
                            });
                        });

                        const buildFallbackMovement = (taskId: string): TaskMovement => {
                            const taskLogs = rawLogs
                                .filter(l => l.taskId === taskId)
                                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                            const latest = taskLogs[0];
                            return {
                                taskId,
                                taskName: latest?.taskName ?? taskId,
                                person: 'Squad',
                                module: latest?.module ?? '',
                                screen: latest?.screen ?? '',
                                sprintGoal: latest?.sprintGoal ?? '',
                                recordLink: latest?.recordLink ?? '',
                                startStatus: null,
                                endStatus: latest?.status ?? 'Not Started',
                                movementType: 'no-change',
                                eventCount: 0,
                                lastEventTime: null,
                                eventsOnDay: [],
                                statusChain: [],
                                isNewTask: false,
                            };
                        };

                        const rows = sharedTodoTaskIds.map(taskId => {
                            const movement = movementByTaskId.get(taskId) ?? buildFallbackMovement(taskId);
                            const people: string[] = Array.from(todoTaskMap.get(taskId) ?? new Set<string>());
                            return { movement, people };
                        });

                        return (
                            <SquadSharedTasksTable
                                rows={rows}
                                onTaskClick={onTaskClick}
                            />
                        );
                    })()}
                </div>
            )}

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 text-[9px] text-zinc-600 px-2 pt-4 border-t border-zinc-800/30">
                <span className="font-semibold uppercase tracking-wider">Legend:</span>
                <div className="flex items-center gap-1">
                    <TrendingUp className="w-2.5 h-2.5 text-emerald-500" />
                    <span>Moved Forward</span>
                </div>
                <div className="flex items-center gap-1">
                    <TrendingDown className="w-2.5 h-2.5 text-red-500" />
                    <span>Moved Backward (Regression)</span>
                </div>
                <div className="flex items-center gap-1">
                    <Activity className="w-2.5 h-2.5 text-amber-500" />
                    <span>Activity, Same Status</span>
                </div>
                <div className="flex items-center gap-1">
                    <Minus className="w-2.5 h-2.5 text-zinc-500" />
                    <span>No Change</span>
                </div>
            </div>
        </div>
    );
}
