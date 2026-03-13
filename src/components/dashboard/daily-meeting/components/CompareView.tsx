import React, { useMemo } from 'react';
import { TaskAnalysis, RawLogEvent } from '@/lib/types';
import { useDailyTodos } from '@/lib/hooks/useDailyTodos';
import { format, subDays } from 'date-fns';
import { Badge } from '../../../ui/badge';
import {
    ArrowRight,
    Calendar,
    CheckCircle2,
    Check,
    ChevronRight,
    Circle,
    Clock,
    Hand,
    History,
    Lightbulb,
    Plus,
    Repeat,
    Sparkles,
    Target,
    TrendingUp,
    Users,
} from 'lucide-react';
import { PersonMeetingData } from '../types';
import { priorityDotColor, statusBadge } from '../utils';

interface CompareViewProps {
    personData: PersonMeetingData;
    analyses: Record<string, TaskAnalysis>;
    highRiskIds: Set<string>;
    onTaskClick: (taskId: string) => void;
    dailyTodos: ReturnType<typeof useDailyTodos>;
    rawLogs: RawLogEvent[];
}

export function CompareView({
    personData,
    analyses,
    highRiskIds,
    onTaskClick,
    dailyTodos,
    rawLogs,
}: CompareViewProps) {
    const today = new Date();
    const yesterday = subDays(today, 1);
    const todayStr = format(today, 'yyyy-MM-dd');
    const yesterdayStr = format(yesterday, 'yyyy-MM-dd');

    const todayTodos = dailyTodos.getTodosForPersonDate(personData.person, todayStr);
    const yesterdayTodos = dailyTodos.getTodosForPersonDate(personData.person, yesterdayStr);

    const yesterdayCompleted = yesterdayTodos.filter((t) => t.completedAt);
    const yesterdayIncomplete = yesterdayTodos.filter((t) => !t.completedAt);

    const todayTaskIds = new Set(todayTodos.map((t) => t.taskId));
    const carryOverTasks = yesterdayIncomplete.filter((t) => !todayTaskIds.has(t.taskId));

    const todayDateStr = format(today, 'yyyy-MM-dd');
    const systemDetectedActivity = useMemo(() => {
        const todayLogs = rawLogs.filter((log) => {
            const logDate = format(new Date(log.timestamp), 'yyyy-MM-dd');
            return logDate === todayDateStr && log.person.includes(personData.person);
        });
        const activeTaskIds = new Set(todayLogs.map((l) => l.taskId));
        return Array.from(activeTaskIds)
            .map((taskId) => analyses[taskId])
            // Treat "Staging Passed" as still relevant activity; only hide fully completed tasks.
            .filter((t): t is TaskAnalysis => !!t && t.currentStatus !== 'Completed');
    }, [rawLogs, todayDateStr, personData.person, analyses]);

    const plannedTaskIds = new Set(todayTodos.map((t) => t.taskId));
    const blockingTaskIds = new Set(personData.categories.blockingOthers.map((t) => t.taskId));
    
    const unplannedActivity = useMemo(() => {
        const unplanned = systemDetectedActivity.filter((t) => !plannedTaskIds.has(t.taskId));
        return unplanned.sort((a, b) => {
            const aIsBlocking = blockingTaskIds.has(a.taskId) ? 1 : 0;
            const bIsBlocking = blockingTaskIds.has(b.taskId) ? 1 : 0;
            const aIsStale = a.isStale ? 1 : 0;
            const bIsStale = b.isStale ? 1 : 0;
            const aScore = aIsBlocking * 10 + aIsStale * 5;
            const bScore = bIsBlocking * 10 + bIsStale * 5;
            return bScore - aScore;
        });
    }, [systemDetectedActivity, plannedTaskIds, blockingTaskIds]);
    
    const plannedWithActivity = systemDetectedActivity.filter((t) => plannedTaskIds.has(t.taskId));

    const yesterdayCompletionRate = yesterdayTodos.length > 0
        ? Math.round((yesterdayCompleted.length / yesterdayTodos.length) * 100)
        : 0;

    const planningHints = useMemo(() => {
        const hints: { type: 'warning' | 'success' | 'info'; message: string; icon: React.ReactNode }[] = [];

        if (carryOverTasks.length > 0) {
            hints.push({
                type: 'warning',
                message: `${carryOverTasks.length} task${carryOverTasks.length > 1 ? 's' : ''} from yesterday not completed and not in today's plan`,
                icon: <Repeat className="w-3.5 h-3.5" />,
            });
        }

        if (yesterdayCompletionRate === 100 && yesterdayTodos.length > 0) {
            hints.push({
                type: 'success',
                message: 'Great job! You completed all planned tasks yesterday',
                icon: <CheckCircle2 className="w-3.5 h-3.5" />,
            });
        } else if (yesterdayCompletionRate < 50 && yesterdayTodos.length >= 3) {
            hints.push({
                type: 'warning',
                message: 'Consider planning fewer tasks - yesterday\'s completion rate was low',
                icon: <TrendingUp className="w-3.5 h-3.5" />,
            });
        }

        if (unplannedActivity.length > 0) {
            hints.push({
                type: 'info',
                message: `${unplannedActivity.length} unplanned task${unplannedActivity.length > 1 ? 's' : ''} detected with activity today`,
                icon: <Sparkles className="w-3.5 h-3.5" />,
            });
        }

        if (todayTodos.length === 0 && personData.allTasks.length > 0) {
            hints.push({
                type: 'info',
                message: 'No tasks planned for today yet',
                icon: <Calendar className="w-3.5 h-3.5" />,
            });
        }

        const blockingCount = personData.categories.blockingOthers.length;
        if (blockingCount > 0 && !todayTodos.some((t) => personData.categories.blockingOthers.some((bt) => bt.taskId === t.taskId))) {
            hints.push({
                type: 'warning',
                message: `You have ${blockingCount} blocking task${blockingCount > 1 ? 's' : ''} - consider adding to today's plan`,
                icon: <Hand className="w-3.5 h-3.5" />,
            });
        }

        return hints;
    }, [carryOverTasks, yesterdayCompletionRate, yesterdayTodos, unplannedActivity, todayTodos, personData]);


    return (
        <div className="space-y-4">
            {/* Planning Hints */}
            {planningHints.length > 0 && (
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-950/30 p-4">
                    <div className="flex items-center gap-2 mb-3 text-zinc-300">
                        <Lightbulb className="w-4 h-4 text-amber-400" />
                        <span className="font-semibold text-sm">Planning Insights</span>
                    </div>
                    <div className="space-y-2">
                        {planningHints.map((hint, idx) => (
                            <div
                                key={idx}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                                    hint.type === 'warning'
                                        ? 'bg-amber-950/30 text-amber-300 border border-amber-800/30'
                                        : hint.type === 'success'
                                            ? 'bg-emerald-950/30 text-emerald-300 border border-emerald-800/30'
                                            : 'bg-blue-950/30 text-blue-300 border border-blue-800/30'
                                }`}
                            >
                                {hint.icon}
                                <span>{hint.message}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Comparison Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Yesterday's Plan */}
                <div className="rounded-xl border border-zinc-800/50 bg-zinc-950/30 p-4">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/50">
                        <div className="flex items-center gap-2">
                            <History className="w-4 h-4 text-purple-400" />
                            <h3 className="font-semibold text-zinc-100">Yesterday's Plan</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            {yesterdayTodos.length > 0 && (
                                <div className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                                    yesterdayCompletionRate === 100
                                        ? 'bg-emerald-950/50 text-emerald-300'
                                        : yesterdayCompletionRate >= 50
                                            ? 'bg-amber-950/50 text-amber-300'
                                            : 'bg-red-950/50 text-red-300'
                                }`}>
                                    {yesterdayCompletionRate}% done
                                </div>
                            )}
                            <Badge variant="outline" className="text-[10px]">
                                {yesterdayTodos.length} planned
                            </Badge>
                        </div>
                    </div>

                    {yesterdayTodos.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500 text-sm">
                            No tasks were planned for yesterday
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {/* Completed */}
                            {yesterdayCompleted.length > 0 && (
                                <div className="mb-3">
                                    <div className="flex items-center gap-2 mb-2 text-emerald-400">
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span className="text-[10px] font-semibold uppercase">Completed ({yesterdayCompleted.length})</span>
                                    </div>
                                    <div className="space-y-1">
                                        {yesterdayCompleted.map((todoItem) => {
                                            const task = analyses[todoItem.taskId];
                                            if (!task) return null;
                                            const blockedByLabel =
                                                task.blockedBy && task.blockedBy !== personData.person
                                                    ? task.blockedBy
                                                    : undefined;
                                            return (
                                                <button
                                                    key={todoItem.taskId}
                                                    onClick={() => onTaskClick(task.taskId)}
                                                    className="w-full text-left px-2 py-1.5 rounded bg-emerald-950/20 border border-emerald-800/30 hover:bg-emerald-900/30 hover:border-emerald-700/50 transition-colors group"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <Check className="w-3 h-3 text-emerald-500" />
                                                        <div className={`w-2 h-2 rounded-full ${priorityDotColor(task.currentStatus)}`} />
                                                        {highRiskIds.has(task.taskId) && (
                                                            <span className="text-red-500 text-[10px] font-bold flex-shrink-0">📌</span>
                                                        )}
                                                        <span className="text-[10px] font-mono text-zinc-500">{task.taskId}</span>
                                                        <span className="text-xs text-zinc-400 truncate flex-1 line-through">{task.taskName}</span>
                                                        <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1 ml-5 flex-wrap">
                                                        {statusBadge(task.currentStatus)}
                                                        {task.sprintGoal && (
                                                            <span className="text-[9px] text-zinc-500 truncate max-w-[140px]" title={task.sprintGoal}>
                                                                <Target className="w-2.5 h-2.5 inline mr-0.5 align-middle" />
                                                                {task.sprintGoal}
                                                            </span>
                                                        )}
                                                        {blockedByLabel && (
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-950/50 text-red-300 flex items-center gap-1">
                                                                <Hand className="w-2.5 h-2.5" />
                                                                Blocked by {blockedByLabel}
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Incomplete */}
                            {yesterdayIncomplete.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2 text-red-400">
                                        <Circle className="w-3 h-3" />
                                        <span className="text-[10px] font-semibold uppercase">Not Completed ({yesterdayIncomplete.length})</span>
                                    </div>
                                    <div className="space-y-1">
                                        {yesterdayIncomplete.map((todoItem) => {
                                            const task = analyses[todoItem.taskId];
                                            const isCarryOver = carryOverTasks.some((c) => c.taskId === todoItem.taskId);
                                            const isAddedToToday = todayTaskIds.has(todoItem.taskId);
                                            if (!task) return null;
                                            const blockedByLabel =
                                                task.blockedBy && task.blockedBy !== personData.person
                                                    ? task.blockedBy
                                                    : undefined;
                                            return (
                                                <button
                                                    key={todoItem.taskId}
                                                    onClick={() => onTaskClick(task.taskId)}
                                                    className={`w-full text-left px-2 py-1.5 rounded border transition-colors group ${
                                                        isCarryOver
                                                            ? 'bg-amber-950/20 border-amber-800/30 hover:bg-amber-900/30 hover:border-amber-700/50'
                                                            : 'bg-zinc-900/50 border-zinc-800/30 hover:bg-zinc-800/50 hover:border-zinc-700/50'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-3 h-3 rounded border border-zinc-600" />
                                                        <div className={`w-2 h-2 rounded-full ${priorityDotColor(task.currentStatus)}`} />
                                                        {highRiskIds.has(task.taskId) && (
                                                            <span className="text-red-500 text-[10px] font-bold flex-shrink-0">📌</span>
                                                        )}
                                                        <span className="text-[10px] font-mono text-zinc-500">{task.taskId}</span>
                                                        <span className="text-xs text-zinc-300 truncate flex-1">{task.taskName}</span>
                                                        {isCarryOver && (
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-300 flex items-center gap-1">
                                                                <Repeat className="w-2.5 h-2.5" />
                                                                Carry over?
                                                            </span>
                                                        )}
                                                        {isAddedToToday && (
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950/50 text-blue-300 flex items-center gap-1">
                                                                <ArrowRight className="w-2.5 h-2.5" />
                                                                In today
                                                            </span>
                                                        )}
                                                        <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1 ml-5 flex-wrap">
                                                        {statusBadge(task.currentStatus)}
                                                        {task.sprintGoal && (
                                                            <span className="text-[9px] text-zinc-500 truncate max-w-[140px]" title={task.sprintGoal}>
                                                                <Target className="w-2.5 h-2.5 inline mr-0.5 align-middle" />
                                                                {task.sprintGoal}
                                                            </span>
                                                        )}
                                                        {blockedByLabel && (
                                                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-950/50 text-red-300 flex items-center gap-1">
                                                                <Hand className="w-2.5 h-2.5" />
                                                                Blocked by {blockedByLabel}
                                                            </span>
                                                        )}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Today's Plan + System Activity */}
                <div className="rounded-xl border border-blue-800/30 bg-blue-950/10 p-4">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/50">
                        <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-blue-400" />
                            <h3 className="font-semibold text-zinc-100">Today's Plan</h3>
                        </div>
                        <div className="flex items-center gap-2">
                            {plannedWithActivity.length > 0 && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-300">
                                    {plannedWithActivity.length} active
                                </span>
                            )}
                            <Badge variant="outline" className="text-[10px] border-blue-800/50 text-blue-300">
                                {todayTodos.length} planned
                            </Badge>
                        </div>
                    </div>

                    {todayTodos.length === 0 ? (
                        <div className="text-center py-8 text-zinc-500">
                            <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                            <p className="text-sm">No tasks planned for today</p>
                            <p className="text-xs mt-1">Switch to single view to add tasks</p>
                        </div>
                    ) : (
                        <div className="space-y-1 mb-4">
                            {todayTodos.map((todoItem) => {
                                const task = analyses[todoItem.taskId];
                                if (!task) return null;
                                const hasActivity = plannedWithActivity.some((t) => t.taskId === todoItem.taskId);
                                const wasYesterday = yesterdayTodos.some((t) => t.taskId === todoItem.taskId);
                                const blockedByLabel =
                                    task.blockedBy && task.blockedBy !== personData.person
                                        ? task.blockedBy
                                        : undefined;
                                return (
                                    <button
                                        key={todoItem.taskId}
                                        onClick={() => onTaskClick(task.taskId)}
                                        className={`w-full text-left px-2 py-1.5 rounded border transition-colors group ${
                                            todoItem.completedAt
                                                ? 'bg-emerald-950/20 border-emerald-800/30 hover:bg-emerald-900/30 hover:border-emerald-700/50'
                                                : hasActivity
                                                    ? 'bg-blue-950/30 border-blue-700/40 hover:bg-blue-900/40 hover:border-blue-600/60'
                                                    : 'bg-zinc-900/50 border-zinc-800/30 hover:bg-zinc-800/50 hover:border-zinc-700/50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {todoItem.completedAt ? (
                                                <Check className="w-3 h-3 text-emerald-500" />
                                            ) : hasActivity ? (
                                                <Sparkles className="w-3 h-3 text-blue-400" />
                                            ) : (
                                                <Circle className="w-3 h-3 text-zinc-600" />
                                            )}
                                            <div className={`w-2 h-2 rounded-full ${priorityDotColor(task.currentStatus)}`} />
                                            {highRiskIds.has(task.taskId) && (
                                                <span className="text-red-500 text-[10px] font-bold flex-shrink-0">📌</span>
                                            )}
                                            <span className="text-[10px] font-mono text-zinc-500">{task.taskId}</span>
                                            <span className={`text-xs truncate flex-1 ${todoItem.completedAt ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                                                {task.taskName}
                                            </span>
                                            <div className="flex items-center gap-1">
                                                {wasYesterday && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-950/50 text-purple-300">
                                                        From yesterday
                                                    </span>
                                                )}
                                                {hasActivity && !todoItem.completedAt && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950/50 text-blue-300">
                                                        Active
                                                    </span>
                                                )}
                                            </div>
                                            <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 ml-5 flex-wrap">
                                            {statusBadge(task.currentStatus)}
                                            {task.sprintGoal && (
                                                <span className="text-[9px] text-zinc-500 truncate max-w-[140px]" title={task.sprintGoal}>
                                                    <Target className="w-2.5 h-2.5 inline mr-0.5 align-middle" />
                                                    {task.sprintGoal}
                                                </span>
                                            )}
                                            {blockedByLabel && (
                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-950/50 text-red-300 flex items-center gap-1">
                                                    <Hand className="w-2.5 h-2.5" />
                                                    Blocked by {blockedByLabel}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Unplanned Activity */}
                    {unplannedActivity.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-zinc-800/50">
                            <div className="flex items-center gap-2 mb-2 text-cyan-400">
                                <Sparkles className="w-3 h-3" />
                                <span className="text-[10px] font-semibold uppercase">Unplanned Activity Detected</span>
                                <span className="text-[9px] text-zinc-500 font-normal">(sorted by priority)</span>
                            </div>
                            <div className="space-y-1">
                                {unplannedActivity.map((task) => {
                                    const isBlocking = blockingTaskIds.has(task.taskId);
                                    const isStale = task.isStale;
                                    const isAlreadyInToday = todayTaskIds.has(task.taskId);
                                    const blockedByLabel =
                                        task.blockedBy && task.blockedBy !== personData.person
                                            ? task.blockedBy
                                            : undefined;
                                    return (
                                        <div
                                            key={task.taskId}
                                            onClick={() => onTaskClick(task.taskId)}
                                            className={`w-full text-left px-2 py-1.5 rounded border transition-colors group cursor-pointer ${
                                                isBlocking
                                                    ? 'bg-amber-950/30 border-amber-800/40 hover:bg-amber-900/40 hover:border-amber-700/60'
                                                    : isStale
                                                        ? 'bg-orange-950/20 border-orange-800/30 hover:bg-orange-900/30 hover:border-orange-700/50'
                                                        : 'bg-cyan-950/20 border-cyan-800/30 hover:bg-cyan-900/30 hover:border-cyan-700/50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2">
                                                {isBlocking ? (
                                                    <Hand className="w-3 h-3 text-amber-400" />
                                                ) : isStale ? (
                                                    <Clock className="w-3 h-3 text-orange-400" />
                                                ) : (
                                                    <Sparkles className="w-3 h-3 text-cyan-400" />
                                                )}
                                                <div className={`w-2 h-2 rounded-full ${priorityDotColor(task.currentStatus)}`} />
                                                {highRiskIds.has(task.taskId) && (
                                                    <span className="text-red-500 text-[10px] font-bold flex-shrink-0">📌</span>
                                                )}
                                                <span className="text-[10px] font-mono text-zinc-500">
                                                    {task.taskId}
                                                </span>
                                                <span className={`text-xs truncate flex-1 ${
                                                    isBlocking ? 'text-amber-200' : isStale ? 'text-orange-200' : 'text-cyan-200'
                                                }`}>
                                                    {task.taskName}
                                                </span>
                                                {!isAlreadyInToday && (
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                dailyTodos.addTodo(personData.person, todayStr, task.taskId);
                                                            }}
                                                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-medium transition-colors"
                                                            title="Add to today's plan"
                                                        >
                                                            <Plus className="w-2.5 h-2.5" />
                                                            Add to Today
                                                        </button>
                                                        {task.currentPerson && task.currentPerson.split(',').map(p => p.trim()).filter(Boolean).length > 1 && (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    const assignees = task.currentPerson.split(',').map(p => p.trim()).filter(Boolean);
                                                                    assignees.forEach(assignee => {
                                                                        dailyTodos.addTodo(assignee, todayStr, task.taskId);
                                                                    });
                                                                }}
                                                                className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-medium transition-colors"
                                                                title="Add for all assignees"
                                                            >
                                                                <Users className="w-2.5 h-2.5" />
                                                                Add for All
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                                {isAlreadyInToday && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950/50 text-blue-300">
                                                        In today's plan
                                                    </span>
                                                )}
                                                <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
                                            </div>
                                            <div className="flex items-center gap-2 mt-1 ml-5 flex-wrap">
                                                {statusBadge(task.currentStatus)}
                                                {task.sprintGoal && (
                                                    <span className="text-[9px] text-zinc-500 truncate max-w-[140px]" title={task.sprintGoal}>
                                                        <Target className="w-2.5 h-2.5 inline mr-0.5 align-middle" />
                                                        {task.sprintGoal}
                                                    </span>
                                                )}
                                                {blockedByLabel && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-950/50 text-red-300 flex items-center gap-1">
                                                        <Hand className="w-2.5 h-2.5" />
                                                        Blocked by {blockedByLabel}
                                                    </span>
                                                )}
                                                {isStale && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-950/50 text-orange-300 flex items-center gap-1">
                                                        <Clock className="w-2.5 h-2.5" />
                                                        No status change
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 text-[9px] text-zinc-500 px-2">
                <div className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span>Completed</span>
                </div>
                <div className="flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-blue-400" />
                    <span>Has activity</span>
                </div>
                <div className="flex items-center gap-1">
                    <Repeat className="w-3 h-3 text-amber-400" />
                    <span>Carry-over candidate</span>
                </div>
                <div className="flex items-center gap-1">
                    <Circle className="w-3 h-3 text-zinc-500" />
                    <span>Not started</span>
                </div>
            </div>
        </div>
    );
}
