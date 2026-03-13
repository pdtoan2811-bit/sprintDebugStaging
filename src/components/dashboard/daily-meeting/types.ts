import { TaskAnalysis } from '@/lib/types';

export interface TaskCategory {
    doing: TaskAnalysis[];
    blockingOthers: TaskAnalysis[];
    blockedByOthers: TaskAnalysis[];
    notStartedInSprint: TaskAnalysis[];
    other: TaskAnalysis[];
}

export type CategoryFilterKey = 'doing' | 'blockedByOthers' | 'blockingOthers' | 'notStarted' | 'other';

export interface PersonMeetingData {
    person: string;
    categories: TaskCategory;
    allTasks: TaskAnalysis[];
    totalTasks: number;
    urgencyScore: number;
}

export interface TodoWebhookItem {
    order: number;
    taskId: string;
    taskName: string;
    status: string;
    sprintGoal: string;
    recordLink: string;
    /** Who is blocking THIS task (if any) */
    blockedBy: string | null;
    /** Which people are being blocked BY this person (attached at item level for Lark) */
    blockingTargets: string[];
}

export interface TodoWebhookPayload {
    person: string;
    date: string;
    todos: (TodoWebhookItem | null)[];
    summary: {
        total: number;
        completed: number;
        blocked: number;
    };
}
