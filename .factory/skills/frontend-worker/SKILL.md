---
name: frontend-worker
description: Build React/TypeScript UI components for SoftwareSawit Electron application
---

# Frontend Worker

## When to Use This Skill

Use this skill for features that involve:
- React component implementation
- UI/UX enhancements
- Page-level features
- Component styling with TailwindCSS
- Frontend state management
- IPC communication from renderer process

## Required Skills

- **agent-browser**: For manual verification of UI flows in Electron app
  - Use for: Component rendering verification, user interaction testing, visual confirmation
  - Invoke when: After component implementation, before declaring feature complete

## Work Procedure

### 1. Understand Requirements
- Read the feature description in features.json
- Identify the component(s) to modify or create
- Review existing similar components for patterns
- Check AGENTS.md for styling conventions

### 2. Write Tests First (Red)
- Create/update test file for the component
- Write tests covering:
  - Component rendering with different props
  - Event handler behavior
  - Conditional rendering (if applicable)
  - Accessibility attributes
- Run tests to confirm they fail (red state)

### 3. Implement Component (Green)
- Create/update component file
- Follow existing code patterns in the codebase
- Use TailwindCSS for styling per AGENTS.md conventions
- Implement TypeScript interfaces for props
- Add proper error handling

### 4. Manual Verification with agent-browser
- Start dev server: `npm run dev:renderer`
- Start Electron: `npm run dev:main`
- Use agent-browser to:
  - Navigate to the relevant page
  - Verify component renders correctly
  - Test user interactions
  - Take screenshots for evidence
- Document all interactive checks in handoff

### 5. Run Validators
- Run tests: `npm test -- --grep '<feature-name>'`
- Run typecheck: `npm run typecheck`
- Run lint: `npm run lint`
- Fix any issues

### 6. Final Verification
- Ensure all tests pass
- Verify manual checks completed
- Update features.json status if needed

## Example Handoff

```json
{
  "salientSummary": "Implemented red sync failure toast notification in ToastContainer.tsx. Changed sync error handling in SyncContext.tsx to use 'error' type for non-retryable failures. Added tests for toast styling based on error classification.",
  "whatWasImplemented": "Modified ToastContainer.tsx to display red background (bg-red-600) with error icon for error-type toasts. Updated SyncContext.tsx showNotification calls to pass type='error' for non-retryable sync failures (401, 403, 400, 404). Retryable errors (409, 5xx, network) still use 'warning' type. Added 6 new tests covering error vs warning toast styling.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {
        "command": "npm test -- --grep 'toast'",
        "exitCode": 0,
        "observation": "6 tests passed covering error/warning toast styling"
      },
      {
        "command": "npm run typecheck",
        "exitCode": 0,
        "observation": "No TypeScript errors"
      },
      {
        "command": "npm run lint",
        "exitCode": 0,
        "observation": "No lint errors"
      }
    ],
    "interactiveChecks": [
      {
        "action": "Trigger non-retryable sync error (401) via agent-browser",
        "observed": "Red toast appeared with bg-red-600, X mark icon, and error message"
      },
      {
        "action": "Trigger retryable sync error (503) via agent-browser",
        "observed": "Yellow toast appeared with bg-yellow-600, warning icon, and retry message"
      }
    ]
  },
  "tests": {
    "added": [
      {
        "file": "src/renderer/components/ToastContainer.test.tsx",
        "cases": [
          {
            "name": "should render error toast with red background",
            "verifies": "Error type toast uses bg-red-600 styling"
          },
          {
            "name": "should render warning toast with yellow background",
            "verifies": "Warning type toast uses bg-yellow-600 styling"
          }
        ]
      }
    ]
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Required IPC API does not exist in window.electronAPI
- Component dependencies are missing or broken
- Styling conventions in AGENTS.md are unclear
- Feature requires backend changes (outside scope)
- Manual verification blocked by environment issues
