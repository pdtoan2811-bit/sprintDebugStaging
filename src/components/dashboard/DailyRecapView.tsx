'use client';

import React, { useState, useMemo } from 'react';
import { RawLogEvent, TaskMovement, PersonDailyMovement, WORKFLOW_STATUSES } from '@/lib/types';
import { useDailyMovement } from '@/lib/hooks/useDailyMovement';
import { Badge } from '../ui/badge';
import { format, subDays, isToday, isYesterday, isBefore, startOfDay } from 'date-fns';
import {
    ArrowRight,
    ArrowDown,
    ArrowUp,
    Calendar,
    ChevronDown,
    ChevronRight,
    ChevronLeft,
    Clock,
    Minus,
    TrendingUp,
    TrendingDown,
    Activity,
    AlertTriangle,
    Sparkles,
    User,
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

export function DailyRecapView({ rawLogs, sprintStartDate, onTaskClick }: DailyRecapViewProps) {
    const [selectedDate, setSelectedDate] = useState<Date>(() => subDays(new Date(), 1));

    const movementData = useDailyMovement(rawLogs, selectedDate);

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

                {/* Summary Stats */}
                <div className="flex items-center gap-3 text-[10px]">
                    <div className="flex items-center gap-1 text-emerald-400">
                        <TrendingUp className="w-3 h-3" />
                        <span className="font-mono">{movementData.totalForward} forward</span>
                    </div>
                    <div className="flex items-center gap-1 text-red-400">
                        <TrendingDown className="w-3 h-3" />
                        <span className="font-mono">{movementData.totalBackward} backward</span>
                    </div>
                    <div className="flex items-center gap-1 text-amber-400">
                        <Activity className="w-3 h-3" />
                        <span className="font-mono">{movementData.totalSameWithEvents} same</span>
                    </div>
                    <div className="flex items-center gap-1 text-zinc-500">
                        <Minus className="w-3 h-3" />
                        <span className="font-mono">{movementData.totalNoChange} unchanged</span>
                    </div>
                    {movementData.topMover && (
                        <div className="flex items-center gap-1 text-blue-400 border-l border-zinc-700 pl-3 ml-1">
                            <User className="w-3 h-3" />
                            <span className="font-mono">Top: {movementData.topMover}</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Summary Card */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className={`px-4 py-3 rounded-xl flex flex-col border ${
                    movementData.totalTasksWithMovement > 0 ? 'bg-blue-950/20 border-blue-800/50' : 'bg-zinc-950 border-zinc-800'
                }`}>
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
                        <Zap className="w-3 h-3 text-blue-400" /> Total Activity
                    </span>
                    <span className={`text-2xl font-bold font-mono mt-1 ${movementData.totalTasksWithMovement > 0 ? 'text-blue-300' : 'text-zinc-100'}`}>
                        {movementData.totalTasksWithMovement}
                    </span>
                </div>
                <div className={`px-4 py-3 rounded-xl flex flex-col border ${
                    movementData.totalForward > 0 ? 'bg-emerald-950/20 border-emerald-800/50' : 'bg-zinc-950 border-zinc-800'
                }`}>
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-emerald-400" /> Forward
                    </span>
                    <span className={`text-2xl font-bold font-mono mt-1 ${movementData.totalForward > 0 ? 'text-emerald-300' : 'text-zinc-100'}`}>
                        {movementData.totalForward}
                    </span>
                </div>
                <div className={`px-4 py-3 rounded-xl flex flex-col border ${
                    movementData.totalBackward > 0 ? 'bg-red-950/20 border-red-800/50' : 'bg-zinc-950 border-zinc-800'
                }`}>
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
                        <TrendingDown className="w-3 h-3 text-red-400" /> Backward
                    </span>
                    <span className={`text-2xl font-bold font-mono mt-1 ${movementData.totalBackward > 0 ? 'text-red-300' : 'text-zinc-100'}`}>
                        {movementData.totalBackward}
                    </span>
                </div>
                <div className={`px-4 py-3 rounded-xl flex flex-col border ${
                    movementData.totalSameWithEvents > 0 ? 'bg-amber-950/20 border-amber-800/50' : 'bg-zinc-950 border-zinc-800'
                }`}>
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
                        <Activity className="w-3 h-3 text-amber-400" /> Same Status
                    </span>
                    <span className={`text-2xl font-bold font-mono mt-1 ${movementData.totalSameWithEvents > 0 ? 'text-amber-300' : 'text-zinc-100'}`}>
                        {movementData.totalSameWithEvents}
                    </span>
                </div>
                <div className={`px-4 py-3 rounded-xl flex flex-col border bg-zinc-950 border-zinc-800`}>
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
                        <Minus className="w-3 h-3" /> No Change
                    </span>
                    <span className="text-2xl font-bold font-mono mt-1 text-zinc-100">
                        {movementData.totalNoChange}
                    </span>
                </div>
            </div>

            {/* Person Cards */}
            {movementData.personMovements.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                    <Calendar className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No task data found for {getDateLabel()}</p>
                    <p className="text-sm mt-1">Try selecting a different date</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {movementData.personMovements.map((personData, idx) => (
                        <PersonCard
                            key={personData.person}
                            personData={personData}
                            onTaskClick={onTaskClick}
                            defaultExpanded={idx < 3}
                        />
                    ))}
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
