'use client';

import React, { useMemo, useState, useCallback, DragEvent } from 'react';
import { TaskAnalysis, MeetingNote, RawLogEvent } from '@/lib/types';
import { getStatusSeverity, isBottleneckStatus } from '@/lib/workflow-engine';
import { useDailyTodos, DailyTodoItem } from '@/lib/hooks/useDailyTodos';
import { Badge } from '../ui/badge';
import { format, subDays, isToday, isYesterday } from 'date-fns';
import {
    AlertTriangle,
    ArrowRight,
    ArrowRightLeft,
    Calendar,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Circle,
    Clock,
    GitCompare,
    GripVertical,
    Hand,
    History,
    Layers,
    Lightbulb,
    PlayCircle,
    Plus,
    RefreshCw,
    Repeat,
    Sparkles,
    Target,
    TrendingUp,
    Trash2,
    User,
    UserX,
    Users,
    Zap,
} from 'lucide-react';

interface DailyMeetingViewProps {
    analyses: Record<string, TaskAnalysis>;
    meetingNotes: Record<string, MeetingNote[]>;
    rawLogs: RawLogEvent[];
    sprintStartSnapshot: Record<string, string>;
    highRiskIds: Set<string>;
    onTaskClick: (taskId: string) => void;
}

interface TaskCategory {
    doing: TaskAnalysis[];
    blockingOthers: TaskAnalysis[];
    blockedByOthers: TaskAnalysis[];
    notStartedInSprint: TaskAnalysis[];
}

interface PersonMeetingData {
    person: string;
    categories: TaskCategory;
    allTasks: TaskAnalysis[];
    totalTasks: number;
    urgencyScore: number;
}

const ACTIVE_STATUSES = new Set([
    'In Process',
    'Bug Fixing',
    'Testing',
    'Reviewing',
]);

function getLatestMeetingNote(notes: MeetingNote[]): MeetingNote | null {
    if (!notes || notes.length === 0) return null;
    return [...notes].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
}

function hasActivityInSprint(
    taskId: string,
    logs: RawLogEvent[],
    sprintStartSnapshot: Record<string, string>
): boolean {
    const taskLogs = logs.filter((l) => l.taskId === taskId);
    if (taskLogs.length === 0) return false;

    const startStatus = sprintStartSnapshot[taskId];
    if (!startStatus) return true;

    const hasStatusChange = taskLogs.some((log) => log.status !== startStatus);
    return hasStatusChange || taskLogs.length > 1;
}

