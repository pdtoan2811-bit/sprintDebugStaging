'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { RawLogEvent, WORKFLOW_STATUSES } from '@/lib/types';
import { SprintStartEntry } from '@/lib/hooks/useSprintStart';
import { Badge } from '../ui/badge';
import { format } from 'date-fns';
import {
    ArrowUpDown,
    Check,
    CheckSquare,
    ChevronDown,
    Clock,
    Edit3,
    ExternalLink,
    Filter,
    Flag,
    RotateCcw,
    Save,
    Search,
    Square,
    User,
} from 'lucide-react';

interface SprintStartManagerProps {
    rawLogs: RawLogEvent[];
    selectedSprint: string;
    getSprintStartSnapshot: (sprint: string, logs: RawLogEvent[]) => SprintStartEntry[];
    onSaveOverride: (sprint: string, taskId: string, newStatus: string) => void;
    onBulkSaveOverrides: (sprint: string, entries: { taskId: string; status: string }[]) => void;
    onClearOverride: (sprint: string, taskId: string) => void;
    onClearAllOverrides: (sprint: string) => void;
    onConfirmAll: (sprint: string, entries: SprintStartEntry[]) => void;
}

type SortKey = 'taskId' | 'taskName' | 'person' | 'module' | 'autoDetectedStatus' | 'confirmedStatus';

const STATUS_OPTIONS = WORKFLOW_STATUSES.map(s => s.name);

