import React, { useState, DragEvent } from 'react';
import { TaskAnalysis } from '@/lib/types';
import { Badge } from '../../../ui/badge';
import {
    Check,
    CheckCircle2,
    ChevronRight,
    Clock,
    GripVertical,
    Plus,
    RefreshCw,
    Target,
    Trash2,
    Users,
} from 'lucide-react';
import { priorityDotColor, statusBadge, formatStaleHours } from '../utils';

interface DraggableTaskCardProps {
    task: TaskAnalysis;
    isHighRisk: boolean;
    onTaskClick: (taskId: string) => void;
    showSprintGoal?: boolean;
    isDraggable?: boolean;
    onDragStart?: (e: DragEvent, taskId: string) => void;
    isInTodoList?: boolean;
    todoCompleted?: boolean;
    onRemoveFromTodo?: () => void;
    onToggleComplete?: () => void;
    onQuickAdd?: () => void;
    showQuickAdd?: boolean;
    categoryLabel?: { text: string; color: string; icon: React.ReactNode };
    blockedByLabel?: string;
    showAssignees?: boolean;
    renderActions?: React.ReactNode;
}

export function DraggableTaskCard({
    task,
    isHighRisk,
    onTaskClick,
    showSprintGoal = false,
    isDraggable = false,
    onDragStart,
    isInTodoList = false,
    todoCompleted = false,
    onRemoveFromTodo,
    onToggleComplete,
    onQuickAdd,
    showQuickAdd = false,
    categoryLabel,
    blockedByLabel,
    showAssignees = false,
    renderActions,
}: DraggableTaskCardProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [mouseDownPos, setMouseDownPos] = useState<{ x: number; y: number } | null>(null);

    const handleMouseDown = (e: React.MouseEvent) => {
        setMouseDownPos({ x: e.clientX, y: e.clientY });
        setIsDragging(false);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (mouseDownPos) {
            const dx = Math.abs(e.clientX - mouseDownPos.x);
            const dy = Math.abs(e.clientY - mouseDownPos.y);
            if (dx > 5 || dy > 5) {
                setIsDragging(true);
            }
        }
    };

    const handleMouseUp = (e: React.MouseEvent) => {
        if (mouseDownPos && !isDragging) {
            const target = e.target as HTMLElement;
            const isInteractiveElement = target.closest('button') || target.closest('input') || target.closest('a');
            if (!isInteractiveElement) {
                onTaskClick(task.taskId);
            }
        }
        setMouseDownPos(null);
        setIsDragging(false);
    };

    const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
        setIsDragging(true);
        // We know onDragStart expects a natural DOM DragEvent
        onDragStart?.(e as unknown as React.DragEvent, task.taskId);
    };

    const handleDragEnd = () => {
        setIsDragging(false);
        setMouseDownPos(null);
    };

    return (
        <div
            draggable={isDraggable}
            onDragStart={handleDragStart as any}
            onDragEnd={handleDragEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            className={`w-full text-left rounded-lg border px-3 py-2 transition-all group cursor-pointer ${
                isDraggable ? 'active:cursor-grabbing' : ''
            } ${
                todoCompleted
                    ? 'border-emerald-700/30 bg-emerald-950/20 opacity-70'
                    : isHighRisk
                        ? 'border-red-600/50 bg-red-950/30 hover:border-red-500/70 hover:bg-red-950/40'
                        : task.isStale
                            ? 'border-amber-700/30 bg-amber-950/10 hover:border-amber-600/50 hover:bg-amber-950/20'
                            : 'border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700/70 hover:bg-zinc-800/50'
            }`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {isDraggable && (
                        <GripVertical className="w-3 h-3 text-zinc-600 flex-shrink-0 cursor-grab" />
                    )}
                    {isInTodoList && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleComplete?.();
                            }}
                            className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                todoCompleted
                                    ? 'bg-emerald-600 border-emerald-500 text-white'
                                    : 'border-zinc-600 hover:border-zinc-400 hover:bg-zinc-800'
                            }`}
                        >
                            {todoCompleted && <Check className="w-3 h-3" />}
                        </button>
                    )}
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${priorityDotColor(task.currentStatus)}`} />
                    {isHighRisk && (
                        <span className="text-red-500 text-[10px] font-bold flex-shrink-0">📌</span>
                    )}
                    <span className="font-mono text-[10px] text-zinc-400 flex-shrink-0">
                        {task.taskId}
                    </span>
                    <span className={`text-xs truncate ${todoCompleted ? 'line-through text-zinc-500' : 'text-zinc-200'}`}>
                        {task.taskName}
                    </span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                    {task.riskLevel === 'critical' && (
                        <Badge variant="destructive" className="gap-1 text-[10px]">
                            <RefreshCw className="w-2.5 h-2.5" />
                            DOOM
                        </Badge>
                    )}
                    {isInTodoList && onRemoveFromTodo && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemoveFromTodo();
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-950/50 rounded text-red-400 transition-all"
                            title="Remove from today's plan"
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    )}
                    {showQuickAdd && onQuickAdd && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onQuickAdd();
                            }}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[9px] font-medium transition-all"
                            title="Add to today's plan"
                        >
                            <Plus className="w-2.5 h-2.5" />
                            Add
                        </button>
                    )}
                    {renderActions}
                    <ChevronRight className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
                </div>
            </div>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {statusBadge(task.currentStatus)}
                {categoryLabel && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 ${categoryLabel.color}`}>
                        {categoryLabel.icon}
                        {categoryLabel.text}
                    </span>
                )}
                {task.isStale && (
                    <span className="text-[9px] text-amber-400 font-mono flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" />
                        STALE {formatStaleHours(task.staleDurationMs)}
                    </span>
                )}
                {blockedByLabel && (
                    <span className="text-[9px] font-mono flex items-center gap-1 bg-red-950/40 text-red-300 px-1.5 py-0.5 rounded border border-red-900/50">
                        <span className="opacity-70">Blocked by</span> {blockedByLabel}
                    </span>
                )}
            </div>
            {showAssignees && task.currentPerson && (
                <div className="mt-2 pt-2 border-t border-zinc-800/50 flex items-center gap-1.5 text-[10px] text-zinc-400">
                    <Users className="w-3 h-3 text-zinc-500" />
                    <span className="truncate">{task.currentPerson}</span>
                </div>
            )}
            {showSprintGoal && task.sprintGoal && (
                <div className="mt-2 pt-2 border-t border-zinc-800/50">
                    <div className={`flex items-center gap-1 text-[9px] ${task.currentStatus === task.sprintGoal ? 'text-emerald-400' : 'text-zinc-500'}`}>
                        {task.currentStatus === task.sprintGoal ? (
                            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500" />
                        ) : (
                            <Target className="w-2.5 h-2.5" />
                        )}
                        <span className="truncate">{task.sprintGoal}</span>
                        {task.currentStatus === task.sprintGoal && (
                            <span className="ml-1 text-[8px] px-1 py-0.5 rounded bg-emerald-950/50 text-emerald-300 font-semibold">MET</span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
