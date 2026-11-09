import express from 'express';
import prisma from '../db.js';
import { requireAuth, minRole, ROLES } from '../middleware/auth.js';
import { validate, categorySchema } from '../validation.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/categories - List categories with item counts (tenant-scoped)
router.get('/', async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const categories = await prisma.category.findMany({
            where: { tenantId },
            include: {
                _count: { select: { items: true } },
            },
            orderBy: { name: 'asc' },
        });
        res.json({ success: true, data: categories });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// GET /api/categories/:id - Single category with its items (tenant-scoped)
router.get('/:id', async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const category = await prisma.category.findFirst({
            where: { id: parseInt(req.params.id), tenantId },
            include: {
                items: {
                    orderBy: [{ name: 'asc' }],
                },
            },
        });
        if (!category) return res.status(404).json({ success: false, error: 'Category not found' });
        res.json({ success: true, data: category });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// POST /api/categories - Create a new category (tenant-scoped)
router.post('/', minRole(ROLES.STAFF), validate(categorySchema), async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const { name, description } = req.body;
        if (!name || typeof name !== 'string' || !name.trim()) {
            return res.status(400).json({ success: false, error: 'Name is required' });
        }

        const category = await prisma.category.create({
            data: { name: name.trim(), description, tenantId },
        });
        res.status(201).json({ success: true, data: category });
    } catch (err) { console.error('Request failed:', err);
        if (err.code === 'P2002') {
            return res.status(409).json({ success: false, error: 'Category name already exists' });
        }
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// PUT /api/categories/:id - Update a category (tenant-scoped)
router.put('/:id', minRole(ROLES.STAFF), validate(categorySchema), async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const { name, description } = req.body;
        const existing = await prisma.category.findFirst({ where: { id: parseInt(req.params.id), tenantId } });
        if (!existing) return res.status(404).json({ success: false, error: 'Category not found' });

        const category = await prisma.category.update({
            where: { id: existing.id },
            data: { name, description },
        });
        res.json({ success: true, data: category });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// DELETE /api/categories/:id - Delete a category (only if no items; tenant-scoped)
router.delete('/:id', minRole(ROLES.STAFF), async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const category = await prisma.category.findFirst({ where: { id: parseInt(req.params.id), tenantId } });
        if (!category) return res.status(404).json({ success: false, error: 'Category not found' });

        const count = await prisma.item.count({
            where: { categoryId: category.id, tenantId },
        });
        if (count > 0) {
            return res.status(400).json({ success: false, error: `Cannot delete: ${count} item(s) still belong to this category` });
        }
        await prisma.category.delete({ where: { id: category.id } });
        res.json({ success: true, message: 'Category deleted' });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

export default router;
