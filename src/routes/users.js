import express from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../db.js';
import { requireAuth, requireRole, ROLES } from '../middleware/auth.js';
import { getPlan } from '../plans.js';
import { validate, userCreateSchema, userUpdateSchema } from '../validation.js';

const router = express.Router();
const SALT_ROUNDS = 10;

// All user routes require ADMIN
router.use(requireAuth, requireRole(ROLES.ADMIN));

// GET /api/users - List users in this tenant
router.get('/', async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const users = await prisma.user.findMany({
            where: { tenantId },
            select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ success: true, data: users });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// POST /api/users - Create user (tenant-scoped; FREE plan user limit enforced)
router.post('/', validate(userCreateSchema), async (req, res) => {
    try {
        const tenantId = req.session.tenantId;

        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
        const { maxUsers } = getPlan(tenant);
        const count = await prisma.user.count({ where: { tenantId } });
        if (count >= maxUsers) {
            return res.status(403).json({
                success: false,
                code: 'PLAN_LIMIT',
                error: `Free plan is limited to ${maxUsers} users. Upgrade to Pro to add your whole team.`,
            });
        }

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
                tenantId,
            },
            select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
        });

        res.status(201).json({ success: true, data: user });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// PUT /api/users/:id - Update user (tenant-scoped)
router.put('/:id', validate(userUpdateSchema), async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const id = parseInt(req.params.id);
        const { name, role, isActive, password } = req.body;

        const existing = await prisma.user.findFirst({ where: { id, tenantId } });
        if (!existing) return res.status(404).json({ success: false, error: 'User not found' });

        const data = {};
        if (name !== undefined) data.name = name;
        if (role !== undefined && Object.values(ROLES).includes(role)) data.role = role;
        if (isActive !== undefined) data.isActive = Boolean(isActive);
        if (password && password.length >= 6) {
            data.password = await bcrypt.hash(password, SALT_ROUNDS);
        }

        const user = await prisma.user.update({
            where: { id: existing.id },
            data,
            select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true },
        });

        res.json({ success: true, data: user });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// DELETE /api/users/:id - Delete user (cannot delete self; tenant-scoped)
router.delete('/:id', async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const id = parseInt(req.params.id);
        if (id === req.session.userId) {
            return res.status(400).json({ success: false, error: 'Cannot delete your own account' });
        }

        const existing = await prisma.user.findFirst({ where: { id, tenantId } });
        if (!existing) return res.status(404).json({ success: false, error: 'User not found' });

        await prisma.user.delete({ where: { id: existing.id } });
        res.json({ success: true, message: 'User deleted' });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

export default router;
