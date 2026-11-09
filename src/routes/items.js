import express from 'express';
import prisma from '../db.js';
import { requireAuth, minRole, ROLES } from '../middleware/auth.js';
import { getPlan } from '../plans.js';

const router = express.Router();
router.use(requireAuth);

// Generate SKU automatically if not provided
// Format: [CategoryPrefix]-[TypePrefix]-[SizeOrClass]
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

// GET /api/items - List items with optional filters & search (tenant-scoped)
router.get('/', async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const { search, categoryId, size, itemClass, subject, lowStock } = req.query;

        const where = { tenantId };

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

        const totalValue = items.reduce((sum, item) => sum + item.stock * item.costPrice, 0);

        res.json({
            success: true,
            count: items.length,
            totalStockValue: totalValue,
            data: items,
        });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// GET /api/items/sku/:sku - Look up item by SKU (tenant-scoped; must be before /:id)
router.get('/sku/:sku', async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const item = await prisma.item.findFirst({
            where: { tenantId, sku: req.params.sku.toUpperCase() },
            include: { category: true },
        });
        if (!item) return res.status(404).json({ success: false, error: `No item found with SKU: ${req.params.sku}` });
        res.json({ success: true, data: item });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// GET /api/items/:id - Get single item with transaction history (tenant-scoped)
router.get('/:id', async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const item = await prisma.item.findFirst({
            where: { id: parseInt(req.params.id), tenantId },
            include: {
                category: true,
                transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
            },
        });
        if (!item) return res.status(404).json({ success: false, error: 'Item not found' });
        res.json({ success: true, data: item });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// POST /api/items - Create a new item (tenant-scoped; FREE plan item limit enforced)
router.post('/', minRole(ROLES.STAFF), async (req, res) => {
    try {
        const tenantId = req.session.tenantId;

        const planLimit = await prisma.$transaction(async (tx) => {
            const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { plan: true } });
            const { maxItems } = getPlan(tenant);
            const count = await tx.item.count({ where: { tenantId } });
            return { count, maxItems };
        });
        if (planLimit.count >= planLimit.maxItems) {
            return res.status(403).json({
                success: false,
                code: 'PLAN_LIMIT',
                error: `Free plan is limited to ${planLimit.maxItems} items. Upgrade to Pro for unlimited inventory.`,
            });
        }

        const {
            name, description, categoryId, size, itemClass, subject,
            costPrice, salePrice, stock, sku,
        } = req.body;

        if (!name || !categoryId) {
            return res.status(400).json({ success: false, error: 'name and categoryId are required' });
        }

        // Lookup category for SKU generation (tenant-scoped)
        const category = await prisma.category.findFirst({ where: { id: parseInt(categoryId), tenantId } });
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
                tenantId,
                transactions: initialStock > 0
                    ? {
                        create: {
                            type: 'INITIAL_BALANCE',
                            quantity: initialStock,
                            price: parseFloat(costPrice) || 0,
                            reference: 'Initial stock entry',
                            tenantId,
                        },
                    }
                    : undefined,
            },
            include: { category: true },
        });

        res.status(201).json({ success: true, data: item });
    } catch (err) { console.error('Request failed:', err);
        if (err.code === 'P2002') {
            return res.status(409).json({ success: false, error: 'An item with this SKU already exists' });
        }
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// PUT /api/items/:id - Update item details (tenant-scoped)
router.put('/:id', minRole(ROLES.STAFF), async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const { name, description, size, itemClass, subject, costPrice, salePrice } = req.body;

        const item = await prisma.item.findFirst({ where: { id: parseInt(req.params.id), tenantId } });
        if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

        const updated = await prisma.item.update({
            where: { id: item.id },
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
        res.json({ success: true, data: updated });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// POST /api/items/:id/stock-in - Add stock (tenant-scoped, atomic)
router.post('/:id/stock-in', minRole(ROLES.STAFF), async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const { quantity, price, reference } = req.body;
        const qty = parseInt(quantity);

        if (!qty || qty <= 0) {
            return res.status(400).json({ success: false, error: 'quantity must be a positive integer' });
        }

        const itemId = parseInt(req.params.id);

        const result = await prisma.$transaction(async (tx) => {
            const existing = await tx.item.findFirst({ where: { id: itemId, tenantId } });
            if (!existing) {
                const e = new Error('Item not found');
                e.status = 404;
                throw e;
            }
            const [transaction, updatedItem] = await Promise.all([
                tx.transaction.create({
                    data: {
                        itemId: existing.id,
                        type: 'STOCK_IN',
                        quantity: qty,
                        price: price ? parseFloat(price) : undefined,
                        reference,
                        tenantId,
                    },
                }),
                tx.item.update({
                    where: { id: existing.id },
                    data: { stock: { increment: qty } },
                    include: { category: true },
                }),
            ]);
            return { transaction, updatedItem };
        });

        res.json({
            success: true,
            message: `Added ${qty} units. New stock: ${result.updatedItem.stock}`,
            data: { item: result.updatedItem, transaction: result.transaction },
        });
    } catch (err) { console.error('Request failed:', err);
        if (err.status === 404) return res.status(404).json({ success: false, error: err.message });
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// POST /api/items/:id/sale - Record a sale (tenant-scoped, atomic, never negative)
router.post('/:id/sale', minRole(ROLES.STAFF), async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const { quantity, price, reference } = req.body;
        const qty = parseInt(quantity);

        if (!qty || qty <= 0) {
            return res.status(400).json({ success: false, error: 'quantity must be a positive integer' });
        }

        const itemId = parseInt(req.params.id);

        const result = await prisma.$transaction(async (tx) => {
            const existing = await tx.item.findFirst({ where: { id: itemId, tenantId } });
            if (!existing) {
                const e = new Error('Item not found');
                e.status = 404;
                throw e;
            }
            // Atomic conditional decrement — cannot go negative
            const decremented = await tx.item.updateMany({
                where: { id: existing.id, tenantId, stock: { gte: qty } },
                data: { stock: { decrement: qty } },
            });
            if (decremented.count === 0) {
                const e = new Error(`Insufficient stock. Available: ${existing.stock}, requested: ${qty}`);
                e.status = 400;
                throw e;
            }
            const salePrice = price ? parseFloat(price) : existing.salePrice;
            const [transaction, updatedItem] = await Promise.all([
                tx.transaction.create({
                    data: {
                        itemId: existing.id,
                        type: 'SALE',
                        quantity: -qty,
                        price: salePrice,
                        reference,
                        tenantId,
                    },
                }),
                tx.item.findFirst({ where: { id: existing.id }, include: { category: true } }),
            ]);
            return { transaction, updatedItem, salePrice };
        });

        const revenue = qty * result.salePrice;

        res.json({
            success: true,
            message: `Sold ${qty} unit(s) @ PKR ${result.salePrice}. Remaining stock: ${result.updatedItem.stock}`,
            revenue,
            data: { item: result.updatedItem, transaction: result.transaction },
        });
    } catch (err) { console.error('Request failed:', err);
        if (err.status === 404) return res.status(404).json({ success: false, error: err.message });
        if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// DELETE /api/items/:id - Delete an item (only if no transactions; tenant-scoped)
router.delete('/:id', minRole(ROLES.STAFF), async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const item = await prisma.item.findFirst({ where: { id: parseInt(req.params.id), tenantId } });
        if (!item) return res.status(404).json({ success: false, error: 'Item not found' });

        const txCount = await prisma.transaction.count({
            where: { itemId: item.id, tenantId },
        });
        if (txCount > 0) {
            return res.status(400).json({
                success: false,
                error: `Cannot delete: item has ${txCount} transaction record(s). Consider deactivating instead.`,
            });
        }
        await prisma.item.delete({ where: { id: item.id } });
        res.json({ success: true, message: 'Item deleted' });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

export default router;
