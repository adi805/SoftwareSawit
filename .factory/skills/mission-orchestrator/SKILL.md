---
name: mission-orchestrator
description: Coordinate multi-worker missions for SoftwareSawit features
---

# Mission Orchestrator

NOTE: This skill orchestrates complex missions that require multiple workers. For simple single-worker tasks, use the specific worker skill directly.

## When to Use This Skill

This skill coordinates missions with multiple workers:
- Features requiring both backend AND frontend changes
- Large refactoring across multiple modules
- Database schema changes + UI updates
- Import/Export functionality + validation

## Work Procedure

### 1. Mission Analysis Phase

1. **Read mission.md** to understand overall mission
2. **Identify feature breakdown:**
   - List all features in features.json
   - Categorize by skill required (backend/frontend/shared)
   - Identify dependencies between features
3. **Determine parallelization:**
   - Which features can run in parallel?
   - Which features have dependencies?
   - Resource constraints (Electron app instances, etc.)

### 2. Worker Assignment Phase

1. **Create worker sessions:**
   - For each parallel track, spawn a worker subagent
   - Pass mission context to each worker
   - Specify skill to use for each worker

2. **Track dependencies:**
   - Backend changes should complete before frontend
   - Database schema changes must complete before UI updates
   - Import functionality needs both database AND UI work

### 3. Execution Phase

1. **Monitor worker progress:**
   - Check handoffs directory for worker outputs
   - Verify each worker completes their task
   - Track issues/discoveries

2. **Handle blockers:**
   - If a worker blocks, assess severity
   - Determine if other workers can proceed
   - Escalate to orchestrator if needed

3. **Coordinate handoffs:**
   - Backend worker completes → informs frontend worker
   - Schema changes documented for UI worker
   - UI worker gets updated interfaces

### 4. Validation Phase

After all workers complete:
1. **Run validation orchestrator** if validation-contract.md exists
2. **Verify integration:**
   - Backend + Frontend work together
   - Import/Export flows work
   - No regressions in existing features

### 5. Completion Phase

1. **Create final handoff:**
   - Aggregate all worker handoffs
   - Document cross-cutting concerns
   - Note any shared state updates needed

2. **Update shared state:**
   - Update AGENTS.md if new conventions discovered
   - Update library/ if new knowledge gained
   - Commit changes

## Worker Session Management

```javascript
// Example worker spawn
{
  "workerSessionId": "worker-001",
  "skillName": "frontend-worker",
  "assignedFeatures": ["blok-list-ui", "blok-form-ui"],
  "status": "in_progress",
  "startedAt": "2026-04-07T10:00:00Z",
  "dependencies": ["blok-schema"]
}
```

## Mission Directory Structure

```
{missionDir}/
├── mission.md              # Mission definition
├── AGENTS.md               # Project conventions
├── features.json           # Feature breakdown
├── validation-contract.md  # Validation assertions (if any)
├── worker-transcripts.jsonl  # All worker interactions
├── handoffs/               # Worker outputs
│   ├── worker-001.json     # Backend worker handoff
│   ├── worker-002.json     # Frontend worker handoff
│   └── ...
└── validation/             # Validation results (if any)
    ├── scrutiny/
    └── user-testing/
```

## Example Mission Flow

### Mission: Add new Blok fields

**Workers:**
1. **Backend Worker** - Update database schema
2. **Frontend Worker** - Update UI components

**Flow:**
```
[Start] 
   │
   ▼
┌─────────────────────┐
│ Mission Orchestrator│
└─────────────────────┘
   │
   ├──────────────────────────────┐
   ▼                              ▼
┌─────────────────┐    ┌─────────────────────┐
│ Backend Worker  │    │ Frontend Worker     │
│ (blocked until   │    │ (waiting for schema)│
│  schema ready)   │    │                     │
└─────────────────┘    └─────────────────────┘
   │                              │
   │ schema complete              │ schema ready
   │                              │
   ▼                              ▼
┌─────────────────┐    ┌─────────────────────┐
│ Handoff sent    │    │ UI updates use      │
│ to orchestrator │    │ new schema          │
└─────────────────┘    └─────────────────────┘
   │                              │
   └──────────┬───────────────────┘
              ▼
   ┌─────────────────────┐
   │ Validation Runner   │
   └─────────────────────┘
              │
              ▼
         [Complete]
```

## Shared State Updates

After mission completion, update these files if needed:

1. **AGENTS.md** - New conventions discovered
2. **library/architecture.md** - System changes
3. **library/user-testing.md** - Testing notes
4. **services.yaml** - New commands/services

## When to Return to Orchestrator

- Mission scope is unclear
- Feature dependencies form a cycle
- Resource constraints prevent parallelization
- All workers blocked simultaneously
