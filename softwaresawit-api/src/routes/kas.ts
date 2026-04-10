import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { D1Database } from '@cloudflare/workers-types';
import { ensureTransactionTableExists, getTableName } from '../lib/migrations';

export type Env = {
  DB: D1Database;
};

// Schema for kas transaction
const kasSchema = z.object({
  id: z.string().optional(),
  tanggal: z.string(),
  kode_akun: z.string(),
  uraian: z.string(),
  debet: z.number().default(0),
  kredit: z.number().default(0),
  sync_status: z.enum(['synced', 'pending', 'conflict', 'error']).default('pending'),
  modified_at: z.string().optional(),
  device_id: z.string().optional(),
});

const createKasSchema = kasSchema.omit({ id: true, sync_status: true, modified_at: true });

export const kasRoutes = new Hono<{ Bindings: Env }>();

// GET /api/kas/:year/:month - List all kas records for a periode
kasRoutes.get('/:year/:month', async (c) => {
  const db = c.env.DB;
  const year = c.req.param('year');
  const month = c.req.param('month').padStart(2, '0');
  const periode = `${year}_${month}`;

  try {
    await ensureTransactionTableExists(db, 'kas', periode);

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = (page - 1) * limit;

    const result = await db
      .prepare(`SELECT * FROM kas_${periode} WHERE deleted = 0 ORDER BY tanggal DESC LIMIT ? OFFSET ?`)
      .bind(limit, offset)
      .all();

    const countResult = await db
      .prepare(`SELECT COUNT(*) as total FROM kas_${periode} WHERE deleted = 0`)
      .first();

    return c.json({
      data: result.results,
      pagination: {
        page,
        limit,
        total: Number(countResult?.total) || 0,
        totalPages: Math.ceil((Number(countResult?.total) || 0) / limit)
      }
    });
  } catch (error: any) {
    console.error('Error listing kas:', error);
    return c.json({ error: error.message }, 500);
  }
});

// GET /api/kas/:year/:month/:id - Get single kas record
kasRoutes.get('/:year/:month/:id', async (c) => {
  const db = c.env.DB;
  const { year, month, id } = c.req.param();
  const periode = `${year}_${month.padStart(2, '0')}`;

  try {
    const result = await db
      .prepare(`SELECT * FROM kas_${periode} WHERE id = ? AND deleted = 0`)
      .bind(id)
      .first();

    if (!result) {
      return c.json({ error: 'Record not found' }, 404);
    }

    return c.json(result);
  } catch (error: any) {
    console.error('Error getting kas:', error);
    return c.json({ error: error.message }, 500);
  }
});

// POST /api/kas/:year/:month - Create kas record
kasRoutes.post('/:year/:month', zValidator('json', createKasSchema), async (c) => {
  const db = c.env.DB;
  const year = c.req.param('year');
  const month = c.req.param('month').padStart(2, '0');
  const periode = `${year}_${month}`;
  const body = c.req.valid('json');

  try {
    await ensureTransactionTableExists(db, 'kas', periode);

    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    await db
      .prepare(`
        INSERT INTO kas_${periode} (id, tanggal, kode_akun, uraian, debet, kredit, sync_status, modified_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
      `)
      .bind(id, body.tanggal, body.kode_akun, body.uraian, body.debet || 0, body.kredit || 0, now, now, now)
      .run();

    const result = await db
      .prepare(`SELECT * FROM kas_${periode} WHERE id = ?`)
      .bind(id)
      .first();

    return c.json(result, 201);
  } catch (error: any) {
    console.error('Error creating kas:', error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT /api/kas/:year/:month/:id - Update kas record
kasRoutes.put('/:year/:month/:id', zValidator('json', kasSchema.partial()), async (c) => {
  const db = c.env.DB;
  const { year, month, id } = c.req.param();
  const periode = `${year}_${month.padStart(2, '0')}`;
  const body = c.req.valid('json');

  try {
    const now = new Date().toISOString();

    // Build update query dynamically
    const updates: string[] = [];
    const values: any[] = [];

    if (body.tanggal !== undefined) {
      updates.push('tanggal = ?');
      values.push(body.tanggal);
    }
    if (body.kode_akun !== undefined) {
      updates.push('kode_akun = ?');
      values.push(body.kode_akun);
    }
    if (body.uraian !== undefined) {
      updates.push('uraian = ?');
      values.push(body.uraian);
    }
    if (body.debet !== undefined) {
      updates.push('debet = ?');
      values.push(body.debet);
    }
    if (body.kredit !== undefined) {
      updates.push('kredit = ?');
      values.push(body.kredit);
    }
    if (body.sync_status !== undefined) {
      updates.push('sync_status = ?');
      values.push(body.sync_status);
    }

    updates.push('modified_at = ?');
    values.push(now);
    updates.push('updated_at = ?');
    values.push(now);

    values.push(id);

    await db
      .prepare(`UPDATE kas_${periode} SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    const result = await db
      .prepare(`SELECT * FROM kas_${periode} WHERE id = ?`)
      .bind(id)
      .first();

    return c.json(result);
  } catch (error: any) {
    console.error('Error updating kas:', error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE /api/kas/:year/:month/:id - Soft delete kas record
kasRoutes.delete('/:year/:month/:id', async (c) => {
  const db = c.env.DB;
  const { year, month, id } = c.req.param();
  const periode = `${year}_${month.padStart(2, '0')}`;

  try {
    const now = new Date().toISOString();

    await db
      .prepare(`UPDATE kas_${periode} SET deleted = 1, sync_status = 'pending', modified_at = ? WHERE id = ?`)
      .bind(now, id)
      .run();

    return c.json({ success: true, message: 'Record deleted' });
  } catch (error: any) {
    console.error('Error deleting kas:', error);
    return c.json({ error: error.message }, 500);
  }
});

// GET /api/kas/:year/:month/changes - Get changes since last sync
kasRoutes.get('/:year/:month/changes', async (c) => {
  const db = c.env.DB;
  const year = c.req.param('year');
  const month = c.req.param('month').padStart(2, '0');
  const periode = `${year}_${month}`;
  const since = c.req.query('since');

  try {
    await ensureTransactionTableExists(db, 'kas', periode);

    if (since) {
      const result = await db
        .prepare(`SELECT * FROM kas_${periode} WHERE modified_at > ? ORDER BY modified_at ASC`)
        .bind(since)
        .all();

      return c.json({
        data: result.results,
        since,
        timestamp: new Date().toISOString()
      });
    }

    return c.json({ data: [], since: null });
  } catch (error: any) {
    console.error('Error getting changes:', error);
    return c.json({ error: error.message }, 500);
  }
});
