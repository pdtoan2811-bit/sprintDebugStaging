'use client';

import React, { useState, useEffect } from 'react';
import { TimelineSegment, TaskAnalysis, MeetingNote } from '@/lib/types';
import { isBottleneckStatus, getStatusSeverity } from '@/lib/workflow-engine';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { TaskTimeline } from './TaskTimeline';
import { Badge } from '../ui/badge';
import { format } from 'date-fns';
import {
    AlertTriangle,
    Calendar,
    ChevronUp,
    Clock,
    ExternalLink,
    OctagonAlert,
    Pin,
    Plus,
    RefreshCw,
    ToggleLeft,
    ToggleRight,
    User,
    Users,
    Zap,
} from 'lucide-react';

// Team leaders always available in "Blocked by" dropdown
const TEAM_LEADERS = ['Bùi Anh Đức', 'Phạm Đức Toàn'];

interface EnhancedInspectorProps {
    segment: TimelineSegment | null;
    taskAnalysis: TaskAnalysis | null;
    onClose: () => void;
    // High risk
    isHighRisk: boolean;
    onToggleHighRisk: (taskId: string) => void;
    // Meeting notes
    meetingNotes: MeetingNote[];
    onAddMeetingNote: (note: MeetingNote) => void;
    onUpdateMeetingNote: (note: MeetingNote) => void;
    onDeleteMeetingNote: (id: string) => void;
    // All persons in the sprint for context
    allPersons: string[];
}

