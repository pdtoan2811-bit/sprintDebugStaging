import React, { useState, useCallback, useMemo, DragEvent } from 'react';
import { TaskAnalysis, MeetingNote, RawLogEvent } from '@/lib/types';
import { useDailyTodos } from '@/lib/hooks/useDailyTodos';
import { format, isToday } from 'date-fns';
import { Badge } from '../../../ui/badge';
import {
    AlertTriangle,
    Calendar,
    Clock,
    Copy,
    GripVertical,
    Hand,
    Layers,
    Loader2,
    PlayCircle,
    Plus,
    Send,
    UserX,
    Users,
} from 'lucide-react';
import { PersonMeetingData, CategoryFilterKey } from '../types';
import {
    formatTodoListForDM,
    formatTodoListForWebhook,
    sendTodoListToWebhook,
    getLatestMeetingNote,
    taskInVisibleCategory,
} from '../utils';
import { DraggableTaskCard } from './DraggableTaskCard';
import { SyncTaskDropdown } from './SyncTaskDropdown';

interface PersonSingleViewProps {
    personData: PersonMeetingData;
    categoryFilter: Record<CategoryFilterKey, boolean>;
    analyses: Record<string, TaskAnalysis>;
    highRiskIds: Set<string>;
    onTaskClick: (taskId: string) => void;
    selectedDate: Date;
    dailyTodos: ReturnType<typeof useDailyTodos>;
    rawLogs: RawLogEvent[];
    sprintStartSnapshot: Record<string, string>;
    allPersonData: PersonMeetingData[];
    meetingNotes: Record<string, MeetingNote[]>;
}

