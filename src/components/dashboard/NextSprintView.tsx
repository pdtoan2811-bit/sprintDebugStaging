'use client';

import React, { useState, useMemo, useCallback } from 'react';
import { TaskAnalysis, MeetingNote, RawLogEvent, WORKFLOW_STATUSES } from '@/lib/types';
import { useRoles, ROLE_ORDER, ValidRole } from '@/lib/hooks/useRoles';
import { useNextSprintPlanner } from '@/lib/hooks/useNextSprintPlanner';
import { useNextSprintDrafts } from '@/lib/hooks/useNextSprintDrafts';
import { useNextSprintDraftSettings } from '@/lib/hooks/useNextSprintDraftSettings';
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
import { format } from 'date-fns';

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

type SubView = 'draftManager' | 'squadPlanner';

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
    const { draftTaskIds, setDraft } = useNextSprintDrafts();
    const { selectedSprintNumbers, setSelectedSprintNumbers } = useNextSprintDraftSettings(activeSprint);

    const [selectedPersonsFilter, setSelectedPersonsFilter] = useState<Set<string>>(new Set());
    const [dragOverPlan, setDragOverPlan] = useState(false);
    const [isRolesModalOpen, setIsRolesModalOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [subView, setSubView] = useState<SubView>('draftManager');
    const [selectedDraftTaskIds, setSelectedDraftTaskIds] = useState<Set<string>>(new Set());

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

    // ── Backlog: draft tasks for selected squad members, not yet in next sprint plan ──
    const { sharedBacklog, individualBacklog } = useMemo(() => {
        const shared: TaskAnalysis[] = [];
        const individual: Record<string, TaskAnalysis[]> = {};
        squadMembers.forEach(sm => individual[sm] = []);

        const uniqueTasks = new Map<string, TaskAnalysis>();
        squadMembers.forEach(sm => {
            const data = allPersonData.find(p => p.person === sm);
            if (data) {
                data.allTasks.forEach(t => {
                    if (!draftTaskIds.has(t.taskId)) return;
                    if (taskInVisibleCategory(t.taskId, data, categoryFilter)) {
                        uniqueTasks.set(t.taskId, t);
                    }
                });
            }
        });

        uniqueTasks.forEach(task => {
            const assignees = task.currentPerson ? task.currentPerson.split(',').map(p => p.trim()) : [];
            const involved = squadMembers.filter(sm => assignees.includes(sm));

            // Check if fully planned by all involved squad members (for next sprint)
            const isFullyPlanned = involved.length > 0 && involved.every(sm => {
                const plans = planner.getPlansForPersonSprint(sm, nextSprintNumber);
                return plans.some(p => p.taskId === task.taskId);
            });

            if (isFullyPlanned) return;

            // Only treat as "shared" when ALL currently selected squad members
            // are involved with the task. Otherwise, it appears in the relevant
            // individual's backlog section.
            if (squadMembers.length > 1 && involved.length === squadMembers.length) {
                shared.push(task);
            } else if (involved.length === 1) {
                individual[involved[0]].push(task);
            } else if (involved.length > 1) {
                // Tasks shared by a subset (e.g. 2 of 3) are attached
                // to each involved member's individual backlog.
                involved.forEach(person => {
                    individual[person].push(task);
                });
            }
        });

        shared.sort((a, b) => b.staleDurationMs - a.staleDurationMs);
        Object.keys(individual).forEach(key => {
            individual[key].sort((a, b) => b.staleDurationMs - a.staleDurationMs);
        });

        return { sharedBacklog: shared, individualBacklog: individual };
    }, [allPersonData, squadMembers, categoryFilter, planner, nextSprintNumber, draftTaskIds]);

    // ── Plan: tasks dragged to the next sprint plan ──
    const { sharedPlans, pairPlans, individualPlans } = useMemo(() => {
        type PlanItem = { task: TaskAnalysis; plannedBy: Set<string>; involved: string[] };
        const subgroupMap = new Map<string, { members: string[]; tasks: Map<string, PlanItem> }>();
        const individual: Record<string, { task: TaskAnalysis }[]> = {};
        squadMembers.forEach(sm => (individual[sm] = []));

        squadMembers.forEach(sm => {
            const plans = planner.getPlansForPersonSprint(sm, nextSprintNumber);
            plans.forEach(planItem => {
                const task = analyses[planItem.taskId];
                if (!task) return;

                const assignees = task.currentPerson ? task.currentPerson.split(',').map(p => p.trim()) : [];
                const involved = squadMembers.filter(m => assignees.includes(m));

                if (involved.length > 1) {
                    // Build a stable key for this exact subset of squad members
                    const membersSorted = [...involved].sort();
                    const key = membersSorted.join('|');
                    let group = subgroupMap.get(key);
                    if (!group) {
                        group = { members: membersSorted, tasks: new Map<string, PlanItem>() };
                        subgroupMap.set(key, group);
                    }
                    const existing = group.tasks.get(task.taskId);
                    if (existing) {
                        existing.plannedBy.add(sm);
                    } else {
                        group.tasks.set(task.taskId, {
                            task,
                            plannedBy: new Set<string>([sm]),
                            involved: membersSorted,
                        });
                    }
                } else {
                    // Purely individual plan (no other squad member involved)
                    const member = involved[0] ?? sm;
                    if (!individual[member]) individual[member] = [];
                    if (!individual[member].some(t => t.task.taskId === task.taskId)) {
                        individual[member].push({ task });
                    }
                }
            });
        });

        const allGroups = Array.from(subgroupMap.values()).map(group => ({
            members: group.members,
            items: Array.from(group.tasks.values()),
        }));

        const sharedPlans = allGroups.filter(g => g.members.length === squadMembers.length);
        const pairPlans = allGroups.filter(g => g.members.length === 2);

        return { sharedPlans, pairPlans, individualPlans: individual };
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

        // Shared by all squad members
        if (sharedPlans.length > 0) {
            lines.push('🤝 Shared Deliverables (All Squad):');
            let idx = 1;
            sharedPlans.forEach(group => {
                group.items.forEach(item => {
                    lines.push(`  ${idx++}. ${item.task.taskName} [${item.task.currentStatus}]`);
                    if (item.task.recordLink) lines.push(`     ${item.task.recordLink}`);
                });
            });
            lines.push('');
        }

        // Pair groupings
        if (pairPlans.length > 0) {
            pairPlans.forEach(group => {
                lines.push(`🤝 Pair: ${group.members.join(' & ')}:`);
                group.items.forEach((item, i) => {
                    lines.push(`  ${i + 1}. ${item.task.taskName} [${item.task.currentStatus}]`);
                    if (item.task.recordLink) lines.push(`     ${item.task.recordLink}`);
                });
                lines.push('');
            });
        }

        // Individual plans
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

    const availableSprints = useMemo(() => {
        const nums = new Set<string>();
        rawLogs.forEach(l => {
            if (l.sprint) nums.add(String(l.sprint));
        });
        return Array.from(nums).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
    }, [rawLogs]);

    // Backlog for draft manager: all tasks whose latest log row
    // falls within the selected sprints. Draft status comes from draftTaskIds.
    const draftCandidates = useMemo(() => {
        if (selectedSprintNumbers.size === 0) return [] as { task: TaskAnalysis; latestLog: RawLogEvent; isDraft: boolean; metGoalInCurrentSprint: boolean }[];

        const latestByTask = new Map<string, RawLogEvent>();
        for (const log of rawLogs) {
            if (!log.sprint || !selectedSprintNumbers.has(String(log.sprint))) continue;
            const existing = latestByTask.get(log.taskId);
            if (!existing || new Date(log.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
                latestByTask.set(log.taskId, log);
            }
        }

        const rows: { task: TaskAnalysis; latestLog: RawLogEvent; isDraft: boolean; metGoalInCurrentSprint: boolean }[] = [];
        latestByTask.forEach((log, taskId) => {
            const task = analyses[taskId];
            if (!task) return;
            const metGoalInCurrentSprint =
                String(log.sprint || '').trim() === String(activeSprint).trim() &&
                !!task.sprintGoal &&
                task.currentStatus === task.sprintGoal;
            rows.push({
                task,
                latestLog: log,
                isDraft: draftTaskIds.has(taskId),
                metGoalInCurrentSprint,
            });
        });

        return rows.sort((a, b) => {
            // 1) Keep same sprint grouping
            const sprintA = parseInt(String(a.latestLog.sprint || '0'), 10);
            const sprintB = parseInt(String(b.latestLog.sprint || '0'), 10);
            if (!isNaN(sprintA) && !isNaN(sprintB) && sprintA !== sprintB) {
                return sprintA - sprintB;
            }
            // 2) Within sprint, push met-goal tasks to the bottom
            if (a.metGoalInCurrentSprint !== b.metGoalInCurrentSprint) {
                return a.metGoalInCurrentSprint ? 1 : -1;
            }
            // 3) For non-met-goal tasks, stale first
            return b.task.staleDurationMs - a.task.staleDurationMs;
        });
    }, [rawLogs, selectedSprintNumbers, analyses, draftTaskIds, activeSprint]);

    const handleConfirmMoveToNextSprint = async () => {
        if (!nextSprintNumber) return;
        const confirm = window.confirm(
            `Confirm moving all planned tasks to Sprint ${nextSprintNumber}?` +
            `\nThis will append logs to the Google Sheet and clear their draft flags.`
        );
        if (!confirm) return;

        const plannedTaskIds = new Set<string>();
        const personsWithPlans = planner.getAllPersonsWithPlans(nextSprintNumber);
        personsWithPlans.forEach(person => {
            planner.getPlansForPersonSprint(person, nextSprintNumber).forEach(p => plannedTaskIds.add(p.taskId));
        });

        if (plannedTaskIds.size === 0) return;

        const latestByTask = new Map<string, RawLogEvent>();
        for (const log of rawLogs) {
            if (!plannedTaskIds.has(log.taskId)) continue;
            const existing = latestByTask.get(log.taskId);
            if (!existing || new Date(log.timestamp).getTime() > new Date(existing.timestamp).getTime()) {
                latestByTask.set(log.taskId, log);
            }
        }

        const scriptUrl = '/api/google-logs-proxy';
        const payloads: any[] = [];
        latestByTask.forEach((log) => {
            payloads.push({
                timestamp: new Date().toISOString(),
                taskId: log.taskId,
                taskName: log.taskName,
                recordLink: log.recordLink,
                status: log.status,
                sprintGoal: log.sprintGoal,
                sprint: nextSprintNumber,
                person: log.person,
                module: log.module,
                screen: log.screen,
                nextSprintDraft: '',
            });
        });

        await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries: payloads }),
        }).catch((err) => {
            console.error('Failed to send sprint move logs to Google Sheet', err);
        });

        alert(`Logged ${plannedTaskIds.size} task(s) as moved to Sprint ${nextSprintNumber}.`);
    };

    const handleSprintGoalUpdate = async (taskId: string, newGoal: string) => {
        const latest = rawLogs
            .filter(l => l.taskId === taskId)
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
        if (!latest) return;

        const scriptUrl = '/api/google-logs-proxy';
        const payload = {
            timestamp: new Date().toISOString(),
            taskId: latest.taskId,
            taskName: latest.taskName,
            recordLink: latest.recordLink,
            status: latest.status,
            sprintGoal: newGoal,
            sprint: latest.sprint,
            person: latest.person,
            module: latest.module,
            screen: latest.screen,
            nextSprintDraft: draftTaskIds.has(taskId) ? 'draft' : '',
        };

        await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entries: [payload] }),
        }).catch(err => {
            console.error('Failed to log sprint goal change to Google Sheet', err);
        });
    };

    const totalPlannedForNextSprint = useMemo(() => {
        if (!nextSprintNumber) return 0;
        const persons = planner.getAllPersonsWithPlans(nextSprintNumber);
        let count = 0;
        persons.forEach(person => {
            count += planner.getPlansForPersonSprint(person, nextSprintNumber).length;
        });
        return count;
    }, [planner, nextSprintNumber]);

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

            {/* Sub-view selector */}
            <div className="flex items-center justify-between bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setSubView('draftManager')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${
                            subView === 'draftManager'
                                ? 'bg-zinc-800 text-zinc-100'
                                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                        }`}
                    >
                        <Layers className="w-4 h-4" />
                        Draft Manager
                    </button>
                    <button
                        onClick={() => setSubView('squadPlanner')}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-1.5 ${
                            subView === 'squadPlanner'
                                ? 'bg-zinc-800 text-zinc-100'
                                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                        }`}
                    >
                        <Users className="w-4 h-4" />
                        Squad Planner
                    </button>
                </div>
                <div className="flex items-center gap-3 text-xs text-zinc-400">
                    <div className="flex items-center gap-2">
                        <Calendar className="w-3 h-3" />
                        <span>
                            Planning transition to{' '}
                            <span className="font-mono text-indigo-300">
                                Sprint {nextSprint.number}{' '}
                                ({format(new Date(nextSprint.startDate), 'MMM d')} – {format(new Date(nextSprint.endDate), 'MMM d')})
                            </span>
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={handleConfirmMoveToNextSprint}
                        disabled={totalPlannedForNextSprint === 0}
                        className={`ml-2 px-3 py-1.5 rounded-md text-[11px] font-semibold border transition-colors ${
                            totalPlannedForNextSprint === 0
                                ? 'border-zinc-700 text-zinc-500 bg-zinc-900 cursor-not-allowed opacity-60'
                                : 'border-emerald-600 bg-emerald-800/80 text-white hover:bg-emerald-600'
                        }`}
                        title="Confirm moving all planned tasks to the next sprint and log the change"
                    >
                        Confirm move to Sprint {nextSprint.number}
                        {totalPlannedForNextSprint > 0 && (
                            <span className="ml-1 font-mono">({totalPlannedForNextSprint})</span>
                        )}
                    </button>
                </div>
            </div>

            {subView === 'draftManager' && (
                <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-indigo-400" />
                            <h3 className="font-semibold text-zinc-100 text-sm">Task Backlog Across Sprints</h3>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[11px]">
                            {availableSprints.map(s => {
                                const selected = selectedSprintNumbers.has(s);
                                return (
                                    <button
                                        key={s}
                                        onClick={() => {
                                            const next = new Set(selectedSprintNumbers);
                                            if (selected) next.delete(s);
                                            else next.add(s);
                                            setSelectedSprintNumbers(next);
                                        }}
                                        className={`px-2 py-1 rounded border transition-colors ${
                                            selected
                                                ? 'bg-indigo-700/40 border-indigo-500 text-indigo-100'
                                                : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800'
                                        }`}
                                    >
                                        Sprint {s}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="mt-3 text-xs text-zinc-400 flex items-center justify-between">
                        <span>
                            Showing <span className="font-mono text-zinc-200">incomplete</span> tasks whose latest log row is in the selected sprints.
                            Use the toggle on each row to mark/unmark them as next-sprint drafts.
                        </span>
                        <span className="font-mono text-zinc-300">
                            {draftCandidates.length} task(s),{' '}
                            {draftCandidates.filter(r => r.isDraft).length} draft
                        </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="text-zinc-400">
                            Selected:{' '}
                            <span className="font-mono text-zinc-100">{selectedDraftTaskIds.size}</span>
                        </span>
                        <button
                            type="button"
                            disabled={selectedDraftTaskIds.size === 0}
                            onClick={() => {
                                const ids = Array.from(selectedDraftTaskIds);
                                ids.forEach(id => setDraft(id, true));
                            }}
                            className="px-2.5 py-1 rounded-md border border-emerald-700 text-emerald-200 bg-emerald-900/40 hover:bg-emerald-800/60 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Mark selected as draft
                        </button>
                        <button
                            type="button"
                            disabled={selectedDraftTaskIds.size === 0}
                            onClick={() => {
                                const ids = Array.from(selectedDraftTaskIds);
                                ids.forEach(id => setDraft(id, false));
                            }}
                            className="px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-200 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Clear draft for selected
                        </button>
                        <button
                            type="button"
                            disabled={draftCandidates.length === 0}
                            onClick={() => {
                                setSelectedDraftTaskIds(new Set(draftCandidates.map(r => r.task.taskId)));
                            }}
                            className="ml-auto px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-300 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Select all in view
                        </button>
                        <button
                            type="button"
                            disabled={selectedDraftTaskIds.size === 0}
                            onClick={() => setSelectedDraftTaskIds(new Set())}
                            className="px-2.5 py-1 rounded-md border border-zinc-700 text-zinc-300 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Clear selection
                        </button>
                    </div>

                    <div className="mt-3 border-t border-zinc-800/60 pt-3 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                        {draftCandidates.length === 0 ? (
                            <div className="text-center py-6 text-zinc-500 text-sm">
                                No incomplete tasks found for the selected sprints.
                            </div>
                        ) : (
                            <table className="w-full text-xs text-left border-collapse">
                                <thead className="text-zinc-400 border-b border-zinc-800/70">
                                    <tr>
                                        <th className="py-1.5 pr-2 font-normal w-8">
                                            <input
                                                type="checkbox"
                                                className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-900"
                                                checked={
                                                    draftCandidates.length > 0 &&
                                                    draftCandidates.every(r => selectedDraftTaskIds.has(r.task.taskId))
                                                }
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedDraftTaskIds(new Set(draftCandidates.map(r => r.task.taskId)));
                                                    } else {
                                                        setSelectedDraftTaskIds(new Set());
                                                    }
                                                }}
                                            />
                                        </th>
                                        <th className="py-1.5 pr-2 font-normal">Sprint</th>
                                        <th className="py-1.5 pr-2 font-normal">Task</th>
                                        <th className="py-1.5 pr-2 font-normal hidden sm:table-cell">Person</th>
                                        <th className="py-1.5 pr-2 font-normal">Status / Blocked</th>
                                        <th className="py-1.5 pr-2 font-normal">Sprint Goal</th>
                                        <th className="py-1.5 pl-2 font-normal text-right">Draft</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {draftCandidates.map(({ task, latestLog, isDraft, metGoalInCurrentSprint }) => (
                                        <tr
                                            key={task.taskId}
                                            className={`border-b border-zinc-900/40 hover:bg-zinc-900/60 ${
                                                metGoalInCurrentSprint ? 'bg-emerald-950/60 ring-1 ring-emerald-700/60' : ''
                                            }`}
                                        >
                                            <td className="py-1.5 pr-2 align-top">
                                                <input
                                                    type="checkbox"
                                                    className="w-3.5 h-3.5 rounded border-zinc-600 bg-zinc-900"
                                                    checked={selectedDraftTaskIds.has(task.taskId)}
                                                    onChange={(e) => {
                                                        setSelectedDraftTaskIds(prev => {
                                                            const next = new Set(prev);
                                                            if (e.target.checked) next.add(task.taskId);
                                                            else next.delete(task.taskId);
                                                            return next;
                                                        });
                                                    }}
                                                />
                                            </td>
                                            <td className="py-1.5 pr-2 align-top">
                                                <div className="flex items-center gap-1.5">
                                                    <span
                                                        className={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${
                                                            metGoalInCurrentSprint
                                                                ? 'bg-emerald-900/90 text-emerald-100 border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.6)]'
                                                                : 'border-zinc-700 text-zinc-300 bg-zinc-950/80'
                                                        }`}
                                                    >
                                                        {latestLog.sprint ?? '-'}
                                                    </span>
                                                    {metGoalInCurrentSprint && (
                                                        <span className="text-[9px] uppercase tracking-wide text-emerald-300 font-semibold">
                                                            Met Goal
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="py-1.5 pr-2 align-top">
                                                <button
                                                    className="text-[11px] text-zinc-100 hover:text-indigo-200 font-medium truncate max-w-[180px] sm:max-w-[260px] text-left"
                                                    onClick={() => onTaskClick(task.taskId)}
                                                >
                                                    {task.taskName}
                                                </button>
                                                <div className="text-[10px] text-zinc-500 mt-0.5 truncate max-w-[200px]">
                                                    {task.taskId}
                                                </div>
                                            </td>
                                            <td className="py-1.5 pr-2 align-top hidden sm:table-cell">
                                                <div className="text-[11px] text-zinc-300 truncate max-w-[140px]">
                                                    {latestLog.person || task.currentPerson || 'Unassigned'}
                                                </div>
                                            </td>
                                            <td className="py-1.5 pr-2 align-top">
                                                <div className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border border-zinc-700/80 text-zinc-200 bg-zinc-900/80">
                                                    <span>{task.currentStatus}</span>
                                                </div>
                                                {task.blockedBy && (
                                                    <div className="text-[10px] text-red-300 mt-0.5">
                                                        Blocked by: {task.blockedBy}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-1.5 pr-2 align-top">
                                                <select
                                                    defaultValue={task.sprintGoal || ''}
                                                    onChange={(e) => {
                                                        const value = e.target.value;
                                                        if (value === (task.sprintGoal || '')) return;
                                                        handleSprintGoalUpdate(task.taskId, value);
                                                    }}
                                                    className="w-full bg-zinc-950 border border-zinc-700 rounded px-2 py-1 text-[11px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                                >
                                                    <option value="">No goal set</option>
                                                    {WORKFLOW_STATUSES.map((s) => (
                                                        <option key={s.name} value={s.name}>
                                                            {s.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="py-1.5 pl-2 align-top text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => setDraft(task.taskId, !isDraft)}
                                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition-colors ${
                                                        isDraft
                                                            ? 'bg-emerald-900/60 border-emerald-600 text-emerald-200 hover:bg-emerald-800'
                                                            : 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                                                    }`}
                                                >
                                                    {isDraft ? (
                                                        <>
                                                            <CheckCircle2 className="w-3 h-3" />
                                                            Draft
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Plus className="w-3 h-3" />
                                                            Mark draft
                                                        </>
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            )}

            {subView === 'squadPlanner' && (
                <>
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
                                    Select one or more team members above to start forming a squad. The views below will dynamically update to show shared draft tasks and planned deliverables for Sprint {nextSprint.number}.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">
                            {/* Left Column: Squad Draft Backlog */}
                            <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-4 flex flex-col min-h-0 overflow-hidden" style={{ maxHeight: '70vh' }}>
                                <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/50 flex-shrink-0">
                                    <div className="flex items-center gap-2">
                                        <Layers className="w-4 h-4 text-indigo-400" />
                                        <h3 className="font-semibold text-zinc-100">Squad Draft Backlog</h3>
                                    </div>
                                    <Badge variant="outline" className="text-[10px] border-indigo-800/50 text-indigo-300 bg-indigo-950/20">
                                        {sharedBacklog.length + squadMembers.reduce((sum, m) => sum + (individualBacklog[m]?.length || 0), 0)} tasks
                                    </Badge>
                                </div>

                                <div className="text-[10px] text-zinc-500 mb-3 flex items-center gap-1 flex-shrink-0">
                                    <GripVertical className="w-3 h-3" />
                                    Drag draft tasks to the Sprint Plan to plan them for Sprint {nextSprint.number}
                                </div>

                                <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-6 pb-8">
                                    {/* Shared Backlog Section */}
                                    {squadMembers.length > 1 && sharedBacklog.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-indigo-400 border-b border-indigo-900/30 pb-1">
                                                <Users className="w-3.5 h-3.5" />
                                                <h4 className="text-xs font-semibold uppercase tracking-wider">Shared Draft Tasks ({sharedBacklog.length})</h4>
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
                                                    <h4 className="text-xs font-semibold uppercase tracking-wider">{member}&apos;s Draft Tasks ({tasks.length})</h4>
                                                </div>
                                                <div className="space-y-1.5 pl-2 border-l border-zinc-800/50">
                                                    {tasks.map(task => renderCard(task, 'backlog', member))}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {sharedBacklog.length === 0 && squadMembers.every(m => (individualBacklog[m]?.length || 0) === 0) && (
                                        <div className="text-center py-8 text-zinc-500 text-sm border-t border-zinc-800/30 mt-4">
                                            No draft tasks for the selected squad members.
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Right Column: Squad Plan for Sprint N */}
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
                                    {/* Shared Deliverables: tasks shared by ALL selected squad members */}
                                    {squadMembers.length > 1 && sharedPlans.length > 0 && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-indigo-400 border-b border-indigo-900/30 pb-1">
                                                <Users className="w-3.5 h-3.5" />
                                                <h4 className="text-xs font-semibold uppercase tracking-wider">Shared Deliverables (All Squad)</h4>
                                            </div>
                                            <div className="space-y-1.5 pl-2 border-l border-indigo-900/30">
                                                {sharedPlans.flatMap(group =>
                                                    group.items.map(item =>
                                                        renderCard(item.task, 'plan', undefined, true, {
                                                            plannedBy: item.plannedBy,
                                                            involved: group.members,
                                                        })
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Pair Groups: tasks shared by exactly 2 squad members (A&B, B&C, etc.) */}
                                    {pairPlans.length > 0 && (
                                        <div className="space-y-4">
                                            {pairPlans.map(group => (
                                                <div key={group.members.join('|')} className="space-y-2">
                                                    <div className="flex items-center gap-2 text-indigo-300 border-b border-indigo-900/40 pb-1">
                                                        <Users className="w-3.5 h-3.5" />
                                                        <h4 className="text-xs font-semibold uppercase tracking-wider">
                                                            Pair: {group.members.join(' & ')}
                                                        </h4>
                                                    </div>
                                                    <div className="space-y-1.5 pl-2 border-l border-indigo-900/40">
                                                        {group.items.map(item =>
                                                            renderCard(item.task, 'plan', undefined, true, {
                                                                plannedBy: item.plannedBy,
                                                                involved: group.members,
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Individual Plans Sections (leftover tasks unique to each person) */}
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
                                            <p className="text-xs mt-1">Drag draft tasks from the backlog to plan</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

export default NextSprintView;
