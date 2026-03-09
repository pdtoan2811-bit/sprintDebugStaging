'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Database, Download, Upload, Trash2, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from '@/components/ui/sheet';
import { useNotes } from '@/lib/hooks/useNotes';
import { useMeetingNotes } from '@/lib/hooks/useMeetingNotes';
import { useHighRisk } from '@/lib/hooks/useHighRisk';
import { useSprintConfig } from '@/lib/hooks/useSprintConfig';

export function DataManagementModal() {
    const { notes, isLoaded: isNotesLoaded } = useNotes();
    const { getAllNotes: getMeetingNotes, isLoaded: isMeetingNotesLoaded } = useMeetingNotes();
    const { highRiskIds, isLoaded: isHighRiskLoaded } = useHighRisk();
    const { configs, manualOverride, isLoaded: isSprintConfigLoaded } = useSprintConfig();
    const [isOpen, setIsOpen] = useState(false);
    const [importStatus, setImportStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [importErrorMsg, setImportErrorMsg] = useState('');
    const [isMounted, setIsMounted] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return null;
    }

    const allLoaded = isNotesLoaded && isMeetingNotesLoaded && isHighRiskLoaded && isSprintConfigLoaded;

    // Calculate stats for display safely
    const notesCount = allLoaded ? Object.keys(notes).length : 0;
    const meetingNotesData = allLoaded ? getMeetingNotes() : {};
    const meetingNotesCount = allLoaded ? Object.values(meetingNotesData).reduce((sum, taskNotes) => sum + taskNotes.length, 0) : 0;
    const blockersCount = allLoaded ? highRiskIds.size : 0;

    const handleExport = async () => {
        try {
            const res = await fetch('/api/data');
            const data = await res.json();

            const jsonString = JSON.stringify(data, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const date = new Date().toISOString().split('T')[0];
            link.download = `sprint-debugger-backup-${date}.json`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Export failed', error);
        }
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const content = event.target?.result as string;
                const data = JSON.parse(content);

                // Validate it looks like our backup format
                if (typeof data !== 'object' || data === null) {
                    throw new Error("Invalid file format");
                }

                // Restore items via API
                const res = await fetch('/api/data', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });

                if (!res.ok) throw new Error("Server failed to write imported data.");

                setImportStatus('success');
                // Reload the page to apply changes
                setTimeout(() => {
                    window.location.reload();
                }, 1500);

            } catch (err) {
                setImportStatus('error');
                setImportErrorMsg(err instanceof Error ? err.message : 'Unknown error during import');
            }
        };
        reader.readAsText(file);

        // Reset input so the same file could be selected again
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleClearData = async () => {
        if (confirm("Are you sure you want to clear ALL Git-synced data? This will overwrite the local JSON file. This cannot be undone unless you have a backup or Git history.")) {
            try {
                const res = await fetch('/api/data?all=true', { method: 'DELETE' });
                if (res.ok) {
                    window.location.reload();
                } else {
                    alert("Failed to clear data via API");
                }
            } catch (e) {
                console.error(e);
            }
        }
    };

    return (
        <Sheet open={isOpen} onOpenChange={(open) => {
            setIsOpen(open);
            if (!open) {
                setTimeout(() => setImportStatus('idle'), 300);
            }
        }}>
            <SheetTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <Database className="h-4 w-4" />
                    Data & Settings
                </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[400px] sm:w-[540px] flex flex-col gap-6 p-6 overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2 text-xl font-semibold">
                        <Database className="h-5 w-5" />
                        Data Management
                    </SheetTitle>
                    <SheetDescription className="text-sm mt-1">
                        Manage your sprint data, notes, and blockers. All data is stored locally in your browser.
                    </SheetDescription>
                </SheetHeader>

                <div className="flex flex-col gap-4 mt-4">
                    <div className="p-4 bg-muted/30 border rounded-lg">
                        <h3 className="text-md font-semibold mb-3 flex items-center gap-2">
                            <FileText className="h-4 w-4 text-blue-500" />
                            Current Local Data
                        </h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                            <div className="flex flex-col">
                                <span className="text-muted-foreground">Notes</span>
                                <span className="font-semibold text-xl">{notesCount}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-muted-foreground">Meeting Notes</span>
                                <span className="font-semibold text-xl">{meetingNotesCount}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-muted-foreground">Blockers Marked</span>
                                <span className="font-semibold text-xl">{blockersCount}</span>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-muted-foreground">Sprint Configs</span>
                                <span className="font-semibold text-xl">{configs.length}</span>
                            </div>
                        </div>
                    </div>

                    <div className="my-4 border-t" />

                    <div className="flex flex-col gap-3">
                        <h3 className="text-md font-semibold">Backup & Restore</h3>
                        <p className="text-xs text-muted-foreground mb-2">
                            Export your data to a file to back it up or transfer it to another browser.
                        </p>

                        <input
                            type="file"
                            accept=".json"
                            className="hidden"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                        />

                        <div className="grid grid-cols-2 gap-3">
                            <Button variant="default" className="w-full gap-2" onClick={handleExport}>
                                <Download className="h-4 w-4" />
                                Export Backup
                            </Button>
                            <Button variant="outline" className="w-full gap-2" onClick={handleImportClick}>
                                <Upload className="h-4 w-4" />
                                Import Data
                            </Button>
                        </div>

                        {importStatus === 'success' && (
                            <div className="bg-green-50 text-green-700 p-3 rounded-md text-sm flex items-center gap-2 mt-2">
                                <CheckCircle2 className="h-4 w-4" />
                                Data imported successfully. Reloading...
                            </div>
                        )}

                        {importStatus === 'error' && (
                            <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm flex items-center gap-2 mt-2">
                                <AlertTriangle className="h-4 w-4 shrink-0" />
                                Failed to import: {importErrorMsg}
                            </div>
                        )}
                    </div>

                    <div className="mt-8 border-t pt-6">
                        <h3 className="text-md font-semibold text-destructive mb-3">Danger Zone</h3>
                        <Button variant="destructive" className="w-full gap-2" onClick={handleClearData}>
                            <Trash2 className="h-4 w-4" />
                            Clear All Local Data
                        </Button>
                        <p className="text-xs text-muted-foreground mt-2 text-center">
                            This will permanently delete all your notes and settings from this browser.
                        </p>
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
