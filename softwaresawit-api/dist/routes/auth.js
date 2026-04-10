import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import * as jose from 'jose';
const JWT_SECRET = new TextEncoder().encode('softwaresawit-secret-key-change-in-production');
const loginSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(1),
    device_id: z.string().optional(),
});
const registerSchema = z.object({
    username: z.string().min(1),
    password: z.string().min(6),
    nama: z.string().min(1),
    role: z.enum(['admin', 'user', 'approver']).default('user'),
    modules: z.array(z.enum(['kas', 'bank', 'gudang', 'coa', 'blok', 'aspek_kerja'])).default(['kas']),
});
export const authRoutes = new Hono();
// Generate JWT token
const generateToken = async (user) => {
    const token = await new jose.SignJWT({
        sub: user.id,
        username: user.username,
        role: user.role,
        modules: user.modules,
    })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(JWT_SECRET);
    return token;
};
// Verify JWT token
export const verifyToken = async (token) => {
    try {
        const { payload } = await jose.jwtVerify(token, JWT_SECRET);
        return payload;
    }
    catch {
        return null;
    }
};
// Auth middleware
export const authMiddleware = async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'Unauthorized - No token provided' }, 401);
    }
    const token = authHeader.substring(7);
    const payload = await verifyToken(token);
    if (!payload) {
        return c.json({ error: 'Unauthorized - Invalid token' }, 401);
    }
    c.set('user', payload);
    await next();
};
// Module access control middleware
// Checks if user has access to the requested module based on JWT 'modules' claim
export const moduleAccessMiddleware = (requiredModule) => {
    return async (c, next) => {
        const authHeader = c.req.header('Authorization');
        // First check if token is provided
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return c.json({ error: 'Unauthorized - No token provided' }, 401);
        }
        const token = authHeader.substring(7);
        const payload = await verifyToken(token);
        if (!payload) {
            return c.json({ error: 'Unauthorized - Invalid token' }, 401);
        }
        // Check if user has the required module
        const userModules = payload.modules;
        if (!userModules || !Array.isArray(userModules) || !userModules.includes(requiredModule)) {
            return c.json({
                error: 'Forbidden - You do not have access to this module',
                requiredModule,
                yourModules: userModules || []
            }, 403);
        }
        c.set('user', payload);
        await next();
    };
};
// POST /api/auth/login - User login
authRoutes.post('/login', zValidator('json', loginSchema), async (c) => {
    const db = c.env.DB;
    const body = c.req.valid('json');
    try {
        const user = await db
            .prepare('SELECT * FROM users WHERE username = ? AND password = ? AND deleted = 0')
            .bind(body.username, body.password)
            .first();
        if (!user) {
            return c.json({ error: 'Invalid username or password' }, 401);
        }
        const token = await generateToken(user);
        // Log device registration if device_id provided
        if (body.device_id) {
            await db
                .prepare(`
          INSERT INTO device_registry (device_id, user_id, last_seen, created_at)
          VALUES (?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(device_id) DO UPDATE SET last_seen = datetime('now')
        `)
                .bind(body.device_id, user.id)
                .run();
        }
        return c.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                nama: user.nama,
                role: user.role,
                modules: user.modules ? JSON.parse(user.modules) : ['kas'],
            }
        });
    }
    catch (error) {
        console.error('Error during login:', error);
        return c.json({ error: error.message }, 500);
    }
});
// POST /api/auth/register - User registration
authRoutes.post('/register', zValidator('json', registerSchema), async (c) => {
    const db = c.env.DB;
    const body = c.req.valid('json');
    try {
        // Check if username exists
        const existing = await db
            .prepare('SELECT id FROM users WHERE username = ?')
            .bind(body.username)
            .first();
        if (existing) {
            return c.json({ error: 'Username already exists' }, 409);
        }
        const id = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        await db
            .prepare(`
        INSERT INTO users (id, username, password, nama, role, modules, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
            .bind(id, body.username, body.password, body.nama, body.role, JSON.stringify(body.modules), now, now)
            .run();
        const user = await db
            .prepare('SELECT * FROM users WHERE id = ?')
            .bind(id)
            .first();
        if (!user) {
            return c.json({ error: 'User creation failed' }, 500);
        }
        const token = await generateToken(user);
        return c.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                nama: user.nama,
                role: user.role,
                modules: body.modules,
            }
        }, 201);
    }
    catch (error) {
        console.error('Error during registration:', error);
        return c.json({ error: error.message }, 500);
    }
});
// GET /api/auth/verify - Verify token
authRoutes.get('/verify', async (c) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return c.json({ error: 'No token provided' }, 401);
    }
    const token = authHeader.substring(7);
    const payload = await verifyToken(token);
    if (!payload) {
        return c.json({ error: 'Invalid token' }, 401);
    }
    return c.json({
        valid: true,
        user: {
            sub: payload.sub,
            username: payload.username,
            role: payload.role,
            modules: payload.modules,
        }
    });
});
// POST /api/auth/logout - Logout (client-side token removal)
authRoutes.post('/logout', async (c) => {
    // In a stateless JWT setup, logout is handled client-side
    // This endpoint can be used for audit logging
    return c.json({ success: true, message: 'Logged out successfully' });
});
