import 'dotenv/config';
import express from 'express';
import morgan from 'morgan';
import cookieSession from 'cookie-session';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Route imports
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import categoryRoutes from './routes/categories.js';
import itemRoutes from './routes/items.js';
import transactionRoutes from './routes/transactions.js';
import settingsRoutes from './routes/settings.js';
import aiRoutes from './routes/ai.js';

const app = express();

// Required behind one reverse proxy (Vercel/Render): trust the first forwarded hop only
app.set('trust proxy', 1);

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
// Security headers. The app uses inline styles/scripts and third-party CDNs
// (jsdelivr for Chart.js, Google Fonts) — CSP is scoped to exactly those.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", 'https://cdn.jsdelivr.net', "'unsafe-inline'"],
            // The app uses inline onclick handlers (e.g. openModal) — allow attribute scripts
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
            fontSrc: ["'self'", 'https://fonts.gstatic.com'],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameAncestors: ["'self'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// Same-origin only: the frontend always calls /api on its own host, so any
// cross-origin request carrying an Origin header is rejected.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
        try {
            const { host } = new URL(origin);
            if (host !== req.headers.host && !ALLOWED_ORIGINS.includes(origin)) {
                return res.status(403).json({ success: false, error: 'Cross-origin request blocked' });
            }
        } catch {
            return res.status(403).json({ success: false, error: 'Invalid origin' });
        }
    }
    next();
});

// Rate limiting — generous for reads, stricter for auth and AI
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 600,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, please slow down' },
});
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many attempts, please wait a few minutes' },
});
const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'AI rate limit reached, please try again later' },
});

app.use('/api/', apiLimiter);
app.use(['/api/auth/login', '/api/auth/signup'], authLimiter);
app.use('/api/ai', aiLimiter);
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
app.use('/api/ai', aiRoutes);

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
