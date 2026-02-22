import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../db.js';
import { requireAuth, requireRole, ROLES } from '../middleware/auth.js';

const router = express.Router();
const SALT_ROUNDS = 10;

// All user routes require ADMIN
router.use(requireAuth, requireRole(ROLES.ADMIN));

// GET /api/users - List all users
router.get('/', async (req, res) => {
    try {
        const users = await prisma.user.findMany({
            select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data: users });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/users - Create user
router.post('/', async (req, res) => {
    try {
        const { email, password, name, role } = req.body;
        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Email and password required' });
        }

        const validRole = Object.values(ROLES).includes(role) ? role : ROLES.STAFF;
        const normalizedEmail = email.trim().toLowerCase();

        const exists = await prisma.user.findUnique({ where: { email: normalizedEmail } });
        if (exists) {
            return res.status(409).json({ success: false, error: 'Email already registered' });
        }

        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        const user = await prisma.user.create({
            data: {
                email: normalizedEmail,
                password: hash,
                name: name || null,
                role: validRole,
            },
            select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
        });

        res.status(201).json({ success: true, data: user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/users/:id - Update user
router.put('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { name, role, isActive, password } = req.body;

        const data = {};
        if (name !== undefined) data.name = name;
        if (role !== undefined && Object.values(ROLES).includes(role)) data.role = role;
        if (isActive !== undefined) data.isActive = Boolean(isActive);
        if (password && password.length >= 6) {
            data.password = await bcrypt.hash(password, SALT_ROUNDS);
        }

        const user = await prisma.user.update({
            where: { id },
            data,
            select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
        });

        res.json({ success: true, data: user });
    } catch (err) {
        if (err.code === 'P2025') {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/users/:id - Delete user (cannot delete self)
router.delete('/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (id === req.session.userId) {
            return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
        }

        await prisma.user.delete({ where: { id } });
        res.json({ success: true, message: 'User deleted' });
    } catch (err) {
        if (err.code === 'P2025') {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