export function StandupInspector({
    segment,
    taskAnalysis,
    onClose,
    isHighRisk,
    onToggleHighRisk,
    meetingNotes,
    onAddMeetingNote,
    onUpdateMeetingNote,
    onDeleteMeetingNote,
    allPersons,
}: EnhancedInspectorProps) {
    // Meeting note form state
    const [showMeetingForm, setShowMeetingForm] = useState(false);
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [meetingIsStall, setMeetingIsStall] = useState(false);
    const [meetingStallReason, setMeetingStallReason] = useState('');
    const [meetingBlockedBy, setMeetingBlockedBy] = useState('');
    const [meetingSolution, setMeetingSolution] = useState('');

    useEffect(() => {
        if (segment) {
            // Reset meeting form
            setShowMeetingForm(false);
            setEditingNoteId(null);
            setMeetingIsStall(false);
            setMeetingStallReason('');
            setMeetingBlockedBy('');
            setMeetingSolution('');
        }
    }, [segment]);

    // Build list of people for the "Blocked by" dropdown
    const assignedPeople = taskAnalysis
        ? [...new Set(taskAnalysis.statusHistory.map((h) => h.person || '').flatMap((p) => p.split(',').map((n) => n.trim())).filter(Boolean))]
        : [];

    const handleAddOrUpdateMeetingNote = () => {
        if (!segment) return;
        const note: MeetingNote = {
            id: editingNoteId || `${segment.taskId}_meeting_${Date.now()}`,
            taskId: segment.taskId,
            date: new Date().toISOString().split('T')[0],
            isStall: meetingIsStall,
            stallReason: meetingIsStall ? meetingStallReason : '',
            blockedBy: meetingBlockedBy,
            solution: meetingSolution,
            createdAt: new Date().toISOString(),
        };

        if (editingNoteId) {
            onUpdateMeetingNote(note);
        } else {
            onAddMeetingNote(note);
        }

        // Reset form
        setEditingNoteId(null);
        setMeetingIsStall(false);
        setMeetingStallReason('');
        setMeetingBlockedBy('');
        setMeetingSolution('');
        setShowMeetingForm(false);
    };

    const handleEditNote = (note: MeetingNote) => {
        setEditingNoteId(note.id);
        setMeetingIsStall(note.isStall || false);
        setMeetingStallReason(note.stallReason || '');
        setMeetingBlockedBy(note.blockedBy || '');
        setMeetingSolution(note.solution || '');
        setShowMeetingForm(true);
    };

    if (!segment) return null;

    const severity = getStatusSeverity(segment.status);
    const isBottleneck = isBottleneckStatus(segment.status);

    return (
        <Sheet open={!!segment} onOpenChange={(open) => !open && onClose()}>
            <SheetContent open={!!segment} onOpenChange={(open: boolean) => !open && onClose()} className="flex flex-col h-full overflow-y-auto sm:max-w-xl w-[90%] p-6">
                <SheetHeader className="mb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-zinc-400 font-bold bg-zinc-900 border border-zinc-800 px-2 flex items-center h-6 rounded-md uppercase text-xs">
                            {segment.taskId}
                        </span>
                        <Badge variant={segment.isCompleted ? 'default' : 'outline'}>
                            {segment.status}
                        </Badge>
                        {isBottleneck && (
                            <Badge className={`gap-1 text-[9px] ${severity === 'critical'
                                ? 'bg-red-900 text-red-200 border-red-700 animate-pulse'
                                : 'bg-amber-900 text-amber-200 border-amber-700 animate-pulse'
                                }`}>
                                <Zap className="w-2.5 h-2.5" />
                                BOTTLENECK
                            </Badge>
                        )}
                    </div>
                    <SheetTitle className="text-xl mt-2 leading-tight tracking-tight">
                        {segment.taskName}
                    </SheetTitle>
                    <SheetDescription className="mt-1 flex items-center gap-2">
                        <span>{segment.startTime instanceof Date && !isNaN(segment.startTime.getTime()) ? format(segment.startTime, 'MMM dd, HH:mm') : 'Unknown Start'}</span>
                        <span>&rarr;</span>
                        <span>{segment.endTime instanceof Date && !isNaN(segment.endTime.getTime()) ? format(segment.endTime, 'MMM dd, HH:mm') : 'Unknown End'}</span>
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 space-y-5">

                    {/* ── All Assigned People ── */}
                    {assignedPeople.length > 0 && (
                        <div className="space-y-2">
                            <h3 className="text-[10px] font-semibold tracking-wide text-zinc-500 uppercase flex items-center gap-1.5">
                                <Users className="w-3 h-3" />
                                Assigned People
                            </h3>
                            <div className="flex flex-wrap gap-1.5">
                                {assignedPeople.map((person) => (
                                    <span
                                        key={person}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-200 font-medium"
                                    >
                                        <User className="w-3 h-3 text-zinc-500" />
                                        {person}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── High Risk Toggle ── */}
                    <button
                        onClick={() => onToggleHighRisk(segment.taskId)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all ${isHighRisk
                            ? 'border-red-600/50 bg-red-950/30 text-red-300'
                            : 'border-zinc-800 bg-zinc-900/50 text-zinc-400'
                            }`}
                    >
                        <div className="flex items-center gap-2">
                            <Pin className={`w-3.5 h-3.5 ${isHighRisk ? 'text-red-400 fill-red-400' : ''}`} />
                            <span className="text-xs font-semibold uppercase tracking-wide">High Risk</span>
                        </div>
                        {isHighRisk ? (
                            <ToggleRight className="w-5 h-5 text-red-400" />
                        ) : (
                            <ToggleLeft className="w-5 h-5 text-zinc-600" />
                        )}
                    </button>

                    {/* ── Doom Loop Indicator ── */}
                    {taskAnalysis && (taskAnalysis.doomLoopCount > 0 || taskAnalysis.reprocessCount > 1) && (
                        <div className={`px-3 py-2.5 rounded-lg border ${taskAnalysis.riskLevel === 'critical'
                            ? 'border-red-700/50 bg-red-950/30'
                            : 'border-amber-700/50 bg-amber-950/20'
                            }`}>
                            <div className="flex items-center gap-2 mb-1.5">
                                <RefreshCw className={`w-3.5 h-3.5 ${taskAnalysis.riskLevel === 'critical' ? 'text-red-400 animate-spin' : 'text-amber-400'
                                    }`} style={{ animationDuration: '3s' }} />
                                <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wide">
                                    Doom Loop Detected
                                </span>
                                <Badge variant="destructive" className="text-[9px] px-1.5 ml-auto">
                                    {taskAnalysis.doomLoopCount} cycle(s)
                                </Badge>
                            </div>
                            <p className="text-[10px] text-zinc-500">
                                Reprocessed {taskAnalysis.reprocessCount}&times; &mdash; Risk: <span className={
                                    taskAnalysis.riskLevel === 'critical' ? 'text-red-400 font-bold' : 'text-amber-400 font-bold'
                                }>{taskAnalysis.riskLevel.toUpperCase()}</span>
                            </p>
                        </div>
                    )}

                    {/* ── Blocking Transitions (> 8 working hours) ── */}
                    {taskAnalysis && taskAnalysis.blockingTransitions && taskAnalysis.blockingTransitions.length > 0 && (
                        <div className="px-3 py-2.5 rounded-lg border border-orange-700/50 bg-orange-950/20">
                            <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
                                <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wide">
                                    Long Status Durations
                                </span>
                                <Badge className="text-[9px] px-1.5 ml-auto bg-orange-900/60 text-orange-200 border-orange-700/50">
                                    {taskAnalysis.blockingTransitions.length} blocking
                                </Badge>
                            </div>
                            <p className="text-[10px] text-zinc-500 mb-2">
                                Status changes that took more than 8 working hours
                            </p>
                            <div className="space-y-1.5">
                                {taskAnalysis.blockingTransitions.map((bt, idx) => (
                                    <div
                                        key={idx}
                                        className="flex items-center gap-2 px-2 py-1.5 bg-black/30 rounded-md border border-orange-900/30 text-[11px]"
                                    >
                                        <Clock className="w-3 h-3 text-orange-400 flex-shrink-0" />
                                        <span className="text-zinc-400 font-mono">{bt.fromStatus}</span>
                                        <span className="text-zinc-600">→</span>
                                        <span className="text-zinc-400 font-mono">{bt.toStatus}</span>
                                        <span className="ml-auto text-orange-300 font-bold font-mono">
                                            {bt.workingHoursElapsed}h
                                        </span>
                                        {bt.person && (
                                            <span className="text-zinc-500 flex items-center gap-1">
                                                <User className="w-2.5 h-2.5" />
                                                <span className="truncate max-w-[80px]">{bt.person}</span>
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ── Metadata ── */}
                    <div className="grid grid-cols-2 gap-4 auto-rows-min text-sm border border-zinc-900 rounded-lg p-4 bg-zinc-950/50 shadow-inner">
                        <div className="flex flex-col">
                            <span className="text-zinc-500 font-medium mb-1">Assignee</span>
                            <span className="font-mono text-zinc-200">{segment.person}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-zinc-500 font-medium mb-1">Module</span>
                            <span className="font-mono text-zinc-200">{segment.module}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-zinc-500 font-medium mb-1">Screen</span>
                            <span className="font-mono text-zinc-200">{segment.screen}</span>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-zinc-500 font-medium mb-1">Sprint Goal</span>
                            <span className="font-mono text-zinc-200">{segment.sprintGoal}</span>
                        </div>
                        {(segment.recordLink || taskAnalysis?.recordLink) && (
                            <div className="flex flex-col col-span-2">
                                <span className="text-zinc-500 font-medium mb-1">Record Link</span>
                                <a
                                    href={segment.recordLink || taskAnalysis?.recordLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 font-mono text-blue-400 hover:text-blue-300 hover:underline transition-colors"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    <span className="truncate">Open in Source System</span>
                                </a>
                            </div>
                        )}
                    </div>

                    <hr className="border-t border-zinc-900" />

                    {/* ══════════════════════════════════════════════════════════════
                        ── UNIFIED TIMELINE + MEETING NOTES ──
                       ══════════════════════════════════════════════════════════════ */}

                    {/* Add Meeting Note button + form */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase flex items-center gap-2">
                                <Calendar className="w-3.5 h-3.5 text-blue-400" />
                                Daily Meeting Notes
                            </h3>
                            <button
                                onClick={() => setShowMeetingForm(!showMeetingForm)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${showMeetingForm
                                    ? 'bg-zinc-800 text-zinc-300 border border-zinc-700'
                                    : 'bg-blue-600 text-white hover:bg-blue-500 shadow-md shadow-blue-900/30'
                                    }`}
                            >
                                {showMeetingForm ? (
                                    <>
                                        <ChevronUp className="w-3 h-3" /> Cancel
                                    </>
                                ) : (
                                    <>
                                        <Plus className="w-3 h-3" /> Add Today&apos;s Note
                                    </>
                                )}
                            </button>
                        </div>

                        {/* Meeting note form */}
                        {showMeetingForm && (
                            <div className="rounded-xl border border-blue-800/40 bg-blue-950/20 p-4 space-y-3 animate-in slide-in-from-top-2">
                                {/* Stall toggle */}
                                <button
                                    type="button"
                                    onClick={() => setMeetingIsStall(!meetingIsStall)}
                                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium transition-all ${meetingIsStall
                                        ? 'border-red-600/50 bg-red-950/40 text-red-300'
                                        : 'border-zinc-700 bg-zinc-900/50 text-zinc-400'
                                        }`}
                                >
                                    <span className="flex items-center gap-2">
                                        <OctagonAlert className="w-3.5 h-3.5" />
                                        Is this task stalled?
                                    </span>
                                    {meetingIsStall ? (
                                        <ToggleRight className="w-5 h-5 text-red-400" />
                                    ) : (
                                        <ToggleLeft className="w-5 h-5 text-zinc-600" />
                                    )}
                                </button>

                                {/* Stall reason */}
                                {meetingIsStall && (
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Why is it stalled?</label>
                                        <textarea
                                            rows={2}
                                            value={meetingStallReason}
                                            onChange={(e) => setMeetingStallReason(e.target.value)}
                                            placeholder="Describe why this task is stalled..."
                                            className="w-full bg-zinc-900 border border-red-800/50 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-red-500 resize-none"
                                        />
                                    </div>
                                )}

                                {/* Blocked by dropdown */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">Blocked By</label>
                                    <select
                                        value={meetingBlockedBy}
                                        onChange={(e) => setMeetingBlockedBy(e.target.value)}
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none"
                                    >
                                        <option value="">Not blocked</option>
                                        {assignedPeople.length > 0 && (
                                            <optgroup label="Assigned on this task">
                                                {assignedPeople.map((p) => (
                                                    <option key={`assigned-${p}`} value={p}>{p}</option>
                                                ))}
                                            </optgroup>
                                        )}
                                        <optgroup label="Team Leaders">
                                            {TEAM_LEADERS.map((leader) => (
                                                <option key={`leader-${leader}`} value={leader}>{leader}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>

                                {/* Solution */}
                                <div className="space-y-1.5">
                                    <label className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">Solution / Action Plan</label>
                                    <textarea
                                        rows={2}
                                        value={meetingSolution}
                                        onChange={(e) => setMeetingSolution(e.target.value)}
                                        placeholder="What's the plan to resolve this?"
                                        className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                                    />
                                </div>

                                {/* Save button */}
                                <button
                                    onClick={handleAddOrUpdateMeetingNote}
                                    className="w-full bg-blue-600 text-white font-semibold py-2 rounded-lg hover:bg-blue-500 transition-colors shadow-md shadow-blue-900/30 text-sm"
                                >
                                    {editingNoteId ? 'Update Meeting Note' : 'Save Meeting Note'}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* ── Unified Timeline (Status History + Meeting Notes) ── */}
                    {taskAnalysis && (
                        <TaskTimeline
                            taskAnalysis={taskAnalysis}
                            meetingNotes={meetingNotes}
                            onEditNote={handleEditNote}
                            onDeleteNote={onDeleteMeetingNote}
                        />
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