function computePersonMeetingData(
    analyses: Record<string, TaskAnalysis>,
    meetingNotes: Record<string, MeetingNote[]>,
    rawLogs: RawLogEvent[],
    sprintStartSnapshot: Record<string, string>
): PersonMeetingData[] {
    const personMap: Record<string, TaskCategory> = {};
    const personAllTasks: Record<string, TaskAnalysis[]> = {};
    const blockingTasksByBlocker: Record<string, Set<string>> = {};

    Object.values(analyses).forEach((task) => {
        const notes = meetingNotes[task.taskId] || [];
        const latestNote = getLatestMeetingNote(notes);

        if (latestNote?.isStall && latestNote.blockedBy) {
            const blocker = latestNote.blockedBy;
            if (!blockingTasksByBlocker[blocker]) {
                blockingTasksByBlocker[blocker] = new Set();
            }
            blockingTasksByBlocker[blocker].add(task.taskId);
        }
    });

    const initCategory = (): TaskCategory => ({
        doing: [],
        blockingOthers: [],
        blockedByOthers: [],
        notStartedInSprint: [],
    });

    Object.values(analyses).forEach((task) => {
        if (task.currentStatus === 'Completed' || task.currentStatus === 'Staging Passed') {
            return;
        }

        const persons = task.currentPerson
            ? task.currentPerson.split(',').map((p) => p.trim()).filter(Boolean)
            : ['Unassigned'];

        persons.forEach((person) => {
            if (!personMap[person]) {
                personMap[person] = initCategory();
                personAllTasks[person] = [];
            }

            personAllTasks[person].push(task);

            const notes = meetingNotes[task.taskId] || [];
            const latestNote = getLatestMeetingNote(notes);
            const isBlockedByOthers = latestNote?.isStall && latestNote.blockedBy && latestNote.blockedBy !== person;
            const isBlockingOthers = blockingTasksByBlocker[person]?.has(task.taskId);
            const isDoing = ACTIVE_STATUSES.has(task.currentStatus) && !isBlockedByOthers;
            const hasActivity = hasActivityInSprint(task.taskId, rawLogs, sprintStartSnapshot);

            if (isDoing) {
                personMap[person].doing.push(task);
            } else if (isBlockingOthers) {
                personMap[person].blockingOthers.push(task);
            } else if (isBlockedByOthers) {
                personMap[person].blockedByOthers.push(task);
            } else if (!hasActivity) {
                personMap[person].notStartedInSprint.push(task);
            }
        });
    });

    Object.entries(blockingTasksByBlocker).forEach(([blocker, taskIds]) => {
        if (!personMap[blocker]) {
            personMap[blocker] = initCategory();
            personAllTasks[blocker] = [];
        }
        taskIds.forEach((taskId) => {
            const task = analyses[taskId];
            if (task && !personMap[blocker].blockingOthers.some((t) => t.taskId === taskId)) {
                personMap[blocker].blockingOthers.push(task);
            }
        });
    });

    return Object.entries(personMap)
        .map(([person, categories]) => {
            const totalTasks =
                categories.doing.length +
                categories.blockingOthers.length +
                categories.blockedByOthers.length +
                categories.notStartedInSprint.length;

            const urgencyScore =
                categories.doing.length * 4 +
                categories.blockingOthers.length * 10 +
                categories.blockedByOthers.length * 3 +
                categories.notStartedInSprint.length * 1;

            return {
                person,
                categories,
                allTasks: personAllTasks[person] || [],
                totalTasks,
                urgencyScore,
            };
        })
        .filter((p) => p.totalTasks > 0)
        .sort((a, b) => b.urgencyScore - a.urgencyScore);
}

function priorityDotColor(status: string): string {
    if (status === 'Reprocess') return 'bg-red-500';
    if (status === 'Waiting to Integrate') return 'bg-amber-500';
    if (status === 'In Process') return 'bg-blue-500';
    if (status === 'Not Started') return 'bg-zinc-500';
    if (status === 'Staging Passed' || status === 'Completed') return 'bg-emerald-500';
    return 'bg-zinc-600';
}

