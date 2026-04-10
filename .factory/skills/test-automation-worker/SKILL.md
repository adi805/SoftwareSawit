---
name: test-automation-worker
description: Write and execute tests for SoftwareSawit features
---

# Test Automation Worker

NOTE: Startup and cleanup are handled by `mission-worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Use this skill for features that involve:
- Writing unit tests for database operations
- Writing integration tests for IPC communication
- Writing E2E tests for user flows
- Setting up test fixtures and mocks
- Verifying test coverage

## Required Skills

- `agent-browser` - For E2E testing
- `electron-evaluate` - For integration testing

## Work Procedure

### 1. Understand the Feature
- Read the feature description in features.json
- Identify what needs to be tested
- Review existing tests for patterns
- Check test coverage requirements

### 2. Plan Test Coverage
- Unit tests: Individual functions, edge cases
- Integration tests: IPC communication, database operations
- E2E tests: User flows, critical paths
- Identify mocks needed (electron, electron-log, database)

### 3. Set Up Test Infrastructure
- Create/update test file
- Set up mocks in jest.mocks/ if needed
- Create test fixtures (sample data)
- Configure test environment

### 4. Write Tests (TDD Approach)
- Write failing tests first (red)
- Tests should be:
  - Independent (no dependencies between tests)
  - Deterministic (same result every run)
  - Fast (< 100ms per test)
  - Readable (clear description)
- Use descriptive test names
- Group related tests with describe blocks

### 5. Run Tests
- Run tests in watch mode during development
- Fix failing tests
- Ensure all tests pass
- Check coverage report

### 6. Verify with Manual Testing
- Use agent-browser for E2E verification
- Use electron-evaluate for integration verification
- Document any gaps between automated and manual testing

### 7. Run Validators
- `npm test` - all tests must pass
- Check coverage meets requirements (> 80% for new code)
- `npm run typecheck` - must pass

### 8. Commit Work
- Commit message: `test(FXXX): Add tests for {feature}`
- Include feature ID

## Example Handoff

```json
{
  "salientSummary": "Implemented comprehensive tests for Dashboard Approval feature (F003-TEST). 12 unit tests, 4 integration tests, all passing with 87% coverage.",
  "whatWasImplemented": "Created test suite with: (1) Unit tests for getPendingApprovals, getApprovalCounts, approveFromDashboard, rejectFromDashboard functions, (2) Integration tests for IPC handlers, (3) Mock setup for electron and electron-log, (4) Test fixtures for sample transactions, (5) E2E test scenarios documented for manual verification.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      { "command": "npm test -- --grep 'dashboard'", "exitCode": 0, "observation": "16 tests passed (12 unit, 4 integration)" },
      { "command": "npm run test:coverage", "exitCode": 0, "observation": "Coverage: 87% statements, 82% branches, 91% functions, 85% lines" },
      { "command": "npm run typecheck", "exitCode": 0, "observation": "No TypeScript errors" }
    ],
    "interactiveChecks": [
      { "action": "Run full test suite", "observed": "All 125 existing tests still pass, no regressions" },
      { "action": "Verify test isolation", "observed": "Tests run in any order, no shared state issues" }
    ]
  },
  "tests": {
    "added": [
      { "file": "src/main/dashboardApproval.test.ts", "cases": [
        { "name": "getPendingApprovals returns empty array when no pending", "verifies": "Edge case handling" },
        { "name": "getPendingApprovals aggregates from all modules", "verifies": "VAL-DASH-003" },
        { "name": "getApprovalCounts returns zeros when empty", "verifies": "Edge case handling" },
        { "name": "getApprovalCounts sums correctly across modules", "verifies": "VAL-DASH-002" },
        { "name": "approveFromDashboard advances PA1 to PA2", "verifies": "VAL-DASH-006" },
        { "name": "approveFromDashboard advances PA2 to Fully Approved", "verifies": "VAL-DASH-006" },
        { "name": "approveFromDashboard rejects creator self-approval", "verifies": "VAL-DASH-008" },
        { "name": "approveFromDashboard rejects approver1 as approver2", "verifies": "VAL-DASH-006" },
        { "name": "rejectFromDashboard changes status to rejected", "verifies": "VAL-DASH-007" },
        { "name": "rejectFromDashboard requires reason", "verifies": "VAL-DASH-007" },
        { "name": "IPC handler getPendingApprovals works", "verifies": "Integration" },
        { "name": "IPC handler approveFromDashboard works", "verifies": "Integration" }
      ]}
    ]
  },
  "discoveredIssues": []
}
```

## Test Patterns

### Unit Test Pattern
```typescript
describe('getPendingApprovals', () => {
  beforeEach(() => {
    // Reset database state
  });

  it('returns empty array when no pending approvals', () => {
    const result = getPendingApprovals();
    expect(result).toEqual([]);
  });

  it('aggregates pending from all modules', () => {
    // Setup: Create transactions in each module
    // Execute
    const result = getPendingApprovals();
    // Assert
    expect(result).toHaveLength(3);
    expect(result[0].module).toBeDefined();
  });
});
```

### Integration Test Pattern
```typescript
describe('IPC handlers', () => {
  it('getPendingApprovals returns data via IPC', async () => {
    const result = await window.electronAPI.getPendingApprovals();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});
```

## Mocking

### Electron Mock
Located in `jest.mocks/electron.ts`:
```typescript
export const ipcMain = {
  handle: jest.fn(),
  on: jest.fn(),
};

export const ipcRenderer = {
  invoke: jest.fn(),
};
```

### Database Mock
Use in-memory SQLite for tests:
```typescript
const SQL = await initSqlJs();
const db = new SQL.Database();
```

## When to Return to Orchestrator

- Feature code doesn't exist yet (need implementation first)
- Test infrastructure issues
- Flaky tests that can't be stabilized
- Coverage requirements can't be met
