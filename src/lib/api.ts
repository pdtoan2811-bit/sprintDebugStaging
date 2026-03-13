import { RawLogEvent, TimelineSegment, PersonTimeline } from './types';

const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwn11Eu6y7j_6pPrWG9z_koTcNONCmHVQtqbPJ9AJUggNXeSCtA69CvjDQ-d_3hcrvr/exec';

export async function fetchLogs(sprint?: string): Promise<RawLogEvent[]> {
    try {
        let url = SCRIPT_URL;
        if (sprint) {
            // Append the sprint query parameter correctly (handles URLs that might already have query params)
            url += `${SCRIPT_URL.includes('?') ? '&' : '?'}sprint=${encodeURIComponent(sprint)}`;
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch logs: ${response.statusText}`);
        }

        const data = await response.json();
        return data as RawLogEvent[];
    } catch (error) {
        console.error('Error fetching logs from Apps Script:', error);
        throw error;
    }
}

export function transformLogsToSegments(logs: RawLogEvent[]): PersonTimeline[] {
    // Sort logs by taskId and then chronologically
    const sortedLogs = [...logs].sort((a, b) => {
        if (a.taskId === b.taskId) {
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
        }
        return a.taskId.localeCompare(b.taskId);
    });

    const segments: TimelineSegment[] = [];

    // Group by taskId
    const logsByTask: Record<string, RawLogEvent[]> = {};
    sortedLogs.forEach(log => {
        if (!logsByTask[log.taskId]) logsByTask[log.taskId] = [];
        logsByTask[log.taskId].push(log);
    });

    // Calculate segments for each task
    Object.values(logsByTask).forEach(taskLogs => {
        for (let i = 0; i < taskLogs.length; i++) {
            const currentLog = taskLogs[i];
            const nextLog = taskLogs[i + 1];

            const startTime = new Date(currentLog.timestamp);
            // If there is a next log, the segment ends there. Otherwise, it ends now.
            const endTime = nextLog ? new Date(nextLog.timestamp) : new Date();
            const durationMs = endTime.getTime() - startTime.getTime();

            // Determine if the task is completely finished across all its logs
            const latestLog = taskLogs[taskLogs.length - 1];
            const isCompleted = latestLog.status === latestLog.sprintGoal;

            // If there's no next log, this is the active current state
            const isActive = !nextLog && !isCompleted;

            // Handle multiple people assigned to the same task (comma-separated)
            const persons = currentLog.person ? currentLog.person.split(',').map(p => p.trim()).filter(Boolean) : ['Unassigned'];

            persons.forEach(personName => {
                segments.push({
                    id: `${currentLog.taskId}_${currentLog.timestamp.replace(/[:.]/g, '-')}_${personName.replace(/\s+/g, '')}`,
                    taskId: currentLog.taskId,
                    taskName: currentLog.taskName,
                    module: currentLog.module,
                    screen: currentLog.screen,
                    person: personName,
                    status: currentLog.status,
                    sprintGoal: currentLog.sprintGoal,
                    recordLink: currentLog.recordLink,
                    startTime,
                    endTime,
                    durationMs,
                    isCompleted,
                    isActive
                });
            });
        }
    });

    // Group segments by person
    const segmentsByPerson: Record<string, TimelineSegment[]> = {};
    segments.forEach(segment => {
        if (!segmentsByPerson[segment.person]) {
            segmentsByPerson[segment.person] = [];
        }
        segmentsByPerson[segment.person].push(segment);
    });

    // Format into expected return type
    return Object.entries(segmentsByPerson).map(([person, personSegments]) => ({
        person,
        segments: personSegments.sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
    }));
}
