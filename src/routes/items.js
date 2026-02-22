import express from 'express';
import prisma from '../db.js';
import { requireAuth, minRole, ROLES } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// Generate SKU automatically if not provided
// Format: [CategoryPrefix]-[TypePrefix]-[SizeOrClass]
// E.g., BUN-SH-32 (Boys Uniform - Shirt - Size 32)
function generateSku(categoryName, name, size, itemClass) {
    const catPart = categoryName
        .replace(/[^a-zA-Z]/g, '')
        .toUpperCase()
        .slice(0, 3);
    const namePart = name
        .replace(/[^a-zA-Z]/g, '')
        .toUpperCase()
        .slice(0, 2);
    const suffix = (size || itemClass || 'XX').toUpperCase().replace(/\s/g, '').slice(0, 5);
    return `${catPart}-${namePart}-${suffix}`;
}

// GET /api/items - List all items with optional filters & search
router.get('/', async (req, res) => {
    try {
        const { search, categoryId, size, itemClass, subject, lowStock } = req.query;

        const where = {};

        if (categoryId) where.categoryId = parseInt(categoryId);
        if (size) where.size = { equals: size, mode: 'insensitive' };
        if (itemClass) where.class = { contains: itemClass, mode: 'insensitive' };
        if (subject) where.subject = { contains: subject, mode: 'insensitive' };
        if (lowStock === 'true') where.stock = { lte: 10 };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { description: { contains: search, mode: 'insensitive' } },
            ];
        }

        const items = await prisma.item.findMany({
            where,
            include: { category: { select: { id: true, name: true } } },
            orderBy: [{ category: { name: 'asc' } }, { name: 'asc' }],
        });

        // Compute total stock value
        const totalValue = items.reduce((sum, item) => sum + item.stock * item.costPrice, 0);

        res.json({
            success: true,
            count: items.length,
            totalStockValue: totalValue,
            data: items,
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/items/sku/:sku - Look up item by SKU code (must be before /:id)
router.get('/sku/:sku', async (req, res) => {
    try {
        const item = await prisma.item.findUnique({
            where: { sku: req.params.sku.toUpperCase() },
            include: { category: true },
        });
        if (!item) return res.status(404).json({ success: false, error: `No item found with SKU: ${req.params.sku}` });
        res.json({ success: true, data: item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/items/:id - Get single item with transaction history
router.get('/:id', async (req, res) => {
    try {
        const item = await prisma.item.findUnique({
            where: { id: parseInt(req.params.id) },
            include: {
                category: true,
                transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
            },
        });
        if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
        res.json({ success: true, data: item });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/items - Create a new item
router.post('/', minRole(ROLES.STAFF), async (req, res) => {
    try {
        const {
            name, description, categoryId, size, itemClass, subject,
            costPrice, salePrice, stock, sku,
        } = req.body;

        if (!name || !categoryId) {
            return res.status(400).json({ success: false, error: 'name and categoryId are required' });
        }

        // Lookup category for SKU generation
        const category = await prisma.category.findUnique({ where: { id: parseInt(categoryId) } });
        if (!category) return res.status(404).json({ success: false, error: 'Category not found' });

        const finalSku = sku
            ? sku.toUpperCase()
            : generateSku(category.name, name, size, itemClass);

        const initialStock = parseInt(stock) || 0;

        const item = await prisma.item.create({
            data: {
                sku: finalSku,
                name,
                description,
                categoryId: parseInt(categoryId),
                size,
                class: itemClass,
                subject,
                costPrice: parseFloat(costPrice) || 0,
                salePrice: parseFloat(salePrice) || 0,
                stock: initialStock,
                transactions: initialStock > 0
                    ? {
                        create: {
                            type: 'INITIAL_BALANCE',
                            quantity: initialStock,
                            price: parseFloat(costPrice) || 0,
                            reference: 'Initial stock entry',
                        },
                    }
                    : undefined,
            },
            include: { category: true },
        });

        res.status(201).json({ success: true, data: item });
    } catch (err) {
        if (err.code === 'P2002') {
            return res.status(409).json({ success: false, error: 'An item with this SKU already exists' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /api/items/:id - Update item details (not stock — use /stock-in or /sale for that)
router.put('/:id', minRole(ROLES.STAFF), async (req, res) => {
    try {
        const { name, description, size, itemClass, subject, costPrice, salePrice } = req.body;

        const item = await prisma.item.update({
            where: { id: parseInt(req.params.id) },
            data: {
                name,
                description,
                size,
                class: itemClass,
                subject,
                costPrice: costPrice !== undefined ? parseFloat(costPrice) : undefined,
                salePrice: salePrice !== undefined ? parseFloat(salePrice) : undefined,
            },
            include: { category: true },
        });
        res.json({ success: true, data: item });
    } catch (err) {
        if (err.code === 'P2025') {
            return res.status(404).json({ success: false, error: 'Item not found' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/items/:id/stock-in - Add new stock (e.g., new delivery arrived)
router.post('/:id/stock-in', minRole(ROLES.STAFF), async (req, res) => {
    try {
        const { quantity, price, reference } = req.body;
        const qty = parseInt(quantity);

        if (!qty || qty <= 0) {
            return res.status(400).json({ success: false, error: 'quantity must be a positive integer' });
        }

        // Use a transaction to guarantee consistency
        const [transaction, updatedItem] = await prisma.$transaction([
            prisma.transaction.create({
                data: {
                    itemId: parseInt(req.params.id),
                    type: 'STOCK_IN',
                    quantity: qty,
                    price: price ? parseFloat(price) : undefined,
                    reference,
                },
            }),
            prisma.item.update({
                where: { id: parseInt(req.params.id) },
                data: { stock: { increment: qty } },
                include: { category: true },
            }),
        ]);

        res.json({
            success: true,
            message: `Added ${qty} units. New stock: ${updatedItem.stock}`,
            data: { item: updatedItem, transaction },
        });
    } catch (err) {
        if (err.code === 'P2025') {
            return res.status(404).json({ success: false, error: 'Item not found' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/items/:id/sale - Record a sale (reduces stock)
router.post('/:id/sale', minRole(ROLES.STAFF), async (req, res) => {
    try {
        const { quantity, price, reference } = req.body;
        const qty = parseInt(quantity);

        if (!qty || qty <= 0) {
            return res.status(400).json({ success: false, error: 'quantity must be a positive integer' });
        }

        // Check current stock first
        const currentItem = await prisma.item.findUnique({ where: { id: parseInt(req.params.id) } });
        if (!currentItem) return res.status(404).json({ success: false, error: 'Item not found' });

        if (currentItem.stock < qty) {
            return res.status(400).json({
                success: false,
                error: `Insufficient stock. Available: ${currentItem.stock}, requested: ${qty}`,
            });
        }

        const salePrice = price ? parseFloat(price) : currentItem.salePrice;

        const [transaction, updatedItem] = await prisma.$transaction([
            prisma.transaction.create({
                data: {
                    itemId: parseInt(req.params.id),
                    type: 'SALE',
                    quantity: -qty, // negative = going out
                    price: salePrice,
                    reference,
                },
            }),
            prisma.item.update({
                where: { id: parseInt(req.params.id) },
                data: { stock: { decrement: qty } },
                include: { category: true },
            }),
        ]);

        const revenue = qty * salePrice;

        res.json({
            success: true,
            message: `Sold ${qty} unit(s) @ PKR ${salePrice}. Remaining stock: ${updatedItem.stock}`,
            revenue,
            data: { item: updatedItem, transaction },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /api/items/:id - Delete an item (only if no transactions)
router.delete('/:id', minRole(ROLES.STAFF), async (req, res) => {
    try {
        const txCount = await prisma.transaction.count({
            where: { itemId: parseInt(req.params.id) },
        });
        if (txCount > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot delete: item has ${txCount} transaction record(s). Consider deactivating instead.`,
            });
        }
        await prisma.item.delete({ where: { id: parseInt(req.params.id) } });
        res.json({ success: true, message: 'Item deleted' });
    } catch (err) {
        if (err.code === 'P2025') {
            return res.status(404).json({ success: false, error: 'Item not found' });
        }
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
