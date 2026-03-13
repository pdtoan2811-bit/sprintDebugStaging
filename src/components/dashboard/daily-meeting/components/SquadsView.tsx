import React, { useState, useMemo, useCallback } from 'react';
import { TaskAnalysis, MeetingNote, RawLogEvent } from '@/lib/types';
import { useDailyTodos } from '@/lib/hooks/useDailyTodos';
import { useRoles, ROLE_ORDER, ValidRole } from '@/lib/hooks/useRoles';
import { format, isToday } from 'date-fns';
import { Badge } from '../../../ui/badge';
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Calendar,
    ChevronDown,
    ChevronRight,
    ChevronUp,
    Clock,
    Copy,
    GripVertical,
    Hand,
    Layers,
    Loader2,
    PlayCircle,
    Plus,
    Send,
    User,
    UserCircle2,
    UserX,
    Users,
    Circle,
    CopyCheck,
    CheckCircle2,
    Target
} from 'lucide-react';
import { PersonMeetingData, CategoryFilterKey } from '../types';
import { DraggableTaskCard } from './DraggableTaskCard';
import {
    getLatestMeetingNote,
    taskInVisibleCategory,
    formatCorporateName,
    formatTodoListForWebhook,
    sendTodoListToWebhook,
    formatTodoListForDM,
} from '../utils';
import { ACTIVE_STATUSES } from '../constants';

export interface SquadsViewProps {
    analyses: Record<string, TaskAnalysis>;
    categoryFilter: Record<CategoryFilterKey, boolean>;
    highRiskIds: Set<string>;
    onTaskClick: (taskId: string) => void;
    meetingNotes: Record<string, MeetingNote[]>;
    dailyTodos: ReturnType<typeof useDailyTodos>;
    selectedDate: Date;
    allPersonData: PersonMeetingData[];
    rolesData: ReturnType<typeof useRoles>;
    rawLogs: RawLogEvent[];
}

