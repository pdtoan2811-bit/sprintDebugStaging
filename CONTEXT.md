# Sprint Relay Debugger — Context & Terminology Reference

## Team Structure

### Team Leaders
| Name | Role |
|------|------|
| **Bùi Anh Đức** | Team Leader |
| **Phạm Đức Toàn** | Team Leader |

### Team Members
Team members are dynamically populated from sprint log data (the `person` field in each event log entry). Multiple people can be assigned to a single task (comma-separated).

---

## Workflow Statuses

Tasks progress through the following statuses. The order represents the ideal forward flow:

| # | Status | Description | Bottleneck? | Severity |
|---|--------|-------------|:-----------:|:--------:|
| 0 | **Not Started** | Task has been created but no work has begun | No | Normal |
| 1 | **In Process** | Active development is underway | No | Normal |
| 2 | **Waiting to Integrate** | Code is done but waiting for integration/merge — a handoff bottleneck | ⚠ Yes | High |
| 3 | **Reviewing** | Code review is in progress — potential bottleneck if reviewer is occupied | ⚠ Yes | High |
| 4 | **Ready for Test** | Development & review complete, awaiting QA | No | Normal |
| 5 | **Testing** | QA is actively testing the task | No | Normal |
| 6 | **Reprocess** | Testing failed — task sent back for rework. Most critical bottleneck | 🔴 Yes | Critical |
| 7 | **Bug Fixing** | Developer is fixing bugs found in testing | No | Normal |
| 8 | **Staging Passed** | QA passed on staging environment — nearly complete | No | Normal |
| 9 | **Completed** | Task is fully done and deployed | No | Normal |

---

## Key Terminologies

### Bottleneck
A status where tasks tend to **stall** because they depend on another person's action (review, integration, reprocessing). The bottleneck statuses are:
- **Waiting to Integrate** — blocked on someone to merge
- **Reviewing** — blocked on reviewer bandwidth
- **Reprocess** — sent back after failed testing, critical friction

### Doom Loop
A cyclical pattern where a task gets stuck in a **test-fail-fix-retest** cycle:

```
(Bug Fixing | Reprocess) → Ready for Test → Testing → Reprocess → ...
```

Each complete cycle is counted. Tasks with **2+ doom loops** are flagged as **critical risk**. This indicates underlying issues: unclear requirements, unstable code, or miscommunication between dev and QA.

### Stale Task
A task whose status **hasn't changed for 24+ hours** (and isn't Completed or Staging Passed). Stale tasks are silent blockers — they may indicate:
- Person is stuck but hasn't raised the issue
- Context switch caused the task to be forgotten
- Waiting on an external dependency

### Risk Levels
| Level | Trigger | Meaning |
|-------|---------|---------|
| **Normal** | No reprocesses, no doom loops | Task is progressing healthily |
| **Elevated** | 1 reprocess or 1 doom loop cycle | Task has hit friction — needs attention |
| **Critical** | 2+ reprocesses or 2+ doom loops | Task is in danger — likely a recurring failure pattern |

### High Risk (Manual Flag)
A PM can manually pin a task as "High Risk" via the inspector panel. This is a subjective flag for tasks that the PM believes need closer monitoring, regardless of automated risk scoring.

---

## Sprint Structure

Sprints are identified by a sprint number (e.g., Sprint 7, Sprint 8, etc.). Each sprint has a defined date range. The app auto-detects the current sprint based on today's date.

### Sprint Configuration
| Sprint | Start Date | End Date |
|--------|-----------|----------|
| Sprint 7 | 2026-01-05 | 2026-01-16 |
| Sprint 8 | 2026-01-19 | 2026-01-30 |
| Sprint 9 | 2026-02-02 | 2026-02-13 |
| Sprint 10 | 2026-02-16 | 2026-02-27 |
| Sprint 11 | 2026-03-02 | 2026-03-13 |
| Sprint 12 | 2026-03-16 | 2026-03-27 |

> **Note**: These dates are estimates based on 2-week sprint cycles. Adjust in the `SPRINT_CONFIG` array in `page.tsx` to match your actual sprint calendar.

---

## Data Architecture

### Data Source
- **Google Apps Script** endpoint (GET request with optional `?sprint=N` filter)
- Returns an array of `RawLogEvent` objects

### Event Log Fields
| Field | Description |
|-------|-------------|
| `timestamp` | When the status change happened |
| `taskId` | Unique task identifier |
| `taskName` | Human-readable task name |
| `recordLink` | Link to the original record (e.g., Notion, Jira) |
| `status` | Current workflow status (see table above) |
| `sprintGoal` | The target status for this sprint |
| `sprint` | Sprint number |
| `person` | Assigned person(s), comma-separated if multiple |
| `module` | Product module the task belongs to |
| `screen` | Specific screen/feature within the module |

---

## Meeting Notes (Daily Standup)

The app supports structured daily meeting notes per task, designed for quick standup logging:

- **Is it stalled?** — Yes/No toggle with reason
- **Blocked by** — Dropdown of task assignees + team leaders
- **Solution** — Free-text action plan

Notes are stored in `localStorage` and displayed as a reverse-chronological timeline for easy day-over-day tracing.
