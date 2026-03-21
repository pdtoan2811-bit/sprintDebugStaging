import {
    RawLogEvent,
    TaskAnalysis,
    PersonSummary,
    StatusHistoryEntry,
    BlockingTransition,
    RiskLevel,
    WORKFLOW_STATUSES,
    MeetingNote,
} from './types';
import { calculateWorkingDuration } from './date-utils';
import { hasMetSprintGoal } from './utils';

// ── Status Helpers ────────────────────────────────────────────────

const BOTTLENECK_STATUSES = new Set([
    'Waiting to Integrate',
    'Reviewing',
    'Reprocess',
]);

const STATUS_NAME_MAP: Record<string, (typeof WORKFLOW_STATUSES)[number]> = {};
WORKFLOW_STATUSES.forEach((s) => {
    STATUS_NAME_MAP[s.name] = s;
});

export function isBottleneckStatus(status: string): boolean {
    return BOTTLENECK_STATUSES.has(status);
}

export function getStatusMeta(status: string) {
    return STATUS_NAME_MAP[status] ?? null;
}

export function getStatusSeverity(status: string): 'normal' | 'high' | 'critical' {
    return STATUS_NAME_MAP[status]?.severity ?? 'normal';
}

// ── Doom Loop Detection ───────────────────────────────────────────

/**
 * Detects cyclical status patterns:
 * (Bug Fixing | Reprocess) → Ready for Test → Testing → Reprocess
 *
 * Returns the number of complete doom loop cycles.
 */
function detectDoomLoops(history: StatusHistoryEntry[]): number {
    let loopCount = 0;

    for (let i = 0; i < history.length; i++) {
        const s = history[i].status;
        if (s === 'Reprocess' || s === 'Bug Fixing') {
            // Look ahead for the pattern: → Ready for Test → Testing → Reprocess
            let j = i + 1;
            // Skip any intermediate statuses that aren't part of the pattern
            while (j < history.length && history[j].status !== 'Ready for Test') j++;
            if (j >= history.length) continue;
            // Found Ready for Test, look for Testing
            let k = j + 1;
            while (k < history.length && history[k].status !== 'Testing') k++;
            if (k >= history.length) continue;
            // Found Testing, look for Reprocess
            let l = k + 1;
            while (l < history.length && history[l].status !== 'Reprocess') l++;
            if (l >= history.length) continue;
            // Complete doom loop found
            loopCount++;
        }
    }

    return loopCount;
}

// ── Single Task Analysis ──────────────────────────────────────────

const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const BLOCKING_WORKING_HOURS_THRESHOLD = 8; // 8 working hours
const BLOCKING_THRESHOLD_MS = BLOCKING_WORKING_HOURS_THRESHOLD * 60 * 60 * 1000; // 8 hours in ms

/**
 * Detects blocking transitions - status changes that took more than 8 working hours
 */
function detectBlockingTransitions(history: StatusHistoryEntry[]): BlockingTransition[] {
    const blockingTransitions: BlockingTransition[] = [];

    for (let i = 0; i < history.length - 1; i++) {
        const current = history[i];
        const next = history[i + 1];

        const startMs = new Date(current.timestamp).getTime();
        const endMs = new Date(next.timestamp).getTime();

        const { workingMs } = calculateWorkingDuration(startMs, endMs);

        if (workingMs > BLOCKING_THRESHOLD_MS) {
            const workingHoursElapsed = Math.round((workingMs / (60 * 60 * 1000)) * 10) / 10;
            blockingTransitions.push({
                fromStatus: current.status,
                toStatus: next.status,
                fromTimestamp: current.timestamp,
                toTimestamp: next.timestamp,
                workingHoursElapsed,
                person: current.person,
            });
        }
    }

    return blockingTransitions;
}

export function analyzeTask(taskLogs: RawLogEvent[], taskNotes: MeetingNote[] = []): TaskAnalysis {
    // Sort chronologically
    const sorted = [...taskLogs].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const latest = sorted[sorted.length - 1];

    // Build status history
    const statusHistory: StatusHistoryEntry[] = sorted.map((log) => ({
        status: log.status,
        timestamp: log.timestamp,
        person: log.person,
    }));

    // Count Reprocess entries
    const reprocessCount = sorted.filter((l) => l.status === 'Reprocess').length;

    // Detect doom loops
    const doomLoopCount = detectDoomLoops(statusHistory);

    // Detect blocking transitions (> 8 working hours between status changes)
    const blockingTransitions = detectBlockingTransitions(statusHistory);

    // Risk level - now also considers blocking transitions
    let riskLevel: RiskLevel = 'normal';
    if (reprocessCount > 2 || doomLoopCount >= 2 || blockingTransitions.length >= 3) {
        riskLevel = 'critical';
    } else if (reprocessCount > 0 || doomLoopCount >= 1 || blockingTransitions.length >= 1) {
        riskLevel = 'elevated';
    }

    // Staleness
    const lastChangeTime = new Date(latest.timestamp).getTime();
    const timeSinceLastChange = Date.now() - lastChangeTime;
    const isCompleted = hasMetSprintGoal(latest.status, latest.sprintGoal)
        || latest.status === 'Completed' || latest.status === 'Staging Passed';
    const isStale = !isCompleted && timeSinceLastChange > STALE_THRESHOLD_MS;

    const latestNote = [...taskNotes].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
    const blockedBy = latestNote?.isStall && latestNote.blockedBy ? latestNote.blockedBy : undefined;
    const isMovedToNextSprint = latestNote?.isMovedToNextSprint;

    return {
        taskId: latest.taskId,
        taskName: latest.taskName,
        currentStatus: latest.status,
        currentPerson: latest.person,
        reprocessCount,
        doomLoopCount,
        riskLevel,
        isStale,
        staleDurationMs: isStale ? timeSinceLastChange : 0,
        statusHistory,
        blockingTransitions,
        module: latest.module,
        screen: latest.screen,
        sprintGoal: latest.sprintGoal,
        recordLink: latest.recordLink,
        blockedBy,
        isMovedToNextSprint,
    };
}