export function PersonSingleView({
    personData,
    categoryFilter,
    analyses,
    highRiskIds,
    onTaskClick,
    selectedDate,
    dailyTodos,
    allPersonData,
    meetingNotes,
}: PersonSingleViewProps) {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const todosForDate = dailyTodos.getTodosForPersonDate(personData.person, dateStr);
    const todoTaskIds = new Set(todosForDate.map((t) => t.taskId));
    
    const [dragOverTodo, setDragOverTodo] = useState<boolean>(false);
    const [copied, setCopied] = useState<boolean>(false);
    const [sending, setSending] = useState<boolean>(false);
    const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);

    const handleCopyForDM = useCallback(() => {
        const text = formatTodoListForDM(personData.person, todosForDate, analyses, meetingNotes, allPersonData);
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [personData.person, todosForDate, analyses, meetingNotes, allPersonData]);

    const handleSendToWebhook = useCallback(async () => {
        if (sending) return;

        setSending(true);
        setSendResult(null);
        
        const payload = formatTodoListForWebhook(
            personData.person,
            dateStr,
            todosForDate,
            analyses,
            meetingNotes,
            allPersonData
        );
        
        const result = await sendTodoListToWebhook(payload);
        
        setSending(false);
        setSendResult({
            success: result.success,
            message: result.success ? 'Sent!' : result.error || 'Failed to send',
        });
        
        setTimeout(() => setSendResult(null), 3000);
    }, [sending, personData.person, dateStr, todosForDate, analyses, meetingNotes, allPersonData]);

    const blockingTaskIds = new Set(personData.categories.blockingOthers.map((t) => t.taskId));
    const notStartedTaskIds = new Set(personData.categories.notStartedInSprint.map((t) => t.taskId));
    const otherTaskIds = new Set(personData.categories.other.map((t) => t.taskId));

    const backlogTasks = useMemo(() => {
        const tasks = personData.allTasks.filter(
            (t) => !todoTaskIds.has(t.taskId) && taskInVisibleCategory(t.taskId, personData, categoryFilter)
        );
        return tasks.sort((a, b) => {
            const aIsBlocking = blockingTaskIds.has(a.taskId) ? 1 : 0;
            const bIsBlocking = blockingTaskIds.has(b.taskId) ? 1 : 0;
            const aNoActivity = notStartedTaskIds.has(a.taskId) ? 1 : 0;
            const bNoActivity = notStartedTaskIds.has(b.taskId) ? 1 : 0;
            const aIsOther = otherTaskIds.has(a.taskId) ? 1 : 0;
            const bIsOther = otherTaskIds.has(b.taskId) ? 1 : 0;
            const aScore = aIsBlocking * 10 + aNoActivity * 5 + aIsOther * 3;
            const bScore = bIsBlocking * 10 + bNoActivity * 5 + bIsOther * 3;
            return bScore - aScore;
        });
    }, [personData, todoTaskIds, blockingTaskIds, notStartedTaskIds, otherTaskIds, categoryFilter]);

    const handleDragStart = (e: DragEvent<HTMLDivElement>, taskId: string) => {
        e.dataTransfer.setData('text/plain', taskId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverTodo(true);
    };

    const handleDragLeave = () => {
        setDragOverTodo(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
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

                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1.5 pr-1">
                    {backlogTasks.map((task) => {
                        const isBlocking = blockingTaskIds.has(task.taskId);
                        const noActivityInSprint = notStartedTaskIds.has(task.taskId);
                        const isOther = otherTaskIds.has(task.taskId);
                        const isDoing = personData.categories.doing.some((t) => t.taskId === task.taskId);
                        const isBlocked = personData.categories.blockedByOthers.some((t) => t.taskId === task.taskId);
                        
                        const getCategoryLabel = () => {
                            if (isBlocking) return { text: 'Blocking others', color: 'bg-amber-950/50 text-amber-300', icon: <Hand className="w-2.5 h-2.5" /> };
                            if (isBlocked) return { text: 'Blocked', color: 'bg-red-950/50 text-red-300', icon: <UserX className="w-2.5 h-2.5" /> };
                            if (isDoing) return { text: 'In progress', color: 'bg-blue-950/50 text-blue-300', icon: <PlayCircle className="w-2.5 h-2.5" /> };
                            if (noActivityInSprint) return { text: 'No activity in sprint', color: 'bg-orange-950/50 text-orange-300', icon: <AlertTriangle className="w-2.5 h-2.5" /> };
                            if (isOther) return { text: 'Pending', color: 'bg-zinc-800/50 text-zinc-300', icon: <Clock className="w-2.5 h-2.5" /> };
                            return undefined;
                        };
                        
                        const notes = meetingNotes[task.taskId] || [];
                        const latestNote = getLatestMeetingNote(notes);
                        const blockedByLabel =
                            isBlocked && latestNote?.isStall && latestNote.blockedBy && latestNote.blockedBy !== personData.person
                                ? latestNote.blockedBy
                                : isBlocked && task.blockedBy && task.blockedBy !== personData.person
                                    ? task.blockedBy
                                    : undefined;
                        
                        const assignees = task.currentPerson
                            ? task.currentPerson.split(',').map((p) => p.trim()).filter(Boolean)
                            : [];
                        const isMultipleAssignees = assignees.length > 1;

                        return (
                            <div key={task.taskId} className="relative group/card">
                                <DraggableTaskCard
                                    task={task}
                                    isHighRisk={highRiskIds.has(task.taskId)}
                                    onTaskClick={onTaskClick}
                                    isDraggable
                                    onDragStart={handleDragStart as any}
                                    showQuickAdd
                                    onQuickAdd={() => dailyTodos.addTodo(personData.person, dateStr, task.taskId)}
                                    categoryLabel={getCategoryLabel()}
                                    blockedByLabel={blockedByLabel}
                                    showAssignees={isMultipleAssignees}
                                />
                                {isMultipleAssignees && (
                                    <div className="absolute top-2 right-16 opacity-0 group-hover/card:opacity-100 transition-opacity">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                assignees.forEach(assignee => {
                                                    dailyTodos.addTodo(assignee, dateStr, task.taskId);
                                                });
                                            }}
                                            className="flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-medium transition-all shadow-sm"
                                            title="Add to today's plan for all assignees"
                                        >
                                            <Users className="w-2.5 h-2.5" />
                                            Add for All
                                        </button>
                                    </div>
                                )}
                            </div>
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
                        {sortedTodos.length > 0 && (
                            <button
                                type="button"
                                onClick={handleCopyForDM}
                                className="p-1.5 rounded-md hover:bg-zinc-700/80 text-zinc-400 hover:text-zinc-200 transition-colors"
                                title="Copy to-do list for DM"
                            >
                                {copied ? (
                                    <span className="text-[10px] text-emerald-400 font-medium px-1">Copied!</span>
                                ) : (
                                    <Copy className="w-3.5 h-3.5" />
                                )}
                            </button>
                        )}
                        {sortedTodos.length > 0 && (
                            <button
                                type="button"
                                onClick={handleSendToWebhook}
                                disabled={sending}
                                className={`p-1.5 rounded-md transition-colors ${
                                    sending
                                        ? 'bg-blue-900/50 text-blue-300 cursor-not-allowed'
                                        : sendResult
                                            ? sendResult.success
                                                ? 'bg-emerald-900/50 text-emerald-300'
                                                : 'bg-red-900/50 text-red-300'
                                            : 'hover:bg-blue-700/80 text-blue-400 hover:text-blue-200'
                                }`}
                                title="Send to-do list to Lark"
                            >
                                {sending ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : sendResult ? (
                                    <span className={`text-[10px] font-medium px-1 ${sendResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {sendResult.message}
                                    </span>
                                ) : (
                                    <Send className="w-3.5 h-3.5" />
                                )}
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {dailyTodos.saving && (
                            <span className="text-[9px] text-zinc-500 animate-pulse">Saving...</span>
                        )}
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

                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {sortedTodos.map((todoItem) => {
                        const task = analyses[todoItem.taskId];
                        if (!task) return null;
                        const notes = meetingNotes[task.taskId] || [];
                        const latestNote = getLatestMeetingNote(notes);
                        const isBlockedByOthers =
                            latestNote?.isStall && latestNote.blockedBy && latestNote.blockedBy !== personData.person;
                        const blockedByLabel =
                            isBlockedByOthers && latestNote?.blockedBy
                                ? latestNote.blockedBy
                                : isBlockedByOthers && task.blockedBy && task.blockedBy !== personData.person
                                    ? task.blockedBy
                                    : undefined;
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
                                blockedByLabel={blockedByLabel}
                                renderActions={
                                    allPersonData.length > 1 && !todoItem.completedAt ? (
                                        <SyncTaskDropdown 
                                            task={task} 
                                            allPersonData={allPersonData} 
                                            personData={personData} 
                                            dateStr={dateStr} 
                                            dailyTodos={dailyTodos} 
                                        />
                                    ) : null
                                }
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
