'use client';

import React, { useMemo, useState, useCallback, DragEvent } from 'react';
import { TaskAnalysis, RawLogEvent } from '@/lib/types';
import { useNextSprintPlan, DraftTask } from '@/lib/hooks/useNextSprintPlan';
import { fetchLogs } from '@/lib/api';
import { getStatusSeverity, isBottleneckStatus } from '@/lib/workflow-engine';
import {
    Calendar,
    Send,
    Target,
    Zap,
    Users,
    Circle,
    PlayCircle,
    AlertTriangle,
    Loader2,
    Trash2,
    Plus,
    User,
    Layers,
    GripVertical,
    CheckCircle2,
    XCircle,
    Clock,
    RefreshCw,
    ShieldCheck
} from 'lucide-react';
import { Badge } from '../ui/badge';

type SyncTaskStatus = 'pending' | 'sending' | 'success' | 'failed';
type VerifyStatus = 'idle' | 'verifying' | 'done';

interface SyncTaskResult {
    taskId: string;
    taskName: string;
    status: SyncTaskStatus;
    error?: string;
}

interface VerificationResult {
    taskId: string;
    taskName: string;
    matched: boolean;
    detail: string;
}

interface SyncProgress {
    total: number;
    completed: number;
    currentTaskId: string | null;
    results: SyncTaskResult[];
    phase: 'sending' | 'verifying' | 'done';
    verifyStatus: VerifyStatus;
    verificationResults: VerificationResult[];
}

interface NextSprintPlanningViewProps {
    analyses: Record<string, TaskAnalysis>;
    rawLogs: RawLogEvent[];
    activeSprint: string;
    onTaskClick: (taskId: string) => void;
}

const ACTIVE_STATUSES = new Set(['In Process', 'Bug Fixing', 'Testing', 'Reviewing']);

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

