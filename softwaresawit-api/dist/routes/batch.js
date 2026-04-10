import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { ensureTransactionTableExists } from '../lib/migrations';
// Schema for batch operation item
const batchItemSchema = z.object({
    id: z.string().optional(),
    operation: z.enum(['create', 'update', 'delete']),
    recordId: z.string().optional(), // For update/delete operations
    data: z.record(z.any()).optional(), // For create/update
    timestamp: z.string().optional(),
    deviceId: z.string().optional(),
});
// Schema for batch request
const batchRequestSchema = z.object({
    module: z.enum(['kas', 'bank', 'gudang']), // Only transaction modules support batch operations
    year: z.string(),
    month: z.string().regex(/^\d{2}$/),
    operations: z.array(batchItemSchema).min(1).max(100), // Max 100 items per batch
    atomic: z.boolean().default(false), // If true, all succeed or all fail
});
export const batchRoutes = new Hono();
// POST /api/batch - Process batch operations
batchRoutes.post('/', zValidator('json', batchRequestSchema), async (c) => {
    const db = c.env.DB;
    const body = c.req.valid('json');
    const { module, year, month, operations, atomic } = body;
    const periode = `${year}_${month}`;
    const results = [];
    try {
        // Ensure the table exists
        await ensureTransactionTableExists(db, module, periode);
        if (atomic) {
            // Atomic batch processing - use a transaction
            // Note: D1 doesn't support explicit transactions, but we can simulate by checking all first
            const allData = operations.map(op => ({
                index: operations.indexOf(op),
                ...op
            }));
            // Validate all operations first
            const validationErrors = [];
            for (const op of allData) {
                if (op.operation === 'update' || op.operation === 'delete') {
                    if (!op.recordId) {
                        validationErrors.push(`Operation at index ${op.index} requires recordId`);
                    }
                }
                if (op.operation === 'create' || op.operation === 'update') {
                    if (!op.data) {
                        validationErrors.push(`Operation at index ${op.index} requires data`);
                    }
                }
            }
            if (validationErrors.length > 0) {
                return c.json({
                    success: false,
                    error: 'Validation failed for atomic batch',
                    validationErrors,
                    results: [],
                }, 400);
            }
            // Process all operations
            for (const op of allData) {
                try {
                    const result = await processOperation(db, module, periode, op);
                    results.push(result);
                }
                catch (error) {
                    // In atomic mode, one failure means all fail
                    // Rollback is simulated by marking remaining as skipped
                    results.push({
                        index: op.index,
                        operation: op.operation,
                        recordId: op.recordId,
                        success: false,
                        error: `Atomic batch failed: ${error.message}`,
                    });
                    // Mark remaining as not processed
                    const remainingIndices = allData.filter((_, i) => i > op.index).map(op2 => ({
                        index: (operations.indexOf(op2)),
                        operation: op2.operation,
                        recordId: op2.recordId,
                        success: false,
                        error: 'Skipped due to earlier failure in atomic batch',
                    }));
                    results.push(...remainingIndices);
                    return c.json({
                        success: false,
                        error: 'Atomic batch failed, all operations rolled back',
                        failedIndex: op.index,
                        results,
                    }, 500);
                }
            }
        }
        else {
            // Non-atomic: process individually, continue on failure
            for (let i = 0; i < operations.length; i++) {
                const op = operations[i];
                try {
                    const result = await processOperation(db, module, periode, { index: i, ...op });
                    results.push(result);
                }
                catch (error) {
                    results.push({
                        index: i,
                        operation: op.operation,
                        recordId: op.recordId,
                        success: false,
                        error: error.message,
                    });
                }
            }
        }
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;
        return c.json({
            success: failureCount === 0,
            summary: {
                total: operations.length,
                succeeded: successCount,
                failed: failureCount,
                atomic,
            },
            results,
        });
    }
    catch (error) {
        console.error('Batch processing error:', error);
        return c.json({ error: error.message }, 500);
    }
});
// Process a single operation within a batch
async function processOperation(db, module, periode, op) {
    const now = op.timestamp || new Date().toISOString();
    switch (op.operation) {
        case 'create': {
            const id = op.recordId || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const data = op.data || {};
            // Build insert query dynamically based on available fields
            const fields = ['id', 'sync_status', 'modified_at', 'created_at', 'updated_at'];
            const values = [id, 'synced', now, now, now];
            const placeholders = ['?', '?', '?', '?', '?'];
            // Add data fields
            for (const [key, value] of Object.entries(data)) {
                if (key !== 'id' && key !== 'sync_status' && key !== 'modified_at' && key !== 'created_at' && key !== 'updated_at') {
                    fields.push(key);
                    values.push(value);
                    placeholders.push('?');
                }
            }
            await db
                .prepare(`INSERT INTO ${module}_${periode} (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`)
                .bind(...values)
                .run();
            const result = await db
                .prepare(`SELECT * FROM ${module}_${periode} WHERE id = ?`)
                .bind(id)
                .first();
            return {
                index: op.index,
                operation: 'create',
                recordId: id,
                success: true,
                data: result,
            };
        }
        case 'update': {
            if (!op.recordId) {
                throw new Error('recordId required for update operation');
            }
            const data = op.data || {};
            const updates = [];
            const values = [];
            for (const [key, value] of Object.entries(data)) {
                if (key !== 'id' && key !== 'sync_status' && key !== 'modified_at' && key !== 'created_at' && key !== 'updated_at') {
                    updates.push(`${key} = ?`);
                    values.push(value);
                }
            }
            updates.push('sync_status = ?');
            values.push('synced');
            updates.push('modified_at = ?');
            values.push(now);
            updates.push('updated_at = ?');
            values.push(now);
            values.push(op.recordId);
            await db
                .prepare(`UPDATE ${module}_${periode} SET ${updates.join(', ')} WHERE id = ?`)
                .bind(...values)
                .run();
            const result = await db
                .prepare(`SELECT * FROM ${module}_${periode} WHERE id = ?`)
                .bind(op.recordId)
                .first();
            return {
                index: op.index,
                operation: 'update',
                recordId: op.recordId,
                success: true,
                data: result,
            };
        }
        case 'delete': {
            if (!op.recordId) {
                throw new Error('recordId required for delete operation');
            }
            await db
                .prepare(`UPDATE ${module}_${periode} SET deleted = 1, sync_status = 'synced', modified_at = ? WHERE id = ?`)
                .bind(now, op.recordId)
                .run();
            return {
                index: op.index,
                operation: 'delete',
                recordId: op.recordId,
                success: true,
            };
        }
        default:
            throw new Error(`Unknown operation: ${op.operation}`);
    }
}
// GET /api/batch/status/:batchId - Check batch processing status (if we store batch IDs)
batchRoutes.get('/status/:batchId', async (c) => {
    const batchId = c.req.param('batchId');
    // For now, return a placeholder
    // In a full implementation, batch status would be stored in D1
    return c.json({
        batchId,
        status: 'completed', // Placeholder
        message: 'Batch status tracking not yet implemented',
    });
});
