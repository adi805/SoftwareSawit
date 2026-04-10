# SoftwareSawit Architecture

## System Overview

SoftwareSawit adalah aplikasi desktop berbasis Electron untuk manajemen perkebunan kelapa sawit. Aplikasi ini terdiri dari:

- **Main Process**: Electron main process yang menangani database, IPC, dan business logic
- **Renderer Process**: React-based UI yang berjalan dalam Chromium
- **Database**: SQLite untuk penyimpanan lokal
- **Sync Engine**: Sistem sinkronisasi dengan cloud backend

## Component Architecture

### Main Process (src/main/)

```
main/
├── database/
│   ├── kasDatabase.ts      # Kas transaction database
│   ├── bankDatabase.ts     # Bank transaction database
│   ├── gudangDatabase.ts   # Gudang/inventory database
│   ├── userDatabase.ts     # User management database
│   └── syncDatabase.ts     # Sync queue database
├── services/
│   ├── syncEngine.ts       # Core sync logic
│   ├── batchSyncService.ts # Batch sync operations
│   ├── retryService.ts     # Retry logic for failed syncs
│   ├── conflictResolution.ts # Conflict detection & resolution
│   └── syncHealthDashboard.ts # Queue health monitoring
├── ipc/
│   └── handlers.ts         # IPC handler registrations
└── main.ts                 # Entry point
```

### Renderer Process (src/renderer/)

```
renderer/
├── components/
│   ├── SyncStatusBadge.tsx       # Status badge component
│   ├── ConflictResolutionDialog.tsx # Conflict resolution UI
│   ├── ToastContainer.tsx        # Toast notifications
│   └── ...
├── pages/
│   ├── SyncSettingsPage.tsx      # Sync settings & queue management
│   ├── KasListPage.tsx           # Kas transaction list
│   ├── BankListPage.tsx          # Bank transaction list
│   └── GudangListPage.tsx        # Gudang transaction list
├── context/
│   └── SyncContext.tsx           # Sync state management
└── App.tsx                       # Main app component
```

## Data Flow

### Sync Flow

1. **Local Change** → Queue in syncDatabase
2. **Sync Trigger** → batchSyncService.processQueue()
3. **API Call** → HTTP request to cloud backend
4. **Response** → Update local status or create conflict
5. **Conflict** → conflictResolution.detectAndStore()
6. **Resolution** → User resolves via ConflictResolutionDialog

### IPC Communication

```
Renderer                    Main
   |                          |
   |--- window.electronAPI --->|
   |    .getSyncStats()       |
   |                          |
   |<-- Promise<SyncStats> ---|
   |                          |
```

All IPC calls go through `window.electronAPI` object defined in `electron.d.ts`.

## Key Invariants

1. **Sync Queue Integrity**: Every local change must be queued before sync
2. **Conflict Detection**: Timestamp-based conflict detection for concurrent edits
3. **Retry Logic**: Exponential backoff for retryable errors
4. **Role-Based Access**: Admin-only features (clear queue, user management)

## Module System

Modules are: kas, bank, gudang, coa, aspek_kerja, blok

Each module has:
- Database layer (moduleDatabase.ts)
- IPC handlers (in main.ts)
- UI pages (ModuleListPage.tsx)
- Sync status tracking

## Sync Status States

- `synced`: Successfully synced to cloud
- `pending`: Queued for sync
- `in_progress`: Currently syncing
- `failed`: Sync failed (retryable or non-retryable)
- `conflict`: Has unresolved conflict