export function NextSprintPlanningView({
    analyses,
    rawLogs,
    activeSprint,
    onTaskClick
}: NextSprintPlanningViewProps) {
    const {
        drafts,
        isLoading,
        addDraft,
        removeDraft,
        updateDraft,
        bulkUpdateDrafts,
        getDraftsArray
    } = useNextSprintPlan(activeSprint);

    const [selectedPersonsFilter, setSelectedPersonsFilter] = useState<Set<string>>(new Set());
    const [dragOverPlan, setDragOverPlan] = useState(false);
    
    // Bulk Edit States
    const [bulkTargetSprint, setBulkTargetSprint] = useState<string>(activeSprint ? String(parseInt(activeSprint) + 1) : '');
    const [bulkTargetStatus, setBulkTargetStatus] = useState<string>('');
    const [bulkTargetSprintGoal, setBulkTargetSprintGoal] = useState<string>('');
    
    const [syncProgress, setSyncProgress] = useState<SyncProgress | null>(null);
    const isSyncing = syncProgress !== null && syncProgress.phase !== 'done';

    // Get all uncompleted tasks and all unique persons
    const { allPersons, allUncompletedTasks } = useMemo(() => {
        const persons = new Set<string>();
        const uncompleted: TaskAnalysis[] = [];
        Object.values(analyses).forEach(t => {
            if (t.currentStatus !== 'Completed' && t.currentStatus !== 'Staging Passed') {
                uncompleted.push(t);
                const assignees = t.currentPerson ? t.currentPerson.split(',').map(p => p.trim()).filter(Boolean) : [];
                assignees.forEach(p => persons.add(p));
            }
        });
        return { 
            allPersons: Array.from(persons).sort((a,b) => a.localeCompare(b)),
            allUncompletedTasks: uncompleted 
        };
    }, [analyses]);

    const squadMembers = Array.from(selectedPersonsFilter).sort((a,b) => a.localeCompare(b));

    // Compute backlog for the selected squad
    const { combinationBacklogs, individualBacklog } = useMemo(() => {
        if (squadMembers.length === 0) return { combinationBacklogs: [], individualBacklog: {} };
        
        const combinations = new Map<string, TaskAnalysis[]>();
        const individual: Record<string, TaskAnalysis[]> = {};
        squadMembers.forEach(sm => individual[sm] = []);

        allUncompletedTasks.forEach(task => {
            if (drafts[task.taskId]) return; // Exclude drafted ones from backlog

            const assignees = task.currentPerson ? task.currentPerson.split(',').map(p => p.trim()) : [];
            const involved = squadMembers.filter(sm => assignees.includes(sm));
            
            if (involved.length > 1) {
                involved.sort((a, b) => a.localeCompare(b));
                const key = involved.join('|');
                if (!combinations.has(key)) combinations.set(key, []);
                combinations.get(key)!.push(task);
            } else if (involved.length === 1) {
                if (!individual[involved[0]].some(t => t.taskId === task.taskId)) {
                    individual[involved[0]].push(task);
                }
            }
        });

        const combinationArray = Array.from(combinations.entries()).map(([key, tasks]) => {
            // Sort to look nice
            tasks.sort((a, b) => a.taskName.localeCompare(b.taskName));
            return {
                involvedList: key.split('|'),
                tasks
            };
        });

        combinationArray.sort((a, b) => {
            if (a.involvedList.length !== b.involvedList.length) return b.involvedList.length - a.involvedList.length;
            return a.involvedList.join(',').localeCompare(b.involvedList.join(','));
        });

        return { combinationBacklogs: combinationArray, individualBacklog: individual };
    }, [allUncompletedTasks, squadMembers, drafts]);

    // Tasks that are drafted and involve the squad
    const squadDrafts = useMemo(() => {
        const array = getDraftsArray();
        if (squadMembers.length === 0) return [];
        return array.filter(d => {
            const task = analyses[d.taskId];
            if (!task) return false;
            const assignees = task.currentPerson ? task.currentPerson.split(',').map(p => p.trim()) : [];
            return squadMembers.some(sm => assignees.includes(sm));
        });
    }, [getDraftsArray, analyses, squadMembers]);

    const handleDragStart = (e: DragEvent, taskId: string) => {
        e.dataTransfer.setData('text/plain', taskId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDrop = (e: DragEvent) => {
        e.preventDefault();
        setDragOverPlan(false);
        const taskId = e.dataTransfer.getData('text/plain');
        if (taskId && analyses[taskId]) {
            const task = analyses[taskId];
            addDraft({
                taskId,
                targetSprint: bulkTargetSprint,
                targetStatus: task.currentStatus,
                targetSprintGoal: task.sprintGoal || ''
            });
        }
    };

    const handleApplyBulkEdits = () => {
        const squadTaskIds = squadDrafts.map(d => d.taskId);
        if (squadTaskIds.length > 0) {
            const updates: Partial<DraftTask> = {};
            if (bulkTargetSprint) updates.targetSprint = bulkTargetSprint;
            if (bulkTargetStatus) updates.targetStatus = bulkTargetStatus;
            if (bulkTargetSprintGoal !== '') updates.targetSprintGoal = bulkTargetSprintGoal;
            
            if (Object.keys(updates).length > 0) {
                bulkUpdateDrafts(updates, squadTaskIds);
            }
        }
    };

    const SYNC_DELAY_MS = 1500;

    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    const handleSendToWebhook = useCallback(async () => {
        if (squadDrafts.length === 0 || squadMembers.length === 0) return;

        const initialResults: SyncTaskResult[] = squadDrafts.map(d => {
            const task = analyses[d.taskId];
            return {
                taskId: d.taskId,
                taskName: task ? task.taskName : 'Unknown',
                status: 'pending' as SyncTaskStatus,
            };
        });

        setSyncProgress({
            total: squadDrafts.length,
            completed: 0,
            currentTaskId: null,
            results: initialResults,
            phase: 'sending',
            verifyStatus: 'idle',
            verificationResults: [],
        });

        const updatedResults = [...initialResults];
        let completedCount = 0;

        // ── Sequential per-task sending ──
        for (let i = 0; i < squadDrafts.length; i++) {
            const draft = squadDrafts[i];
            const task = analyses[draft.taskId];

            // Mark current task as sending
            updatedResults[i] = { ...updatedResults[i], status: 'sending' };
            setSyncProgress(prev => prev ? {
                ...prev,
                currentTaskId: draft.taskId,
                results: [...updatedResults],
            } : prev);

            const payload = {
                person: task ? task.currentPerson : squadMembers[0],
                eventType: 'sprint_planning_task',
                currentSprint: activeSprint,
                targetSprint: draft.targetSprint,
                squadMembers,
                taskId: draft.taskId,
                taskName: task ? task.taskName : 'Unknown',
                recordLink: task ? task.recordLink : '',
                targetStatus: draft.targetStatus,
                targetSprintGoal: draft.targetSprintGoal,
            };

            try {
                const res = await fetch('/api/send-todo-webhook', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({}));
                    throw new Error(err.error || `HTTP error ${res.status}`);
                }

                updatedResults[i] = { ...updatedResults[i], status: 'success' };
            } catch (error) {
                updatedResults[i] = {
                    ...updatedResults[i],
                    status: 'failed',
                    error: error instanceof Error ? error.message : 'Unknown error',
                };
            }

            completedCount++;
            setSyncProgress(prev => prev ? {
                ...prev,
                completed: completedCount,
                results: [...updatedResults],
            } : prev);

            // Wait between tasks (skip delay after the last one)
            if (i < squadDrafts.length - 1) {
                await sleep(SYNC_DELAY_MS);
            }
        }

        // ── Verification phase: re-fetch from Google Sheet ──
        setSyncProgress(prev => prev ? {
            ...prev,
            phase: 'verifying',
            verifyStatus: 'verifying',
            currentTaskId: null,
        } : prev);

        let verificationResults: VerificationResult[] = [];
        try {
            // Small delay to let the Lark automation propagate
            await sleep(2000);
            const freshLogs = await fetchLogs(activeSprint || undefined);

            // Build a map of the latest status per task from the fresh data
            const freshTaskMap = new Map<string, RawLogEvent>();
            freshLogs.forEach(log => {
                const existing = freshTaskMap.get(log.taskId);
                if (!existing || new Date(log.timestamp) > new Date(existing.timestamp)) {
                    freshTaskMap.set(log.taskId, log);
                }
            });

            verificationResults = squadDrafts.map(draft => {
                const task = analyses[draft.taskId];
                const freshLog = freshTaskMap.get(draft.taskId);
                const taskName = task ? task.taskName : 'Unknown';

                if (!freshLog) {
                    return {
                        taskId: draft.taskId,
                        taskName,
                        matched: false,
                        detail: 'Task not found in Google Sheet data',
                    };
                }

                // Check if the sheet reflects the target values
                const checks: string[] = [];
                if (freshLog.sprint !== draft.targetSprint) {
                    checks.push(`Sprint: sheet="${freshLog.sprint}" vs planned="${draft.targetSprint}"`);
                }
                if (freshLog.status !== draft.targetStatus) {
                    checks.push(`Status: sheet="${freshLog.status}" vs planned="${draft.targetStatus}"`);
                }
                if (draft.targetSprintGoal && freshLog.sprintGoal !== draft.targetSprintGoal) {
                    checks.push(`Goal: sheet="${freshLog.sprintGoal}" vs planned="${draft.targetSprintGoal}"`);
                }

                if (checks.length === 0) {
                    return { taskId: draft.taskId, taskName, matched: true, detail: 'All fields match' };
                } else {
                    return { taskId: draft.taskId, taskName, matched: false, detail: checks.join(' · ') };
                }
            });
        } catch (error) {
            console.error('Verification fetch failed:', error);
            verificationResults = squadDrafts.map(d => ({
                taskId: d.taskId,
                taskName: analyses[d.taskId]?.taskName || 'Unknown',
                matched: false,
                detail: 'Verification fetch failed — could not reach Google Sheet',
            }));
        }

        setSyncProgress(prev => prev ? {
            ...prev,
            phase: 'done',
            verifyStatus: 'done',
            verificationResults,
        } : prev);
    }, [squadDrafts, squadMembers, analyses, activeSprint, bulkTargetSprint]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
            </div>
        );
    }

    const renderCard = (task: TaskAnalysis, context: 'backlog') => {
        const categoryLabel = (() => {
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
        })();

        return (
            <div
                key={task.taskId}
                draggable={true}
                onDragStart={(e) => handleDragStart(e, task.taskId)}
                className="group w-full text-left rounded-lg lg:rounded-xl border border-zinc-800/50 bg-zinc-900/40 px-3 py-2.5 lg:px-4 lg:py-3 hover:border-zinc-700/70 hover:bg-zinc-800/60 transition-colors shadow-sm cursor-grab active:cursor-grabbing"
            >
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 lg:gap-3 min-w-0 flex-1">
                        <GripVertical className="w-3 h-3 text-zinc-600 mt-1 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 cursor-pointer" onClick={() => onTaskClick(task.taskId)}>
                                <span className="font-mono text-[10px] text-zinc-400 shrink-0">{task.taskId}</span>
                                <span className="text-xs font-semibold text-zinc-200 truncate group-hover:text-white transition-colors">
                                    {task.taskName}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${priorityDotColor(task.currentStatus)}`} />
                                {statusBadge(task.currentStatus)}
                                {categoryLabel && (
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 ${categoryLabel.color}`}>
                                        {categoryLabel.icon}
                                        {categoryLabel.text}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={() => addDraft({
                            taskId: task.taskId,
                            targetSprint: bulkTargetSprint,
                            targetStatus: task.currentStatus,
                            targetSprintGoal: task.sprintGoal || ''
                        })}
                        className="opacity-0 group-hover:opacity-100 px-2 py-1.5 rounded bg-indigo-900/40 text-indigo-300 hover:bg-indigo-600 hover:text-white text-[10px] font-semibold transition-all flex items-center border border-indigo-500/30 hover:border-indigo-500 shrink-0"
                    >
                        <Plus className="w-3 h-3 mr-1" /> Add
                    </button>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col gap-6 pb-12 min-h-screen">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-indigo-400" />
                        Next Sprint Squad Planning
                    </h2>
                    <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
                        Form a dynamic squad below. Uncompleted tasks belonging to squad members will appear in the backlog. 
                        Draft them to the Squad Plan, apply bulk updates, and sync to Lark in one click.
                    </p>
                </div>
            </div>

            {/* Personnel Selector Row */}
            <div className="bg-zinc-950/50 p-4 rounded-xl border border-zinc-800 flex flex-col gap-3 flex-shrink-0 shadow-lg shadow-black/20">
                <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-400" />
                    <span className="font-semibold text-zinc-200 text-sm">Gradually form your squad</span>
                </div>
                <div className="flex items-center gap-2.5 overflow-x-auto pb-2 custom-scrollbar">
                    {allPersons.map(p => {
                        const isSelected = selectedPersonsFilter.has(p);
                        return (
                            <button
                                key={p}
                                onClick={() => {
                                    const next = new Set(selectedPersonsFilter);
                                    if (isSelected) next.delete(p);
                                    else next.add(p);
                                    setSelectedPersonsFilter(next);
                                }}
                                className={`flex-shrink-0 flex items-center gap-2 px-3.5 py-1.5 rounded-full border transition-all ${
                                    isSelected 
                                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-[0_0_12px_rgba(79,70,229,0.3)]'
                                        : 'bg-zinc-900/80 border-zinc-700/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                                }`}
                            >
                                <div className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white/80' : 'bg-zinc-600'}`} />
                                <span className="text-sm font-medium">{p}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {selectedPersonsFilter.size === 0 ? (
                <div className="flex-1 flex items-center justify-center rounded-xl border border-zinc-800 bg-zinc-950/50 min-h-[400px]">
                    <div className="text-center py-12 px-4 max-w-md">
                        <Users className="w-12 h-12 mx-auto mb-4 text-indigo-500/30" />
                        <h3 className="text-zinc-200 font-semibold mb-2 text-lg">No Squad Selected</h3>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                            Pick one or more personnel above. The backlog will automatically populate with existing unfinished work related to those personnel.
                        </p>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] xl:grid-cols-[40%_60%] gap-6 flex-1 items-start">
                    {/* Left Column: Squad Backlog */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-5 shadow-lg shadow-black/20 flex flex-col h-[75vh]">
                        <div className="flex items-center justify-between mb-5 pb-3 border-b border-zinc-800/60 shrink-0">
                            <div className="flex items-center gap-2">
                                <Layers className="w-4 h-4 text-indigo-400" />
                                <h3 className="font-semibold text-zinc-100 text-sm">Squad Uncompleted Backlog</h3>
                            </div>
                            <div className="text-[10px] text-zinc-500 flex items-center gap-1">
                                <GripVertical className="w-3 h-3" />
                                Drag tasks to draft
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6 pb-6">
                            {/* Combination Backlog */}
                            {combinationBacklogs.map(group => (
                                <div key={group.involvedList.join('|')} className="space-y-3">
                                    <div className="flex items-center gap-2 text-indigo-400 border-b border-indigo-900/40 pb-1.5">
                                        <Users className="w-3.5 h-3.5" />
                                        <h4 className="text-[11px] font-semibold uppercase tracking-widest">
                                            {group.involvedList.length === squadMembers.length 
                                                ? `Shared by Squad (${group.tasks.length})`
                                                : `Shared: ${group.involvedList.join(', ')} (${group.tasks.length})`}
                                        </h4>
                                    </div>
                                    <div className="space-y-2.5">
                                        {group.tasks.map(task => renderCard(task, 'backlog'))}
                                    </div>
                                </div>
                            ))}

                            {/* Individual Backlog */}
                            {squadMembers.map(member => {
                                const tasks = individualBacklog[member] || [];
                                if (tasks.length === 0) return null;
                                return (
                                    <div key={member} className="space-y-3">
                                        <div className="flex items-center gap-2 text-zinc-400 border-b border-zinc-800/50 pb-1.5">
                                            <User className="w-3.5 h-3.5" />
                                            <h4 className="text-[11px] font-semibold uppercase tracking-widest">{member}'s Tasks ({tasks.length})</h4>
                                        </div>
                                        <div className="space-y-2.5">
                                            {tasks.map(task => renderCard(task, 'backlog'))}
                                        </div>
                                    </div>
                                );
                            })}
                            
                            {combinationBacklogs.length === 0 && squadMembers.every(m => individualBacklog[m].length === 0) && (
                                <div className="text-center py-12 text-zinc-500 text-sm opacity-60">
                                    No tasks to roll over.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Column: Squad Plan */}
                    <div 
                        onDragOver={(e) => { e.preventDefault(); setDragOverPlan(true); }}
                        onDragLeave={() => setDragOverPlan(false)}
                        onDrop={handleDrop}
                        className={`rounded-xl border p-5 flex flex-col h-[75vh] shadow-xl shadow-black/40 transition-colors ${
                            dragOverPlan
                                ? 'border-emerald-500/50 bg-emerald-950/10'
                                : 'border-zinc-800 bg-black/60'
                        }`}
                    >
                        <div className="flex items-center justify-between mb-4 pb-4 border-b border-zinc-800 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <Target className="w-4 h-4 text-emerald-400" />
                                <h3 className="font-semibold text-zinc-100 text-sm">Squad Draft Plan</h3>
                                <Badge variant="secondary" className="bg-zinc-800">{squadDrafts.length}</Badge>
                            </div>
                            
                            <button
                                onClick={handleSendToWebhook}
                                disabled={squadDrafts.length === 0 || isSyncing}
                                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:bg-zinc-800 disabled:text-zinc-500 disabled:border-zinc-700 text-white text-xs font-bold rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.3)] disabled:shadow-none transition-all flex items-center gap-2 active:scale-95 border border-emerald-400/50"
                            >
                                {isSyncing ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                ) : syncProgress?.phase === 'done' ? (
                                    <CheckCircle2 className="w-4 h-4 text-white" />
                                ) : (
                                    <Send className="w-4 h-4" />
                                )}
                                {isSyncing
                                    ? `Syncing ${syncProgress?.completed ?? 0}/${syncProgress?.total ?? 0}...`
                                    : syncProgress?.phase === 'done'
                                        ? 'Sync Complete — Resync?'
                                        : 'Confirm & Sync Squad'}
                            </button>
                        </div>

                        {/* ── Sync Progress Panel ── */}
                        {syncProgress && (
                            <div className="mb-4 p-4 bg-zinc-950/80 border border-zinc-700/60 rounded-xl space-y-4 shadow-inner">
                                {/* Progress bar */}
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-[10px] uppercase tracking-wider font-semibold">
                                        <span className="text-zinc-400 flex items-center gap-1.5">
                                            {syncProgress.phase === 'sending' && <><Loader2 className="w-3 h-3 animate-spin text-emerald-400" /> Sending tasks to Lark…</>}
                                            {syncProgress.phase === 'verifying' && <><RefreshCw className="w-3 h-3 animate-spin text-blue-400" /> Verifying with Google Sheet…</>}
                                            {syncProgress.phase === 'done' && <><ShieldCheck className="w-3 h-3 text-emerald-400" /> Sync Complete</>}
                                        </span>
                                        <span className="text-zinc-500 font-mono">
                                            {syncProgress.completed}/{syncProgress.total}
                                        </span>
                                    </div>
                                    <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500 ease-out"
                                            style={{
                                                width: `${syncProgress.total > 0 ? (syncProgress.completed / syncProgress.total) * 100 : 0}%`,
                                                background: syncProgress.phase === 'done'
                                                    ? 'linear-gradient(90deg, #10b981, #34d399)'
                                                    : 'linear-gradient(90deg, #6366f1, #818cf8)',
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Per-task status list */}
                                <div className="space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                                    {syncProgress.results.map(r => (
                                        <div
                                            key={r.taskId}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                                                r.status === 'sending'
                                                    ? 'bg-indigo-950/40 border border-indigo-800/40'
                                                    : r.status === 'success'
                                                        ? 'bg-emerald-950/20 border border-emerald-900/30'
                                                        : r.status === 'failed'
                                                            ? 'bg-red-950/30 border border-red-900/40'
                                                            : 'bg-zinc-900/50 border border-zinc-800/30'
                                            }`}
                                        >
                                            {r.status === 'pending' && <Clock className="w-3 h-3 text-zinc-500 shrink-0" />}
                                            {r.status === 'sending' && <Loader2 className="w-3 h-3 text-indigo-400 animate-spin shrink-0" />}
                                            {r.status === 'success' && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
                                            {r.status === 'failed' && <XCircle className="w-3 h-3 text-red-400 shrink-0" />}
                                            <span className="font-mono text-zinc-500 shrink-0">{r.taskId}</span>
                                            <span className="text-zinc-300 truncate">{r.taskName}</span>
                                            {r.error && (
                                                <span className="ml-auto text-red-400 text-[10px] font-mono shrink-0 truncate max-w-[150px]" title={r.error}>
                                                    {r.error}
                                                </span>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Verification results */}
                                {syncProgress.phase === 'done' && syncProgress.verificationResults.length > 0 && (
                                    <div className="pt-3 border-t border-zinc-800 space-y-2">
                                        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-zinc-400">
                                            <ShieldCheck className="w-3 h-3 text-blue-400" />
                                            Google Sheet Verification
                                        </div>
                                        <div className="space-y-1.5 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                                            {syncProgress.verificationResults.map(v => (
                                                <div
                                                    key={v.taskId}
                                                    className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs border ${
                                                        v.matched
                                                            ? 'bg-emerald-950/20 border-emerald-900/30'
                                                            : 'bg-amber-950/20 border-amber-900/30'
                                                    }`}
                                                >
                                                    {v.matched
                                                        ? <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                                                        : <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />}
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-mono text-zinc-500">{v.taskId}</span>
                                                            <span className="text-zinc-300 truncate">{v.taskName}</span>
                                                        </div>
                                                        <div className={`text-[10px] mt-0.5 ${v.matched ? 'text-emerald-400/80' : 'text-amber-400/80'} font-mono`}>
                                                            {v.detail}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-zinc-600 italic">
                                            ⚠️ Mismatches may be normal if Lark automation hasn't propagated to the Google Sheet yet.
                                        </p>
                                    </div>
                                )}

                                {/* Close/dismiss button when done */}
                                {syncProgress.phase === 'done' && (
                                    <div className="flex justify-end">
                                        <button
                                            onClick={() => setSyncProgress(null)}
                                            className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors px-2 py-1 rounded hover:bg-zinc-800/50"
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Bulk Edit Panel */}
                        {squadDrafts.length > 0 && (
                            <div className="mb-4 p-3 bg-zinc-900 border border-zinc-800 rounded-lg flex-shrink-0 flex flex-col sm:flex-row sm:items-end gap-3">
                                <div className="space-y-1flex-1">
                                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold block">Bulk Set Target Sprint</label>
                                    <input 
                                        type="text" 
                                        value={bulkTargetSprint}
                                        onChange={e => setBulkTargetSprint(e.target.value)}
                                        className="w-full sm:max-w-[120px] bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 px-2 py-1.5 rounded focus:border-emerald-500 focus:outline-none transition-colors"
                                        placeholder="e.g. 24"
                                    />
                                </div>
                                <div className="space-y-1 flex-1">
                                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold block">Bulk Set Target Status</label>
                                    <select 
                                        value={bulkTargetStatus}
                                        onChange={e => setBulkTargetStatus(e.target.value)}
                                        className="w-full sm:max-w-[160px] bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 px-2 py-1.5 rounded focus:border-emerald-500 focus:outline-none transition-colors"
                                    >
                                        <option value="">Keep Existing</option>
                                        <option value="Not Started">Not Started</option>
                                        <option value="In Process">In Process</option>
                                        <option value="Reviewing">Reviewing</option>
                                        <option value="Waiting to Integrate">Waiting to Integrate</option>
                                        <option value="Ready for Test">Ready for Test</option>
                                        <option value="Testing">Testing</option>
                                        <option value="Reprocess">Reprocess</option>
                                        <option value="Bug Fixing">Bug Fixing</option>
                                        <option value="Staging Passed">Staging Passed</option>
                                        <option value="Completed">Completed</option>
                                    </select>
                                </div>
                                <div className="space-y-1 flex-1">
                                    <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold block">Bulk Set Sprint Goal</label>
                                    <select 
                                        value={bulkTargetSprintGoal}
                                        onChange={e => setBulkTargetSprintGoal(e.target.value)}
                                        className="w-full sm:max-w-[160px] bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 px-2 py-1.5 rounded focus:border-emerald-500 focus:outline-none transition-colors"
                                    >
                                        <option value="">Keep Existing</option>
                                        <option value="Not Started">Not Started</option>
                                        <option value="In Process">In Process</option>
                                        <option value="Waiting to Integrate">Waiting to Integrate</option>
                                        <option value="Reviewing">Reviewing</option>
                                        <option value="Ready for Test">Ready for Test</option>
                                        <option value="Testing">Testing</option>
                                        <option value="Reprocess">Reprocess</option>
                                        <option value="Bug Fixing">Bug Fixing</option>
                                        <option value="Staging Passed">Staging Passed</option>
                                        <option value="Completed">Completed</option>
                                    </select>
                                </div>
                                <button
                                    onClick={handleApplyBulkEdits}
                                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded transition-colors whitespace-nowrap mt-2 sm:mt-0"
                                >
                                    Apply to {squadDrafts.length} task(s)
                                </button>
                            </div>
                        )}

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3 pb-6">
                            {squadDrafts.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-zinc-600 gap-3 min-h-[150px]">
                                    {dragOverPlan ? (
                                        <div className="animate-pulse flex flex-col items-center">
                                            <Plus className="w-10 h-10 text-emerald-500/50 mb-2" />
                                            <p className="text-sm font-medium text-emerald-400">Drop it!</p>
                                        </div>
                                    ) : (
                                        <>
                                            <Calendar className="w-10 h-10 opacity-20" />
                                            <p className="text-sm">Drag tasks here or click "Add"</p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                squadDrafts.map((draft, idx) => {
                                    const task = analyses[draft.taskId];
                                    return (
                                        <div key={draft.taskId} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 group relative shadow-md">
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2.5 min-w-0" onClick={() => onTaskClick(draft.taskId)}>
                                                    <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded shrink-0">#{idx + 1}</span>
                                                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${task ? priorityDotColor(task.currentStatus) : 'bg-zinc-500'}`} />
                                                    <span className="font-mono text-[10px] text-zinc-400 shrink-0">{draft.taskId}</span>
                                                    <span className="text-sm text-zinc-100 font-semibold truncate cursor-pointer hover:underline">{task ? task.taskName : 'Unknown'}</span>
                                                </div>
                                                <button
                                                    onClick={() => removeDraft(draft.taskId)}
                                                    className="text-red-500/70 hover:text-red-400 hover:bg-red-950/30 p-1.5 rounded transition-colors"
                                                    title="Remove from plan"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            
                                            {/* Edit Form */}
                                            <div className="grid grid-cols-[1fr_2fr] gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold block">Sprint</label>
                                                    <input 
                                                        type="text" 
                                                        value={draft.targetSprint}
                                                        onChange={e => updateDraft(draft.taskId, { targetSprint: e.target.value })}
                                                        className="w-full bg-zinc-950 border border-zinc-700 text-xs font-mono text-zinc-200 px-2 py-1.5 rounded focus:border-emerald-500 focus:outline-none transition-colors"
                                                        placeholder="Sprint #"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold block">Status</label>
                                                    <select 
                                                        value={draft.targetStatus}
                                                        onChange={e => updateDraft(draft.taskId, { targetStatus: e.target.value })}
                                                        className="w-full bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 px-2 py-1.5 rounded focus:border-emerald-500 focus:outline-none transition-colors appearance-none"
                                                    >
                                                        <option value="Not Started">Not Started</option>
                                                        <option value="In Process">In Process</option>
                                                        <option value="Waiting to Integrate">Waiting to Integrate</option>
                                                        <option value="Reviewing">Reviewing</option>
                                                        <option value="Ready for Test">Ready for Test</option>
                                                        <option value="Testing">Testing</option>
                                                        <option value="Reprocess">Reprocess</option>
                                                        <option value="Bug Fixing">Bug Fixing</option>
                                                        <option value="Staging Passed">Staging Passed</option>
                                                        <option value="Completed">Completed</option>
                                                    </select>
                                                </div>
                                                <div className="col-span-2 space-y-1.5">
                                                    <label className="text-[9px] uppercase tracking-wider text-zinc-500 font-semibold block">Sprint Goal</label>
                                                    <select 
                                                        value={draft.targetSprintGoal}
                                                        onChange={e => updateDraft(draft.taskId, { targetSprintGoal: e.target.value })}
                                                        className="w-full bg-zinc-950 border border-zinc-700 text-xs text-zinc-200 px-2 py-1.5 rounded focus:border-emerald-500 focus:outline-none transition-colors appearance-none"
                                                    >
                                                        <option value="">(Empty / Ignore)</option>
                                                        <option value="Not Started">Not Started</option>
                                                        <option value="In Process">In Process</option>
                                                        <option value="Waiting to Integrate">Waiting to Integrate</option>
                                                        <option value="Reviewing">Reviewing</option>
                                                        <option value="Ready for Test">Ready for Test</option>
                                                        <option value="Testing">Testing</option>
                                                        <option value="Reprocess">Reprocess</option>
                                                        <option value="Bug Fixing">Bug Fixing</option>
                                                        <option value="Staging Passed">Staging Passed</option>
                                                        <option value="Completed">Completed</option>
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
