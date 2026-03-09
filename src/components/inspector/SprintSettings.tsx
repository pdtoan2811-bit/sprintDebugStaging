'use client';

import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../ui/sheet';
import { useSprintConfig, SprintConfig } from '@/lib/hooks/useSprintConfig';
import { Plus, Trash2, Save, Undo2 } from 'lucide-react';
import { DatePicker } from '../ui/date-picker';

interface SprintSettingsProps {
    open: boolean;
    onClose: () => void;
}

export function SprintSettings({ open, onClose }: SprintSettingsProps) {
    const { configs, saveConfigs, manualOverride, saveManualOverride, isLoaded } = useSprintConfig();
    const [localConfigs, setLocalConfigs] = useState<SprintConfig[]>([]);
    const [localOverride, setLocalOverride] = useState<string | null>(null);

    // Sync from hook to local state when modal opens
    useEffect(() => {
        if (open && isLoaded) {
            setLocalConfigs([...configs]);
            setLocalOverride(manualOverride);
        }
    }, [open, isLoaded, configs, manualOverride]);

    const handleAdd = () => {
        const nextNum = localConfigs.length > 0
            ? String(Math.max(...localConfigs.map(c => parseInt(c.number) || 0)) + 1)
            : '1';
        setLocalConfigs([...localConfigs, { number: nextNum, startDate: '2026-01-01', endDate: '2026-01-14' }]);
    };

    const handleRemove = (index: number) => {
        const newConfigs = [...localConfigs];
        newConfigs.splice(index, 1);
        setLocalConfigs(newConfigs);
    };

    const handleChange = (index: number, field: keyof SprintConfig, value: string) => {
        const newConfigs = [...localConfigs];
        newConfigs[index] = { ...newConfigs[index], [field]: value };
        setLocalConfigs(newConfigs);
    };

    const handleSave = () => {
        saveConfigs(localConfigs);
        saveManualOverride(localOverride);
        onClose();
    };

    if (!open) return null;

    return (
        <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <SheetContent open={open} onOpenChange={(isOpen: boolean) => !isOpen && onClose()} side="right" className="flex flex-col h-full overflow-y-auto pr-2 sm:max-w-xl w-[90%] p-6">
                <SheetHeader className="mb-6">
                    <SheetTitle className="text-xl">Settings</SheetTitle>
                    <SheetDescription>
                        Configure sprint date ranges and manual overrides.
                    </SheetDescription>
                </SheetHeader>

                <div className="space-y-8 flex-1">
                    {/* ── Sprint Detection Mode ── */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">Active Sprint Mode</h3>
                        <p className="text-xs text-zinc-500">
                            Choose whether to auto-detect the current sprint based on today's date, or manually lock the view to a specific sprint.
                        </p>
                        <select
                            value={localOverride || "auto"}
                            onChange={(e) => setLocalOverride(e.target.value === "auto" ? null : e.target.value)}
                            className="w-full bg-zinc-900 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                            <option value="auto">🌟 Auto-detect from current date</option>
                            <optgroup label="Manual Override">
                                {localConfigs.map(c => (
                                    <option key={c.number} value={c.number}>Force Sprint {c.number}</option>
                                ))}
                            </optgroup>
                        </select>
                    </div>

                    <hr className="border-t border-zinc-800" />

                    {/* ── Sprint Date Ranges ── */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold tracking-wide text-zinc-300 uppercase">Sprint Configurations</h3>
                            <button
                                onClick={handleAdd}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs rounded-md transition-colors"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add Sprint
                            </button>
                        </div>

                        <div className="space-y-3">
                            {localConfigs.map((config, idx) => (
                                <div key={idx} className="flex items-center gap-2 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800">
                                    <div className="flex flex-col gap-1 w-20 flex-shrink-0">
                                        <label className="text-[10px] text-zinc-500 uppercase font-semibold">Sprint #</label>
                                        <input
                                            type="text"
                                            value={config.number}
                                            onChange={(e) => handleChange(idx, 'number', e.target.value)}
                                            className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-zinc-ed"
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1 flex-1">
                                        <label className="text-[10px] text-zinc-500 uppercase font-semibold">Start Date</label>
                                        <DatePicker
                                            value={config.startDate}
                                            onChange={(val) => handleChange(idx, 'startDate', val)}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1 flex-1">
                                        <label className="text-[10px] text-zinc-500 uppercase font-semibold">End Date</label>
                                        <DatePicker
                                            value={config.endDate}
                                            onChange={(val) => handleChange(idx, 'endDate', val)}
                                        />
                                    </div>
                                    <div className="flex flex-col gap-1 justify-end h-full">
                                        <div className="h-[14px]"></div>
                                        <button
                                            onClick={() => handleRemove(idx)}
                                            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-950/30 rounded transition-colors"
                                            title="Remove sprint"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer buttons */}
                <div className="mt-8 pt-4 border-t border-zinc-800 flex gap-3 justify-end">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                        <Undo2 className="w-4 h-4" /> Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-4 py-2 flex items-center gap-2 text-sm bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors shadow-md shadow-blue-900/20"
                    >
                        <Save className="w-4 h-4" /> Save Settings
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
