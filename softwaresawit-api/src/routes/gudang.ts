import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { D1Database } from '@cloudflare/workers-types';
import { ensureTransactionTableExists } from '../lib/migrations';

export type Env = {
  DB: D1Database;
};

// Schema for gudang transaction
const gudangSchema = z.object({
  id: z.string().optional(),
  tanggal: z.string(),
  kode_barang: z.string(),
  nama_barang: z.string(),
  quantity: z.number().default(0),
  satuan: z.string().default('unit'),
  harga_satuan: z.number().default(0),
  total_harga: z.number().default(0),
  jenis_transaksi: z.enum(['masuk', 'keluar']).default('masuk'),
  uraian: z.string().optional(),
  sync_status: z.enum(['synced', 'pending', 'conflict', 'error']).default('pending'),
  modified_at: z.string().optional(),
  device_id: z.string().optional(),
});

const createGudangSchema = gudangSchema.omit({ id: true, sync_status: true, modified_at: true });

export const gudangRoutes = new Hono<{ Bindings: Env }>();

// GET /api/gudang/:year/:month - List all gudang records for a periode
gudangRoutes.get('/:year/:month', async (c) => {
  const db = c.env.DB;
  const year = c.req.param('year');
  const month = c.req.param('month').padStart(2, '0');
  const periode = `${year}_${month}`;

  try {
    await ensureTransactionTableExists(db, 'gudang', periode);

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = (page - 1) * limit;

    const result = await db
      .prepare(`SELECT * FROM gudang_${periode} WHERE deleted = 0 ORDER BY tanggal DESC LIMIT ? OFFSET ?`)
      .bind(limit, offset)
      .all();

    const countResult = await db
      .prepare(`SELECT COUNT(*) as total FROM gudang_${periode} WHERE deleted = 0`)
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
    console.error('Error listing gudang:', error);
    return c.json({ error: error.message }, 500);
  }
});

// GET /api/gudang/:year/:month/:id - Get single gudang record
gudangRoutes.get('/:year/:month/:id', async (c) => {
  const db = c.env.DB;
  const { year, month, id } = c.req.param();
  const periode = `${year}_${month.padStart(2, '0')}`;

  try {
    const result = await db
      .prepare(`SELECT * FROM gudang_${periode} WHERE id = ? AND deleted = 0`)
      .bind(id)
      .first();

    if (!result) {
      return c.json({ error: 'Record not found' }, 404);
    }

    return c.json(result);
  } catch (error: any) {
    console.error('Error getting gudang:', error);
    return c.json({ error: error.message }, 500);
  }
});

// POST /api/gudang/:year/:month - Create gudang record
gudangRoutes.post('/:year/:month', zValidator('json', createGudangSchema), async (c) => {
  const db = c.env.DB;
  const year = c.req.param('year');
  const month = c.req.param('month').padStart(2, '0');
  const periode = `${year}_${month}`;
  const body = c.req.valid('json');

  try {
    await ensureTransactionTableExists(db, 'gudang', periode);

    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    const totalHarga = body.quantity * body.harga_satuan;

    await db
      .prepare(`
        INSERT INTO gudang_${periode} (id, tanggal, kode_barang, nama_barang, quantity, satuan, harga_satuan, total_harga, jenis_transaksi, uraian, sync_status, modified_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)
      `)
      .bind(
        id,
        body.tanggal,
        body.kode_barang,
        body.nama_barang,
        body.quantity || 0,
        body.satuan || 'unit',
        body.harga_satuan || 0,
        totalHarga,
        body.jenis_transaksi || 'masuk',
        body.uraian || '',
        now,
        now,
        now
      )
      .run();

    const result = await db
      .prepare(`SELECT * FROM gudang_${periode} WHERE id = ?`)
      .bind(id)
      .first();

    return c.json(result, 201);
  } catch (error: any) {
    console.error('Error creating gudang:', error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT /api/gudang/:year/:month/:id - Update gudang record
gudangRoutes.put('/:year/:month/:id', zValidator('json', gudangSchema.partial()), async (c) => {
  const db = c.env.DB;
  const { year, month, id } = c.req.param();
  const periode = `${year}_${month.padStart(2, '0')}`;
  const body = c.req.valid('json');

  try {
    const now = new Date().toISOString();

    const updates: string[] = [];
    const values: any[] = [];

    if (body.tanggal !== undefined) {
      updates.push('tanggal = ?');
      values.push(body.tanggal);
    }
    if (body.kode_barang !== undefined) {
      updates.push('kode_barang = ?');
      values.push(body.kode_barang);
    }
    if (body.nama_barang !== undefined) {
      updates.push('nama_barang = ?');
      values.push(body.nama_barang);
    }
    if (body.quantity !== undefined) {
      updates.push('quantity = ?');
      values.push(body.quantity);
    }
    if (body.satuan !== undefined) {
      updates.push('satuan = ?');
      values.push(body.satuan);
    }
    if (body.harga_satuan !== undefined) {
      updates.push('harga_satuan = ?');
      values.push(body.harga_satuan);
    }
    if (body.total_harga !== undefined) {
      updates.push('total_harga = ?');
      values.push(body.total_harga);
    }
    if (body.jenis_transaksi !== undefined) {
      updates.push('jenis_transaksi = ?');
      values.push(body.jenis_transaksi);
    }
    if (body.uraian !== undefined) {
      updates.push('uraian = ?');
      values.push(body.uraian);
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
      .prepare(`UPDATE gudang_${periode} SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    const result = await db
      .prepare(`SELECT * FROM gudang_${periode} WHERE id = ?`)
      .bind(id)
      .first();

    return c.json(result);
  } catch (error: any) {
    console.error('Error updating gudang:', error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE /api/gudang/:year/:month/:id - Soft delete gudang record
gudangRoutes.delete('/:year/:month/:id', async (c) => {
  const db = c.env.DB;
  const { year, month, id } = c.req.param();
  const periode = `${year}_${month.padStart(2, '0')}`;

  try {
    const now = new Date().toISOString();

    await db
      .prepare(`UPDATE gudang_${periode} SET deleted = 1, sync_status = 'pending', modified_at = ? WHERE id = ?`)
      .bind(now, id)
      .run();

    return c.json({ success: true, message: 'Record deleted' });
  } catch (error: any) {
    console.error('Error deleting gudang:', error);
    return c.json({ error: error.message }, 500);
  }
});

// GET /api/gudang/:year/:month/changes - Get changes since last sync
gudangRoutes.get('/:year/:month/changes', async (c) => {
  const db = c.env.DB;
  const year = c.req.param('year');
  const month = c.req.param('month').padStart(2, '0');
  const periode = `${year}_${month}`;
  const since = c.req.query('since');

  try {
    await ensureTransactionTableExists(db, 'gudang', periode);

    if (since) {
      const result = await db
        .prepare(`SELECT * FROM gudang_${periode} WHERE modified_at > ? ORDER BY modified_at ASC`)
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
