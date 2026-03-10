'use client';

import { useMemo } from 'react';
import {
    RawLogEvent,
    WORKFLOW_STATUSES,
    MovementType,
    TaskMovement,
    PersonDailyMovement,
    DailyMovementSummary,
    StatusTransition,
} from '@/lib/types';
import { startOfDay, endOfDay, format } from 'date-fns';

function getStatusIndex(status: string): number {
    const normalized = status?.trim() ?? '';
    if (!normalized) return -1;
    // Exact match first
    const exact = WORKFLOW_STATUSES.find(s => s.name === status);
    if (exact) return exact.index;
    // Case-insensitive so "Waiting To Integrate" etc. still count as progress
    const found = WORKFLOW_STATUSES.find(s => s.name.toLowerCase() === normalized.toLowerCase());
    return found?.index ?? -1;
}

function getStatusAtTime(
    taskId: string,
    logs: RawLogEvent[],
    targetTime: Date
): string | null {
    const taskLogs = logs
        .filter(l => l.taskId === taskId && new Date(l.timestamp) <= targetTime)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return taskLogs[0]?.status ?? null;
}

function determineMovementType(
    startStatus: string | null,
    endStatus: string | null,
    dayEvents: RawLogEvent[],
    isNewTask: boolean
): MovementType {
    const hadEventsOnDay = dayEvents.length > 0;

    if (isNewTask) {
        if (dayEvents.length <= 1) {
            return 'no-change';
        }
        const sortedEvents = [...dayEvents].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        const firstStatus = sortedEvents[0].status;
        const lastStatus = sortedEvents[sortedEvents.length - 1].status;

        if (firstStatus === lastStatus) {
            return 'same';
        }

        const firstIdx = getStatusIndex(firstStatus);
        const lastIdx = getStatusIndex(lastStatus);

        if (lastIdx > firstIdx) return 'forward';
        if (lastIdx < firstIdx) return 'backward';
        return 'same';
    }

    if (!endStatus) return 'no-change';
    if (!startStatus) return 'no-change';

    if (startStatus === endStatus) {
        return hadEventsOnDay ? 'same' : 'no-change';
    }

    const startIdx = getStatusIndex(startStatus);
    const endIdx = getStatusIndex(endStatus);

    // Known indices: higher index = further along workflow = progress
    if (endIdx >= 0 && startIdx >= 0) {
        if (endIdx > startIdx) return 'forward';
        if (endIdx < startIdx) return 'backward';
        return 'same';
    }
    // One or both unknown: don't treat as recession (e.g. Not Started → Waiting to Integrate with wrong casing)
    if (endIdx >= 0 && startIdx === -1) return 'forward'; // started day with unknown, ended in known = progress
    if (endIdx === -1 && startIdx >= 0) return 'same';    // ended in unknown: inconclusive, not recession
    return 'same';
}

function buildStatusChain(
    startStatus: string | null,
    dayEvents: RawLogEvent[],
    isNewTask: boolean
): StatusTransition[] {
    const chain: StatusTransition[] = [];

    if (!isNewTask && startStatus) {
        chain.push({
            status: startStatus,
            timestamp: 'start-of-day',
        });
    }

    const sortedEvents = [...dayEvents].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    let lastStatus = startStatus;
    sortedEvents.forEach(event => {
        if (event.status !== lastStatus) {
            chain.push({
                status: event.status,
                timestamp: event.timestamp,
            });
            lastStatus = event.status;
        }
    });

    return chain;
}

function getTaskLatestInfo(logs: RawLogEvent[], taskId: string): {
    taskName: string;
    module: string;
    screen: string;
    sprintGoal: string;
    recordLink: string;
} {
    const taskLogs = logs
        .filter(l => l.taskId === taskId)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const latest = taskLogs[0];
    return {
        taskName: latest?.taskName ?? taskId,
        module: latest?.module ?? '',
        screen: latest?.screen ?? '',
        sprintGoal: latest?.sprintGoal ?? '',
        recordLink: latest?.recordLink ?? '',
    };
}

