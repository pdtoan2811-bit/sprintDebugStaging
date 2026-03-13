import React, { useState } from 'react';
import { TaskAnalysis } from '@/lib/types';
import { useDailyTodos } from '@/lib/hooks/useDailyTodos';
import { Popover, PopoverContent, PopoverTrigger } from '../../../ui/popover';
import { RefreshCw, CheckCircle2, Circle } from 'lucide-react';
import { PersonMeetingData } from '../types';

interface SyncTaskDropdownProps {
    task: TaskAnalysis;
    allPersonData: PersonMeetingData[];
    personData: PersonMeetingData;
    dateStr: string;
    dailyTodos: ReturnType<typeof useDailyTodos>;
}

export function SyncTaskDropdown({ task, allPersonData, personData, dateStr, dailyTodos }: SyncTaskDropdownProps) {
    const [selectedPersons, setSelectedPersons] = useState<Set<string>>(new Set());
    const [isOpen, setIsOpen] = useState(false);

    const otherPersons = allPersonData.filter(p => p.person !== personData.person);

    const handleSync = () => {
        selectedPersons.forEach(person => {
            dailyTodos.addTodo(person, dateStr, task.taskId);
        });
        setIsOpen(false);
        setSelectedPersons(new Set());
    };

    return (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
            <PopoverTrigger asChild>
                <div onClick={(e) => e.stopPropagation()}>
                    <button
                        className={`p-1.5 rounded-md transition-all ml-1 border shadow-sm ${isOpen ? 'bg-indigo-900/50 text-indigo-400 border-indigo-500/30' : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:text-indigo-300 hover:bg-zinc-800 hover:border-indigo-500/50'}`}
                        title="Sync task to others"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                </div>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-3 z-[100]" align="end" onClick={(e) => e.stopPropagation()}>
                <div className="mb-2">
                    <h4 className="text-sm font-semibold text-zinc-200">Sync to others</h4>
                    <p className="text-xs text-zinc-400">Select team members to add this task to their today's plan.</p>
                </div>
                <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar pr-1 mb-3">
                    {otherPersons.map(p => {
                        const isSelected = selectedPersons.has(p.person);
                        const alreadyHasIt = dailyTodos.getTodosForPersonDate(p.person, dateStr).some(t => t.taskId === task.taskId);
                        
                        return (
                            <button
                                key={p.person}
                                disabled={alreadyHasIt}
                                onClick={() => {
                                    const next = new Set(selectedPersons);
                                    if (next.has(p.person)) next.delete(p.person);
                                    else next.add(p.person);
                                    setSelectedPersons(next);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors ${alreadyHasIt ? 'opacity-50 cursor-not-allowed bg-zinc-900 border border-zinc-800/50' : 'hover:bg-zinc-800'}`}
                            >
                                <span className={alreadyHasIt ? 'text-zinc-500' : 'text-zinc-300'}>{p.person}</span>
                                {alreadyHasIt ? (
                                    <span className="text-[9px] text-emerald-500 font-medium">Already in plan</span>
                                ) : isSelected ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400" />
                                ) : (
                                    <Circle className="w-3.5 h-3.5 text-zinc-600" />
                                )}
                            </button>
                        );
                    })}
                </div>
                <div className="flex justify-end gap-2">
                    <button 
                        onClick={() => setIsOpen(false)}
                        className="px-2.5 py-1 rounded text-xs text-zinc-400 hover:text-zinc-200"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleSync}
                        disabled={selectedPersons.size === 0}
                        className="px-2.5 py-1 rounded text-xs bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 font-medium shadow-sm transition-all"
                    >
                        <RefreshCw className="w-3 h-3" />
                        Sync ({selectedPersons.size})
                    </button>
                </div>
            </PopoverContent>
        </Popover>
    );
}
