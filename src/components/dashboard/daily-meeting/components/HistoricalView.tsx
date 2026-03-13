import React from 'react';
import { TaskAnalysis } from '@/lib/types';
import { useDailyTodos } from '@/lib/hooks/useDailyTodos';
import { format, isToday, isYesterday } from 'date-fns';
import { Calendar, Check, CheckCircle2, ChevronRight, History, Target } from 'lucide-react';
import { PersonMeetingData } from '../types';
import { priorityDotColor, statusBadge } from '../utils';

interface HistoricalViewProps {
    personData: PersonMeetingData;
    analyses: Record<string, TaskAnalysis>;
    highRiskIds: Set<string>;
    onTaskClick: (taskId: string) => void;
    dailyTodos: ReturnType<typeof useDailyTodos>;
}

export function HistoricalView({
    personData,
    analyses,
    highRiskIds,
    onTaskClick,
    dailyTodos,
}: HistoricalViewProps) {
    const history = dailyTodos.getHistoricalTodos(personData.person, 14);
    const pastHistory = history.filter((entry) => !isToday(new Date(entry.date)));

    if (pastHistory.length === 0) {
        return (
            <div className="text-center py-12 text-zinc-500">
                <History className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No history yet</p>
                <p className="text-xs mt-1">Past daily plans will appear here</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {pastHistory.map((entry) => {
                const date = new Date(entry.date);
                const completed = entry.items.filter((i) => i.completedAt).length;
                const total = entry.items.length;
                
                return (
                    <div
                        key={entry.date}
                        className="rounded-xl border border-zinc-800/50 bg-zinc-950/30 p-4"
                    >
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800/30">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-zinc-500" />
                                <span className="font-medium text-zinc-200">
                                    {isYesterday(date) ? 'Yesterday' : format(date, 'EEEE, MMM d')}
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                                    completed === total && total > 0
                                        ? 'bg-emerald-950/50 text-emerald-300'
                                        : completed > 0
                                            ? 'bg-amber-950/50 text-amber-300'
                                            : 'bg-zinc-800 text-zinc-400'
                                }`}>
                                    {completed}/{total} completed
                                </div>
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            {entry.items.map((todoItem) => {
                                const task = analyses[todoItem.taskId];
                                if (!task) {
                                    return (
                                        <div
                                            key={todoItem.taskId}
                                            className="px-3 py-2 rounded-lg bg-zinc-900/50 border border-zinc-800/30"
                                        >
                                            <span className="text-xs text-zinc-500 font-mono">
                                                {todoItem.taskId} (task no longer in sprint)
                                            </span>
                                        </div>
                                    );
                                }
                                return (
                                    <div
                                        key={todoItem.taskId}
                                        onClick={() => onTaskClick(task.taskId)}
                                        className={`px-3 py-2 rounded-lg border cursor-pointer transition-colors group ${
                                            todoItem.completedAt
                                                ? 'border-emerald-800/30 bg-emerald-950/10 hover:border-emerald-700/50 hover:bg-emerald-950/20'
                                                : 'border-zinc-800/30 bg-zinc-900/30 hover:border-zinc-700/50 hover:bg-zinc-800/50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {todoItem.completedAt ? (
                                                <Check className="w-3 h-3 text-emerald-500" />
                                            ) : (
                                                <div className="w-3 h-3 rounded border border-zinc-600" />
                                            )}
                                            <div className={`w-2 h-2 rounded-full ${priorityDotColor(task.currentStatus)}`} />
                                            {highRiskIds.has(task.taskId) && (
                                                <span className="text-red-500 text-[10px] font-bold flex-shrink-0">📌</span>
                                            )}
                                            <span className="font-mono text-[10px] text-zinc-500">{task.taskId}</span>
                                            <span className={`text-xs truncate flex-1 ${todoItem.completedAt ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                                                {task.taskName}
                                            </span>
                                            <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
                                        </div>
                                        <div className="flex items-center gap-2 mt-1 ml-5">
                                            {statusBadge(task.currentStatus)}
                                            {task.sprintGoal && (
                                                <span className={`text-[9px] flex items-center gap-1 ${task.currentStatus === task.sprintGoal ? 'text-emerald-400' : 'text-zinc-600'}`}>
                                                    {task.currentStatus === task.sprintGoal ? (
                                                        <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                                                    ) : (
                                                        <Target className="w-2 h-2" />
                                                    )}
                                                    {task.sprintGoal}
                                                    {task.currentStatus === task.sprintGoal && (
                                                        <span className="ml-1 text-[8px] px-1 py-0.5 rounded bg-emerald-950/50 text-emerald-300 font-semibold">MET</span>
                                                    )}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
