---
name: mission-worker-base
description: Standard worker setup and cleanup for SoftwareSawit missions
---

# Mission Worker Base

NOTE: This skill is the foundation for ALL other workers. Other skills should invoke this skill first for setup and last for cleanup.

## When to Use This Skill

This skill should be invoked FIRST at the start of every mission/feature work and LAST for cleanup:
- Worker initialization
- Environment verification
- Mission context loading
- Cleanup after work completion

## Work Procedure

### 1. Setup Phase (Invoke First)

1. **Read mission context:**
   ```bash
   cat mission.md
   cat AGENTS.md
   ```

2. **Verify environment:**
   ```bash
   # Check Electron app status
   curl -s http://localhost:9222/json 2>/dev/null | findstr "webSocketDebuggerUrl"
   
   # Check database files exist
   ls data/master/
   ```

3. **Check skill requirements:**
   - Read the skill file you'll be using for this mission
   - Verify all required skills are available
   - Note any dependencies or prerequisites

4. **Plan work:**
   - Break down mission into actionable tasks
   - Identify files that need modification
   - Note verification requirements

### 2. Work Phase (Execute Mission)

Follow the specific skill for your mission (frontend-worker, backend-worker, etc.)

### 3. Cleanup Phase (Invoke Last)

1. **Verify all changes:**
   - Run typecheck: `npm run typecheck`
   - Run lint: `npm run lint`
   - Document any issues

2. **Close resources:**
   - Stop any running background processes
   - Close browser connections if any opened

3. **Prepare handoff:**
   - Summarize what was done
   - Note what was left undone
   - List verification commands run
   - Document any issues discovered

## Example Handoff Structure

```json
{
  "salientSummary": "Brief description of work completed",
  "whatWasImplemented": "What specific changes were made",
  "whatWasLeftUndone": "Any incomplete items",
  "verification": {
    "commandsRun": [
      {"command": "npm run typecheck", "exitCode": 0, "observation": "Passed"}
    ]
  },
  "tests": {},
  "discoveredIssues": []
}
```

## Environment Requirements

- Node.js 18+
- npm 8+
- Windows 10/11
- Electron app with debug port 9222

## File Locations

- Mission dir: Provided by orchestrator
- Repo root: `D:\Estate\Droid\SoftwareSawit`
- Database: `./data/` subdirectories
- Dist: `./dist/`

## When to Return to Orchestrator

- Requirements are ambiguous
- Blocker encountered that can't be resolved
- Scope creep detected
- Mission complete
