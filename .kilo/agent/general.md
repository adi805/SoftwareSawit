# General Agent

## Purpose
General implementation agent for SoftwareSawit development tasks.

## Capabilities
- Implement new features across Electron, React, and database layers
- Modify existing modules (Kas, Bank, Gudang, COA, User Management)
- Write and run tests using CDP automation
- Query and manipulate SQLite databases
- Debug application issues

## Modules
1. **Dashboard** - Landing page with quick actions
2. **Master Data** - COA, Aspek Kerja, Blok
3. **Kas Module** - Cash transactions with dual approval
4. **Bank Module** - Bank transactions with dual approval
5. **Gudang Module** - Inventory with dual approval
6. **User Management** - Multi-user with roles
7. **Sync Settings** - Multi-location sync

## Workflow
1. Understand the task requirements
2. Explore relevant source files
3. Implement changes following existing code patterns
4. Test changes using CDP automation or direct database queries
5. Verify with lint/typecheck if available

## Important Notes
- CDP click events don't trigger React synthetic events
- Page ID changes on every app restart
- Database is in AppData, not project folder
- Always consider React event handling when automating UI
