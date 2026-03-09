'use client';

import { useState, useEffect, useMemo } from 'react';
import { PersonTimeline, TimelineSegment, RawLogEvent, MeetingNote } from '@/lib/types';
import { fetchLogs, transformLogsToSegments } from '@/lib/api';
import { analyzeAllTasks, getPersonSummaries } from '@/lib/workflow-engine';
import { StandupInspector } from '@/components/inspector/StandupInspector';
import { PersonnelOverview } from '@/components/dashboard/PersonnelOverview';
import { TaskOverview } from '@/components/dashboard/TaskOverview';
import { SprintStartManager } from '@/components/dashboard/SprintStartManager';
import { DailyMeetingView } from '@/components/dashboard/DailyMeetingView';
import { DailyRecapView } from '@/components/dashboard/DailyRecapView';
import { WorkflowLegend } from '@/components/dashboard/WorkflowLegend';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useHighRisk } from '@/lib/hooks/useHighRisk';
import { useInterrogationLog } from '@/lib/hooks/useInterrogationLog';
import { useMeetingNotes } from '@/lib/hooks/useMeetingNotes';
import { useSprintStart } from '@/lib/hooks/useSprintStart';
import { format } from 'date-fns';
import { useSprintConfig } from '@/lib/hooks/useSprintConfig';
import { SprintSettings } from '@/components/inspector/SprintSettings';
import { DataManagementModal } from '@/components/dashboard/DataManagementModal';
import {
  Activity,
  Calendar,
  CheckCircle2,
  Database,
  Users,
  LayoutGrid,
  ListChecks,
  AlertTriangle,
  RefreshCw,
  Settings,
  Flag,
  UsersRound,
  History,
} from 'lucide-react';

type ViewTab = 'dailyMeeting' | 'dailyRecap' | 'personnel' | 'tasks' | 'sprintStart';

