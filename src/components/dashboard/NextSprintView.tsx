'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { TaskAnalysis, MeetingNote, RawLogEvent } from '@/lib/types';
import { useRoles, ROLE_ORDER, ValidRole } from '@/lib/hooks/useRoles';
import { useNextSprintPlanner } from '@/lib/hooks/useNextSprintPlanner';
import { SprintConfig } from '@/lib/hooks/useSprintConfig';
import { Badge } from '@/components/ui/badge';
import {
    AlertTriangle,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Copy,
    CopyCheck,
    GripVertical,
    Layers,
    Loader2,
    PlayCircle,
    Plus,
    Send,
    Settings,
    Target,
    User,
    Users,
    Circle,
    CheckCircle2,
} from 'lucide-react';
import { DraggableTaskCard } from './daily-meeting/components/DraggableTaskCard';
import {
    getLatestMeetingNote,
    formatCorporateName,
    taskInVisibleCategory,
} from './daily-meeting/utils';
import { PersonMeetingData, CategoryFilterKey } from './daily-meeting/types';
import { computePersonMeetingData } from './daily-meeting/utils';
import { ACTIVE_STATUSES } from './daily-meeting/constants';

export interface NextSprintViewProps {
    analyses: Record<string, TaskAnalysis>;
    meetingNotes?: Record<string, MeetingNote[]>;
    rawLogs?: RawLogEvent[];
    sprintStartSnapshot?: Record<string, string>;
    highRiskIds?: Set<string>;
    onTaskClick?: (taskId: string) => void;
    sprintConfigs: SprintConfig[];
    activeSprint: string;
}

