export interface RawLogEvent {
    timestamp: string;
    taskId: string;
    taskName: string;
    recordLink: string;
    status: string;
    sprintGoal: string;
    sprint: string;
    person: string;
    module: string;
    screen: string;
}

export interface TimelineSegment {
    id: string;
    taskId: string;
    taskName: string;
    module: string;
    screen: string;
    person: string;
    status: string;
    sprintGoal: string;
    recordLink: string;
    startTime: Date;
    endTime: Date;
    durationMs: number;
    isCompleted: boolean;
    isActive: boolean;
}

export interface PersonTimeline {
    person: string;
    segments: TimelineSegment[];
}

export interface StandupNote {
    id: string;
    taskId: string;
    timestamp: string;
    blockedBy: string;
    reason: string;
    note: string;
}

// ── Workflow Anatomy ──────────────────────────────────────────────

export const WORKFLOW_STATUSES = [
    { index: 0, name: 'Not Started', isBottleneck: false, severity: 'normal' as const },
    { index: 1, name: 'In Process', isBottleneck: false, severity: 'normal' as const },
    { index: 2, name: 'Waiting to Integrate', isBottleneck: true, severity: 'high' as const },
    { index: 3, name: 'Reviewing', isBottleneck: true, severity: 'high' as const },
    { index: 4, name: 'Ready for Test', isBottleneck: false, severity: 'normal' as const },
    { index: 5, name: 'Testing', isBottleneck: false, severity: 'normal' as const },
    { index: 6, name: 'Reprocess', isBottleneck: true, severity: 'critical' as const },
    { index: 7, name: 'Bug Fixing', isBottleneck: false, severity: 'normal' as const },
    { index: 8, name: 'Staging Passed', isBottleneck: false, severity: 'normal' as const },
    { index: 9, name: 'Completed', isBottleneck: false, severity: 'normal' as const },
] as const;

export type RiskLevel = 'normal' | 'elevated' | 'critical';

export interface StatusHistoryEntry {
    status: string;
    timestamp: string;
    person: string;
}

export interface BlockingTransition {
    fromStatus: string;
    toStatus: string;
    fromTimestamp: string;
    toTimestamp: string;
    workingHoursElapsed: number;
    person: string;
}

export interface TaskAnalysis {
    taskId: string;
    taskName: string;
    currentStatus: string;
    currentPerson: string;
    reprocessCount: number;
    doomLoopCount: number;
    riskLevel: RiskLevel;
    isStale: boolean;
    staleDurationMs: number;
    statusHistory: StatusHistoryEntry[];
    blockingTransitions: BlockingTransition[];
    module: string;
    screen: string;
    sprintGoal: string;
    recordLink: string;
    blockedBy?: string;
    isMovedToNextSprint?: boolean;
}

export interface InterrogationLogEntry {
    id: string;
    taskId: string;
    timestamp: string;
    text: string;
}

export interface MeetingNote {
    id: string;
    taskId: string;
    date: string;        // ISO date string (YYYY-MM-DD)
    isStall: boolean;
    stallReason: string;
    blockedBy: string;   // person name
    solution: string;
    isMovedToNextSprint?: boolean;
    createdAt: string;   // ISO timestamp
}

export interface PersonSummary {
    person: string;
    tasks: TaskAnalysis[];
    blockingTasks: TaskAnalysis[];
    staleTasks: TaskAnalysis[];
    suggestion: string | null;
    totalTasks: number;
}

// ── Daily Movement Analysis ──────────────────────────────────────────

export type MovementType = 'forward' | 'backward' | 'same' | 'new' | 'no-change';

export interface StatusTransition {
    status: string;
    timestamp: string;
}

export interface TaskMovement {
    taskId: string;
    taskName: string;
    person: string;
    module: string;
    screen: string;
    sprintGoal: string;
    recordLink: string;
    startStatus: string | null;
    endStatus: string;
    movementType: MovementType;
    eventCount: number;
    lastEventTime: string | null;
    eventsOnDay: RawLogEvent[];
    statusChain: StatusTransition[];
    isNewTask: boolean;
}

export interface PersonDailyMovement {
    person: string;
    movedForward: TaskMovement[];
    movedBackward: TaskMovement[];
    sameWithEvents: TaskMovement[];
    noChange: TaskMovement[];
    totalTasks: number;
    forwardCount: number;
    backwardCount: number;
    totalEventsOnDay: number;
    urgencyScore: number;
}

export interface DailyMovementSummary {
    date: string;
    totalTasksWithMovement: number;
    totalForward: number;
    totalBackward: number;
    totalSameWithEvents: number;
    totalNoChange: number;
    topMover: string | null;
    personMovements: PersonDailyMovement[];
    sharedSquadData?: PersonDailyMovement | null;
}
