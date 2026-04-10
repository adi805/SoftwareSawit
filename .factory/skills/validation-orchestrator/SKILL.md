---
name: validation-orchestrator
description: Orchestrate validation contracts for SoftwareSawit missions
---

# Validation Orchestrator

NOTE: This skill coordinates validation after a mission is complete. It runs validation contracts and manages validators.

## When to Use This Skill

This skill runs after a mission completes:
- All worker tasks finished
- Validation contract exists
- Need to verify feature implementation
- Need to run scrutiny and user testing validators

## Work Procedure

### 1. Contract Analysis Phase

1. **Read validation contract:**
   ```bash
   cat validation-contract.md
   ```

2. **Categorize assertions:**
   - **Code review assertions** → scrutiny-feature-reviewer
   - **UI/UX assertions** → user-testing-flow-validator
   - **API assertions** → direct curl testing
   - **Database assertions** → direct SQL queries

3. **Plan validation:
   - Determine validation order (code review before user testing)
   - Group assertions for parallel execution
   - Identify isolation boundaries

### 2. Scrutiny Phase (Code Review)

1. **Spawn scrutiny validator for each feature:**
   - Read feature from features.json
   - Get commit ID from worker handoff
   - Spawn scrutiny-feature-reviewer subagent

2. **Collect review reports:**
   - Wait for all scrutiny reviews to complete
   - Aggregate pass/fail status
   - Document issues found

3. **Handle failures:**
   - If blocking issues found, flag feature as failed
   - Spawn fix reviewer if fixes were applied
   - Document for mission orchestrator

### 3. User Testing Phase

1. **Start Electron app:**
   ```bash
   npx electron . --remote-debugging-port=9222
   ```

2. **Kill Chrome/Edge interference:**
   ```bash
   taskkill /F /IM chrome.exe 2>nul
   taskkill /F /IM msedge.exe 2>nul
   ```

3. **Spawn user testing validators:**
   - Group assertions by isolation boundary
   - Spawn user-testing-flow-validator for each group
   - Collect test reports

### 4. Validation State Management

Track validation state in `validation-state.json`:

```json
{
  "validationId": "mission-2026-04-07-001",
  "startedAt": "2026-04-07T10:00:00Z",
  "assertions": {
    "VAL-BLOK-001": {"status": "pending", "type": "scrutiny"},
    "VAL-BLOK-002": {"status": "pending", "type": "scrutiny"},
    "VAL-AK-001": {"status": "pending", "type": "user-testing"}
  },
  "results": {
    "scrutiny": {},
    "user-testing": {}
  }
}
```

### 5. Completion Phase

1. **Aggregate results:**
   - Count pass/fail/blocked
   - Generate validation summary

2. **Generate report:**
   ```json
   {
     "validationId": "mission-2026-04-07-001",
     "completedAt": "2026-04-07T12:00:00Z",
     "summary": {
       "total": 20,
       "passed": 18,
       "failed": 2,
       "blocked": 0
     },
     "assertionResults": [
       {"id": "VAL-BLOK-001", "status": "pass", "type": "scrutiny"},
       {"id": "VAL-BLOK-002", "status": "fail", "type": "scrutiny", "reason": "..."}
     ]
   }
   ```

3. **Handle failures:**
   - If any assertions failed, mission is NOT complete
   - Document failures for fix workflow
   - Notify mission orchestrator

## Validation Types

| Type | Validator | Evidence Required |
|------|-----------|-------------------|
| Code Review | scrutiny-feature-reviewer | Commit diff, transcript |
| UI Testing | user-testing-flow-validator | Screenshots, console errors |
| API Testing | curl | Request/response logs |
| DB Testing | sql.js | Query results |

## File Locations

```
{missionDir}/
├── validation-contract.md
├── validation-state.json
├── features.json
├── handoffs/
└── validation/
    ├── scrutiny/
    │   └── reviews/
    │       └── {feature-id}.json
    └── user-testing/
        └── flows/
            └── {group-id}.json
```

## Isolation Rules

### User Testing Isolation
- Each validator gets own credentials
- Each validator gets own app instance port (if needed)
- File system namespace isolation if possible
- No sharing of browser sessions

### Scrutiny Isolation
- Each feature reviewed independently
- No cross-feature review in single reviewer
- Fix reviews linked to original failure

## When to Return to Orchestrator

- All assertions pass → Mission COMPLETE
- Some assertions fail → Mission needs fixes
- Multiple blockers → Infrastructure issues
- Validation contract missing → Cannot validate
