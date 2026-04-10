---
name: sync-worker
description: Multi-location database synchronization for SoftwareSawit
---

# Sync Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE for database synchronization.

## When to Use This Skill

This worker handles sync functionality:
- Manual path configuration per module
- Auto-sync on connection restore
- Queue changes when offline
- Conflict resolution (latest timestamp wins)
- Notification on connect/disconnect
- Sync status monitoring

## Required Skills

- `mission-worker-base` - Standard worker setup
- `agent-browser` - For sync UI verification

## Work Procedure

### 1. Setup Phase

1. Invoke `mission-worker-base` skill
2. Read `mission.md` for sync requirements
3. Read `library/architecture.md` for sync system design
4. Read `src/main/syncDatabase.ts` - Current sync implementation
5. Read `src/main/syncService.ts` - Sync service implementation

### 2. Investigation Phase

1. **Understand current sync system:**
   - Read syncDatabase.ts for sync queue table
   - Read syncService.ts for sync logic
   - Understand conflict resolution (latest timestamp wins)
   - Understand notification system

2. **Identify sync modules:**
   - Kas module sync
   - Bank module sync
   - Gudang module sync
   - Master data sync (if applicable)

3. **Review sync settings UI:**
   - Read SyncSettingsPage.tsx
   - Understand path configuration per module
   - Note connection status indicators

### 3. Implementation Phase

#### For Sync Configuration Changes:

1. **Update sync path per module:**
   ```typescript
   // In syncService.ts
   interface SyncConfig {
     module: 'kas' | 'bank' | 'gudang';
     localPath: string;
     remotePath: string;  // UNC or local
     enabled: boolean;
     lastSync: Date | null;
   }
   ```

2. **Implement manual sync trigger:**
   ```typescript
   const triggerManualSync = async (module: string): Promise<SyncResult> => {
     // 1. Queue current changes
     // 2. Connect to remote path
     // 3. Compare timestamps
     // 4. Resolve conflicts (latest wins)
     // 5. Apply remote changes
     // 6. Push local changes
     // 7. Update lastSync timestamp
     // 8. Return result
   };
   ```

3. **Handle offline mode:**
   ```typescript
   // Queue changes when offline
   const queueChange = (change: Change): void => {
     db.prepare(`
       INSERT INTO sync_queue (id, module, table_name, record_id, operation, data, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)
     `).run(/* ... */);
   };
   ```

4. **Implement auto-sync on reconnect:**
   ```typescript
   // Listen for network changes
   network.on('change', async () => {
     if (isNetworkAvailable()) {
       await syncPendingChanges();
     }
   });
   ```

#### For Sync Status UI:

1. **Update SyncSettingsPage:**
   ```typescript
   // Display sync status per module
   interface SyncStatus {
     module: string;
     localPath: string;
     remotePath: string;
     status: 'connected' | 'disconnected' | 'syncing' | 'error';
     lastSync: string | null;
     pendingChanges: number;
     conflictCount: number;
   }
   ```

2. **Add status indicators:**
   - Green: Connected, synced
   - Yellow: Syncing in progress
   - Red: Error or disconnected
   - Orange: Pending changes

3. **Add manual sync buttons:**
   - Sync Now button per module
   - Sync All button
   - Cancel sync button

### 4. Verification Phase

1. **Run typecheck and lint:**
   ```bash
   npm run typecheck
   npm run lint
   ```

2. **Test sync functionality:**
   - Configure sync paths
   - Make changes in one location
   - Trigger sync
   - Verify changes appear in other location
   - Test conflict resolution

3. **Test offline handling:**
   - Disconnect network
   - Make changes offline
   - Reconnect
   - Verify auto-sync triggers
   - Verify all changes synced

### 5. Completion Phase

1. **Document sync configuration:**
   - Update architecture.md with sync details
   - Document path format examples
   - Document conflict resolution rules

2. **Prepare handoff**

## Sync Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    SoftwareSawit                        │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐ │
│  │    Kas      │    │    Bank     │    │   Gudang    │ │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘ │
│         │                  │                  │        │
│         └──────────────────┼──────────────────┘        │
│                            │                           │
│                     ┌──────▼──────┐                    │
│                     │ Sync Queue │                    │
│                     └──────┬──────┘                    │
│                            │                           │
│                     ┌──────▼──────┐                    │
│                     │Sync Service│                    │
│                     └──────┬──────┘                    │
└────────────────────────────┼────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │ Location │   │ Location │   │ Location │
        │    A     │◄─►│    B     │◄─►│    C     │
        └──────────┘   └──────────┘   └──────────┘
```

## Sync Queue Table Schema

```sql
CREATE TABLE sync_queue (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL,           -- 'kas', 'bank', 'gudang'
  table_name TEXT NOT NULL,       -- 'kas', 'bank', 'gudang'
  record_id TEXT NOT NULL,
  operation TEXT NOT NULL,        -- 'INSERT', 'UPDATE', 'DELETE'
  data TEXT NOT NULL,             -- JSON of record data
  timestamp DATETIME NOT NULL,
  synced INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Conflict Resolution

**Rule:** Latest timestamp wins

```
Location A: Record updated at 2026-04-07T10:00:00Z
Location B: Record updated at 2026-04-07T10:00:05Z

Sync result: Location B's version wins (later timestamp)
```

## Path Configuration Formats

| Type | Format | Example |
|------|--------|---------|
| UNC Network | `\\hostname\share` | `\\192.168.1.10\C$\Databases` |
| Local | `C:\path\to\dir` | `C:\SoftwareSawit\Data` |

## Example Handoff

```json
{
  "salientSummary": "Enhanced sync functionality with manual trigger and conflict resolution.",
  "whatWasImplemented": "Added manual sync buttons, improved conflict resolution, added sync status indicators.",
  "whatWasLeftUndone": "Auto-sync on network restore needs testing",
  "verification": {
    "commandsRun": [
      {"command": "npm run typecheck", "exitCode": 0}
    ]
  },
  "tests": {
    "manualSync": "pass",
    "conflictResolution": "pass",
    "offlineQueue": "pending"
  },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Network paths unreachable
- Sync conflicts not resolving correctly
- Auto-sync not triggering
- Requirements unclear
