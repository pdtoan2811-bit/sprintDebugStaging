import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { WORKFLOW_STATUSES } from "./types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Determines whether a task's current status has met (or passed beyond) its sprint goal.
 *
 * Uses the ordered WORKFLOW_STATUSES indices so that a status further along the
 * workflow (e.g. "Completed" when the goal was "Testing") is treated as "met".
 *
 * Falls back to exact string match when either status is not found in the workflow.
 */
export function hasMetSprintGoal(currentStatus: string, sprintGoal: string): boolean {
  if (!sprintGoal || !currentStatus) return false;

  // Look up indices in the workflow
  const currentIndex = WORKFLOW_STATUSES.find(
    s => s.name.toLowerCase() === currentStatus.trim().toLowerCase()
  )?.index ?? -1;
  const goalIndex = WORKFLOW_STATUSES.find(
    s => s.name.toLowerCase() === sprintGoal.trim().toLowerCase()
  )?.index ?? -1;

  // Both statuses are known — compare numerically
  if (currentIndex >= 0 && goalIndex >= 0) {
    return currentIndex >= goalIndex;
  }

  // Fallback: exact string match (case-insensitive)
  return currentStatus.trim().toLowerCase() === sprintGoal.trim().toLowerCase();
}
