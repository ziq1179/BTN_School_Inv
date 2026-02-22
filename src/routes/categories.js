import express from 'express';
import prisma from '../db.js';
import { requireAuth, minRole, ROLES } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/categories - List all categories with item counts
router.get('/', async (req, res) => {
    try {
        const categories = await prisma.category.findMany({
            include: {
                _count: { select: { items: true } },
            },
            orderBy: { name: 'asc' },
        });
        res.json({ success: true, data: categories });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/categories/:id - Get a single category with its items
router.get('/:id', async (req, res) => {
    try {
        const category = await prisma.category.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                items: {
                    orderBy: [{ name: 'asc' }],
                },
            },
        });
        if (!category) return res.status(404).json({ success: false, error: 'Category not found' });
        res.json({ success: true, data: category });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/categories - Create a new category
router.post('/', minRole(ROLES.STAFF), async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name) return res.status(400).json({ success: false, error: 'Name is required' });

        const category = await prisma.category.create({
            data: { name, description },
        });
        res.status(201).json({ success: true, data: category });
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(409).json({ success: false, error: 'Category name already exists' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/categories/:id - Update a category
router.put('/:id', minRole(ROLES.STAFF), async (req, res) => {
    try {
        const { name, description } = req.body;
        const category = await prisma.category.update({
            where: { id: parseInt(req.params.id) },
            data: { name, description },
        });
        res.json({ success: true, data: category });
    } catch (err) {
        if (err.code === 'P2025') {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/categories/:id - Delete a category (only if no items)
router.delete('/:id', minRole(ROLES.STAFF), async (req, res) => {
    try {
        const count = await prisma.item.count({
            where: { categoryId: parseInt(req.params.id) },
        });
        if (count > 0) {
            return res.status(400).json({ success: false, error: `Cannot delete: ${count} item(s) still belong to this category` });
        }
        await prisma.category.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true, message: 'Category deleted' });
    } catch (err) {
        if (err.code === 'P2025') {
            return res.status(404).json({ success: false, error: 'Category not found' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