export function NextSprintView({
    analyses,
    meetingNotes = {},
    rawLogs = [],
    sprintStartSnapshot = {},
    highRiskIds = new Set(),
    onTaskClick = () => { },
    sprintConfigs,
    activeSprint,
}: NextSprintViewProps) {
    const rolesData = useRoles();
    const { roles } = rolesData;
    const planner = useNextSprintPlanner();

    const [selectedPersonsFilter, setSelectedPersonsFilter] = useState<Set<string>>(new Set());
    const [dragOverPlan, setDragOverPlan] = useState(false);
    const [isRolesModalOpen, setIsRolesModalOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    // Determine the next sprint
    const nextSprint = useMemo(() => {
        const currentNum = parseInt(activeSprint, 10);
        if (isNaN(currentNum)) return null;
        return sprintConfigs.find(c => parseInt(c.number, 10) === currentNum + 1) || null;
    }, [activeSprint, sprintConfigs]);

    const nextSprintNumber = nextSprint?.number || '';

    // Pre-compute person meeting data (same as DailyMeetingView)
    const allPersonData = useMemo(() => {
        return computePersonMeetingData(analyses, meetingNotes, rawLogs, sprintStartSnapshot);
    }, [analyses, meetingNotes, rawLogs, sprintStartSnapshot]);

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

    const squadMembers = useMemo(() => {
        return Array.from(selectedPersonsFilter).sort((a, b) => {
            const roleA = roles[a] || 'Other';
            const roleB = roles[b] || 'Other';
            const indexA = ROLE_ORDER.indexOf(roleA as ValidRole);
            const indexB = ROLE_ORDER.indexOf(roleB as ValidRole);
            const posA = indexA === -1 ? 99 : indexA;
            const posB = indexB === -1 ? 99 : indexB;
            if (posA !== posB) return posA - posB;
            return a.localeCompare(b);
        });
    }, [selectedPersonsFilter, roles]);

    // Category filter – show all categories by default
    const categoryFilter: Record<CategoryFilterKey, boolean> = {
        doing: true,
        blockedByOthers: true,
        blockingOthers: true,
        notStarted: true,
        other: true,
    };

    // ── Backlog: tasks from current sprint belonging to selected squad members, not yet planned ──
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
                const plans = planner.getPlansForPersonSprint(sm, nextSprintNumber);
                return plans.some(p => p.taskId === task.taskId);
            });

            if (isFullyPlanned) return;

            if (involved.length > 1) {
                shared.push(task);
            } else if (involved.length === 1) {
                individual[involved[0]].push(task);
            }
        });

        shared.sort((a, b) => b.staleDurationMs - a.staleDurationMs);
        Object.keys(individual).forEach(key => {
            individual[key].sort((a, b) => b.staleDurationMs - a.staleDurationMs);
        });

        return { sharedBacklog: shared, individualBacklog: individual };
    }, [allPersonData, squadMembers, categoryFilter, planner, nextSprintNumber]);

    // ── Plan: tasks dragged to the next sprint plan ──
    const { sharedPlans, individualPlans } = useMemo(() => {
        const shared = new Map<string, { task: TaskAnalysis, plannedBy: Set<string>, involved: string[] }>();
        const individual: Record<string, { task: TaskAnalysis }[]> = {};
        squadMembers.forEach(sm => individual[sm] = []);

        squadMembers.forEach(sm => {
            const plans = planner.getPlansForPersonSprint(sm, nextSprintNumber);
            plans.forEach(planItem => {
                const task = analyses[planItem.taskId];
                if (!task) return;

                const assignees = task.currentPerson ? task.currentPerson.split(',').map(p => p.trim()) : [];
                const involved = squadMembers.filter(m => assignees.includes(m));

                if (involved.length > 1) {
                    if (!shared.has(task.taskId)) {
                        shared.set(task.taskId, { task, plannedBy: new Set([sm]), involved });
                    } else {
                        shared.get(task.taskId)!.plannedBy.add(sm);
                    }
                } else {
                    if (!individual[sm]) individual[sm] = [];
                    if (!individual[sm].some(t => t.task.taskId === task.taskId)) {
                        individual[sm].push({ task });
                    }
                }
            });
        });

        return { sharedPlans: Array.from(shared.values()), individualPlans: individual };
    }, [squadMembers, planner, nextSprintNumber, analyses]);

    // ── Drag \u0026 drop ──
    const handleDragStart = (e: React.DragEvent, taskId: string) => {
        e.dataTransfer!.setData('text/plain', taskId);
        e.dataTransfer!.effectAllowed = 'move';
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer!.dropEffect = 'move';
        setDragOverPlan(true);
    };

    const handleDragLeave = () => {
        setDragOverPlan(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOverPlan(false);
        if (!nextSprintNumber) return;

        const taskId = e.dataTransfer!.getData('text/plain');
        if (taskId) {
            const task = analyses[taskId];
            if (!task) return;
            const assignees = task.currentPerson ? task.currentPerson.split(',').map(p => p.trim()) : [];
            const involved = squadMembers.filter(m => assignees.includes(m));

            if (involved.length > 0) {
                involved.forEach(sm => {
                    const plans = planner.getPlansForPersonSprint(sm, nextSprintNumber);
                    if (!plans.some(p => p.taskId === taskId)) {
                        planner.addPlan(sm, nextSprintNumber, taskId);
                    }
                });
            } else if (squadMembers.length === 1) {
                const plans = planner.getPlansForPersonSprint(squadMembers[0], nextSprintNumber);
                if (!plans.some(p => p.taskId === taskId)) {
                    planner.addPlan(squadMembers[0], nextSprintNumber, taskId);
                }
            }
        }
    };

    // ── Copy plan summary ──
    const handleCopyPlan = useCallback(() => {
        const lines: string[] = [];
        lines.push(`📋 Sprint ${nextSprintNumber} Plan`);
        lines.push('');

        if (sharedPlans.length > 0) {
            lines.push('🤝 Shared Deliverables:');
            sharedPlans.forEach((p, i) => {
                lines.push(`  ${i + 1}. ${p.task.taskName} [${p.task.currentStatus}]`);
                if (p.task.recordLink) lines.push(`     ${p.task.recordLink}`);
            });
            lines.push('');
        }

        squadMembers.forEach(member => {
            const plans = individualPlans[member] || [];
            if (plans.length === 0) return;
            lines.push(`👤 ${member}:`);
            plans.forEach((p, i) => {
                lines.push(`  ${i + 1}. ${p.task.taskName} [${p.task.currentStatus}]`);
                if (p.task.recordLink) lines.push(`     ${p.task.recordLink}`);
            });
            lines.push('');
        });

        if (lines.length <= 2) return;
        navigator.clipboard.writeText(lines.join('\n').trimEnd()).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, [nextSprintNumber, sharedPlans, squadMembers, individualPlans]);

    // ── Card rendering (matches SquadsView exactly) ──
    const renderCard = (
        task: TaskAnalysis,
        context: 'backlog' | 'plan',
        member?: string,
        isSharedPlan?: boolean,
        sharedPlanData?: { plannedBy: Set<string>; involved: string[] }
    ) => {
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
            if (!nextSprintNumber) return;
            const assignees = task.currentPerson ? task.currentPerson.split(',').map(p => p.trim()) : [];
            const involved = squadMembers.filter(m => assignees.includes(m));
            if (involved.length > 0) {
                involved.forEach(sm => planner.addPlan(sm, nextSprintNumber, task.taskId));
            } else if (squadMembers.length === 1) {
                planner.addPlan(squadMembers[0], nextSprintNumber, task.taskId);
            }
        };

        const onRemove = () => {
            if (!nextSprintNumber) return;
            if (isSharedPlan && sharedPlanData) {
                sharedPlanData.plannedBy.forEach(sm => planner.removePlan(sm, nextSprintNumber, task.taskId));
            } else if (member) {
                planner.removePlan(member, nextSprintNumber, task.taskId);
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
                    showSprintGoal={context === 'plan'}
                    showQuickAdd={context === 'backlog'}
                    onQuickAdd={onQuickAdd}
                    onRemoveFromTodo={onRemove}
                    categoryLabel={getCategoryLabel()}
                    blockedByLabel={blockedByLabel}
                    renderActions={
                        isSharedPlan && sharedPlanData ? (
                            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 rounded p-0.5" onClick={(e) => e.stopPropagation()}>
                                {sharedPlanData.involved.map(inv => {
                                    const isPlanning = sharedPlanData.plannedBy.has(inv);
                                    return (
                                        <button
                                            key={inv}
                                            onClick={() => {
                                                if (!nextSprintNumber) return;
                                                if (isPlanning) planner.removePlan(inv, nextSprintNumber, task.taskId);
                                                else planner.addPlan(inv, nextSprintNumber, task.taskId);
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

    // ── Roles Modal (same as SquadsView) ──
    const renderRolesModal = () => {
        if (!isRolesModalOpen) return null;
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div className="p-5 pb-4 border-b border-zinc-800/50 bg-zinc-900/30 flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                                <Settings className="w-5 h-5 text-zinc-400" />
                                Manage Team Roles
                            </h2>
                            <p className="text-sm text-zinc-500 mt-1">Assign roles to team members for squad planning.</p>
                        </div>
                        <button onClick={() => setIsRolesModalOpen(false)} className="text-zinc-400 hover:text-zinc-200 p-1">
                            ✕
                        </button>
                    </div>
                    <div className="p-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                        <div className="space-y-3">
                            {sortedAllPersonData.map(p => (
                                <div key={p.person} className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                                    <span className="font-medium text-zinc-300">{p.person}</span>
                                    <input
                                        type="text"
                                        value={roles[p.person] || ''}
                                        onChange={(e) => rolesData.updateRole(p.person, e.target.value)}
                                        placeholder="e.g. Frontend, Backend, QA"
                                        className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-40"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    if (!nextSprint) {
        return (
            <div className="flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/50 py-16">
                <div className="text-center max-w-md px-4">
                    <Target className="w-12 h-12 mx-auto mb-4 text-indigo-500/30" />
                    <h3 className="text-zinc-200 font-semibold mb-2">No Next Sprint Configured</h3>
                    <p className="text-sm text-zinc-400">
                        The current sprint is <span className="font-mono text-indigo-300">Sprint {activeSprint}</span>, but no subsequent sprint is configured.
                        Add sprint configurations in Settings to enable next sprint planning.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 flex flex-col min-h-[500px]">
            {renderRolesModal()}

            {/* Personnel Selector Row — same as SquadsView */}
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
                    {/* Left Column: Squad Backlog — same structure as SquadsView */}
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
                            Drag tasks to the Sprint Plan to plan them
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
                                            <h4 className="text-xs font-semibold uppercase tracking-wider">{member}&apos;s Tasks ({tasks.length})</h4>
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

                    {/* Right Column: Squad Plan for Sprint N — same structure as SquadsView */}
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`rounded-xl border p-4 flex flex-col min-h-0 overflow-hidden transition-colors ${
                            dragOverPlan
                                ? 'border-indigo-500 bg-indigo-950/20 border-dashed'
                                : 'border-zinc-800 bg-zinc-950/50'
                        }`}
                        style={{ maxHeight: '70vh' }}
                    >
                        <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/50 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-emerald-400" />
                                <h3 className="font-semibold text-zinc-100">Squad Plan for Sprint {nextSprint.number}</h3>
                                {squadMembers.some(sm => planner.getPlansForPersonSprint(sm, nextSprintNumber).length > 0) && (
                                    <div className="flex items-center gap-1 ml-2">
                                        <button
                                            type="button"
                                            onClick={handleCopyPlan}
                                            className="p-1.5 rounded-md hover:bg-zinc-700/80 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1"
                                            title="Copy sprint plan summary"
                                        >
                                            {copied ? (
                                                <span className="text-[10px] text-emerald-400 font-medium px-1">Copied!</span>
                                            ) : (
                                                <Copy className="w-3.5 h-3.5" />
                                            )}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {dragOverPlan && (
                            <div className="flex items-center justify-center py-4 mb-3 rounded-lg border-2 border-dashed border-indigo-500/50 bg-indigo-950/30 flex-shrink-0">
                                <Plus className="w-4 h-4 text-indigo-400 mr-2" />
                                <span className="text-indigo-300 text-sm">Drop to plan for Sprint {nextSprint.number}</span>
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
                                        {sharedPlans.map(planData => renderCard(planData.task, 'plan', undefined, true, planData))}
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
                                            <h4 className="text-xs font-semibold uppercase tracking-wider">{member}&apos;s Plan</h4>
                                        </div>
                                        <div className="space-y-1.5 pl-2 border-l border-emerald-900/30">
                                            {plans.map(p => renderCard(p.task, 'plan', member, false))}
                                        </div>
                                    </div>
                                );
                            })}

                            {sharedPlans.length === 0 && squadMembers.every(m => (individualPlans[m]?.length || 0) === 0) && !dragOverPlan && (
                                <div className="text-center py-12 text-zinc-500 border-t border-zinc-800/30 mt-4">
                                    <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30 text-emerald-500" />
                                    <p className="text-sm">No tasks planned for Sprint {nextSprint.number}</p>
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

export default NextSprintView;