export default function Home() {
  const { configs, manualOverride, saveManualOverride, getActiveSprintNumber, refetch: refetchSprintConfig } = useSprintConfig();

  const [data, setData] = useState<PersonTimeline[]>([]);
  const [rawLogs, setRawLogs] = useState<RawLogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSegment, setSelectedSegment] = useState<TimelineSegment | null>(null);
  const [activeTab, setActiveTab] = useState<ViewTab>('dailyMeeting');
  const [showSettings, setShowSettings] = useState(false);

  const activeSprint = getActiveSprintNumber();

  function getSprintLabel(sprintNum: string): string {
    const config = configs.find((s) => s.number === sprintNum);
    if (!config) return `Sprint ${sprintNum}`;
    return `Sprint ${sprintNum} · ${format(new Date(config.startDate), 'MMM d')} – ${format(new Date(config.endDate), 'MMM d')}`;
  }

  const { highRiskIds, toggleHighRisk, isHighRisk } = useHighRisk();
  // useInterrogationLog removed
  const { addNote, updateNote, deleteNote, getNotesForTask, notes } = useMeetingNotes();
  const {
    getSprintStartSnapshot,
    saveOverride,
    bulkSaveOverrides,
    clearOverride,
    clearAllOverrides,
    confirmAllAsOverrides,
  } = useSprintStart();

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      setLoading(true);
      try {
        const migrationModule = await import('@/lib/migration');
        await migrationModule.migrateLocalStorageToAPI();

        const logs = await fetchLogs(activeSprint || undefined);
        if (!ignore) {
          setRawLogs(logs);
          const segments = transformLogsToSegments(logs);
          setData(segments);
        }
      } catch (err) {
        if (!ignore) {
          console.error('Failed to load sprint logs', err);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      ignore = true;
    };
  }, [activeSprint]);

  // ── Workflow Analysis ──────────────────────────────────────────
  const analyses = useMemo(() => analyzeAllTasks(rawLogs, notes), [rawLogs, notes]);
  const personSummaries = useMemo(() => getPersonSummaries(rawLogs, analyses), [rawLogs, analyses]);

  // ── Stats ──────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const taskList = Object.values(analyses);
    return {
      total: taskList.length,
      metGoal: taskList.filter((t) => t.sprintGoal && t.currentStatus === t.sprintGoal).length,
      bottlenecked: taskList.filter((t) => ['Waiting to Integrate', 'Reviewing', 'Reprocess'].includes(t.currentStatus)).length,
      doomLoops: taskList.filter((t) => t.doomLoopCount > 0).length,
      stale: taskList.filter((t) => t.isStale).length,
      highRisk: Array.from(highRiskIds).length,
    };
  }, [analyses, highRiskIds]);

  // ── Task Click from overview views ─────────────────────────────
  const handleTaskClick = (taskId: string) => {
    // Find a segment for this task to open the inspector
    for (const lane of data) {
      for (const seg of lane.segments) {
        if (seg.taskId === taskId) {
          // Prefer the latest/active segment
          const latestSeg = lane.segments
            .filter((s) => s.taskId === taskId)
            .sort((a, b) => b.startTime.getTime() - a.startTime.getTime())[0];
          setSelectedSegment(latestSeg || seg);
          return;
        }
      }
    }
  };

  const currentAnalysis = selectedSegment ? analyses[selectedSegment.taskId] ?? null : null;
  // currentLogs removed
  const currentMeetingNotes = selectedSegment ? getNotesForTask(selectedSegment.taskId) : [];

  // ── Tab definitions ────────────────────────────────────────────
  const tabs: { key: ViewTab; label: string; icon: React.ReactNode; desc: string }[] = [
    { key: 'dailyMeeting', label: 'Daily Meeting', icon: <UsersRound className="w-4 h-4" />, desc: 'Prioritized view for daily standups: Doing → Blocking → Blocked → Not Started' },
    { key: 'dailyRecap', label: 'Daily Recap', icon: <History className="w-4 h-4" />, desc: 'Retrospective view: task movements per person for a selected day (default: yesterday)' },
    { key: 'personnel', label: 'Personnel', icon: <LayoutGrid className="w-4 h-4" />, desc: 'Standup-ready view grouped by person' },
    { key: 'tasks', label: 'Tasks', icon: <ListChecks className="w-4 h-4" />, desc: 'Sortable task table with risk analysis' },
    { key: 'sprintStart', label: 'Sprint Start', icon: <Flag className="w-4 h-4" />, desc: 'Auto-detected starting status snapshot with override support' },
  ];

  return (
    <div className="min-h-screen bg-black text-white p-4 sm:p-8 font-sans grid grid-rows-[auto_auto_1fr_auto] gap-6">

      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-900 pb-6">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-50 flex items-center gap-2">
            <Activity className="w-8 h-8 text-blue-500" />
            Sprint Relay<span className="text-zinc-500 font-light">Debugger</span>
          </h1>
          <p className="text-zinc-500 text-sm mt-1 max-w-lg">
            Workflow-aware diagnostics — bottleneck detection, doom loop tracking, and PM decision support.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={manualOverride || 'auto'}
            onChange={(e) => saveManualOverride(e.target.value === 'auto' ? null : e.target.value)}
            className="bg-zinc-900 border border-zinc-700 text-zinc-300 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 max-w-[200px] truncate"
          >
            <option value="auto">🌟 Auto-detect Current Sprint</option>
            {configs.map((s) => (
              <option key={s.number} value={s.number}>
                {getSprintLabel(s.number)}
              </option>
            ))}
          </select>
          {activeSprint && (
            <Badge variant="outline" className="px-3 py-1.5 flex items-center gap-1.5 bg-blue-950/30 border-blue-800/50">
              <Calendar className="w-3 h-3 text-blue-400" />
              <span className="font-mono text-blue-300 text-xs">{getSprintLabel(activeSprint)}</span>
            </Badge>
          )}
          <Badge variant="outline" className="px-3 py-1.5 flex items-center gap-1.5 bg-zinc-950">
            <Database className="w-3 h-3 text-emerald-400" />
            <span className="font-mono">Live Logs</span>
          </Badge>
          <Badge variant="outline" className="px-3 py-1.5 flex items-center gap-1.5 bg-zinc-950">
            <Users className="w-3 h-3 text-purple-400" />
            <span className="font-mono">{data.length} Members</span>
          </Badge>
          <DataManagementModal />
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
            title="Sprint Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ── Stats Bar ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="px-4 py-3 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col">
          <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">Total Tasks</span>
          <span className="text-2xl font-bold font-mono text-zinc-100 mt-1">{stats.total}</span>
        </div>
        <div className={`px-4 py-3 rounded-xl flex flex-col border ${stats.metGoal > 0 ? 'bg-emerald-950/20 border-emerald-800/50' : 'bg-zinc-950 border-zinc-800'}`}>
          <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Met Goal
          </span>
          <span className={`text-2xl font-bold font-mono mt-1 ${stats.metGoal > 0 ? 'text-emerald-300' : 'text-zinc-100'}`}>
            {stats.metGoal}
          </span>
        </div>
        <div className={`px-4 py-3 rounded-xl flex flex-col border ${stats.bottlenecked > 0 ? 'bg-amber-950/20 border-amber-800/50' : 'bg-zinc-950 border-zinc-800'}`}>
          <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-500" /> Bottlenecked
          </span>
          <span className={`text-2xl font-bold font-mono mt-1 ${stats.bottlenecked > 0 ? 'text-amber-300' : 'text-zinc-100'}`}>
            {stats.bottlenecked}
          </span>
        </div>
        <div className={`px-4 py-3 rounded-xl flex flex-col border ${stats.doomLoops > 0 ? 'bg-red-950/20 border-red-800/50' : 'bg-zinc-950 border-zinc-800'}`}>
          <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold flex items-center gap-1">
            <RefreshCw className="w-3 h-3 text-red-500" /> Doom Loops
          </span>
          <span className={`text-2xl font-bold font-mono mt-1 ${stats.doomLoops > 0 ? 'text-red-300' : 'text-zinc-100'}`}>
            {stats.doomLoops}
          </span>
        </div>
        <div className={`px-4 py-3 rounded-xl flex flex-col border ${stats.stale > 0 ? 'bg-amber-950/10 border-amber-800/30' : 'bg-zinc-950 border-zinc-800'}`}>
          <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">Stale (24h+)</span>
          <span className={`text-2xl font-bold font-mono mt-1 ${stats.stale > 0 ? 'text-amber-200' : 'text-zinc-100'}`}>
            {stats.stale}
          </span>
        </div>
        <div className={`px-4 py-3 rounded-xl flex flex-col border ${stats.highRisk > 0 ? 'bg-red-950/15 border-red-800/30' : 'bg-zinc-950 border-zinc-800'}`}>
          <span className="text-zinc-500 text-[10px] uppercase tracking-wider font-semibold">📌 High Risk</span>
          <span className={`text-2xl font-bold font-mono mt-1 ${stats.highRisk > 0 ? 'text-red-300' : 'text-zinc-100'}`}>
            {stats.highRisk}
          </span>
        </div>
      </div>

      {/* ── Main Content ───────────────────────────────────── */}
      <main className="w-full h-full flex flex-col gap-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

          {/* Main Panel */}
          <Card className="lg:col-span-3 border-zinc-800/50 bg-black/40 backdrop-blur-xl">
            <CardHeader className="pb-3">
              {/* Tab Navigation */}
              <div className="flex items-center gap-1 border-b border-zinc-800/50 -mx-6 px-6 pb-3 mb-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`relative flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${activeTab === tab.key
                      ? 'text-zinc-100 bg-zinc-800/50'
                      : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/30'
                      }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                    {activeTab === tab.key && (
                      <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-500 rounded-full tab-active-indicator" />
                    )}
                  </button>
                ))}
              </div>
              <CardDescription className="text-xs">
                {tabs.find((t) => t.key === activeTab)?.desc}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="w-full h-[400px] flex items-center justify-center border border-zinc-800 rounded-xl bg-zinc-950/50 animate-pulse">
                  <p className="font-mono text-zinc-500 text-sm">Loading Sprint Telemetry...</p>
                </div>
              ) : (
                <>
                  {activeTab === 'dailyMeeting' && (() => {
                    const snapshot = getSprintStartSnapshot(activeSprint || '', rawLogs);
                    const snapshotMap: Record<string, string> = {};
                    snapshot.forEach(entry => {
                      snapshotMap[entry.taskId] = entry.confirmedStatus;
                    });
                    return (
                      <DailyMeetingView
                        analyses={analyses}
                        meetingNotes={notes}
                        rawLogs={rawLogs}
                        sprintStartSnapshot={snapshotMap}
                        highRiskIds={highRiskIds}
                        onTaskClick={handleTaskClick}
                      />
                    );
                  })()}
                  {activeTab === 'dailyRecap' && (
                    <DailyRecapView
                      rawLogs={rawLogs}
                      sprintStartDate={configs.find(c => c.number === activeSprint)?.startDate}
                      onTaskClick={handleTaskClick}
                    />
                  )}
                  {activeTab === 'personnel' && (
                    <PersonnelOverview
                      summaries={personSummaries}
                      highRiskIds={highRiskIds}
                      onTaskClick={handleTaskClick}
                    />
                  )}
                  {activeTab === 'tasks' && (
                    <TaskOverview
                      analyses={analyses}
                      highRiskIds={highRiskIds}
                      onTaskClick={handleTaskClick}
                    />
                  )}
                  {activeTab === 'sprintStart' && (
                    <SprintStartManager
                      rawLogs={rawLogs}
                      selectedSprint={activeSprint || ''}
                      getSprintStartSnapshot={getSprintStartSnapshot}
                      onSaveOverride={saveOverride}
                      onBulkSaveOverrides={bulkSaveOverrides}
                      onClearOverride={clearOverride}
                      onClearAllOverrides={clearAllOverrides}
                      onConfirmAll={confirmAllAsOverrides}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className="flex flex-col gap-6 h-full">
            <Card className="flex-1 border-zinc-800/50 bg-black/40 overflow-y-auto max-h-[70vh]">
              <CardHeader>
                <CardTitle className="text-sm">Workflow Legend</CardTitle>
                <CardDescription className="text-xs">Status flow & risk indicators</CardDescription>
              </CardHeader>
              <CardContent>
                <WorkflowLegend />
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <footer className="w-full text-center text-zinc-600 text-xs font-mono py-4 border-t border-zinc-900 mt-auto">
        Sprint Relay Engine v2.0.0 &middot; Workflow Anatomy Enabled
      </footer>

      {/* Inspector Side Panel */}
      <StandupInspector
        segment={selectedSegment}
        taskAnalysis={currentAnalysis}
        onClose={() => setSelectedSegment(null)}
        isHighRisk={selectedSegment ? isHighRisk(selectedSegment.taskId) : false}
        onToggleHighRisk={toggleHighRisk}
        meetingNotes={currentMeetingNotes}
        onAddMeetingNote={addNote}
        onUpdateMeetingNote={updateNote}
        onDeleteMeetingNote={(id) => selectedSegment && deleteNote(selectedSegment.taskId, id)}
        allPersons={data.map((d) => d.person)}
      />

      {/* Settings Modal */}
      <SprintSettings
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onSave={refetchSprintConfig}
      />
    </div>
  );
}
