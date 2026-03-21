'use client';

import React from 'react';
import { SyncStatus, SyncLogEntry } from '@/lib/hooks/useSprintStartSync';
import { 
    X, 
    CheckCircle2, 
    AlertCircle, 
    Loader2, 
    Send, 
    ExternalLink, 
    AlertTriangle,
    Check
} from 'lucide-react';

interface SprintStartSyncModalProps {
    isOpen: boolean;
    onClose: () => void;
    syncStatus: SyncStatus;
    sprint: string;
}

export function SprintStartSyncModal({
    isOpen,
    onClose,
    syncStatus,
    sprint
}: SprintStartSyncModalProps) {
    if (!isOpen) return null;

    const { isSyncing, current, total, logs } = syncStatus;
    const progress = total > 0 ? (current / total) * 100 : 0;
    
    const successCount = logs.filter(l => l.success).length;
    const failCount = logs.filter(l => !l.success).length;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
            <div className="w-full max-w-3xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-zinc-900 bg-zinc-950/50">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isSyncing ? 'bg-blue-900/30' : 'bg-emerald-900/30'}`}>
                            {isSyncing ? (
                                <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                            ) : (
                                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            )}
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-zinc-100 font-display">
                                {isSyncing ? 'Syncing Sprint to Lark...' : 'Sync Completed'}
                            </h3>
                            <p className="text-sm text-zinc-500">
                                {isSyncing 
                                    ? `Sending Task ${current} of ${total} for Sprint ${sprint}` 
                                    : `Processed ${total} tasks for Sprint ${sprint}`}
                            </p>
                        </div>
                    </div>
                    {!isSyncing && (
                        <button 
                            onClick={onClose} 
                            className="p-2 hover:bg-zinc-900 rounded-full text-zinc-500 hover:text-zinc-200 transition-colors"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                {/* Progress Bar */}
                <div className="px-6 py-4 bg-zinc-900/30">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-mono text-zinc-400">Progress: {Math.round(progress)}%</span>
                        <div className="flex gap-4">
                            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> {successCount} Success
                            </span>
                            <span className="text-[10px] text-red-400 font-bold uppercase tracking-widest flex items-center gap-1">
                                <AlertCircle className="w-3 h-3" /> {failCount} Failed
                            </span>
                        </div>
                    </div>
                    <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-300 ${isSyncing ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-emerald-500'}`}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* Log Content */}
                <div className="flex-1 overflow-y-auto p-0 custom-scrollbar bg-black">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-zinc-950/90 backdrop-blur-sm z-10 border-b border-zinc-900">
                            <tr>
                                <th className="px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest w-24">Status</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest w-32">Task ID</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Task Name & Person</th>
                                <th className="px-6 py-3 text-[10px] font-bold text-zinc-500 uppercase tracking-widest w-40">Result</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-900/50">
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3 opacity-30">
                                            <Send className="w-8 h-8" />
                                            <p className="text-sm">Preparing to dispatch requests...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                logs.map((log, idx) => (
                                    <tr key={log.taskId + idx} className="hover:bg-zinc-900/40 transition-colors group">
                                        <td className="px-6 py-4">
                                            {log.success ? (
                                                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold">
                                                    <div className="w-5 h-5 rounded-full bg-emerald-950/30 flex items-center justify-center">
                                                        <Check className="w-3 h-3" />
                                                    </div>
                                                    OK
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2 text-red-400 text-xs font-bold">
                                                    <div className="w-5 h-5 rounded-full bg-red-950/30 flex items-center justify-center">
                                                        <AlertTriangle className="w-3 h-3" />
                                                    </div>
                                                    FAIL
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 font-mono text-[11px] text-zinc-500 group-hover:text-zinc-300">
                                            {log.taskId}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-xs text-zinc-200 line-clamp-1 group-hover:text-white transition-colors">
                                                    {log.taskName}
                                                </span>
                                                <span className="text-[10px] text-zinc-600 flex items-center gap-1 mt-1">
                                                    <div className="w-1 h-1 rounded-full bg-zinc-700" />
                                                    {log.person}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-[10px]">
                                            {log.success ? (
                                                <span className="text-zinc-600 italic">Accepted by Lark</span>
                                            ) : (
                                                <span className="text-red-400/80 font-mono break-all">{log.error}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-zinc-900 bg-zinc-950/50 flex justify-between items-center">
                    <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono uppercase tracking-widest">
                        <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                        Live API Stream Enabled
                    </div>
                    <button 
                        onClick={onClose}
                        disabled={isSyncing}
                        className={`px-8 py-2.5 rounded-xl font-bold transition-all ${
                            isSyncing 
                                ? 'bg-zinc-900 text-zinc-600 cursor-not-allowed' 
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 active:scale-95'
                        }`}
                    >
                        {isSyncing ? 'Dispatching...' : 'Done'}
                    </button>
                </div>
            </div>
        </div>
    );
}
