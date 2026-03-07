import { fetchLogs, transformLogsToSegments } from './src/lib/api';
import { analyzeAllTasks, getPersonSummaries } from './src/lib/workflow-engine';

async function main() {
    console.log("Fetching logs for sprint 7...");
    const logs = await fetchLogs("7");
    console.log("Logs fetched:", logs.length);

    const segments = transformLogsToSegments(logs);
    console.log("Segments generated (persons):", segments.length);

    if (segments.length > 0) {
        console.log("Segments[0] segments length:", segments[0].segments.length);
    }

    const analyses = analyzeAllTasks(logs);
    const analysisKeys = Object.keys(analyses);
    console.log("Analyses generated (tasks):", analysisKeys.length);

    const summaries = getPersonSummaries(logs, analyses);
    console.log("Person summaries length:", summaries.length);
    if (summaries.length > 0) {
        console.log("First person summary tasks:", summaries[0].tasks.length);
    }
}

main().catch(console.error);