export function SquadsView({
    analyses,
    categoryFilter,
    highRiskIds,
    onTaskClick,
    meetingNotes,
    dailyTodos,
    selectedDate,
    allPersonData,
    rolesData,
    rawLogs,
}: SquadsViewProps) {
    const { roles } = rolesData;
    const [selectedPersonsFilter, setSelectedPersonsFilter] = useState<Set<string>>(new Set());
    const [dragOverTodo, setDragOverTodo] = useState(false);
    const [copied, setCopied] = useState(false);
    const [sending, setSending] = useState(false);
    const [sendResult, setSendResult] = useState<{ success: boolean; message: string } | null>(null);
    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    const squadMembers = Array.from(selectedPersonsFilter).sort((a, b) => {
        const roleA = roles[a] || 'Other';
        const roleB = roles[b] || 'Other';
        const indexA = ROLE_ORDER.indexOf(roleA as ValidRole);
        const indexB = ROLE_ORDER.indexOf(roleB as ValidRole);
        const posA = indexA === -1 ? 99 : indexA;
        const posB = indexB === -1 ? 99 : indexB;
        if (posA !== posB) return posA - posB;
        return a.localeCompare(b);
    });

    const sortedAllPersonData = useMemo(() => {
        return [...allPersonData].sort((a, b) => {
            const roleA = roles[a.person] || 'Other';
            const roleB = roles[b.person] || 'Other';
            const indexA = ROLE_ORDER.indexOf(roleA as ValidRole);
            const indexB = ROLE_ORDER.indexOf(roleB as ValidRole);
            const posA = indexA === -1 ? 99 : indexA;
            const posB = indexB === -1 ? 99 : indexB;
            if (posA !== posB) return posA - posB;
            return a.person.localeCompare(b.person);
        });
    }, [allPersonData, roles]);

    const handleCopyForDM = useCallback(() => {
        const texts = squadMembers.map(member => {
            const todosForDate = dailyTodos.getTodosForPersonDate(member, dateStr);
            if (todosForDate.length === 0) return null;
            return formatTodoListForDM(member, todosForDate, analyses, meetingNotes, allPersonData);
        }).filter(Boolean);
        
        if (texts.length === 0) return;
        
        navigator.clipboard.writeText(texts.join('\n\n---\n\n')).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [squadMembers, dateStr, dailyTodos, analyses, meetingNotes, allPersonData]);

    const handleSendToWebhook = useCallback(async () => {
        if (sending) return;

        setSending(true);
        setSendResult(null);
        
        let allSuccess = true;
        let errorMessage = '';
        let sentCount = 0;

        for (const member of squadMembers) {
            const todosForDate = dailyTodos.getTodosForPersonDate(member, dateStr);
            if (todosForDate.length === 0) continue;

            const payload = formatTodoListForWebhook(
                member,
                dateStr,
                todosForDate,
                analyses,
                meetingNotes,
                allPersonData
            );
            
            const result = await sendTodoListToWebhook(payload);
            if (!result.success) {
                allSuccess = false;
                errorMessage = result.error || 'Failed to send';
                break;
            }
            sentCount++;
        }
        
        setSending(false);
        if (sentCount === 0) {
            setSendResult({ success: false, message: 'No tasks to send' });
        } else {
            setSendResult({
                success: allSuccess,
                message: allSuccess ? 'Sent for all!' : errorMessage,
            });
        }
        
        setTimeout(() => setSendResult(null), 3000);
    }, [sending, squadMembers, dateStr, dailyTodos, analyses, meetingNotes, allPersonData]);

    // Compute derived tasks for Backlog
    const { sharedBacklog, individualBacklog } = useMemo(() => {
        const shared: TaskAnalysis[] = [];
        const individual: Record<string, TaskAnalysis[]> = {};
        squadMembers.forEach(sm => individual[sm] = []);

        const uniqueTasks = new Map<string, TaskAnalysis>();
        squadMembers.forEach(sm => {
            const data = allPersonData.find(p => p.person === sm);
            if (data) {
                data.allTasks.forEach(t => {
                    if (taskInVisibleCategory(t.taskId, data, categoryFilter)) {
                        uniqueTasks.set(t.taskId, t);
                    }
                });
            }
        });

        uniqueTasks.forEach(task => {
            const assignees = task.currentPerson ? task.currentPerson.split(',').map(p => p.trim()) : [];
            const involved = squadMembers.filter(sm => assignees.includes(sm));
            
            // Check if fully planned by all involved squad members
            const isFullyPlanned = involved.length > 0 && involved.every(sm => {
                const todos = dailyTodos.getTodosForPersonDate(sm, dateStr);
                return todos.some(todo => todo.taskId === task.taskId);
            });
            
            if (isFullyPlanned) return; // Skip if fully planned

            if (involved.length > 1) {
                shared.push(task);
            } else if (involved.length === 1) {
                individual[involved[0]].push(task);
            }
        });

        // Sort them for consistent viewing
        shared.sort((a, b) => b.staleDurationMs - a.staleDurationMs);
        Object.keys(individual).forEach(key => {
            individual[key].sort((a, b) => b.staleDurationMs - a.staleDurationMs);
        });

        return { sharedBacklog: shared, individualBacklog: individual };
    }, [allPersonData, squadMembers, categoryFilter, dailyTodos, dateStr]);

    // Compute derived tasks for Squad Plan
    const { sharedPlans, individualPlans } = useMemo(() => {
        const shared = new Map<string, { task: TaskAnalysis, plannedBy: Set<string>, involved: string[] }>();
        const individual: Record<string, { task: TaskAnalysis, completedAt?: string }[]> = {};
        squadMembers.forEach(sm => individual[sm] = []);

        squadMembers.forEach(sm => {
            const todos = dailyTodos.getTodosForPersonDate(sm, dateStr);
            todos.forEach(todo => {
                const task = analyses[todo.taskId];
                if (!task) return;

                const assignees = task.currentPerson ? task.currentPerson.split(',').map(p => p.trim()) : [];
                const involved = squadMembers.filter(m => assignees.includes(m));

                if (involved.length > 1) {
                    if (!shared.has(task.taskId)) {
                        shared.set(task.taskId, { task, plannedBy: new Set([sm]), involved });
                    } else {
                        shared.get(task.taskId)!.plannedBy.add(sm);
                    }
                } else if (involved.length === 1) {
                    if (!individual[sm].some(t => t.task.taskId === task.taskId)) {
                        individual[sm].push({ task, completedAt: todo.completedAt });
                    }
                } else {
                    if (!individual[sm].some(t => t.task.taskId === task.taskId)) {
                        individual[sm].push({ task, completedAt: todo.completedAt });
                    }
                }
            });
        });

        return { sharedPlans: Array.from(shared.values()), individualPlans: individual };
    }, [squadMembers, dailyTodos, dateStr, analyses]);

    const handleDragStart = (e: React.DragEvent, taskId: string) => {
        e.dataTransfer!.setData('text/plain', taskId);
        e.dataTransfer!.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        setDragOverTodo(true);
    };

    const handleDragLeave = () => {
        setDragOverTodo(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOverTodo(false);
        const taskId = e.dataTransfer!.getData('text/plain');
        if (taskId) {
            const task = analyses[taskId];
            if (!task) return;
            const assignees = task.currentPerson ? task.currentPerson.split(',').map(p => p.trim()) : [];
            const involved = squadMembers.filter(m => assignees.includes(m));
            
            if (involved.length > 0) {
                involved.forEach(sm => {
                    const todos = dailyTodos.getTodosForPersonDate(sm, dateStr);
                    if (!todos.some(t => t.taskId === taskId)) {
                        dailyTodos.addTodo(sm, dateStr, taskId);
                    }
                });
            } else if (squadMembers.length === 1) {
                 const todos = dailyTodos.getTodosForPersonDate(squadMembers[0], dateStr);
                 if (!todos.some(t => t.taskId === taskId)) {
                     dailyTodos.addTodo(squadMembers[0], dateStr, taskId);
                 }
            }
        }
    };

    const renderCard = (task: TaskAnalysis, context: 'backlog' | 'plan', member?: string, completed?: boolean, isSharedPlan?: boolean, sharedPlanData?: { plannedBy: Set<string>, involved: string[] }) => {
        const notes = meetingNotes[task.taskId] || [];
        const latestNote = getLatestMeetingNote(notes);
        const isBlockedByOthers = latestNote?.isStall && latestNote.blockedBy;
        const blockedByLabel = isBlockedByOthers ? latestNote.blockedBy : task.blockedBy;

        const getCategoryLabel = () => {
            if (task.currentStatus === 'Reprocess' || task.currentStatus === 'Reviewing' || task.currentStatus === 'Waiting to Integrate') {
                return { text: 'In bottleneck', color: 'bg-amber-950/50 text-amber-300', icon: <AlertTriangle className="w-2.5 h-2.5" /> };
            }
            if (ACTIVE_STATUSES.has(task.currentStatus)) {
                return { text: 'Active', color: 'bg-blue-950/50 text-blue-300', icon: <PlayCircle className="w-2.5 h-2.5" /> };
            }
            if (task.currentStatus === 'Not Started') {
                return { text: 'Not started', color: 'bg-zinc-800/50 text-zinc-400', icon: <Circle className="w-2.5 h-2.5" /> };
            }
            return undefined;
        };

        const onQuickAdd = () => {
            const assignees = task.currentPerson ? task.currentPerson.split(',').map(p => p.trim()) : [];
            const involved = squadMembers.filter(m => assignees.includes(m));
            if (involved.length > 0) {
                involved.forEach(sm => dailyTodos.addTodo(sm, dateStr, task.taskId));
            } else if (squadMembers.length === 1) {
                dailyTodos.addTodo(squadMembers[0], dateStr, task.taskId);
            }
        };

        const onRemove = () => {
            if (isSharedPlan && sharedPlanData) {
                sharedPlanData.plannedBy.forEach(sm => dailyTodos.removeTodo(sm, dateStr, task.taskId));
            } else if (member) {
                dailyTodos.removeTodo(member, dateStr, task.taskId);
            }
        };

        const onToggle = () => {
            if (isSharedPlan && sharedPlanData) {
                sharedPlanData.plannedBy.forEach(sm => dailyTodos.toggleTodoComplete(sm, dateStr, task.taskId));
            } else if (member) {
                dailyTodos.toggleTodoComplete(member, dateStr, task.taskId);
            }
        };

        return (
            <div key={task.taskId} className="relative group/card">
                <DraggableTaskCard
                    task={task}
                    isHighRisk={highRiskIds.has(task.taskId)}
                    onTaskClick={onTaskClick}
                    isDraggable={context === 'backlog'}
                    onDragStart={handleDragStart}
                    isInTodoList={context === 'plan'}
                    todoCompleted={completed}
                    showSprintGoal={context === 'plan'}
                    showQuickAdd={context === 'backlog'}
                    onQuickAdd={onQuickAdd}
                    onRemoveFromTodo={onRemove}
                    onToggleComplete={onToggle}
                    categoryLabel={getCategoryLabel()}
                    blockedByLabel={blockedByLabel}
                    renderActions={
                        isSharedPlan && sharedPlanData && !completed ? (
                            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 rounded p-0.5" onClick={(e) => e.stopPropagation()}>
                                {sharedPlanData.involved.map(inv => {
                                    const isPlanning = sharedPlanData.plannedBy.has(inv);
                                    return (
                                        <button
                                            key={inv}
                                            onClick={() => {
                                                if (isPlanning) dailyTodos.removeTodo(inv, dateStr, task.taskId);
                                                else dailyTodos.addTodo(inv, dateStr, task.taskId);
                                            }}
                                            className={`px-1.5 h-5 min-w-[20px] flex items-center justify-center rounded text-[10px] font-bold transition-colors ${
                                                isPlanning 
                                                    ? 'bg-indigo-600 text-white' 
                                                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200'
                                            }`}
                                            title={isPlanning ? `${inv} planned this` : `Add to ${inv}'s plan`}
                                        >
                                            {formatCorporateName(inv)}
                                        </button>
                                    );
                                })}
                            </div>
                        ) : null
                    }
                />
            </div>
        );
    };

    return (
        <div className="space-y-4 flex flex-col min-h-[500px]">
            {/* Personnel Selector Row */}
            <div className="bg-zinc-950/50 p-3 rounded-xl border border-zinc-800 flex flex-col gap-2 flex-shrink-0">
                <div className="flex items-center gap-2 mb-1">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <span className="font-semibold text-zinc-200 text-sm">Gradually form your squad</span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar">
                    {sortedAllPersonData.map(p => {
                        const isSelected = selectedPersonsFilter.has(p.person);
                        return (
                            <button
                                key={p.person}
                                onClick={() => {
                                    const next = new Set(selectedPersonsFilter);
                                    if (isSelected) next.delete(p.person);
                                    else next.add(p.person);
                                    setSelectedPersonsFilter(next);
                                }}
                                className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all ${
                                    isSelected 
                                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-[0_0_10px_rgba(79,70,229,0.3)]'
                                        : 'bg-zinc-900/80 border-zinc-700/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                                }`}
                            >
                                <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white/80' : 'bg-zinc-600'}`} />
                                <span className="text-sm font-medium">{p.person}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {selectedPersonsFilter.size === 0 ? (
                <div className="flex-1 flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/50">
                    <div className="text-center py-12 px-4 max-w-md">
                        <Users className="w-12 h-12 mx-auto mb-4 text-indigo-500/30" />
                        <h3 className="text-zinc-200 font-semibold mb-2">No Personnel Selected</h3>
                        <p className="text-sm text-zinc-400">
                            Select one or more team members above to start forming a squad. The views below will dynamically update to show shared tasks, individual tasks, and blockers for the selected team members.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
                    {/* Left Column: Squad Backlog */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 flex flex-col min-h-0 overflow-hidden" style={{ maxHeight: '70vh' }}>
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/50 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-indigo-400" />
                                <h3 className="font-semibold text-zinc-100">Squad Backlog</h3>
                            </div>
                            <Badge variant="outline" className="text-[10px] border-indigo-800/50 text-indigo-300 bg-indigo-950/20">
                                {sharedBacklog.length + squadMembers.reduce((sum, m) => sum + individualBacklog[m].length, 0)} tasks
                            </Badge>
                        </div>

                        <div className="text-[10px] text-zinc-500 mb-3 flex items-center gap-1 flex-shrink-0">
                            <GripVertical className="w-3 h-3" />
                            Drag tasks to the Squad Plan to plan them
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-6 pb-8">
                            {/* Shared Backlog Section */}
                            {squadMembers.length > 1 && sharedBacklog.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-indigo-400 border-b border-indigo-900/30 pb-1">
                                        <Users className="w-3.5 h-3.5" />
                                        <h4 className="text-xs font-semibold uppercase tracking-wider">Shared Tasks ({sharedBacklog.length})</h4>
                                    </div>
                                    <div className="space-y-1.5 pl-2 border-l border-indigo-900/30">
                                        {sharedBacklog.map(task => renderCard(task, 'backlog'))}
                                    </div>
                                </div>
                            )}

                            {/* Individual Backlog Sections */}
                            {squadMembers.map(member => {
                                const tasks = individualBacklog[member] || [];
                                if (tasks.length === 0) return null;
                                return (
                                    <div key={member} className="space-y-2">
                                        <div className="flex items-center gap-2 text-zinc-400 border-b border-zinc-800/50 pb-1">
                                            <User className="w-3.5 h-3.5" />
                                            <h4 className="text-xs font-semibold uppercase tracking-wider">{member}'s Tasks ({tasks.length})</h4>
                                        </div>
                                        <div className="space-y-1.5 pl-2 border-l border-zinc-800/50">
                                            {tasks.map(task => renderCard(task, 'backlog', member))}
                                        </div>
                                    </div>
                                );
                            })}

                            {sharedBacklog.length === 0 && squadMembers.every(m => individualBacklog[m].length === 0) && (
                                <div className="text-center py-8 text-zinc-500 text-sm border-t border-zinc-800/30 mt-4">
                                    No tasks in backlog for the selected personnel.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Squad Plan */}
                    <div 
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`rounded-xl border p-4 flex flex-col min-h-0 overflow-hidden transition-colors ${
                            dragOverTodo
                                ? 'border-indigo-500 bg-indigo-950/20 border-dashed'
                                : 'border-zinc-800 bg-zinc-950/50'
                        }`}
                        style={{ maxHeight: '70vh' }}
                    >
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/50 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-emerald-400" />
                                <h3 className="font-semibold text-zinc-100">Squad Plan for {isToday(selectedDate) ? "Today" : format(selectedDate, 'MMM d')}</h3>
                                {squadMembers.some(sm => dailyTodos.getTodosForPersonDate(sm, dateStr).length > 0) && (
                                    <div className="flex items-center gap-1 ml-2">
                                        <button
                                            type="button"
                                            onClick={handleCopyForDM}
                                            className="p-1.5 rounded-md hover:bg-zinc-700/80 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1"
                                            title="Copy all squad plans for DM"
                                        >
                                            {copied ? (
                                                <span className="text-[10px] text-emerald-400 font-medium px-1">Copied!</span>
                                            ) : (
                                                <Copy className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleSendToWebhook}
                                            disabled={sending}
                                            className={`p-1.5 rounded-md transition-colors flex items-center gap-1 ${
                                                sending
                                                    ? 'bg-indigo-900/50 text-indigo-300 cursor-not-allowed'
                                                    : sendResult
                                                        ? sendResult.success
                                                            ? 'bg-emerald-900/50 text-emerald-300'
                                                            : 'bg-red-900/50 text-red-300'
                                                        : 'hover:bg-indigo-700/80 text-indigo-400 hover:text-indigo-200'
                                            }`}
                                            title="Send all squad plans to Lark"
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
                                    </div>
                                )}
                            </div>
                        </div>

                        {dragOverTodo && (
                            <div className="flex items-center justify-center py-4 mb-3 rounded-lg border-2 border-dashed border-indigo-500/50 bg-indigo-950/30 flex-shrink-0">
                                <Plus className="w-4 h-4 text-indigo-400 mr-2" />
                                <span className="text-indigo-300 text-sm">Drop to plan for squad</span>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-6 pb-8">
                             {/* Shared Plans Section */}
                             {squadMembers.length > 1 && sharedPlans.length > 0 && (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2 text-indigo-400 border-b border-indigo-900/30 pb-1">
                                        <Users className="w-3.5 h-3.5" />
                                        <h4 className="text-xs font-semibold uppercase tracking-wider">Shared Deliverables</h4>
                                    </div>
                                    <div className="space-y-1.5 pl-2 border-l border-indigo-900/30">
                                        {sharedPlans.map(planData => {
                                            const isCompleted = Array.from(planData.plannedBy).some(sm => {
                                                const t = dailyTodos.getTodosForPersonDate(sm, dateStr).find(tt => tt.taskId === planData.task.taskId);
                                                return t?.completedAt;
                                            });
                                            return renderCard(planData.task, 'plan', undefined, isCompleted, true, planData);
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Individual Plans Sections */}
                            {squadMembers.map(member => {
                                const plans = individualPlans[member] || [];
                                if (plans.length === 0) return null;
                                return (
                                    <div key={member} className="space-y-2">
                                        <div className="flex items-center gap-2 text-emerald-400 border-b border-emerald-900/30 pb-1">
                                            <User className="w-3.5 h-3.5" />
                                            <h4 className="text-xs font-semibold uppercase tracking-wider">{member}'s Plan</h4>
                                        </div>
                                        <div className="space-y-1.5 pl-2 border-l border-emerald-900/30">
                                            {plans.map(p => renderCard(p.task, 'plan', member, !!p.completedAt, false))}
                                        </div>
                                    </div>
                                );
                            })}
                            
                            {sharedPlans.length === 0 && squadMembers.every(m => individualPlans[m].length === 0) && !dragOverTodo && (
                                <div className="text-center py-12 text-zinc-500 border-t border-zinc-800/30 mt-4">
                                    <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30 text-emerald-500" />
                                    <p className="text-sm">No tasks planned for the squad</p>
                                    <p className="text-xs mt-1">Drag tasks from the backlog to plan</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
