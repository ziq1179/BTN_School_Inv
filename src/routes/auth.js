import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../db.js';
import { requireAuth, requireRole, ROLES } from '../middleware/auth.js';

const router = express.Router();

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const passwordMin = 8;

// POST /api/auth/signup — self-serve: creates tenant + admin user + branding row
router.post('/signup', async (req, res) => {
    try {
        const { schoolName, name, email, password } = req.body || {};

        if (!schoolName || typeof schoolName !== 'string' || schoolName.trim().length < 2) {
            return res.status(400).json({ success: false, error: 'School name is required' });
        }
        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            return res.status(400).json({ success: false, error: 'Your name is required' });
        }
        if (!email || typeof email !== 'string' || !emailRe.test(email.trim())) {
            return res.status(400).json({ success: false, error: 'A valid email is required' });
        }
        if (!password || typeof password !== 'string' || password.length < passwordMin) {
            return res.status(400).json({ success: false, error: `Password must be at least ${passwordMin} characters` });
        }

        const normalizedEmail = email.trim().toLowerCase();
        const normalizedSchool = schoolName.trim();
        const normalizedName = name.trim();

        const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (exists) {
            return res.status(409).json({ success: false, error: 'That email is already registered' });
        }

        // Build a unique, url-safe slug from the school name
        const base = normalizedSchool
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '')
            .slice(0, 40) || 'school';
        const slug = `${base}-${crypto.randomBytes(3).toString('hex')}`;

        const hash = await bcrypt.hash(password, 10);

        const tenant = await prisma.$transaction(async (tx) => {
            const t = await tx.tenant.create({
                data: {
                    name: normalizedSchool,
                    slug,
                    plan: 'FREE',
                    status: 'active',
                },
            });
            await tx.school.create({
                data: { tenantId: t.id, name: normalizedSchool },
            });
            const u = await tx.user.create({
                data: {
                    email: normalizedEmail,
                    password: hash,
                    name: normalizedName,
                    role: 'ADMIN',
                    tenantId: t.id,
                },
            });
            return { ...t, users: [u] };
        });

        const user = tenant.users[0];
        req.session.userId = user.id;
        req.session.email = user.email;
        req.session.role = user.role;
        req.session.name = user.name;
        req.session.tenantId = tenant.id;
        req.session.plan = tenant.plan;

        res.status(201).json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                tenant: { id: tenant.id, name: tenant.name, plan: tenant.plan },
            },
        });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        const user = await prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() },
            include: { tenant: true },
        });

        if (!user || !user.isActive) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            return res.status(401).json({ success: false, error: 'Invalid email or password' });
        }

        req.session.userId = user.id;
        req.session.email = user.email;
        req.session.role = user.role;
        req.session.name = user.name;
        req.session.tenantId = user.tenantId;
        req.session.plan = user.tenant.plan;

        res.json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                tenant: { id: user.tenant.id, name: user.tenant.name, plan: user.tenant.plan },
            },
        });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
    req.session = null;
    res.json({ success: true });
});

// GET /api/auth/me - current user (requires auth)
router.get('/me', requireAuth, async (req, res) => {
    try {
        const user = await prisma.user.findUnique({
            where: { id: req.session.userId },
            include: { tenant: true },
        });
        if (!user || !user.id) {
            req.session = null;
            return res.status(401).json({ success: false, error: 'Session invalid' });
        }
        // Keep the session fresh so upgrades take effect without re-login
        req.session.plan = user.tenant.plan;
        req.session.tenantId = user.tenantId;
        res.json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                tenant: { id: user.tenant.id, name: user.tenant.name, plan: user.tenant.plan },
            },
        });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// GET /api/auth/roles - list roles (for UI)
router.get('/roles', (req, res) => {
    res.json({
        success: true,
        data: Object.values(ROLES),
    });
});

export default router;
