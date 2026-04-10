import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { logger } from 'hono/logger';
// Import routes
import { kasRoutes } from './routes/kas';
import { bankRoutes } from './routes/bank';
import { gudangRoutes } from './routes/gudang';
import { authRoutes } from './routes/auth';
import { masterRoutes } from './routes/master';
import { batchRoutes } from './routes/batch';
import { moduleAccessMiddleware } from './routes/auth';
// Import migrations
import { runMigrations, getMigrationStatus } from './lib/migrations';
const app = new Hono();
// Middleware
app.use('*', logger());
app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
}));
app.use('*', etag());
// Health check endpoint
app.get('/health', async (c) => {
    const db = c.env.DB;
    // Get migration status
    let migrationStatus = { applied: [], pending: [] };
    try {
        migrationStatus = await getMigrationStatus(db);
    }
    catch {
        migrationStatus = { applied: [], pending: ['0001_initial_schema', '0002_seed_data'] };
    }
    return c.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: c.env.ENVIRONMENT || 'development',
        migrations: migrationStatus
    });
});
// Migration endpoint for manual trigger
app.post('/migrations/run', async (c) => {
    const db = c.env.DB;
    try {
        const result = await runMigrations(db);
        return c.json({
            success: true,
            applied: result.applied,
            errors: result.errors
        });
    }
    catch (error) {
        return c.json({ error: error.message }, 500);
    }
});
// Migration status endpoint
app.get('/migrations/status', async (c) => {
    const db = c.env.DB;
    try {
        const status = await getMigrationStatus(db);
        return c.json(status);
    }
    catch (error) {
        return c.json({ error: error.message }, 500);
    }
});
// API Routes with versioning
// Apply module access middleware to kas, bank, and gudang routes
app.use('/api/kas/*', moduleAccessMiddleware('kas'));
app.use('/api/bank/*', moduleAccessMiddleware('bank'));
app.use('/api/gudang/*', moduleAccessMiddleware('gudang'));
// Apply module access middleware to master sub-routes
app.use('/api/master/coa/*', moduleAccessMiddleware('coa'));
app.use('/api/master/blok/*', moduleAccessMiddleware('blok'));
app.use('/api/master/aspek-kerja/*', moduleAccessMiddleware('aspek_kerja'));
app.route('/api/kas', kasRoutes);
app.route('/api/bank', bankRoutes);
app.route('/api/gudang', gudangRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/master', masterRoutes);
app.route('/api/batch', batchRoutes);
// Fallback for unknown routes
app.notFound((c) => {
    return c.json({
        error: 'Not Found',
        message: `Route ${c.req.path} not found`,
        status: 404
    }, 404);
});
// Error handler
app.onError((err, c) => {
    console.error('Error:', err);
    return c.json({
        error: 'Internal Server Error',
        message: err.message,
        status: 500
    }, 500);
});
export default app;
