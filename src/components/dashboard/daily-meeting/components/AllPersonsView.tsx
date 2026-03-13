import React from 'react';
import { TaskAnalysis, MeetingNote } from '@/lib/types';
import { Badge } from '../../../ui/badge';
import { AlertTriangle, ChevronRight, Clock, Hand, PlayCircle, UserX } from 'lucide-react';
import { PersonMeetingData, CategoryFilterKey } from '../types';
import { priorityDotColor } from '../utils';

interface AllPersonsViewProps {
    personData: PersonMeetingData[];
    categoryFilter: Record<CategoryFilterKey, boolean>;
    highRiskIds: Set<string>;
    onTaskClick: (taskId: string) => void;
    meetingNotes: Record<string, MeetingNote[]>;
}

export function AllPersonsView({ personData, categoryFilter, highRiskIds, onTaskClick, meetingNotes }: AllPersonsViewProps) {
    const renderTaskButton = (task: TaskAnalysis, colorScheme: 'doing' | 'blocking' | 'blocked' | 'notStarted') => {
        const isHighRisk = highRiskIds.has(task.taskId);
        const colorClasses = {
            doing: 'bg-zinc-900/50 border-zinc-800/30 hover:bg-zinc-800/50 hover:border-zinc-700/50 text-zinc-300',
            blocking: 'bg-amber-950/20 border-amber-800/30 hover:bg-amber-900/30 hover:border-amber-700/50 text-amber-200',
            blocked: 'bg-red-950/20 border-red-800/30 hover:bg-red-900/30 hover:border-red-700/50 text-red-200',
            notStarted: 'bg-zinc-900/50 border-zinc-800/30 hover:bg-zinc-800/50 hover:border-zinc-700/50 text-zinc-300',
        };

        return (
            <button
                key={task.taskId}
                onClick={() => onTaskClick(task.taskId)}
                className={`w-full text-left px-2 py-1.5 rounded border transition-colors group ${colorClasses[colorScheme]}`}
            >
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${priorityDotColor(task.currentStatus)}`} />
                    {isHighRisk && (
                        <span className="text-red-500 text-[10px] font-bold flex-shrink-0">📌</span>
                    )}
                    <span className="text-[10px] font-mono text-zinc-500">{task.taskId}</span>
                    <span className="text-xs truncate flex-1">{task.taskName}</span>
                    <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
                </div>
            </button>
        );
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {personData.map((data) => {
                const hasBlocking = data.categories.blockingOthers.length > 0;
                const hasBlocked = data.categories.blockedByOthers.length > 0;
                const hasDoing = data.categories.doing.length > 0;

                return (
                    <div
                        key={data.person}
                        className={`rounded-xl border p-4 transition-all ${
                            hasBlocking
                                ? 'border-amber-700/60 bg-amber-950/10'
                                : hasBlocked
                                    ? 'border-red-700/40 bg-red-950/10'
                                    : hasDoing
                                        ? 'border-blue-700/40 bg-blue-950/10'
                                        : 'border-zinc-800 bg-zinc-950/50'
                        }`}
                    >
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/50">
                            <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${
                                    hasBlocking ? 'bg-amber-500 animate-pulse' :
                                    hasBlocked ? 'bg-red-500 animate-pulse' :
                                    hasDoing ? 'bg-blue-500' : 'bg-zinc-500'
                                }`} />
                                <h3 className="font-semibold text-zinc-100">{data.person}</h3>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-mono flex-wrap">
                                {categoryFilter.doing && data.categories.doing.length > 0 && (
                                    <Badge className="bg-blue-950/50 text-blue-300 border-blue-800/50">
                                        {data.categories.doing.length} doing
                                    </Badge>
                                )}
                                {categoryFilter.blockingOthers && data.categories.blockingOthers.length > 0 && (
                                    <Badge className="bg-amber-950/50 text-amber-300 border-amber-800/50">
                                        {data.categories.blockingOthers.length} blocking
                                    </Badge>
                                )}
                                {categoryFilter.blockedByOthers && data.categories.blockedByOthers.length > 0 && (
                                    <Badge className="bg-red-950/50 text-red-300 border-red-800/50">
                                        {data.categories.blockedByOthers.length} blocked
                                    </Badge>
                                )}
                                {categoryFilter.notStarted && data.categories.notStartedInSprint.length > 0 && (
                                    <Badge className="bg-orange-950/50 text-orange-300 border-orange-800/50">
                                        {data.categories.notStartedInSprint.length} no activity
                                    </Badge>
                                )}
                                {categoryFilter.other && data.categories.other.length > 0 && (
                                    <Badge className="bg-zinc-800/50 text-zinc-400 border-zinc-700/50">
                                        {data.categories.other.length} pending
                                    </Badge>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3">
                            {categoryFilter.doing && data.categories.doing.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2 text-blue-400">
                                        <PlayCircle className="w-3 h-3" />
                                        <span className="text-[10px] font-semibold uppercase">Doing</span>
                                    </div>
                                    <div className="space-y-1">
                                        {data.categories.doing.map((task) => renderTaskButton(task, 'doing'))}
                                    </div>
                                </div>
                            )}

                            {categoryFilter.blockingOthers && data.categories.blockingOthers.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2 text-amber-400">
                                        <Hand className="w-3 h-3" />
                                        <span className="text-[10px] font-semibold uppercase">Blocking others</span>
                                    </div>
                                    <div className="space-y-1">
                                        {data.categories.blockingOthers.map((task) => renderTaskButton(task, 'blocking'))}
                                    </div>
                                </div>
                            )}

                            {categoryFilter.blockedByOthers && data.categories.blockedByOthers.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2 text-red-400">
                                        <UserX className="w-3 h-3" />
                                        <span className="text-[10px] font-semibold uppercase">Blocked by others</span>
                                    </div>
                                    <div className="space-y-1">
                                        {data.categories.blockedByOthers.map((task) => renderTaskButton(task, 'blocked'))}
                                    </div>
                                </div>
                            )}

                            {categoryFilter.notStarted && data.categories.notStartedInSprint.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2 text-orange-400">
                                        <AlertTriangle className="w-3 h-3" />
                                        <span className="text-[10px] font-semibold uppercase">No Activity in Sprint</span>
                                    </div>
                                    <div className="space-y-1">
                                        {data.categories.notStartedInSprint.map((task) => renderTaskButton(task, 'notStarted'))}
                                    </div>
                                </div>
                            )}

                            {categoryFilter.other && data.categories.other.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2 text-zinc-400">
                                        <Clock className="w-3 h-3" />
                                        <span className="text-[10px] font-semibold uppercase">Pending</span>
                                    </div>
                                    <div className="space-y-1">
                                        {data.categories.other.map((task) => renderTaskButton(task, 'notStarted'))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
