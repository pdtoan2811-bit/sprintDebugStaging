import React from 'react';
import { TaskAnalysis, MeetingNote, RawLogEvent } from '@/lib/types';
import { getStatusSeverity, isBottleneckStatus } from '@/lib/workflow-engine';
import { DailyTodoItem } from '@/lib/hooks/useDailyTodos';
import { Zap } from 'lucide-react';

import {
    CategoryFilterKey,
    PersonMeetingData,
    TaskCategory,
    TodoWebhookItem,
    TodoWebhookPayload,
} from './types';
import { ACTIVE_STATUSES } from './constants';

export function getLatestMeetingNote(notes: MeetingNote[]): MeetingNote | null {
    if (!notes || notes.length === 0) return null;
    return [...notes].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
}

export function hasActivityInSprint(
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

export function computePersonMeetingData(
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
        other: [],
    });

    Object.values(analyses).forEach((task) => {
        // Exclude only fully completed tasks from the daily meeting view.
        // Tasks in "Staging Passed" should still appear so they can be discussed.
        if (task.currentStatus === 'Completed') {
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
            } else {
                personMap[person].other.push(task);
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
                categories.notStartedInSprint.length +
                categories.other.length;

            const urgencyScore =
                categories.doing.length * 4 +
                categories.blockingOthers.length * 10 +
                categories.blockedByOthers.length * 3 +
                categories.notStartedInSprint.length * 1 +
                categories.other.length * 2;

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

export function getVisibleTaskCount(person: PersonMeetingData, filter: Record<CategoryFilterKey, boolean>): number {
    let n = 0;
    if (filter.doing) n += person.categories.doing.length;
    if (filter.blockedByOthers) n += person.categories.blockedByOthers.length;
    if (filter.blockingOthers) n += person.categories.blockingOthers.length;
    if (filter.notStarted) n += person.categories.notStartedInSprint.length;
    if (filter.other) n += person.categories.other.length;
    return n;
}

export function priorityDotColor(status: string): string {
    if (status === 'Reprocess') return 'bg-red-500';
    if (status === 'Waiting to Integrate') return 'bg-amber-500';
    if (status === 'In Process') return 'bg-blue-500';
    if (status === 'Not Started') return 'bg-zinc-500';
    if (status === 'Staging Passed' || status === 'Completed') return 'bg-emerald-500';
    return 'bg-zinc-600';
}

export function statusBadge(status: string) {
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

export function formatStaleHours(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
}

/** Build DM-friendly text for a person's to-do list */
export function formatCorporateName(name: string): string {
    const cleanName = name.trim();
    if (!cleanName) return '';
    
    // Remove diacritics
    const normalized = cleanName
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .replace(/Đ/g, "D");
        
    const parts = normalized.split(/\s+/);
    if (parts.length === 1) return parts[0];
    
    const lastWord = parts[parts.length - 1];
    const initials = parts.slice(0, -1).map(p => p[0].toUpperCase()).join('');
    
    // Ensure last word is capitalized nicely (e.g. LINH -> Linh, linh -> Linh)
    const formattedLastWord = lastWord.charAt(0).toUpperCase() + lastWord.slice(1).toLowerCase();
    
    return formattedLastWord + initials;
}

export function formatTodoListForDM(
    person: string,
    todos: DailyTodoItem[],
    analyses: Record<string, TaskAnalysis>,
    meetingNotes: Record<string, MeetingNote[]>,
    allPersonData: PersonMeetingData[]
): string {
    const lines: string[] = [`📋 ${person} – To-do list`, ''];

    // Find people this person is blocking (tasks where blockedBy === person)
    const blockingOthers = new Set<string>();
    allPersonData.forEach((pd) => {
        pd.allTasks.forEach((task) => {
            const notes = meetingNotes[task.taskId] || [];
            const latestNote = getLatestMeetingNote(notes);
            if (latestNote?.isStall && latestNote.blockedBy === person && task.currentPerson !== person) {
                blockingOthers.add(task.currentPerson);
            }
        });
    });

    if (blockingOthers.size > 0) {
        lines.push(`⚠️ Blocking: ${[...blockingOthers].join(', ')}`);
        lines.push('');
    }

    const sortedTodos = [...todos].sort((a, b) => a.order - b.order);
    sortedTodos.forEach((todoItem, i) => {
        const task = analyses[todoItem.taskId];
        if (!task) return;

        const notes = meetingNotes[task.taskId] || [];
        const latestNote = getLatestMeetingNote(notes);
        const blockedBy = latestNote?.isStall && latestNote.blockedBy ? latestNote.blockedBy : null;

        lines.push(`${i + 1}. ${task.taskName}`);
        if (task.recordLink) {
            lines.push(`   Link: ${task.recordLink}`);
        }
        lines.push(`   Status: ${task.currentStatus}`);
        if (blockedBy) {
            lines.push(`   Blocked by: ${blockedBy}`);
        }
        if (task.isStale && task.staleDurationMs > 0) {
            lines.push(`   ⏱ Stale: ${formatStaleHours(task.staleDurationMs)}`);
        }
        lines.push('');
    });

    return lines.join('\n').trimEnd();
}

/** Build JSON payload for webhook */
export function formatTodoListForWebhook(
    person: string,
    date: string,
    todos: DailyTodoItem[],
    analyses: Record<string, TaskAnalysis>,
    meetingNotes: Record<string, MeetingNote[]>,
    allPersonData: PersonMeetingData[]
): TodoWebhookPayload {
    const blockingOthers = new Set<string>();
    allPersonData.forEach((pd) => {
        pd.allTasks.forEach((task) => {
            const notes = meetingNotes[task.taskId] || [];
            const latestNote = getLatestMeetingNote(notes);
            if (latestNote?.isStall && latestNote.blockedBy === person && task.currentPerson !== person) {
                blockingOthers.add(task.currentPerson);
            }
        });
    });

    const sortedTodos = [...todos].sort((a, b) => a.order - b.order);
    let blockedCount = 0;

    const todoItems = sortedTodos.map((todoItem, i) => {
        const task = analyses[todoItem.taskId];
        if (!task) {
            return null;
        }

        const notes = meetingNotes[task.taskId] || [];
        const latestNote = getLatestMeetingNote(notes);
        const blockedBy = latestNote?.isStall && latestNote.blockedBy ? latestNote.blockedBy : null;
        
        if (blockedBy) blockedCount++;

        // Attach the list of people this person is blocking at the item level so Lark can reach it easily.
        const blockingTargets = [...blockingOthers];

        const item: TodoWebhookItem = {
            order: i + 1,
            taskId: task.taskId,
            taskName: task.taskName,
            status: task.currentStatus,
            sprintGoal: task.sprintGoal,
            recordLink: task.recordLink || '',
            blockedBy,
            blockingTargets,
        };

        return item;
    }).filter((item): item is NonNullable<typeof item> => item !== null);

    const blockingArray = [...blockingOthers];
    const summary = {
        total: todoItems.length,
        completed: todoItems.filter(t => t.status === 'Completed' || t.status === 'Staging Passed').length,
        blocked: blockedCount,
    };

    const MAX_SLOTS = 10;
    const paddedTodos: TodoWebhookPayload['todos'] = Array.from({ length: MAX_SLOTS }, (_, idx) => {
        return todoItems[idx] ?? null;
    });

    return {
        person,
        date,
        todos: paddedTodos,
        summary,
    };
}

/** Send todo list to backend API which forwards to Lark webhook */
export async function sendTodoListToWebhook(
    payload: TodoWebhookPayload
): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await fetch('/api/send-todo-webhook', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
                const data = await response.json();
                if (data && typeof data.error === 'string') {
                    errorMessage = data.error;
                }
            } catch {
                // ignore JSON parse errors
            }
            return { success: false, error: errorMessage };
        }

        try {
            const data = await response.json();
            if (data && data.success === false && typeof data.error === 'string') {
                return { success: false, error: data.error };
            }
        } catch {
            // ignore if no JSON body
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export function taskInVisibleCategory(taskId: string, personData: PersonMeetingData, filter: Record<CategoryFilterKey, boolean>): boolean {
    if (filter.doing && personData.categories.doing.some((t) => t.taskId === taskId)) return true;
    if (filter.blockingOthers && personData.categories.blockingOthers.some((t) => t.taskId === taskId)) return true;
    if (filter.blockedByOthers && personData.categories.blockedByOthers.some((t) => t.taskId === taskId)) return true;
    if (filter.notStarted && personData.categories.notStartedInSprint.some((t) => t.taskId === taskId)) return true;
    if (filter.other && personData.categories.other.some((t) => t.taskId === taskId)) return true;
    return false;
}