export function computeDailyMovement(
    logs: RawLogEvent[],
    selectedDate: Date
): DailyMovementSummary {
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const dayStart = startOfDay(selectedDate);
    const dayEnd = endOfDay(selectedDate);

    const allTaskIds = [...new Set(logs.map(l => l.taskId))];

    const eventsOnDay = logs.filter(l => {
        const t = new Date(l.timestamp);
        return t >= dayStart && t <= dayEnd;
    });

    const taskEventsMap: Record<string, RawLogEvent[]> = {};
    eventsOnDay.forEach(event => {
        if (!taskEventsMap[event.taskId]) {
            taskEventsMap[event.taskId] = [];
        }
        taskEventsMap[event.taskId].push(event);
    });

    const taskMovements: TaskMovement[] = [];

    for (const taskId of allTaskIds) {
        const startStatus = getStatusAtTime(taskId, logs, dayStart);
        const endStatus = getStatusAtTime(taskId, logs, dayEnd);

        if (!endStatus) continue;

        const dayEvents = taskEventsMap[taskId] || [];
        const isNewTask = startStatus === null && dayEvents.length > 0;
        const movementType = determineMovementType(startStatus, endStatus, dayEvents, isNewTask);
        const statusChain = buildStatusChain(startStatus, dayEvents, isNewTask);

        const taskInfo = getTaskLatestInfo(logs, taskId);
        const sortedDayEvents = [...dayEvents].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        const lastEventTime = sortedDayEvents[0]?.timestamp ?? null;

        const persons = new Set<string>();
        dayEvents.forEach(e => {
            if (e.person) {
                e.person.split(',').map(p => p.trim()).filter(Boolean).forEach(p => persons.add(p));
            }
        });

        if (persons.size === 0) {
            const allTaskLogs = logs.filter(l => l.taskId === taskId);
            const latestLog = allTaskLogs.sort(
                (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
            )[0];
            if (latestLog?.person) {
                latestLog.person.split(',').map(p => p.trim()).filter(Boolean).forEach(p => persons.add(p));
            }
        }

        if (persons.size === 0) {
            persons.add('Unassigned');
        }

        persons.forEach(person => {
            taskMovements.push({
                taskId,
                taskName: taskInfo.taskName,
                person,
                module: taskInfo.module,
                screen: taskInfo.screen,
                sprintGoal: taskInfo.sprintGoal,
                recordLink: taskInfo.recordLink,
                startStatus,
                endStatus,
                movementType,
                eventCount: dayEvents.length,
                lastEventTime,
                eventsOnDay: dayEvents,
                statusChain,
                isNewTask,
            });
        });
    }

    const personMap: Record<string, PersonDailyMovement> = {};
    const personEventCounts: Record<string, Set<string>> = {};

    taskMovements.forEach(tm => {
        if (!personMap[tm.person]) {
            personMap[tm.person] = {
                person: tm.person,
                movedForward: [],
                movedBackward: [],
                sameWithEvents: [],
                noChange: [],
                totalTasks: 0,
                forwardCount: 0,
                backwardCount: 0,
                totalEventsOnDay: 0,
                urgencyScore: 0,
            };
            personEventCounts[tm.person] = new Set();
        }

        const pd = personMap[tm.person];

        tm.eventsOnDay.forEach(event => {
            const eventKey = `${event.taskId}_${event.timestamp}`;
            personEventCounts[tm.person].add(eventKey);
        });

        switch (tm.movementType) {
            case 'forward':
                pd.movedForward.push(tm);
                pd.forwardCount++;
                break;
            case 'backward':
                pd.movedBackward.push(tm);
                pd.backwardCount++;
                break;
            case 'same':
                pd.sameWithEvents.push(tm);
                break;
            case 'no-change':
                pd.noChange.push(tm);
                break;
        }

        pd.totalTasks++;
    });

    Object.values(personMap).forEach(pd => {
        pd.totalEventsOnDay = personEventCounts[pd.person]?.size ?? 0;
        pd.urgencyScore =
            pd.backwardCount * 10 +
            pd.forwardCount * 5 +
            pd.sameWithEvents.length * 2 +
            pd.noChange.length * 1;
    });

    const personMovements = Object.values(personMap).sort((a, b) => {
        return b.totalEventsOnDay - a.totalEventsOnDay;
    });

    // Count distinct tasks (same task touched by multiple people counts once)
    const distinctForward = new Set<string>();
    const distinctBackward = new Set<string>();
    const distinctSame = new Set<string>();
    const distinctNoChange = new Set<string>();
    personMovements.forEach(p => {
        p.movedForward.forEach(tm => distinctForward.add(tm.taskId));
        p.movedBackward.forEach(tm => distinctBackward.add(tm.taskId));
        p.sameWithEvents.forEach(tm => distinctSame.add(tm.taskId));
        p.noChange.forEach(tm => distinctNoChange.add(tm.taskId));
    });
    const totalForward = distinctForward.size;
    const totalBackward = distinctBackward.size;
    const totalSameWithEvents = distinctSame.size;
    const totalNoChange = distinctNoChange.size;
    const totalTasksWithMovement = new Set([
        ...distinctForward,
        ...distinctBackward,
        ...distinctSame,
    ]).size;

    let topMover: string | null = null;
    let maxForward = 0;
    personMovements.forEach(p => {
        if (p.forwardCount > maxForward) {
            maxForward = p.forwardCount;
            topMover = p.person;
        }
    });

    return {
        date: dateStr,
        totalTasksWithMovement,
        totalForward,
        totalBackward,
        totalSameWithEvents,
        totalNoChange,
        topMover,
        personMovements,
    };
}

export function useDailyMovement(
    logs: RawLogEvent[],
    selectedDate: Date
): DailyMovementSummary {
    return useMemo(
        () => computeDailyMovement(logs, selectedDate),
        [logs, selectedDate]
    );
}
