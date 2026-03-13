'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { TaskAnalysis, MeetingNote, RawLogEvent } from '@/lib/types';
import { useRoles } from '@/lib/hooks/useRoles';
import { useDailyTodos } from '@/lib/hooks/useDailyTodos';
import { format, subDays, addDays, isToday, isFuture } from 'date-fns';
import {
    Activity,
    Calendar,
    ChevronLeft,
    ChevronRight,
    History,
    Layers,
    List,
    Settings,
    Users,
} from 'lucide-react';

// Shared types and constants
import { CategoryFilterKey } from './daily-meeting/types';
import { DEFAULT_CATEGORY_FILTER } from './daily-meeting/constants';

// Utility functions
import { computePersonMeetingData, getVisibleTaskCount } from './daily-meeting/utils';

// Sub-views
import { PersonSingleView } from './daily-meeting/components/PersonSingleView';
import { HistoricalView } from './daily-meeting/components/HistoricalView';
import { CompareView } from './daily-meeting/components/CompareView';
import { AllPersonsView } from './daily-meeting/components/AllPersonsView';
import { SquadsView } from './daily-meeting/components/SquadsView';

export interface DailyMeetingViewProps {
    analyses: Record<string, TaskAnalysis>;
    meetingNotes?: Record<string, MeetingNote[]>;
    rawLogs?: RawLogEvent[];
    sprintStartSnapshot?: Record<string, string>;
    highRiskIds?: Set<string>;
    onTaskClick?: (taskId: string) => void;
}

