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

const app = express();

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// ── Serve Frontend ──────────────────────────────────────────────────────────
app.use(express.static(join(__dirname, '../public')));

// ── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/transactions', transactionRoutes);

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