function statusBadge(status: string) {
    const severity = getStatusSeverity(status);
    const classes: Record<string, string> = {
        normal: 'bg-zinc-800 text-zinc-300 border-zinc-700',
        high: 'bg-amber-950 text-amber-300 border-amber-800',
        critical: 'bg-red-950 text-red-300 border-red-800',
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

interface DraggableTaskCardProps {
    task: TaskAnalysis;
    isHighRisk: boolean;
    onTaskClick: (taskId: string) => void;
    showSprintGoal?: boolean;
    isDraggable?: boolean;
    onDragStart?: (e: DragEvent, taskId: string) => void;
    isInTodoList?: boolean;
    todoCompleted?: boolean;
    onRemoveFromTodo?: () => void;
    onToggleComplete?: () => void;
    onQuickAdd?: () => void;
    showQuickAdd?: boolean;
    categoryLabel?: { text: string; color: string; icon: React.ReactNode };
}

function DraggableTaskCard({
    task,
    isHighRisk,
    onTaskClick,
    showSprintGoal = false,
    isDraggable = false,
    onDragStart,
    isInTodoList = false,
    todoCompleted = false,
    onRemoveFromTodo,
    onToggleComplete,
    onQuickAdd,
    showQuickAdd = false,
    categoryLabel,
}: DraggableTaskCardProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        setMouseDownPos({ x: e.clientX, y: e.clientY });
        setIsDragging(false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (mouseDownPos) {
            const dx = Math.abs(e.clientX - mouseDownPos.x);
            const dy = Math.abs(e.clientY - mouseDownPos.y);
            if (dx > 5 || dy > 5) {
                setIsDragging(true);
            }
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (mouseDownPos && !isDragging) {
            const target = e.target as HTMLElement;
            const isInteractiveElement = target.closest('button') || target.closest('input') || target.closest('a');
            if (!isInteractiveElement) {
                onTaskClick(task.taskId);
            }
        }
        setMouseDownPos(null);
        setIsDragging(false);
    };

    const handleDragStart = (e: DragEvent) => {
        setIsDragging(true);
        onDragStart?.(e, task.taskId);
    };

    const handleDragEnd = () => {
        setIsDragging(false);
        setMouseDownPos(null);
    };

    return (
        <div
            draggable={isDraggable}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className={`w-full text-left rounded-lg border px-3 py-2 transition-all group cursor-pointer ${
                isDraggable ? 'active:cursor-grabbing' : ''
            } ${
                todoCompleted
                    ? 'border-emerald-700/30 bg-emerald-950/20 opacity-70'
                    : isHighRisk
                        ? 'border-red-600/50 bg-red-950/30 hover:border-red-500/70 hover:bg-red-950/40'
                        : task.isStale
                            ? 'border-amber-700/30 bg-amber-950/10 hover:border-amber-600/50 hover:bg-amber-950/20'
                            : 'border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700/70 hover:bg-zinc-800/50'
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isDraggable && (
                        <GripVertical className="w-3 h-3 text-zinc-600 flex-shrink-0 cursor-grab" />
                    )}
                    {isInTodoList && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleComplete?.();
                            }}
                            className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                todoCompleted
                                    ? 'bg-emerald-600 border-emerald-500 text-white'
                                    : 'border-zinc-600 hover:border-zinc-400 hover:bg-zinc-800'
                            }`}
                        >
                            {todoCompleted && <Check className="w-3 h-3" />}
                        </button>
                    )}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDotColor(task.currentStatus)}`} />
                    {isHighRisk && (
                        <span className="text-red-500 text-[10px] font-bold flex-shrink-0">📌</span>
                    )}
                    <span className="font-mono text-[10px] text-zinc-400 flex-shrink-0">
                        {task.taskId}
                    </span>
                    <span className={`text-xs truncate ${todoCompleted ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                        {task.taskName}
                    </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {task.riskLevel === 'critical' && (
                        <Badge variant="destructive" className="gap-1 text-[10px]">
                            <RefreshCw className="w-2.5 h-2.5" />
                            DOOM
                        </Badge>
                    )}
                    {isInTodoList && onRemoveFromTodo && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemoveFromTodo();
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-950/50 rounded text-red-400 transition-all"
                            title="Remove from today's plan"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                    {showQuickAdd && onQuickAdd && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onQuickAdd();
                            }}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-medium transition-all"
                            title="Add to today's plan"
                        >
                            <Plus className="w-2.5 h-2.5" />
                            Add
                        </button>
                    )}
                    <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
                </div>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {statusBadge(task.currentStatus)}
                {categoryLabel && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 ${categoryLabel.color}`}>
                        {categoryLabel.icon}
                        {categoryLabel.text}
                    </span>
                )}
                {task.isStale && (
                    <span className="text-[9px] text-amber-400 font-mono flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        STALE {formatStaleHours(task.staleDurationMs)}
                    </span>
                )}
            </div>
            {showSprintGoal && task.sprintGoal && (
                <div className="mt-2 pt-2 border-t border-zinc-800/50">
                    <div className={`flex items-center gap-1 text-[9px] ${task.currentStatus === task.sprintGoal ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {task.currentStatus === task.sprintGoal ? (
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                        ) : (
                            <Target className="w-2.5 h-2.5" />
                        )}
                        <span className="truncate">{task.sprintGoal}</span>
                        {task.currentStatus === task.sprintGoal && (
                            <span className="ml-1 text-[8px] px-1 py-0.5 rounded bg-emerald-950/50 text-emerald-300 font-semibold">MET</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

interface PersonSingleViewProps {
    personData: PersonMeetingData;
    analyses: Record<string, TaskAnalysis>;
    highRiskIds: Set<string>;
    onTaskClick: (taskId: string) => void;
    selectedDate: Date;
    dailyTodos: ReturnType<typeof useDailyTodos>;
    rawLogs: RawLogEvent[];
    sprintStartSnapshot: Record<string, string>;
}

function PersonSingleView({
    personData,
    analyses,
    highRiskIds,
    onTaskClick,
    selectedDate,
    dailyTodos,
    rawLogs,
    sprintStartSnapshot,
}: PersonSingleViewProps) {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const todosForDate = dailyTodos.getTodosForPersonDate(personData.person, dateStr);
    const todoTaskIds = new Set(todosForDate.map((t) => t.taskId));
    
    const [dragOverTodo, setDragOverTodo] = useState(false);

    const blockingTaskIds = new Set(personData.categories.blockingOthers.map((t) => t.taskId));
    const notStartedTaskIds = new Set(personData.categories.notStartedInSprint.map((t) => t.taskId));

    const backlogTasks = useMemo(() => {
        const tasks = personData.allTasks.filter((t) => !todoTaskIds.has(t.taskId));
        return tasks.sort((a, b) => {
            const aIsBlocking = blockingTaskIds.has(a.taskId) ? 1 : 0;
            const bIsBlocking = blockingTaskIds.has(b.taskId) ? 1 : 0;
            const aNoActivity = notStartedTaskIds.has(a.taskId) ? 1 : 0;
            const bNoActivity = notStartedTaskIds.has(b.taskId) ? 1 : 0;
            const aScore = aIsBlocking * 10 + aNoActivity * 5;
            const bScore = bIsBlocking * 10 + bNoActivity * 5;
            return bScore - aScore;
        });
    }, [personData.allTasks, todoTaskIds, blockingTaskIds, notStartedTaskIds]);

    const handleDragStart = (e: DragEvent, taskId: string) => {
        e.dataTransfer.setData('text/plain', taskId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverTodo(true);
    };

    const handleDragLeave = () => {
        setDragOverTodo(false);
    };

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        setDragOverTodo(false);
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId && !todoTaskIds.has(taskId)) {
            dailyTodos.addTodo(personData.person, dateStr, taskId);
        }
    };

    const sortedTodos = [...todosForDate].sort((a, b) => a.order - b.order);

    const hasBlocking = personData.categories.blockingOthers.length > 0;
    const hasBlocked = personData.categories.blockedByOthers.length > 0;
    const hasDoing = personData.categories.doing.length > 0;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
            {/* Left Column: Task Backlog */}
            <div className={`rounded-xl border p-4 flex flex-col ${
                hasBlocking
                    ? 'border-amber-700/60 bg-amber-950/10'
                    : hasBlocked
                        ? 'border-red-700/40 bg-red-950/10'
                        : hasDoing
                            ? 'border-blue-700/40 bg-blue-950/10'
                            : 'border-zinc-800 bg-zinc-950/50'
            }`}>
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/50">
                    <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-zinc-400" />
                        <h3 className="font-semibold text-zinc-100">Task Backlog</h3>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                        {backlogTasks.length} tasks
                    </Badge>
                </div>

                <div className="text-[10px] text-zinc-500 mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                        <GripVertical className="w-3 h-3" />
                        Drag tasks to add to today's list
                    </div>
                    <span className="text-[9px] text-zinc-600">(sorted by priority)</span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                    {backlogTasks.map((task) => {
                        const isBlocking = blockingTaskIds.has(task.taskId);
                        const noActivityInSprint = notStartedTaskIds.has(task.taskId);
                        const isDoing = personData.categories.doing.some((t) => t.taskId === task.taskId);
                        const isBlocked = personData.categories.blockedByOthers.some((t) => t.taskId === task.taskId);
                        
                        const getCategoryLabel = () => {
                            if (isBlocking) return { text: 'Blocking others', color: 'bg-amber-950/50 text-amber-300', icon: <Hand className="w-2.5 h-2.5" /> };
                            if (noActivityInSprint) return { text: 'No activity in sprint', color: 'bg-orange-950/50 text-orange-300', icon: <AlertTriangle className="w-2.5 h-2.5" /> };
                            if (isBlocked) return { text: 'Blocked', color: 'bg-red-950/50 text-red-300', icon: <UserX className="w-2.5 h-2.5" /> };
                            if (isDoing) return { text: 'In progress', color: 'bg-blue-950/50 text-blue-300', icon: <PlayCircle className="w-2.5 h-2.5" /> };
                            return undefined;
                        };
                        
                        return (
                            <DraggableTaskCard
                                key={task.taskId}
                                task={task}
                                isHighRisk={highRiskIds.has(task.taskId)}
                                onTaskClick={onTaskClick}
                                isDraggable
                                onDragStart={handleDragStart}
                                showQuickAdd
                                onQuickAdd={() => dailyTodos.addTodo(personData.person, dateStr, task.taskId)}
                                categoryLabel={getCategoryLabel()}
                            />
                        );
                    })}

                    {backlogTasks.length === 0 && (
                        <div className="text-center py-8 text-zinc-500 text-sm">
                            All tasks added to today's list
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Today's To-Do List */}
            <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`rounded-xl border p-4 flex flex-col transition-colors ${
                    dragOverTodo
                        ? 'border-blue-500 bg-blue-950/20 border-dashed'
                        : 'border-zinc-800 bg-zinc-950/50'
                }`}
            >
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/50">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-400" />
                        <h3 className="font-semibold text-zinc-100">
                            {isToday(selectedDate) ? "Today's Plan" : format(selectedDate, 'MMM d')}
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {sortedTodos.length > 0 && (
                            <span className="text-[10px] text-emerald-400">
                                {sortedTodos.filter((t) => t.completedAt).length}/{sortedTodos.length} done
                            </span>
                        )}
                        <Badge variant="outline" className="text-[10px] border-blue-800/50 text-blue-300">
                            {sortedTodos.length} planned
                        </Badge>
                    </div>
                </div>

                {dragOverTodo && (
                    <div className="flex items-center justify-center py-4 mb-3 rounded-lg border-2 border-dashed border-blue-500/50 bg-blue-950/30">
                        <Plus className="w-4 h-4 text-blue-400 mr-2" />
                        <span className="text-blue-300 text-sm">Drop to add task</span>
                    </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                    {sortedTodos.map((todoItem) => {
                        const task = analyses[todoItem.taskId];
                        if (!task) return null;
                        return (
                            <DraggableTaskCard
                                key={todoItem.taskId}
                                task={task}
                                isHighRisk={highRiskIds.has(task.taskId)}
                                onTaskClick={onTaskClick}
                                showSprintGoal
                                isInTodoList
                                todoCompleted={!!todoItem.completedAt}
                                onRemoveFromTodo={() => dailyTodos.removeTodo(personData.person, dateStr, todoItem.taskId)}
                                onToggleComplete={() => dailyTodos.toggleTodoComplete(personData.person, dateStr, todoItem.taskId)}
                            />
                        );
                    })}

                    {sortedTodos.length === 0 && !dragOverTodo && (
                        <div className="text-center py-12 text-zinc-500">
                            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No tasks planned</p>
                            <p className="text-xs mt-1">Drag tasks from backlog to plan your day</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

interface HistoricalViewProps {
    personData: PersonMeetingData;
    analyses: Record<string, TaskAnalysis>;
    highRiskIds: Set<string>;
    onTaskClick: (taskId: string) => void;
    dailyTodos: ReturnType<typeof useDailyTodos>;
}

function HistoricalView({
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

interface CompareViewProps {
    personData: PersonMeetingData;
    analyses: Record<string, TaskAnalysis>;
    highRiskIds: Set<string>;
    onTaskClick: (taskId: string) => void;
    dailyTodos: ReturnType<typeof useDailyTodos>;
    rawLogs: RawLogEvent[];
}

function CompareView({
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
            .filter((t): t is TaskAnalysis => !!t && t.currentStatus !== 'Completed' && t.currentStatus !== 'Staging Passed');
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
                                                {isBlocking && (
                                                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-300 flex items-center gap-1">
                                                        <Hand className="w-2.5 h-2.5" />
                                                        Blocking others
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

interface AllPersonsViewProps {
    personData: PersonMeetingData[];
    highRiskIds: Set<string>;
    onTaskClick: (taskId: string) => void;
    meetingNotes: Record<string, MeetingNote[]>;
}

function AllPersonsView({ personData, highRiskIds, onTaskClick, meetingNotes }: AllPersonsViewProps) {
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
                                {data.categories.doing.length > 0 && (
                                    <Badge className="bg-blue-950/50 text-blue-300 border-blue-800/50">
                                        {data.categories.doing.length} doing
                                    </Badge>
                                )}
                                {data.categories.blockingOthers.length > 0 && (
                                    <Badge className="bg-amber-950/50 text-amber-300 border-amber-800/50">
                                        {data.categories.blockingOthers.length} blocking
                                    </Badge>
                                )}
                                {data.categories.blockedByOthers.length > 0 && (
                                    <Badge className="bg-red-950/50 text-red-300 border-red-800/50">
                                        {data.categories.blockedByOthers.length} blocked
                                    </Badge>
                                )}
                                {data.categories.notStartedInSprint.length > 0 && (
                                    <Badge className="bg-zinc-800/50 text-zinc-400 border-zinc-700/50">
                                        {data.categories.notStartedInSprint.length} not started
                                    </Badge>
                                )}
                            </div>
                        </div>

                        <div className="space-y-3">
                            {data.categories.doing.length > 0 && (
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

                            {data.categories.blockingOthers.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2 text-amber-400">
                                        <Hand className="w-3 h-3" />
                                        <span className="text-[10px] font-semibold uppercase">Blocking</span>
                                    </div>
                                    <div className="space-y-1">
                                        {data.categories.blockingOthers.map((task) => renderTaskButton(task, 'blocking'))}
                                    </div>
                                </div>
                            )}

                            {data.categories.blockedByOthers.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2 text-red-400">
                                        <UserX className="w-3 h-3" />
                                        <span className="text-[10px] font-semibold uppercase">Blocked</span>
                                    </div>
                                    <div className="space-y-1">
                                        {data.categories.blockedByOthers.map((task) => renderTaskButton(task, 'blocked'))}
                                    </div>
                                </div>
                            )}

                            {data.categories.notStartedInSprint.length > 0 && (
                                <div>
                                    <div className="flex items-center gap-2 mb-2 text-zinc-400">
                                        <AlertTriangle className="w-3 h-3" />
                                        <span className="text-[10px] font-semibold uppercase">Not Started</span>
                                    </div>
                                    <div className="space-y-1">
                                        {data.categories.notStartedInSprint.map((task) => renderTaskButton(task, 'notStarted'))}
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

export function DailyMeetingView({
    analyses,
    meetingNotes,
    rawLogs,
    sprintStartSnapshot,
    highRiskIds,
    onTaskClick,
}: DailyMeetingViewProps) {
    const personData = useMemo(
        () => computePersonMeetingData(analyses, meetingNotes, rawLogs, sprintStartSnapshot),
        [analyses, meetingNotes, rawLogs, sprintStartSnapshot]
    );

    const dailyTodos = useDailyTodos();

    const [viewMode, setViewMode] = useState<'single' | 'all'>('single');
    const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [showHistory, setShowHistory] = useState(false);
    const [showCompare, setShowCompare] = useState(false);
    const [personDropdownOpen, setPersonDropdownOpen] = useState(false);

    const currentPersonData = useMemo(() => {
        if (!selectedPerson && personData.length > 0) {
            return personData[0];
        }
        return personData.find((p) => p.person === selectedPerson) || personData[0];
    }, [selectedPerson, personData]);

    const stats = useMemo(() => {
        let totalDoing = 0;
        let totalBlocking = 0;
        let totalBlocked = 0;
        let totalNotStarted = 0;

        personData.forEach((p) => {
            totalDoing += p.categories.doing.length;
            totalBlocking += p.categories.blockingOthers.length;
            totalBlocked += p.categories.blockedByOthers.length;
            totalNotStarted += p.categories.notStartedInSprint.length;
        });

        return { totalDoing, totalBlocking, totalBlocked, totalNotStarted };
    }, [personData]);

    const navigateDate = useCallback((direction: 'prev' | 'next') => {
        setSelectedDate((prev) => {
            const newDate = new Date(prev);
            newDate.setDate(newDate.getDate() + (direction === 'next' ? 1 : -1));
            if (newDate > new Date()) return prev;
            return newDate;
        });
    }, []);

    return (
        <div className="space-y-4">
            {/* Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-800/50">
                {/* View Mode Toggle */}
                <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border border-zinc-800 p-0.5 bg-zinc-950">
                        <button
                            onClick={() => setViewMode('single')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                viewMode === 'single'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                        >
                            <User className="w-3 h-3" />
                            Single Person
                        </button>
                        <button
                            onClick={() => setViewMode('all')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                viewMode === 'all'
                                    ? 'bg-blue-600 text-white'
                                    : 'text-zinc-400 hover:text-zinc-200'
                            }`}
                        >
                            <Users className="w-3 h-3" />
                            View All
                        </button>
                    </div>

                    {/* Person Selector (only in single mode) */}
                    {viewMode === 'single' && currentPersonData && (
                        <div className="relative">
                            <button
                                onClick={() => setPersonDropdownOpen(!personDropdownOpen)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 transition-colors"
                            >
                                <div className={`w-2 h-2 rounded-full ${
                                    currentPersonData.categories.blockingOthers.length > 0
                                        ? 'bg-amber-500'
                                        : currentPersonData.categories.blockedByOthers.length > 0
                                            ? 'bg-red-500'
                                            : 'bg-blue-500'
                                }`} />
                                <span className="text-sm text-zinc-200">{currentPersonData.person}</span>
                                <ChevronDown className="w-3 h-3 text-zinc-500" />
                            </button>
                            {personDropdownOpen && (
                                <>
                                    <div
                                        className="fixed inset-0 z-10"
                                        onClick={() => setPersonDropdownOpen(false)}
                                    />
                                    <div className="absolute top-full left-0 mt-1 w-64 max-h-80 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 shadow-xl z-20">
                                        {personData.map((p) => (
                                            <button
                                                key={p.person}
                                                onClick={() => {
                                                    setSelectedPerson(p.person);
                                                    setPersonDropdownOpen(false);
                                                }}
                                                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800 transition-colors ${
                                                    p.person === currentPersonData.person ? 'bg-zinc-800' : ''
                                                }`}
                                            >
                                                <div className={`w-2 h-2 rounded-full ${
                                                    p.categories.blockingOthers.length > 0
                                                        ? 'bg-amber-500'
                                                        : p.categories.blockedByOthers.length > 0
                                                            ? 'bg-red-500'
                                                            : p.categories.doing.length > 0
                                                                ? 'bg-blue-500'
                                                                : 'bg-zinc-500'
                                                }`} />
                                                <span className="text-sm text-zinc-200 flex-1">{p.person}</span>
                                                <div className="flex items-center gap-1">
                                                    {p.categories.blockingOthers.length > 0 && (
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-300">
                                                            {p.categories.blockingOthers.length}
                                                        </span>
                                                    )}
                                                    <span className="text-[10px] text-zinc-500">{p.totalTasks}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Date Navigation & History (only in single mode) */}
                {viewMode === 'single' && (
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                setShowCompare(!showCompare);
                                if (!showCompare) setShowHistory(false);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                                showCompare
                                    ? 'border-cyan-600 bg-cyan-950/30 text-cyan-300'
                                    : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
                            }`}
                        >
                            <GitCompare className="w-3 h-3" />
                            Compare
                        </button>
                        <button
                            onClick={() => {
                                setShowHistory(!showHistory);
                                if (!showHistory) setShowCompare(false);
                            }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                                showHistory
                                    ? 'border-purple-600 bg-purple-950/30 text-purple-300'
                                    : 'border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600'
                            }`}
                        >
                            <History className="w-3 h-3" />
                            History
                        </button>

                        {!showHistory && !showCompare && (
                            <div className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 p-0.5">
                                <button
                                    onClick={() => navigateDate('prev')}
                                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => setSelectedDate(new Date())}
                                    className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                        isToday(selectedDate)
                                            ? 'bg-blue-600 text-white'
                                            : 'text-zinc-300 hover:bg-zinc-800'
                                    }`}
                                >
                                    {isToday(selectedDate) ? 'Today' : format(selectedDate, 'MMM d')}
                                </button>
                                <button
                                    onClick={() => navigateDate('next')}
                                    disabled={isToday(selectedDate)}
                                    className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Quick Stats */}
                <div className="flex items-center gap-3 text-[10px]">
                    <div className="flex items-center gap-1 text-blue-400">
                        <PlayCircle className="w-3 h-3" />
                        <span className="font-mono">{stats.totalDoing}</span>
                    </div>
                    <div className="flex items-center gap-1 text-amber-400">
                        <Hand className="w-3 h-3" />
                        <span className="font-mono">{stats.totalBlocking}</span>
                    </div>
                    <div className="flex items-center gap-1 text-red-400">
                        <UserX className="w-3 h-3" />
                        <span className="font-mono">{stats.totalBlocked}</span>
                    </div>
                    <div className="flex items-center gap-1 text-zinc-400">
                        <AlertTriangle className="w-3 h-3" />
                        <span className="font-mono">{stats.totalNotStarted}</span>
                    </div>
                </div>
            </div>

            {/* Priority Legend (collapsed) */}
            <div className="flex items-center gap-4 text-[9px] text-zinc-600">
                <span className="font-semibold uppercase tracking-wider">Priority:</span>
                <div className="flex items-center gap-1">
                    <PlayCircle className="w-2.5 h-2.5 text-blue-500" />
                    <span>Doing</span>
                </div>
                <ArrowRight className="w-2.5 h-2.5" />
                <div className="flex items-center gap-1">
                    <Hand className="w-2.5 h-2.5 text-amber-500" />
                    <span>Blocking</span>
                </div>
                <ArrowRight className="w-2.5 h-2.5" />
                <div className="flex items-center gap-1">
                    <UserX className="w-2.5 h-2.5 text-red-500" />
                    <span>Blocked</span>
                </div>
                <ArrowRight className="w-2.5 h-2.5" />
                <div className="flex items-center gap-1">
                    <AlertTriangle className="w-2.5 h-2.5 text-zinc-500" />
                    <span>Not Started</span>
                </div>
            </div>

            {/* Main Content */}
            {personData.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                    <AlertTriangle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No active tasks found for the current sprint</p>
                </div>
            ) : viewMode === 'all' ? (
                <AllPersonsView
                    personData={personData}
                    highRiskIds={highRiskIds}
                    onTaskClick={onTaskClick}
                    meetingNotes={meetingNotes}
                />
            ) : showCompare && currentPersonData ? (
                <CompareView
                    personData={currentPersonData}
                    analyses={analyses}
                    highRiskIds={highRiskIds}
                    onTaskClick={onTaskClick}
                    dailyTodos={dailyTodos}
                    rawLogs={rawLogs}
                />
            ) : showHistory && currentPersonData ? (
                <HistoricalView
                    personData={currentPersonData}
                    analyses={analyses}
                    highRiskIds={highRiskIds}
                    onTaskClick={onTaskClick}
                    dailyTodos={dailyTodos}
                />
            ) : currentPersonData ? (
                <PersonSingleView
                    personData={currentPersonData}
                    analyses={analyses}
                    highRiskIds={highRiskIds}
                    onTaskClick={onTaskClick}
                    selectedDate={selectedDate}
                    dailyTodos={dailyTodos}
                    rawLogs={rawLogs}
                    sprintStartSnapshot={sprintStartSnapshot}
                />
            ) : null}
        </div>
    );
}
