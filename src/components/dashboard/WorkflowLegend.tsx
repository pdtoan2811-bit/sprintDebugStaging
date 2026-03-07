'use client';

import React from 'react';
import { WORKFLOW_STATUSES } from '@/lib/types';
import { Zap, RefreshCw, ArrowRight } from 'lucide-react';

export function WorkflowLegend() {
    return (
        <div className="flex flex-col gap-4">
            {/* Status Flow */}
            <div className="space-y-1.5">
                <h4 className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500 mb-2">
                    Workflow Statuses
                </h4>
                {WORKFLOW_STATUSES.map((status) => (
                    <div key={status.index} className="flex items-center gap-2">
                        <span className="w-4 text-right text-[10px] font-mono text-zinc-600">
                            {status.index}
                        </span>
                        <div
                            className={`w-3 h-3 rounded-sm border ${status.severity === 'critical'
                                    ? 'bg-red-600 border-red-400 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.4)]'
                                    : status.severity === 'high'
                                        ? 'bg-amber-600 border-amber-400 animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                                        : 'bg-zinc-700 border-zinc-500'
                                }`}
                        />
                        <span
                            className={`text-[11px] font-mono ${status.isBottleneck ? 'text-zinc-100 font-semibold' : 'text-zinc-400'
                                }`}
                        >
                            {status.name}
                        </span>
                        {status.isBottleneck && (
                            <Zap className={`w-3 h-3 ${status.severity === 'critical' ? 'text-red-400' : 'text-amber-400'}`} />
                        )}
                    </div>
                ))}
            </div>

            {/* Doom Loop Explanation */}
            <div className="border border-zinc-800 rounded-lg p-3 bg-zinc-950/50">
                <h4 className="text-[10px] uppercase tracking-wider font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                    <RefreshCw className="w-3 h-3" />
                    The Doom Loop
                </h4>
                <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-400 flex-wrap">
                    <span className="px-1.5 py-0.5 bg-red-950/50 border border-red-800/50 rounded text-red-300">Reprocess</span>
                    <ArrowRight className="w-2.5 h-2.5 text-zinc-600" />
                    <span className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded">Ready for Test</span>
                    <ArrowRight className="w-2.5 h-2.5 text-zinc-600" />
                    <span className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-700 rounded">Testing</span>
                    <ArrowRight className="w-2.5 h-2.5 text-zinc-600" />
                    <span className="px-1.5 py-0.5 bg-red-950/50 border border-red-800/50 rounded text-red-300">Reprocess</span>
                </div>
                <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
                    If a task hits <span className="text-red-400 font-semibold">Reprocess</span> more
                    than once, risk level escalates automatically.
                </p>
                <div className="flex gap-2 mt-2">
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-amber-500" />
                        <span className="text-[9px] text-zinc-500">1× = Elevated</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[9px] text-zinc-500">2×+ = Critical</span>
                    </div>
                </div>
            </div>

            {/* Module Colors */}
            <div className="space-y-1.5">
                <h4 className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500 mb-2">
                    Module Colors
                </h4>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-blue-600 border border-blue-400" />
                    <span className="text-[11px] font-mono text-zinc-400">Auth / Identity</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-fuchsia-600 border border-fuchsia-400" />
                    <span className="text-[11px] font-mono text-zinc-400">UI / Design</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-emerald-600 border border-emerald-400" />
                    <span className="text-[11px] font-mono text-zinc-400">API / Graph</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm bg-amber-600 border border-amber-400" />
                    <span className="text-[11px] font-mono text-zinc-400">Backend / Infra</span>
                </div>
            </div>
        </div>
    );
}
