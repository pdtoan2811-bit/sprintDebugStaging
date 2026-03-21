'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useData } from '@/lib/DataProvider';
import { useMeetingNotes } from '@/lib/hooks/useMeetingNotes';
import { usePersonWebhooks } from '@/lib/hooks/usePersonWebhooks';
import { fetchLogs, transformLogsToSegments } from '@/lib/api';
import { analyzeAllTasks } from '@/lib/workflow-engine';
import { 
    Send, 
    RefreshCw, 
    CheckCircle2, 
    AlertCircle, 
    Link as LinkIcon, 
    User, 
    Code, 
    Play, 
    ChevronRight,
    ArrowLeft
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useSprintConfig } from '@/lib/hooks/useSprintConfig';

export default function SandboxPage() {
    const { getActiveSprintNumber } = useSprintConfig();
    const activeSprint = getActiveSprintNumber();
    
    const [rawLogs, setRawLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { notes, addNote, updateNote, getNotesForTask } = useMeetingNotes();
    const { map: webhooks } = usePersonWebhooks();
    
    const [selectedPerson, setSelectedPerson] = useState<string>('');
    const [testResult, setTestResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
    const [isSending, setIsSending] = useState(false);

    // Load data
    useEffect(() => {
        async function load() {
            setLoading(true);
            try {
                const logs = await fetchLogs(activeSprint || undefined);
                setRawLogs(logs);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [activeSprint]);

    const analyses = useMemo(() => analyzeAllTasks(rawLogs, notes), [rawLogs, notes]);
    
    const persons = useMemo(() => {
        const p = new Set<string>();
        rawLogs.forEach(l => p.add(l.person));
        return Array.from(p).sort();
    }, [rawLogs]);

    const personTasks = useMemo(() => {
        if (!selectedPerson) return [];
        return Object.values(analyses).filter(t => t.currentPerson === selectedPerson);
    }, [selectedPerson, analyses]);

    // Format payload for preview
    const payload = useMemo(() => {
        if (!selectedPerson) return null;
        
        const todos = personTasks.map((task, i) => {
            const taskNotes = getNotesForTask(task.taskId);
            const latestNote = [...taskNotes].sort((a, b) => 
                new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
            )[0];
            
            return {
                order: i + 1,
                taskId: task.taskId,
                taskName: task.taskName,
                status: task.currentStatus,
                sprintGoal: task.sprintGoal,
                recordLink: task.recordLink || '',
                blockedBy: latestNote?.isStall ? latestNote.blockedBy : null,
                blockingTargets: [],
                isMoved: task.isMovedToNextSprint
            };
        });

        const webhookUrl = webhooks[selectedPerson] || 'https://jsg35lsl9g0c.sg.larksuite.com/base/automation/webhook/event/CyknaO0BCwAPxZhhaItlNTN0gEg';
            
        return {
            person: selectedPerson,
            date: new Date().toISOString().split('T')[0],
            todos: todos.concat(Array(Math.max(0, 10 - todos.length)).fill(null)).slice(0, 10),
            summary: {
                total: todos.length,
                completed: todos.filter(t => t.status === 'Completed' || t.status === 'Staging Passed').length,
                blocked: todos.filter(t => t.blockedBy).length
            },
            webhookUrl: webhookUrl,
            isTest: true
        };
    }, [selectedPerson, personTasks, getNotesForTask, webhooks]);

    const handleToggleMoved = (taskId: string, current: boolean) => {
        const taskNotes = getNotesForTask(taskId);
        const latest = [...taskNotes].sort((a, b) => 
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )[0];

        if (latest) {
            updateNote({
                ...latest,
                isMovedToNextSprint: !current,
                createdAt: new Date().toISOString()
            });
        } else {
            addNote({
                id: `${taskId}_move_${Date.now()}`,
                taskId,
                date: new Date().toISOString().split('T')[0],
                isStall: false,
                stallReason: '',
                blockedBy: '',
                solution: '',
                isMovedToNextSprint: !current,
                createdAt: new Date().toISOString()
            });
        }
    };

    const handleSendTest = async () => {
        if (!payload || !payload.webhookUrl) return;
        setIsSending(true);
        setTestResult(null);
        
        try {
            const res = await fetch('/api/send-todo-webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            setTestResult({
                success: res.ok && data.success,
                message: data.success ? 'Sent successfully!' : (data.error || 'Failed to send'),
                data: data.data || data
            });
        } catch (err) {
            setTestResult({
                success: false,
                message: err instanceof Error ? err.message : 'Network error'
            });
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-8 font-sans">
            <header className="max-w-6xl mx-auto mb-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Link href="/" className="p-2 hover:bg-zinc-900 rounded-lg transition-colors border border-zinc-800">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Code className="w-6 h-6 text-indigo-400" />
                            Sprint Movement Sandbox
                        </h1>
                        <p className="text-zinc-500 text-sm">Test Lark integrations and task status overrides in isolation</p>
                    </div>
                </div>
                {activeSprint && (
                    <Badge variant="outline" className="bg-indigo-950/20 border-indigo-800 text-indigo-300 px-3 py-1">
                        Sprint {activeSprint}
                    </Badge>
                )}
            </header>

            <main className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Panel: Configuration */}
                <div className="space-y-6">
                    <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                        <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-4 flex items-center gap-2">
                            <User className="w-4 h-4" /> 1. Select Person
                        </h2>
                        <select 
                            value={selectedPerson}
                            onChange={(e) => setSelectedPerson(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-medium"
                        >
                            <option value="">-- Choose a member --</option>
                            {persons.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </section>

                    {selectedPerson && (
                        <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 shadow-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 mb-4 flex items-center gap-2">
                                <RefreshCw className="w-4 h-4" /> 2. Toggle Task Movement
                            </h2>
                            <div className="space-y-3">
                                {personTasks.length === 0 ? (
                                    <p className="text-zinc-500 text-xs italic">No active tasks found for this person in Sprint {activeSprint}.</p>
                                ) : (
                                    personTasks.map(task => (
                                        <div key={task.taskId} className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800 p-3 rounded-xl hover:border-zinc-700 transition-colors">
                                            <div className="flex-1 min-w-0 pr-4">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="text-[10px] font-mono font-bold bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400">{task.taskId}</span>
                                                    <span className="text-xs font-semibold text-zinc-200 truncate">{task.taskName}</span>
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                                                    <Badge variant="outline" className="text-[9px] h-4 px-1">{task.currentStatus}</Badge>
                                                    {task.isMovedToNextSprint && (
                                                        <span className="text-indigo-400 font-bold italic flex items-center gap-1">
                                                            <RefreshCw className="w-2.5 h-2.5 animate-spin" style={{animationDuration: '4s'}} />
                                                            Moved to Next Sprint
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <button 
                                                onClick={() => handleToggleMoved(task.taskId, !!task.isMovedToNextSprint)}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                                                    task.isMovedToNextSprint 
                                                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' 
                                                        : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                                }`}
                                            >
                                                {task.isMovedToNextSprint ? 'UNMARK' : 'MARK MOVED'}
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </section>
                    )}
                </div>

                {/* Right Panel: Payload Preview & Test */}
                <div className="space-y-6">
                    <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 shadow-xl flex flex-col h-full sticky top-8">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-500 flex items-center gap-2">
                                <LinkIcon className="w-4 h-4" /> 3. Lark Payload Preview
                            </h2>
                            {payload && (
                                <button 
                                    onClick={handleSendTest}
                                    disabled={!payload.webhookUrl || isSending}
                                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-95"
                                >
                                    {isSending ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                                    Send Test to Lark
                                </button>
                            )}
                        </div>

                        {!selectedPerson ? (
                            <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 py-20 bg-zinc-950/30 border border-dashed border-zinc-800 rounded-xl">
                                <Send className="w-8 h-8 mb-2 opacity-20" />
                                <p className="text-sm">Select a person to generate preview</p>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col gap-4 overflow-hidden">
                                {payload?.webhookUrl ? (
                                    <div className="bg-emerald-950/10 border border-emerald-900/30 px-3 py-2 rounded-lg flex items-center gap-2">
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                        <span className="text-[10px] text-emerald-400 truncate">Webhook configured: {payload.webhookUrl}</span>
                                    </div>
                                ) : (
                                    <div className="bg-red-950/10 border border-red-900/30 px-3 py-2 rounded-lg flex items-center gap-2">
                                        <AlertCircle className="w-3.5 h-3.5 text-red-500" />
                                        <span className="text-[10px] text-red-400">No webhook configured for this person.</span>
                                    </div>
                                )}

                                <div className="flex-1 relative bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden flex flex-col">
                                    <div className="flex items-center justify-between px-3 py-2 bg-zinc-900 border-b border-zinc-800">
                                        <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest">generated_payload.json</span>
                                        <button 
                                            onClick={() => navigator.clipboard.writeText(JSON.stringify(payload, null, 2))}
                                            className="text-[10px] text-zinc-400 hover:text-white transition-colors"
                                        >
                                            Copy JSON
                                        </button>
                                    </div>
                                    <pre className="flex-1 p-4 text-[11px] font-mono text-indigo-300 overflow-auto custom-scrollbar leading-relaxed">
                                        {JSON.stringify(payload, null, 2)}
                                    </pre>
                                </div>

                                {testResult && (
                                    <div className={`p-4 rounded-xl border animate-in fade-in zoom-in-95 duration-200 ${
                                        testResult.success ? 'bg-emerald-950/20 border-emerald-900/50' : 'bg-red-950/20 border-red-900/50'
                                    }`}>
                                        <div className="flex items-start gap-3">
                                            {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />}
                                            <div>
                                                <h4 className={`text-xs font-bold mb-1 ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {testResult.message}
                                                </h4>
                                                {testResult.data && (
                                                    <pre className="text-[9px] text-zinc-500 font-mono mt-2 bg-black/40 p-2 rounded">
                                                        {JSON.stringify(testResult.data, null, 2)}
                                                    </pre>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>
            </main>
        </div>
    );
}
