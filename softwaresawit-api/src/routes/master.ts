import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { D1Database } from '@cloudflare/workers-types';

export type Env = {
  DB: D1Database;
};

// COA Schema
const coaSchema = z.object({
  id: z.string().optional(),
  kode: z.string(),
  nama: z.string(),
  jenis: z.enum(['asset', 'liability', 'equity', 'revenue', 'expense']),
  kategori: z.string().optional(),
  parent_kode: z.string().optional(),
  sync_status: z.enum(['synced', 'pending', 'conflict', 'error']).default('pending'),
});

const createCoaSchema = coaSchema.omit({ id: true, sync_status: true });

// Blok Schema
const blokSchema = z.object({
  id: z.string().optional(),
  kode_blok: z.string(),
  nama: z.string(),
  tahun_tanam: z.number(),
  luas: z.number(),
  status: z.enum(['TM', 'TBM', 'TTM', 'TLS']),
  keterangan: z.string().optional(),
  pokok: z.number().optional(),
  sph: z.number().optional(),
  bulan_tanam: z.string().optional(),
  status_tanaman: z.string().optional(),
  sync_status: z.enum(['synced', 'pending', 'conflict', 'error']).default('pending'),
});

const createBlokSchema = blokSchema.omit({ id: true, sync_status: true });

// Aspek Kerja Schema
const aspekKerjaSchema = z.object({
  id: z.string().optional(),
  kode: z.string(),
  nama: z.string(),
  kategori: z.string().optional(),
  sync_status: z.enum(['synced', 'pending', 'conflict', 'error']).default('pending'),
});

const createAspekKerjaSchema = aspekKerjaSchema.omit({ id: true, sync_status: true });

export const masterRoutes = new Hono<{ Bindings: Env }>();

// ==================== COA Routes ====================

// GET /api/master/coa - List all COA
masterRoutes.get('/coa', async (c) => {
  const db = c.env.DB;

  try {
    const result = await db
      .prepare('SELECT * FROM coa WHERE deleted = 0 ORDER BY kode ASC')
      .all();

    return c.json({ data: result.results });
  } catch (error: any) {
    console.error('Error listing COA:', error);
    return c.json({ error: error.message }, 500);
  }
});

// GET /api/master/coa/:id - Get single COA
masterRoutes.get('/coa/:id', async (c) => {
  const db = c.env.DB;
  const { id } = c.req.param();

  try {
    const result = await db
      .prepare('SELECT * FROM coa WHERE id = ? AND deleted = 0')
      .bind(id)
      .first();

    if (!result) {
      return c.json({ error: 'COA not found' }, 404);
    }

    return c.json(result);
  } catch (error: any) {
    console.error('Error getting COA:', error);
    return c.json({ error: error.message }, 500);
  }
});

