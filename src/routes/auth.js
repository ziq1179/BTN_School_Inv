import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../db.js';
import { requireAuth, requireRole, ROLES } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        const user = await prisma.user.findUnique({
            where: { email: email.trim().toLowerCase() },
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

        res.json({
            success: true,
            data: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
            select: { id: true, email: true, name: true, role: true },
        });
        if (!user || !user.id) {
            req.session = null;
            return res.status(401).json({ success: false, error: 'Session invalid' });
        }
        res.json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
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
