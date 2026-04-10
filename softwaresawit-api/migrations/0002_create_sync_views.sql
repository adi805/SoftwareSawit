-- Migration: 0002_create_sync_views
-- Description: Create views for sync status monitoring
-- Created: 2026-04-08

-- View: Pending sync count by module
CREATE VIEW IF NOT EXISTS v_sync_pending AS
SELECT 
    module,
    COUNT(*) as pending_count
FROM sync_queue
WHERE status = 'pending'
GROUP BY module;

-- View: Recent sync activity
CREATE VIEW IF NOT EXISTS v_recent_sync AS
SELECT 
    id,
    direction,
    module,
    records_count,
    status,
    started_at,
    completed_at
FROM sync_log
ORDER BY started_at DESC
LIMIT 50;

-- View: Active devices
CREATE VIEW IF NOT EXISTS v_active_devices AS
SELECT 
    device_id,
    user_id,
    device_name,
    last_seen,
    last_sync_at
FROM device_registry
WHERE last_seen > datetime('now', '-24 hours');