// POST /api/master/coa - Create COA
masterRoutes.post('/coa', zValidator('json', createCoaSchema), async (c) => {
  const db = c.env.DB;
  const body = c.req.valid('json');

  try {
    const id = `coa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    await db
      .prepare(`
        INSERT INTO coa (id, kode, nama, jenis, kategori, parent_kode, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `)
      .bind(id, body.kode, body.nama, body.jenis, body.kategori || '', body.parent_kode || '', now, now)
      .run();

    const result = await db
      .prepare('SELECT * FROM coa WHERE id = ?')
      .bind(id)
      .first();

    return c.json(result, 201);
  } catch (error: any) {
    console.error('Error creating COA:', error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT /api/master/coa/:id - Update COA
masterRoutes.put('/coa/:id', zValidator('json', coaSchema.partial()), async (c) => {
  const db = c.env.DB;
  const { id } = c.req.param();
  const body = c.req.valid('json');

  try {
    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: any[] = [];

    if (body.kode !== undefined) { updates.push('kode = ?'); values.push(body.kode); }
    if (body.nama !== undefined) { updates.push('nama = ?'); values.push(body.nama); }
    if (body.jenis !== undefined) { updates.push('jenis = ?'); values.push(body.jenis); }
    if (body.kategori !== undefined) { updates.push('kategori = ?'); values.push(body.kategori); }
    if (body.parent_kode !== undefined) { updates.push('parent_kode = ?'); values.push(body.parent_kode); }
    if (body.sync_status !== undefined) { updates.push('sync_status = ?'); values.push(body.sync_status); }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await db
      .prepare(`UPDATE coa SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    const result = await db
      .prepare('SELECT * FROM coa WHERE id = ?')
      .bind(id)
      .first();

    return c.json(result);
  } catch (error: any) {
    console.error('Error updating COA:', error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE /api/master/coa/:id - Soft delete COA
masterRoutes.delete('/coa/:id', async (c) => {
  const db = c.env.DB;
  const { id } = c.req.param();

  try {
    const now = new Date().toISOString();

    await db
      .prepare(`UPDATE coa SET deleted = 1, sync_status = 'pending', updated_at = ? WHERE id = ?`)
      .bind(now, id)
      .run();

    return c.json({ success: true, message: 'COA deleted' });
  } catch (error: any) {
    console.error('Error deleting COA:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== Blok Routes ====================

// GET /api/master/blok - List all Blok
masterRoutes.get('/blok', async (c) => {
  const db = c.env.DB;

  try {
    const result = await db
      .prepare('SELECT * FROM blok WHERE deleted = 0 ORDER BY kode_blok ASC')
      .all();

    return c.json({ data: result.results });
  } catch (error: any) {
    console.error('Error listing blok:', error);
    return c.json({ error: error.message }, 500);
  }
});

// GET /api/master/blok/:id - Get single Blok
masterRoutes.get('/blok/:id', async (c) => {
  const db = c.env.DB;
  const { id } = c.req.param();

  try {
    const result = await db
      .prepare('SELECT * FROM blok WHERE id = ? AND deleted = 0')
      .bind(id)
      .first();

    if (!result) {
      return c.json({ error: 'Blok not found' }, 404);
    }

    return c.json(result);
  } catch (error: any) {
    console.error('Error getting blok:', error);
    return c.json({ error: error.message }, 500);
  }
});

// POST /api/master/blok - Create Blok
masterRoutes.post('/blok', zValidator('json', createBlokSchema), async (c) => {
  const db = c.env.DB;
  const body = c.req.valid('json');

  try {
    const id = `blok-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    await db
      .prepare(`
        INSERT INTO blok (id, kode_blok, nama, tahun_tanam, luas, status, keterangan, pokok, sph, bulan_tanam, status_tanaman, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
      `)
      .bind(
        id,
        body.kode_blok,
        body.nama,
        body.tahun_tanam,
        body.luas,
        body.status,
        body.keterangan || '',
        body.pokok || 0,
        body.sph || 0,
        body.bulan_tanam || '',
        body.status_tanaman || '',
        now,
        now
      )
      .run();

    const result = await db
      .prepare('SELECT * FROM blok WHERE id = ?')
      .bind(id)
      .first();

    return c.json(result, 201);
  } catch (error: any) {
    console.error('Error creating blok:', error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT /api/master/blok/:id - Update Blok
masterRoutes.put('/blok/:id', zValidator('json', blokSchema.partial()), async (c) => {
  const db = c.env.DB;
  const { id } = c.req.param();
  const body = c.req.valid('json');

  try {
    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: any[] = [];

    if (body.kode_blok !== undefined) { updates.push('kode_blok = ?'); values.push(body.kode_blok); }
    if (body.nama !== undefined) { updates.push('nama = ?'); values.push(body.nama); }
    if (body.tahun_tanam !== undefined) { updates.push('tahun_tanam = ?'); values.push(body.tahun_tanam); }
    if (body.luas !== undefined) { updates.push('luas = ?'); values.push(body.luas); }
    if (body.status !== undefined) { updates.push('status = ?'); values.push(body.status); }
    if (body.keterangan !== undefined) { updates.push('keterangan = ?'); values.push(body.keterangan); }
    if (body.pokok !== undefined) { updates.push('pokok = ?'); values.push(body.pokok); }
    if (body.sph !== undefined) { updates.push('sph = ?'); values.push(body.sph); }
    if (body.bulan_tanam !== undefined) { updates.push('bulan_tanam = ?'); values.push(body.bulan_tanam); }
    if (body.status_tanaman !== undefined) { updates.push('status_tanaman = ?'); values.push(body.status_tanaman); }
    if (body.sync_status !== undefined) { updates.push('sync_status = ?'); values.push(body.sync_status); }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await db
      .prepare(`UPDATE blok SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    const result = await db
      .prepare('SELECT * FROM blok WHERE id = ?')
      .bind(id)
      .first();

    return c.json(result);
  } catch (error: any) {
    console.error('Error updating blok:', error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE /api/master/blok/:id - Soft delete Blok
masterRoutes.delete('/blok/:id', async (c) => {
  const db = c.env.DB;
  const { id } = c.req.param();

  try {
    const now = new Date().toISOString();

    await db
      .prepare(`UPDATE blok SET deleted = 1, sync_status = 'pending', updated_at = ? WHERE id = ?`)
      .bind(now, id)
      .run();

    return c.json({ success: true, message: 'Blok deleted' });
  } catch (error: any) {
    console.error('Error deleting blok:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ==================== Aspek Kerja Routes ====================

// GET /api/master/aspek-kerja - List all aspek kerja
masterRoutes.get('/aspek-kerja', async (c) => {
  const db = c.env.DB;

  try {
    const result = await db
      .prepare('SELECT * FROM aspek_kerja WHERE deleted = 0 ORDER BY kode ASC')
      .all();

    return c.json({ data: result.results });
  } catch (error: any) {
    console.error('Error listing aspek_kerja:', error);
    return c.json({ error: error.message }, 500);
  }
});

// GET /api/master/aspek-kerja/:id - Get single aspek kerja
masterRoutes.get('/aspek-kerja/:id', async (c) => {
  const db = c.env.DB;
  const { id } = c.req.param();

  try {
    const result = await db
      .prepare('SELECT * FROM aspek_kerja WHERE id = ? AND deleted = 0')
      .bind(id)
      .first();

    if (!result) {
      return c.json({ error: 'Aspek kerja not found' }, 404);
    }

    return c.json(result);
  } catch (error: any) {
    console.error('Error getting aspek_kerja:', error);
    return c.json({ error: error.message }, 500);
  }
});

// POST /api/master/aspek-kerja - Create aspek kerja
masterRoutes.post('/aspek-kerja', zValidator('json', createAspekKerjaSchema), async (c) => {
  const db = c.env.DB;
  const body = c.req.valid('json');

  try {
    const id = `aspek-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();

    await db
      .prepare(`
        INSERT INTO aspek_kerja (id, kode, nama, kategori, sync_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?)
      `)
      .bind(id, body.kode, body.nama, body.kategori || '', now, now)
      .run();

    const result = await db
      .prepare('SELECT * FROM aspek_kerja WHERE id = ?')
      .bind(id)
      .first();

    return c.json(result, 201);
  } catch (error: any) {
    console.error('Error creating aspek_kerja:', error);
    return c.json({ error: error.message }, 500);
  }
});

// PUT /api/master/aspek-kerja/:id - Update aspek kerja
masterRoutes.put('/aspek-kerja/:id', zValidator('json', aspekKerjaSchema.partial()), async (c) => {
  const db = c.env.DB;
  const { id } = c.req.param();
  const body = c.req.valid('json');

  try {
    const now = new Date().toISOString();
    const updates: string[] = [];
    const values: any[] = [];

    if (body.kode !== undefined) { updates.push('kode = ?'); values.push(body.kode); }
    if (body.nama !== undefined) { updates.push('nama = ?'); values.push(body.nama); }
    if (body.kategori !== undefined) { updates.push('kategori = ?'); values.push(body.kategori); }
    if (body.sync_status !== undefined) { updates.push('sync_status = ?'); values.push(body.sync_status); }

    updates.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await db
      .prepare(`UPDATE aspek_kerja SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    const result = await db
      .prepare('SELECT * FROM aspek_kerja WHERE id = ?')
      .bind(id)
      .first();

    return c.json(result);
  } catch (error: any) {
    console.error('Error updating aspek_kerja:', error);
    return c.json({ error: error.message }, 500);
  }
});

// DELETE /api/master/aspek-kerja/:id - Soft delete aspek kerja
masterRoutes.delete('/aspek-kerja/:id', async (c) => {
  const db = c.env.DB;
  const { id } = c.req.param();

  try {
    const now = new Date().toISOString();

    await db
      .prepare(`UPDATE aspek_kerja SET deleted = 1, sync_status = 'pending', updated_at = ? WHERE id = ?`)
      .bind(now, id)
      .run();

    return c.json({ success: true, message: 'Aspek kerja deleted' });
  } catch (error: any) {
    console.error('Error deleting aspek_kerja:', error);
    return c.json({ error: error.message }, 500);
  }
});