export function SprintStartManager({
    rawLogs,
    selectedSprint,
    getSprintStartSnapshot,
    onSaveOverride,
    onBulkSaveOverrides,
    onClearOverride,
    onClearAllOverrides,
    onConfirmAll,
}: SprintStartManagerProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
    const [sortKey, setSortKey] = useState<SortKey>('taskId');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
    const [showBulkMenu, setShowBulkMenu] = useState(false);
    const [localEntries, setLocalEntries] = useState<SprintStartEntry[]>([]);

    const snapshotEntries = useMemo(() => {
        if (!selectedSprint || rawLogs.length === 0) return [];
        return getSprintStartSnapshot(selectedSprint, rawLogs);
    }, [selectedSprint, rawLogs, getSprintStartSnapshot]);

    useEffect(() => {
        setLocalEntries(snapshotEntries);
        setSelectedTaskIds(new Set());
    }, [snapshotEntries]);

    const handleLocalStatusChange = useCallback((taskId: string, newStatus: string) => {
        setLocalEntries(prev => prev.map(entry => {
            if (entry.taskId !== taskId) return entry;
            return {
                ...entry,
                confirmedStatus: newStatus,
                isOverridden: newStatus !== entry.autoDetectedStatus,
            };
        }));
        onSaveOverride(selectedSprint, taskId, newStatus);
    }, [selectedSprint, onSaveOverride]);

    const handleResetToAuto = useCallback((taskId: string) => {
        setLocalEntries(prev => prev.map(entry => {
            if (entry.taskId !== taskId) return entry;
            return {
                ...entry,
                confirmedStatus: entry.autoDetectedStatus,
                isOverridden: false,
            };
        }));
        onClearOverride(selectedSprint, taskId);
    }, [selectedSprint, onClearOverride]);

    const handleBulkStatusChange = useCallback((newStatus: string) => {
        const taskIds = Array.from(selectedTaskIds);
        setLocalEntries(prev => prev.map(entry => {
            if (!selectedTaskIds.has(entry.taskId)) return entry;
            return {
                ...entry,
                confirmedStatus: newStatus,
                isOverridden: newStatus !== entry.autoDetectedStatus,
            };
        }));
        onBulkSaveOverrides(selectedSprint, taskIds.map(taskId => ({ taskId, status: newStatus })));
        setSelectedTaskIds(new Set());
        setShowBulkMenu(false);
    }, [selectedSprint, selectedTaskIds, onBulkSaveOverrides]);

    const handleConfirmAll = useCallback(() => {
        onConfirmAll(selectedSprint, localEntries);
    }, [selectedSprint, localEntries, onConfirmAll]);

    const handleClearAllOverrides = useCallback(() => {
        if (confirm('Reset all overrides to auto-detected values?')) {
            setLocalEntries(prev => prev.map(entry => ({
                ...entry,
                confirmedStatus: entry.autoDetectedStatus,
                isOverridden: false,
            })));
            onClearAllOverrides(selectedSprint);
        }
    }, [selectedSprint, onClearAllOverrides]);

    const toggleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    };

    const filteredAndSortedEntries = useMemo(() => {
        let filtered = localEntries;

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(e =>
                e.taskId.toLowerCase().includes(q) ||
                e.taskName.toLowerCase().includes(q) ||
                e.person.toLowerCase().includes(q) ||
                e.module.toLowerCase().includes(q)
            );
        }

        if (statusFilter !== 'all') {
            if (statusFilter === 'overridden') {
                filtered = filtered.filter(e => e.isOverridden);
            } else {
                filtered = filtered.filter(e => e.confirmedStatus === statusFilter);
            }
        }

        return [...filtered].sort((a, b) => {
            let cmp = 0;
            switch (sortKey) {
                case 'taskId':
                    cmp = a.taskId.localeCompare(b.taskId);
                    break;
                case 'taskName':
                    cmp = a.taskName.localeCompare(b.taskName);
                    break;
                case 'person':
                    cmp = a.person.localeCompare(b.person);
                    break;
                case 'module':
                    cmp = a.module.localeCompare(b.module);
                    break;
                case 'autoDetectedStatus':
                    cmp = a.autoDetectedStatus.localeCompare(b.autoDetectedStatus);
                    break;
                case 'confirmedStatus':
                    cmp = a.confirmedStatus.localeCompare(b.confirmedStatus);
                    break;
            }
            return sortDir === 'desc' ? -cmp : cmp;
        });
    }, [localEntries, searchQuery, statusFilter, sortKey, sortDir]);

    const stats = useMemo(() => {
        const overriddenCount = localEntries.filter(e => e.isOverridden).length;
        const statusCounts: Record<string, number> = {};
        localEntries.forEach(e => {
            statusCounts[e.confirmedStatus] = (statusCounts[e.confirmedStatus] || 0) + 1;
        });
        return { total: localEntries.length, overridden: overriddenCount, statusCounts };
    }, [localEntries]);

    const toggleSelectAll = () => {
        if (selectedTaskIds.size === filteredAndSortedEntries.length) {
            setSelectedTaskIds(new Set());
        } else {
            setSelectedTaskIds(new Set(filteredAndSortedEntries.map(e => e.taskId)));
        }
    };

    const toggleTaskSelection = (taskId: string) => {
        setSelectedTaskIds(prev => {
            const next = new Set(prev);
            if (next.has(taskId)) {
                next.delete(taskId);
            } else {
                next.add(taskId);
            }
            return next;
        });
    };

    const SortHeader = ({ label, sortKeyName, className = '' }: { label: string; sortKeyName: SortKey; className?: string }) => (
        <button
            onClick={() => toggleSort(sortKeyName)}
            className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold cursor-pointer hover:text-zinc-200 transition-colors ${sortKey === sortKeyName ? 'text-blue-400' : 'text-zinc-500'} ${className}`}
        >
            {label}
            <ArrowUpDown className="w-2.5 h-2.5" />
        </button>
    );

    if (!selectedSprint) {
        return (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
                <Flag className="w-12 h-12 mb-4 opacity-50" />
                <p className="text-sm">Select a sprint to view its starting status snapshot</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
                <div>
                    <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
                        <Flag className="w-4 h-4 text-blue-400" />
                        Sprint {selectedSprint} Starting Status
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1">
                        Auto-detected from earliest log entry per task where sprint and status are set
                    </p>
                </div>
                <div className="flex gap-2">
                    {stats.overridden > 0 && (
                        <button
                            onClick={handleClearAllOverrides}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-md transition-colors"
                        >
                            <RotateCcw className="w-3 h-3" />
                            Reset All
                        </button>
                    )}
                    <button
                        onClick={handleConfirmAll}
                        className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-md transition-colors shadow-lg shadow-blue-900/30"
                    >
                        <Save className="w-3 h-3" />
                        Confirm All
                    </button>
                </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search tasks..."
                        className="pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-700 text-zinc-200 text-sm rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
                    />
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                    {/* Status Filter */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <Filter className="w-3.5 h-3.5 text-zinc-500" />
                        <button
                            onClick={() => setStatusFilter('all')}
                            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${statusFilter === 'all'
                                ? 'bg-blue-600 text-white'
                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                }`}
                        >
                            All ({stats.total})
                        </button>
                        <button
                            onClick={() => setStatusFilter('overridden')}
                            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${statusFilter === 'overridden'
                                ? 'bg-amber-600 text-white'
                                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                }`}
                        >
                            Overridden ({stats.overridden})
                        </button>
                        {Object.entries(stats.statusCounts).slice(0, 4).map(([status, count]) => (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`px-2.5 py-1 text-xs rounded-md transition-colors ${statusFilter === status
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                                    }`}
                            >
                                {status} ({count})
                            </button>
                        ))}
                    </div>

                    {/* Bulk Actions */}
                    {selectedTaskIds.size > 0 && (
                        <div className="relative">
                            <button
                                onClick={() => setShowBulkMenu(!showBulkMenu)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-md transition-colors"
                            >
                                <Edit3 className="w-3 h-3" />
                                Bulk Edit ({selectedTaskIds.size})
                                <ChevronDown className="w-3 h-3" />
                            </button>
                            {showBulkMenu && (
                                <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[180px]">
                                    <div className="px-3 py-1.5 text-[10px] text-zinc-500 uppercase tracking-wider font-semibold border-b border-zinc-800">
                                        Set Confirmed Status To
                                    </div>
                                    {STATUS_OPTIONS.map(status => (
                                        <button
                                            key={status}
                                            onClick={() => handleBulkStatusChange(status)}
                                            className="w-full text-left px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800 transition-colors"
                                        >
                                            {status}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Tasks Table */}
            {localEntries.length > 0 ? (
                <div className="overflow-x-auto border border-zinc-800/50 rounded-xl">
                    {/* Table Header */}
                    <table className="w-full min-w-[1100px] table-fixed">
                        <thead>
                            <tr className="bg-zinc-900/50 border-b border-zinc-800/50">
                                <th className="w-[40px] px-2 py-3">
                                    <button
                                        onClick={toggleSelectAll}
                                        className="flex justify-center text-zinc-500 hover:text-zinc-300 w-full"
                                    >
                                        {selectedTaskIds.size === filteredAndSortedEntries.length && filteredAndSortedEntries.length > 0 ? (
                                            <CheckSquare className="w-4 h-4 text-blue-400" />
                                        ) : (
                                            <Square className="w-4 h-4" />
                                        )}
                                    </button>
                                </th>
                                <th className="w-[110px] px-3 py-3 text-left">
                                    <SortHeader label="Task ID" sortKeyName="taskId" />
                                </th>
                                <th className="w-[280px] px-3 py-3 text-left">
                                    <SortHeader label="Task Name" sortKeyName="taskName" />
                                </th>
                                <th className="w-[180px] px-3 py-3 text-left">
                                    <SortHeader label="Person" sortKeyName="person" />
                                </th>
                                <th className="w-[100px] px-3 py-3 text-left">
                                    <SortHeader label="Module" sortKeyName="module" />
                                </th>
                                <th className="w-[140px] px-3 py-3 text-left">
                                    <SortHeader label="Auto Status" sortKeyName="autoDetectedStatus" />
                                </th>
                                <th className="w-[150px] px-3 py-3 text-left">
                                    <SortHeader label="Confirmed" sortKeyName="confirmedStatus" />
                                </th>
                                <th className="w-[50px] px-2 py-3 text-center">
                                    <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Diff</span>
                                </th>
                                <th className="w-[50px] px-2 py-3 text-center">
                                    <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-500">Link</span>
                                </th>
                            </tr>
                        </thead>
                    </table>

                    {/* Table Body */}
                    <div className="max-h-[500px] overflow-y-auto">
                        <table className="w-full min-w-[1100px] table-fixed">
                            <tbody className="divide-y divide-zinc-900/50">
                                {filteredAndSortedEntries.map(entry => {
                                    const isSelected = selectedTaskIds.has(entry.taskId);
                                    const persons = entry.person ? entry.person.split(',').map(p => p.trim()).filter(Boolean) : [];

                                    return (
                                        <tr
                                            key={entry.taskId}
                                            className={`transition-all ${entry.isOverridden
                                                ? 'bg-amber-950/20 border-l-2 border-amber-500'
                                                : isSelected
                                                    ? 'bg-blue-950/20'
                                                    : 'hover:bg-zinc-800/30'
                                                }`}
                                        >
                                            {/* Checkbox */}
                                            <td className="w-[40px] px-2 py-3 align-top">
                                                <button
                                                    onClick={() => toggleTaskSelection(entry.taskId)}
                                                    className="flex justify-center text-zinc-500 hover:text-zinc-300 w-full pt-1"
                                                >
                                                    {isSelected ? (
                                                        <CheckSquare className="w-4 h-4 text-blue-400" />
                                                    ) : (
                                                        <Square className="w-4 h-4" />
                                                    )}
                                                </button>
                                            </td>

                                            {/* Task ID */}
                                            <td className="w-[110px] px-3 py-3 align-top">
                                                <span className="font-mono text-[11px] text-zinc-400 break-all">{entry.taskId}</span>
                                            </td>

                                            {/* Task Name - Wrapping enabled */}
                                            <td className="w-[280px] px-3 py-3 align-top">
                                                <span className="text-xs text-zinc-200 break-words leading-relaxed">
                                                    {entry.taskName}
                                                </span>
                                            </td>

                                            {/* Person - Chips UI */}
                                            <td className="w-[180px] px-3 py-3 align-top">
                                                {persons.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {persons.map((person, idx) => (
                                                            <span
                                                                key={idx}
                                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-[11px] text-zinc-200"
                                                            >
                                                                <User className="w-2.5 h-2.5 text-zinc-500" />
                                                                {person}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-zinc-600">—</span>
                                                )}
                                            </td>

                                            {/* Module */}
                                            <td className="w-[100px] px-3 py-3 align-top">
                                                <span className="text-[11px] text-zinc-400 break-words">
                                                    {entry.module || '—'}
                                                </span>
                                            </td>

                                            {/* Auto-Detected Status */}
                                            <td className="w-[140px] px-3 py-3 align-top">
                                                <div className="flex flex-col gap-1">
                                                    <span 
                                                        className="text-[10px] px-2 py-1 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 inline-block w-fit"
                                                        title={entry.autoDetectedStatus}
                                                    >
                                                        {entry.autoDetectedStatus}
                                                    </span>
                                                    <span 
                                                        className="text-[9px] text-zinc-600 flex items-center gap-1" 
                                                        title={format(new Date(entry.autoDetectedTimestamp), 'PPpp')}
                                                    >
                                                        <Clock className="w-2.5 h-2.5" />
                                                        {format(new Date(entry.autoDetectedTimestamp), 'MMM d, HH:mm')}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Confirmed Status (Editable) */}
                                            <td className="w-[150px] px-3 py-3 align-top">
                                                <select
                                                    value={entry.confirmedStatus}
                                                    onChange={(e) => handleLocalStatusChange(entry.taskId, e.target.value)}
                                                    className={`text-[11px] px-2 py-1.5 rounded border focus:outline-none focus:ring-1 focus:ring-blue-500 w-full ${entry.isOverridden
                                                        ? 'bg-amber-950/50 text-amber-300 border-amber-700'
                                                        : 'bg-zinc-800 text-zinc-300 border-zinc-700'
                                                        }`}
                                                >
                                                    {STATUS_OPTIONS.map(status => (
                                                        <option key={status} value={status}>{status}</option>
                                                    ))}
                                                </select>
                                            </td>

                                            {/* Override Indicator / Reset */}
                                            <td className="w-[50px] px-2 py-3 align-top">
                                                <div className="flex justify-center pt-1">
                                                    {entry.isOverridden ? (
                                                        <button
                                                            onClick={() => handleResetToAuto(entry.taskId)}
                                                            className="text-amber-400 hover:text-amber-300 transition-colors"
                                                            title="Reset to auto-detected"
                                                        >
                                                            <RotateCcw className="w-3.5 h-3.5" />
                                                        </button>
                                                    ) : (
                                                        <Check className="w-3.5 h-3.5 text-green-600" />
                                                    )}
                                                </div>
                                            </td>

                                            {/* Record Link */}
                                            <td className="w-[50px] px-2 py-3 align-top">
                                                <div className="flex justify-center pt-1">
                                                    {entry.recordLink ? (
                                                        <a
                                                            href={entry.recordLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-blue-400 hover:text-blue-300 transition-colors"
                                                            title="Open in source system"
                                                        >
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </a>
                                                    ) : (
                                                        <span className="text-zinc-700">—</span>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-48 text-zinc-500 bg-zinc-950/30 rounded-xl border border-zinc-800/50">
                    <Flag className="w-10 h-10 mb-3 opacity-50" />
                    <p className="text-sm">No tasks found for Sprint {selectedSprint}</p>
                    <p className="text-xs mt-1 text-zinc-600">
                        {rawLogs.length === 0 
                            ? 'No log data loaded yet - waiting for API response'
                            : `${rawLogs.length} logs loaded, but none match the sprint start criteria (sprint=${selectedSprint} with non-empty status)`
                        }
                    </p>
                </div>
            )}

            {/* Summary Stats */}
            {localEntries.length > 0 && (
                <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                    <span>Total: <span className="text-zinc-300 font-mono">{stats.total}</span> tasks</span>
                    <span>|</span>
                    <span>Overridden: <span className="text-amber-400 font-mono">{stats.overridden}</span></span>
                    <span>|</span>
                    <span>Selected: <span className="text-blue-400 font-mono">{selectedTaskIds.size}</span></span>
                    <span>|</span>
                    <span>Showing: <span className="text-zinc-300 font-mono">{filteredAndSortedEntries.length}</span></span>
                </div>
            )}
        </div>
    );
}
