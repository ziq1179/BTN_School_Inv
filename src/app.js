import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieSession from 'cookie-session';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Route imports
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import categoryRoutes from './routes/categories.js';
import itemRoutes from './routes/items.js';
import transactionRoutes from './routes/transactions.js';
import settingsRoutes from './routes/settings.js';

const app = express();

// Required behind reverse proxy (Render, etc.): trust X-Forwarded-* headers for cookies & HTTPS
app.set('trust proxy', true);

// Netlify: rewrite /.netlify/functions/api/* to /api/* so Express routes match
app.use((req, res, next) => {
    if (req.path.startsWith('/.netlify/functions/api')) {
        req.url = '/api' + req.path.slice('/.netlify/functions/api'.length) + (req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?')[1] : '');
    }
    next();
});

// ESM __dirname - safe for Netlify (import.meta.url undefined when bundled)
let __dirname;
try {
    const fn = fileURLToPath(import.meta.url);
    __dirname = dirname(fn);
} catch {
    __dirname = join(process.cwd(), 'src');
}

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(morgan('dev'));
app.use(cookieSession({
    name: 'session',
    secret: process.env.SESSION_SECRET || 'school-inventory-secret-change-in-production',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
}));
// Fix secure cookie behind proxy: cookie-session skips Set-Cookie if secure but req.secure is false
app.use((req, res, next) => {
    if (req.sessionOptions) {
        req.sessionOptions.secure = req.secure || req.get('x-forwarded-proto') === 'https';
    }
    next();
});

// Serve static files only when NOT on Netlify (Netlify serves from publish dir)
if (!process.env.NETLIFY) {
    app.use(express.static(join(__dirname, '../public')));
}

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/settings', settingsRoutes);

// ── Health check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        app: 'School Inventory Management System',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
    });
});

// ── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

export default app;
