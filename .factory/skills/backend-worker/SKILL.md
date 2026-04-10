---
name: backend-worker
description: Build Electron main process, database layer, and backend services for SoftwareSawit
---

# Backend Worker

## When to Use This Skill

Use this skill for features that involve:
- Electron main process code
- Database operations and queries
- IPC handler implementation
- Backend service logic
- Test data generators
- Integration test implementation

## Required Skills

- **tuistory**: For terminal/TUI testing (if applicable)
  - Use for: Testing CLI outputs, terminal interactions
  - Invoke when: Feature has TUI components

## Work Procedure

### 1. Understand Requirements
- Read the feature description in features.json
- Identify the service/handler to implement
- Review existing similar implementations for patterns
- Check database schema if applicable

### 2. Write Tests First (Red)
- Create/update test file
- Write tests covering:
  - Service function behavior
  - Error handling paths
  - Edge cases
  - Integration with other services
- Run tests to confirm they fail (red state)

### 3. Implement Service (Green)
- Create/update service file
- Follow existing code patterns
- Implement proper error handling
- Add TypeScript types

### 4. Integration Testing
- Write integration tests if applicable
- Test interaction with other modules
- Verify database operations

### 5. Run Validators
- Run tests: `npm test -- --grep '<feature-name>'`
- Run typecheck: `npm run typecheck`
- Run lint: `npm run lint`
- Fix any issues

### 6. Final Verification
- Ensure all tests pass
- Verify integration with frontend (if applicable)

## Example Handoff

```json
{
  "salientSummary": "Created test data generator for cross-area conflict scenarios in crossAreaIntegration.test.ts. Implemented helper functions to create conflicts between Kas-Bank, Kas-Gudang, and Bank-Gudang modules.",
  "whatWasImplemented": "Added createCrossAreaConflict() helper that generates sync conflicts across different modules. Creates related records in two modules, modifies both offline, and triggers sync to generate conflicts. Conflicts are stored in sync_db with proper module attribution. Added 4 integration tests verifying cross-area conflict detection and resolution.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "npm test -- --grep 'cross.*area.*conflict'",
        "exitCode": 0,
        "observation": "4 tests passed for cross-area conflict scenarios"
      },
      {
        "command": "npm test -- crossAreaIntegration.test.ts",
        "exitCode": 0,
        "observation": "All integration tests pass"
      },
      {
        "command": "npm run typecheck",
        "exitCode": 0,
        "observation": "No TypeScript errors"
      }
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {
        "file": "src/main/crossAreaIntegration.test.ts",
        "cases": [
          {
            "name": "should detect cross-area conflicts between kas and bank",
            "verifies": "Conflicts between different modules are detected and stored"
          },
          {
            "name": "should resolve cross-area conflicts with correct module labels",
            "verifies": "Conflict resolution maintains proper module attribution"
          }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Database schema changes required (outside scope)
- IPC API changes required (outside scope)
- Frontend changes required to complete feature
- Test infrastructure issues
- Integration with external services needed
