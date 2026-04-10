# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Node.js Version

- Required: Node.js 18+
- Recommended: Node.js 20 LTS

## Dependencies

### Core
- Electron: ^28.0.0
- React: ^18.2.0
- TypeScript: ^5.3.0
- TailwindCSS: ^3.4.0
- Vite: ^5.0.0

### Testing
- Jest: ^29.7.0
- @testing-library/react: ^14.1.0
- Playwright (via agent-browser)

### Database
- sql.js: ^1.8.0 (SQLite in JavaScript)
- better-sqlite3: ^9.0.0 (Native SQLite)

## Environment Variables

No environment variables required for local development.

For production builds:
- `NODE_ENV=production`

## Platform Notes

### Windows
- PowerShell execution policy may need adjustment
- Use `taskkill` for stopping processes

### macOS/Linux
- Use `pkill` or `kill` for stopping processes

## External Services

None required for this mission. All APIs are local IPC.
