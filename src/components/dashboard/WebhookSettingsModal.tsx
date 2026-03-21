'use client';

import React, { useState, useEffect } from 'react';
import { useWebhooks } from '@/lib/hooks/useWebhooks';
import { 
    X, 
    Send, 
    Loader2, 
    Link as LinkIcon, 
    User, 
    CheckCircle2, 
    AlertCircle,
    Copy,
    Globe,
    RefreshCw
} from 'lucide-react';
import { Badge } from '../ui/badge';
import { WORKFLOW_STATUSES } from '@/lib/types';
import { useSprintConfig } from '@/lib/hooks/useSprintConfig';

interface WebhookSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    persons: string[];
    initialPerson?: string | null;
    activeSprint?: string;
}

export function WebhookSettingsModal({
    isOpen,
    onClose,
    persons,
    initialPerson,
    activeSprint
}: WebhookSettingsModalProps) {
    const { webhooks, updateWebhook, isLoading } = useWebhooks();
    const { configs } = useSprintConfig();
    const [selectedPerson, setSelectedPerson] = useState<string>(initialPerson || persons[0] || '');
    const [testWebhookUrl, setTestWebhookUrl] = useState('');
    const [testTaskUrl, setTestTaskUrl] = useState('');
    const [testCurrentSprint, setTestCurrentSprint] = useState(activeSprint || '8');
    const [testNextSprint, setTestNextSprint] = useState(activeSprint ? String(parseInt(activeSprint) + 1) : '9');
    const [testStatus, setTestStatus] = useState('In Process');
    const [testSprintGoal, setTestSprintGoal] = useState('Completed');
    const [isTesting, setIsTesting] = useState(false);
    const [simulateMoved, setSimulateMoved] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);

    useEffect(() => {
        if (selectedPerson && webhooks[selectedPerson]) {
            setTestWebhookUrl(webhooks[selectedPerson]);
        } else {
            setTestWebhookUrl('');
        }
    }, [selectedPerson, webhooks]);

    if (!isOpen) return null;

    const handleSave = async (person: string, url: string) => {
        await updateWebhook(person, url);
    };

    const handleRunTest = async () => {
        if (!testWebhookUrl) return;

        setIsTesting(true);
        setTestResult(null);

        try {
            const payload = {
                person: selectedPerson,
                currentSprint: testCurrentSprint,
                nextSprint: testNextSprint,
                webhookUrl: testWebhookUrl,
                date: new Date().toISOString().split('T')[0],
                todos: [
                    {
                        order: 1,
                        taskId: 'TEST-123',
                        taskName: simulateMoved ? '🚀 Test: Moving to Next Sprint' : '📝 Sample Task for Testing',
                        status: testStatus, 
                        sprintGoal: testSprintGoal,
                        recordLink: testTaskUrl || 'https://example.larksuite.com/task/test-123',
                        tag: simulateMoved ? 'Moved to Next Sprint' : testStatus,
                        isMoved: simulateMoved
                    }
                ],
                summary: {
                    total: 1,
                    completed: 0,
                    blocked: 0
                },
                isTest: true
            };

            const response = await fetch('/api/send-todo-webhook', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await response.json();
            
            if (response.ok && data.success) {
                setTestResult({
                    success: true,
                    message: 'Successfully sent to Lark!',
                    data: data.data
                });
            } else {
                setTestResult({
                    success: false,
                    message: data.error || `HTTP Error ${response.status}`,
                    data: data
                });
            }
        } catch (error) {
            setTestResult({
                success: false,
                message: error instanceof Error ? error.message : 'Unknown communication error'
            });
        } finally {
            setIsTesting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-6 border-b border-zinc-900">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-900/30 rounded-lg">
                            <Send className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-zinc-100 font-display">Lark Webhook Settings</h3>
                            <p className="text-sm text-zinc-500">Configure and test automation targets</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose} 
                        className="p-2 hover:bg-zinc-900 rounded-full text-zinc-500 hover:text-zinc-200 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
                    {/* Management Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 text-zinc-200">
                            <User className="w-4 h-4 text-zinc-500" />
                            <h4 className="text-sm font-semibold uppercase tracking-wider">Webhook Management</h4>
                        </div>
                        
                        <div className="grid gap-3">
                            {persons.map(person => (
                                <div key={person} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-zinc-900/40 p-3 rounded-xl border border-zinc-800/50 hover:border-zinc-700/50 transition-all">
                                    <div className="flex items-center gap-2 min-w-[140px]">
                                        <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400">
                                            {person.substring(0, 2).toUpperCase()}
                                        </div>
                                        <span className="text-sm font-medium text-zinc-300">{person}</span>
                                    </div>
                                    <div className="flex-1 relative group">
                                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600 group-focus-within:text-indigo-400" />
                                        <input
                                            type="text"
                                            defaultValue={webhooks[person] || ''}
                                            placeholder="https://...larksuite.com/base/automation/webhook/..."
                                            onBlur={(e) => handleSave(person, e.target.value)}
                                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-xs text-zinc-400 focus:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/50 transition-all"
                                        />
                                    </div>
                                    {webhooks[person] && (
                                        <Badge variant="outline" className="h-6 bg-emerald-950/20 text-emerald-400 border-emerald-900/30 self-start sm:self-auto">
                                            Configured
                                        </Badge>
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>

                    <hr className="border-zinc-900" />

                    {/* Test Section */}
                    <section className="space-y-4">
                        <div className="flex items-center gap-2 text-zinc-200">
                            <Globe className="w-4 h-4 text-indigo-400" />
                            <h4 className="text-sm font-semibold uppercase tracking-wider">Test Lark Connection</h4>
                        </div>

                        <div className="bg-indigo-950/10 border border-indigo-900/30 rounded-2xl p-5 space-y-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-zinc-500 ml-1">Test as Person</label>
                                    <select
                                        value={selectedPerson}
                                        onChange={(e) => setSelectedPerson(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                    >
                                        {persons.map(p => <option key={p} value={p}>{p}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-zinc-500 ml-1">Mock Task URL (Optional)</label>
                                    <div className="relative">
                                        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                                        <input
                                            type="text"
                                            value={testTaskUrl}
                                            onChange={(e) => setTestTaskUrl(e.target.value)}
                                            placeholder="Paste a task link to test formatting"
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg pl-9 pr-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-zinc-800/30 pt-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-zinc-500 ml-1">Current Sprint</label>
                                    <select
                                        value={testCurrentSprint}
                                        onChange={(e) => setTestCurrentSprint(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                    >
                                        {configs.map(c => <option key={c.number} value={c.number}>Sprint {c.number}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-zinc-500 ml-1">Next Sprint (Target)</label>
                                    <select
                                        value={testNextSprint}
                                        onChange={(e) => setTestNextSprint(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono"
                                    >
                                        {configs.map(c => <option key={c.number} value={c.number}>Sprint {c.number}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-zinc-500 ml-1">Task Status</label>
                                    <select
                                        value={testStatus}
                                        onChange={(e) => setTestStatus(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                                    >
                                        {WORKFLOW_STATUSES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-zinc-500 ml-1">Task Sprint Goal</label>
                                    <select
                                        value={testSprintGoal}
                                        onChange={(e) => setTestSprintGoal(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono"
                                    >
                                        {WORKFLOW_STATUSES.map(s => <option key={s.name} value={s.name}>{s.name}</option>)}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-zinc-500 ml-1 block">Webhook URL to Test</label>
                                <input
                                    type="text"
                                    value={testWebhookUrl}
                                    onChange={(e) => setTestWebhookUrl(e.target.value)}
                                    placeholder="Use default or paste a test webhook URL"
                                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono"
                                />
                            </div>
                            
                            <div className="flex items-center gap-2 p-2 bg-indigo-900/10 border border-indigo-500/20 rounded-lg">
                                <input
                                    type="checkbox"
                                    id="simulateMoved"
                                    checked={simulateMoved}
                                    onChange={(e) => setSimulateMoved(e.target.checked)}
                                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-900 text-indigo-600 focus:ring-indigo-500/20 focus:ring-offset-0"
                                />
                                <label htmlFor="simulateMoved" className="text-xs font-semibold text-indigo-300 flex items-center gap-1.5 cursor-pointer">
                                    <RefreshCw className={`w-3 h-3 ${simulateMoved ? 'animate-spin' : ''}`} style={{ animationDuration: '4s' }} />
                                    Simulate "Moved to Next Sprint" for this task
                                </label>
                            </div>

                            <div className="flex items-center justify-between pt-2">
                                <p className="text-[10px] text-zinc-500 italic max-w-xs">
                                    Note: Running a test sends a sample JSON payload to the specified URL. It does not affect your production to-do lists.
                                </p>
                                <button
                                    onClick={handleRunTest}
                                    disabled={isTesting || !testWebhookUrl}
                                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-500/20 active:scale-95"
                                >
                                    {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                    Run Test
                                </button>
                            </div>

                            {/* Result Display */}
                            {testResult && (
                                <div className={`mt-4 rounded-xl border p-4 animate-in fade-in slide-in-from-top-2 duration-300 ${
                                    testResult.success 
                                        ? 'bg-emerald-950/20 border-emerald-900/50' 
                                        : 'bg-red-950/20 border-red-900/50'
                                }`}>
                                    <div className="flex items-start gap-3">
                                        {testResult.success ? (
                                            <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                                        ) : (
                                            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                                        )}
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <h5 className={`text-sm font-bold ${testResult.success ? 'text-emerald-400' : 'text-red-400'}`}>
                                                    {testResult.success ? 'Test Passed' : 'Test Failed'}
                                                </h5>
                                                <span className="text-[10px] bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 text-zinc-500">
                                                    {new Date().toLocaleTimeString()}
                                                </span>
                                            </div>
                                            <p className="text-xs text-zinc-300">{testResult.message}</p>
                                            
                                            {testResult.data && (
                                                <div className="mt-3 relative">
                                                    <div className="absolute top-2 right-2 flex gap-2">
                                                        <button 
                                                            onClick={() => navigator.clipboard.writeText(JSON.stringify(testResult.data, null, 2))}
                                                            className="p-1 hover:bg-zinc-800 rounded transition-colors text-zinc-500 hover:text-zinc-300"
                                                        >
                                                            <Copy className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    <pre className="text-[10px] bg-black/50 p-3 rounded-lg border border-zinc-800/50 overflow-x-auto custom-scrollbar font-mono text-zinc-400">
                                                        {JSON.stringify(testResult.data, null, 2)}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                <div className="p-6 border-t border-zinc-900 flex justify-end">
                    <button 
                        onClick={onClose}
                        className="px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl font-bold transition-all"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}