// ── Batch Analysis ────────────────────────────────────────────────

export function analyzeAllTasks(logs: RawLogEvent[], meetingNotes: Record<string, MeetingNote[]> = {}): Record<string, TaskAnalysis> {
    const byTask: Record<string, RawLogEvent[]> = {};
    logs.forEach((log) => {
        if (!byTask[log.taskId]) byTask[log.taskId] = [];
        byTask[log.taskId].push(log);
    });

    const result: Record<string, TaskAnalysis> = {};
    Object.entries(byTask).forEach(([taskId, taskLogs]) => {
        result[taskId] = analyzeTask(taskLogs, meetingNotes[taskId] || []);
    });

    return result;
}

// ── Priority Suggestion Engine (Use Case 3) ──────────────────────

function generateSuggestion(tasks: TaskAnalysis[]): string | null {
    const reprocessTasks = tasks.filter((t) => t.currentStatus === 'Reprocess');
    const waitingTasks = tasks.filter((t) => t.currentStatus === 'Waiting to Integrate');
    const reviewingTasks = tasks.filter((t) => t.currentStatus === 'Reviewing');
    const bugFixTasks = tasks.filter((t) => t.currentStatus === 'Bug Fixing');

    const blockers = [...reprocessTasks, ...waitingTasks, ...reviewingTasks, ...bugFixTasks];

    if (blockers.length === 0) return null;

    const parts: string[] = [];

    if (reprocessTasks.length > 0) {
        parts.push(`${reprocessTasks.length} task(s) in Reprocess`);
    }
    if (waitingTasks.length > 0) {
        parts.push(`${waitingTasks.length} task(s) Waiting to Integrate`);
    }
    if (reviewingTasks.length > 0) {
        parts.push(`${reviewingTasks.length} task(s) in Review`);
    }
    if (bugFixTasks.length > 0) {
        parts.push(`${bugFixTasks.length} task(s) in Bug Fixing`);
    }

    return `⚠ Suggested Priority: Clear ${parts.join(', ')} before pulling new 'Not Started' tickets.`;
}

// ── Person Summaries (Use Case 1 & 3) ────────────────────────────

export function getPersonSummaries(
    logs: RawLogEvent[],
    analyses: Record<string, TaskAnalysis>
): PersonSummary[] {
    // Group tasks by current person
    const personTaskIds: Record<string, Set<string>> = {};

    // Use latest log entry per task to determine current person
    Object.values(analyses).forEach((analysis) => {
        const persons = new Set(
            analysis.currentPerson
                ? analysis.currentPerson.split(',').map((p) => p.trim()).filter(Boolean)
                : ['Unassigned']
        );

        if (analysis.blockedBy) {
            persons.add(analysis.blockedBy);
        }

        persons.forEach((person) => {
            if (!personTaskIds[person]) personTaskIds[person] = new Set();
            personTaskIds[person].add(analysis.taskId);
        });
    });

    return Object.entries(personTaskIds)
        .map(([person, taskIds]) => {
            const tasks = Array.from(taskIds)
                .map((id) => analyses[id])
                .filter(Boolean);

            const blockingTasks = tasks.filter((t) => {
                if (t.blockedBy) return t.blockedBy === person;
                return isBottleneckStatus(t.currentStatus);
            });
            const staleTasks = tasks.filter((t) => t.isStale);
            const suggestion = generateSuggestion(tasks);

            return {
                person,
                tasks,
                blockingTasks,
                staleTasks,
                suggestion,
                totalTasks: tasks.length,
            };
        })
        .sort((a, b) => {
            // Sort by blocking count desc, then stale count desc
            if (b.blockingTasks.length !== a.blockingTasks.length)
                return b.blockingTasks.length - a.blockingTasks.length;
            return b.staleTasks.length - a.staleTasks.length;
        });
}