export function DailyMeetingView({
    analyses,
    meetingNotes = {},
    rawLogs = [],
    sprintStartSnapshot = {},
    highRiskIds = new Set(),
    onTaskClick = () => { },
}: DailyMeetingViewProps) {
    const rolesData = useRoles();
    const { roles, updateRole } = rolesData;
    const dailyTodos = useDailyTodos();

    const [selectedPerson, setSelectedPerson] = useState<string | 'ALL' | 'SQUADS'>('ALL');
    const [viewMode, setViewMode] = useState<'today' | 'history' | 'compare'>('today');
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [categoryFilter, setCategoryFilter] = useState<Record<CategoryFilterKey, boolean>>(DEFAULT_CATEGORY_FILTER);
    const [isRolesModalOpen, setIsRolesModalOpen] = useState(false);

    // Ensure we don't pick future dates
    useEffect(() => {
        if (isFuture(selectedDate) && !isToday(selectedDate)) {
            setSelectedDate(new Date());
        }
    }, [selectedDate]);

    // Pre-calculate data for all persons
    const allPersonData = useMemo(() => {
        return computePersonMeetingData(analyses, meetingNotes, rawLogs, sprintStartSnapshot);
    }, [analyses, meetingNotes, rawLogs, sprintStartSnapshot]);

    const activePersons = useMemo(() => {
        return allPersonData.map((p) => p.person);
    }, [allPersonData]);

    const handleDateChange = (days: number) => {
        const newDate = days > 0 ? addDays(selectedDate, days) : subDays(selectedDate, Math.abs(days));
        if (!isFuture(newDate) || isToday(newDate)) {
            setSelectedDate(newDate);
        }
    };

    const toggleFilter = (key: CategoryFilterKey) => {
        setCategoryFilter((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const getFilterButtonColor = (key: CategoryFilterKey, isActive: boolean) => {
        if (!isActive) return 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:bg-zinc-800';
        switch (key) {
            case 'doing': return 'bg-blue-900/50 border-blue-500/50 text-blue-300';
            case 'blockingOthers': return 'bg-amber-900/50 border-amber-500/50 text-amber-300';
            case 'blockedByOthers': return 'bg-red-900/50 border-red-500/50 text-red-300';
            case 'notStarted': return 'bg-orange-900/50 border-orange-500/50 text-orange-300';
            case 'other': return 'bg-zinc-800 border-zinc-500/50 text-zinc-300';
            default: return '';
        }
    };

    // Calculate system-wide stats
    const stats = useMemo(() => {
        let total = 0, doing = 0, blocking = 0, blocked = 0;
        allPersonData.forEach(p => {
            total += p.totalTasks;
            doing += p.categories.doing.length;
            blocking += p.categories.blockingOthers.length;
            blocked += p.categories.blockedByOthers.length;
        });
        return { total, doing, blocking, blocked };
    }, [allPersonData]);

    // Roles Modal component
    const renderRolesModal = () => {
        if (!isRolesModalOpen) return null;

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-zinc-950 border border-zinc-800 rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                    <div className="p-5 pb-4 border-b border-zinc-800/50 bg-zinc-900/30 flex justify-between items-center">
                        <div>
                            <h2 className="text-lg font-semibold text-zinc-100 flex items-center gap-2">
                                <Settings className="w-5 h-5 text-zinc-400" />
                                Manage Team Roles
                            </h2>
                            <p className="text-sm text-zinc-500 mt-1">Assign roles to team members for squad planning.</p>
                        </div>
                        <button onClick={() => setIsRolesModalOpen(false)} className="text-zinc-400 hover:text-zinc-200 p-1">
                            ✕
                        </button>
                    </div>
                    <div className="p-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
                        <div className="space-y-3">
                            {activePersons.map(person => (
                                <div key={person} className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/50 border border-zinc-800/50">
                                    <span className="font-medium text-zinc-300">{person}</span>
                                    <input
                                        type="text"
                                        value={roles[person] || ''}
                                        onChange={(e) => updateRole(person, e.target.value)}
                                        placeholder="e.g. Frontend, Backend, QA"
                                        className="bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-40"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderMainContent = () => {
        if (selectedPerson === 'ALL') {
            return (
                <AllPersonsView
                    personData={allPersonData}
                    categoryFilter={categoryFilter}
                    highRiskIds={highRiskIds}
                    onTaskClick={onTaskClick}
                    meetingNotes={meetingNotes}
                />
            );
        }

        if (selectedPerson === 'SQUADS') {
            return (
                <SquadsView
                    allPersonData={allPersonData}
                    categoryFilter={categoryFilter}
                    analyses={analyses}
                    highRiskIds={highRiskIds}
                    onTaskClick={onTaskClick}
                    selectedDate={selectedDate}
                    dailyTodos={dailyTodos}
                    rolesData={rolesData}
                    meetingNotes={meetingNotes}
                    rawLogs={rawLogs}
                />
            );
        }

        // Single Person View
        const personData = allPersonData.find((p) => p.person === selectedPerson);
        if (!personData) {
            return (
                <div className="text-center py-12 text-zinc-500 bg-zinc-950/30 rounded-xl border border-dashed border-zinc-800/50">
                    <p>No active tasks for {selectedPerson} in this sprint</p>
                </div>
            );
        }

        if (viewMode === 'today') {
            return (
                <PersonSingleView
                    personData={personData}
                    categoryFilter={categoryFilter}
                    analyses={analyses}
                    highRiskIds={highRiskIds}
                    onTaskClick={onTaskClick}
                    selectedDate={selectedDate}
                    dailyTodos={dailyTodos}
                    rawLogs={rawLogs}
                    sprintStartSnapshot={sprintStartSnapshot}
                    allPersonData={allPersonData}
                    meetingNotes={meetingNotes}
                />
            );
        }

        if (viewMode === 'compare') {
            return (
                <CompareView
                    personData={personData}
                    analyses={analyses}
                    highRiskIds={highRiskIds}
                    onTaskClick={onTaskClick}
                    dailyTodos={dailyTodos}
                    rawLogs={rawLogs}
                />
            );
        }

        return (
            <HistoricalView
                personData={personData}
                analyses={analyses}
                highRiskIds={highRiskIds}
                onTaskClick={onTaskClick}
                dailyTodos={dailyTodos}
            />
        );
    };

    return (
        <div className="space-y-4">
            {renderRolesModal()}

            {/* Top Navigation & Filters */}
            <div className="flex flex-col gap-4">
                {/* Mode Selector and Stats */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-zinc-950/50 p-3 rounded-xl border border-zinc-800/80 backdrop-blur-sm">
                    <div className="flex overflow-x-auto custom-scrollbar gap-2 w-full sm:w-auto pb-1 sm:pb-0">
                        <button
                            onClick={() => { setSelectedPerson('ALL'); setViewMode('today'); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                                selectedPerson === 'ALL'
                                    ? 'bg-zinc-800 text-zinc-100 border border-zinc-700 shadow-sm'
                                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent'
                            }`}
                        >
                            <List className="w-4 h-4" /> View All ({activePersons.length})
                        </button>
                        <button
                            onClick={() => { setSelectedPerson('SQUADS'); setViewMode('today'); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                                selectedPerson === 'SQUADS'
                                    ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-700/50 shadow-sm'
                                    : 'text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800/50 border border-transparent'
                            }`}
                        >
                            <Users className="w-4 h-4" /> Squads
                        </button>
                        <div className="w-px h-6 bg-zinc-800 mx-1 self-center" />
                        {activePersons.map((person) => (
                            <button
                                key={person}
                                onClick={() => setSelectedPerson(person)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                                    selectedPerson === person
                                        ? 'bg-blue-900/40 text-blue-300 border border-blue-700/50 shadow-sm'
                                        : 'text-zinc-400 hover:text-blue-300 hover:bg-zinc-800/50 border border-transparent'
                                }`}
                            >
                                {person}
                            </button>
                        ))}
                    </div>

                    {/* Quick Stats (Hidden on mobile for space) */}
                    <div className="hidden lg:flex items-center gap-3 text-xs font-mono bg-zinc-900/50 px-3 py-1.5 rounded-md border border-zinc-800/50 shrink-0">
                        <span className="text-zinc-400">Team Active:</span>
                        <span className="text-zinc-200">{stats.total}</span>
                        <span className="text-zinc-600">|</span>
                        <span className="text-blue-400" title="Doing">{stats.doing}</span>
                        <span className="text-zinc-600">|</span>
                        <span className="text-amber-400" title="Blocking">{stats.blocking}</span>
                        <span className="text-zinc-600">|</span>
                        <span className="text-red-400" title="Blocked">{stats.blocked}</span>
                    </div>
                </div>

                {/* Sub-navigation based on context */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    {/* View Modes (Only for single person) */}
                    <div className="flex items-center gap-1 bg-zinc-900/30 p-1 rounded-lg border border-zinc-800/50 w-full sm:w-auto overflow-x-auto">
                        {selectedPerson !== 'ALL' && selectedPerson !== 'SQUADS' ? (
                            <>
                                <button
                                    onClick={() => setViewMode('today')}
                                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors min-w-[100px] ${
                                        viewMode === 'today'
                                            ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                                    }`}
                                >
                                    <Calendar className="w-3.5 h-3.5" /> Plan
                                </button>
                                <button
                                    onClick={() => setViewMode('compare')}
                                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors min-w-[100px] ${
                                        viewMode === 'compare'
                                            ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                                    }`}
                                >
                                    <Activity className="w-3.5 h-3.5" /> Compare
                                </button>
                                <button
                                    onClick={() => setViewMode('history')}
                                    className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors min-w-[100px] ${
                                        viewMode === 'history'
                                            ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                                            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                                    }`}
                                >
                                    <History className="w-3.5 h-3.5" /> History
                                </button>
                            </>
                        ) : (
                            <div className="flex items-center gap-4 px-3 py-1.5 text-xs">
                                <span className="font-semibold text-zinc-300">
                                    {selectedPerson === 'ALL' ? 'Overview' : 'Squad Planning Context'}
                                </span>
                                {selectedPerson === 'SQUADS' && (
                                    <button
                                        onClick={() => setIsRolesModalOpen(true)}
                                        className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors bg-indigo-950/30 px-2 py-1 rounded border border-indigo-900/50"
                                    >
                                        <Settings className="w-3.5 h-3.5" />
                                        Manage Roles
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Right side controls (Filters or Date navigation) */}
                    <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                        {(viewMode === 'today' && selectedPerson !== 'SQUADS') ? (
                            <div className="flex items-center gap-2 overflow-x-auto text-[10px] font-mono w-full sm:w-auto pb-1 sm:pb-0 hide-scrollbar justify-start sm:justify-end">
                                <span className="text-zinc-500 mr-1 hidden lg:inline">Filters:</span>
                                <button
                                    onClick={() => toggleFilter('doing')}
                                    className={`px-2 py-1 rounded border transition-colors whitespace-nowrap ${getFilterButtonColor('doing', categoryFilter.doing)}`}
                                >
                                    Doing
                                </button>
                                <button
                                    onClick={() => toggleFilter('blockingOthers')}
                                    className={`px-2 py-1 rounded border transition-colors whitespace-nowrap ${getFilterButtonColor('blockingOthers', categoryFilter.blockingOthers)}`}
                                >
                                    Blocking
                                </button>
                                <button
                                    onClick={() => toggleFilter('blockedByOthers')}
                                    className={`px-2 py-1 rounded border transition-colors whitespace-nowrap ${getFilterButtonColor('blockedByOthers', categoryFilter.blockedByOthers)}`}
                                >
                                    Blocked
                                </button>
                                <button
                                    onClick={() => toggleFilter('notStarted')}
                                    className={`px-2 py-1 rounded border transition-colors whitespace-nowrap ${getFilterButtonColor('notStarted', categoryFilter.notStarted)}`}
                                    title="No activity in current sprint"
                                >
                                    No Activity
                                </button>
                                <button
                                    onClick={() => toggleFilter('other')}
                                    className={`px-2 py-1 rounded border transition-colors whitespace-nowrap ${getFilterButtonColor('other', categoryFilter.other)}`}
                                >
                                    Pending
                                </button>
                            </div>
                        ) : viewMode === 'today' && selectedPerson === 'SQUADS' ? (
                            <div className="flex items-center justify-between sm:justify-end gap-2 bg-zinc-900/50 p-1 max-w-fit rounded-lg border border-zinc-800/80">
                                <button
                                    onClick={() => handleDateChange(-1)}
                                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 transition-colors"
                                    title="Previous Day"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                </button>
                                <div className="flex flex-col items-center px-4 min-w-[120px]">
                                    <span className="text-xs font-semibold text-zinc-200">
                                        {isToday(selectedDate) ? 'Today' : format(selectedDate, 'MMM d, yyyy')}
                                    </span>
                                    {!isToday(selectedDate) && (
                                        <button
                                            onClick={() => setSelectedDate(new Date())}
                                            className="text-[9px] text-indigo-400 hover:text-indigo-300 mt-0.5 font-medium"
                                        >
                                            Return to today
                                        </button>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleDateChange(1)}
                                    disabled={isToday(selectedDate)}
                                    className={`p-1 rounded transition-colors ${isToday(selectedDate) ? 'text-zinc-700 cursor-not-allowed' : 'hover:bg-zinc-800 text-zinc-400'}`}
                                    title="Next Day"
                                >
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="mt-4">
                {renderMainContent()}
            </div>

            {/* Bottom Legend */}
            <div className="flex flex-wrap items-center justify-center gap-4 py-2 text-[10px] text-zinc-500 border-t border-zinc-800/50 mt-6 pt-4">
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500" /> In Process</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" /> Reprocess</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500" /> Waiting to Integrate</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-zinc-500" /> Not Started</div>
                <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Completed</div>
                <span className="text-zinc-700">|</span>
                <div className="flex items-center gap-1"><span className="text-red-500 font-bold">📌</span> High Risk Route</div>
            </div>
        </div>
    );
}

// Keep a default export just in case something relied on it, though standard was named
export default DailyMeetingView;
