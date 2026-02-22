import express from 'express';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

// GET /api/transactions - List transactions with filters
router.get('/', async (req, res) => {
    try {
        const { itemId, type, limit = 100 } = req.query;

        const where = {};
        if (itemId) where.itemId = parseInt(itemId);
        if (type) where.type = type.toUpperCase();

        const transactions = await prisma.transaction.findMany({
            where,
            include: {
                item: { select: { id: true, sku: true, name: true } },
            },
            orderBy: { createdAt: 'desc' },
            take: parseInt(limit),
        });

        res.json({ success: true, count: transactions.length, data: transactions });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/transactions/summary - Dashboard summary statistics
router.get('/summary', async (req, res) => {
    try {
        const [
            totalItems,
            totalCategories,
            allItems,
            recentSales,
            lowStockItems,
        ] = await Promise.all([
            prisma.item.count(),
            prisma.category.count(),
            prisma.item.findMany({ select: { stock: true, costPrice: true, salePrice: true } }),
            prisma.transaction.findMany({
                where: { type: 'SALE' },
                include: { item: { select: { name: true, sku: true } } },
                orderBy: { createdAt: 'desc' },
                take: 10,
            }),
            prisma.item.findMany({
                where: { stock: { lte: 10 } },
                include: { category: { select: { name: true } } },
                orderBy: { stock: 'asc' },
            }),
        ]);

        const totalStockValue = allItems.reduce(
            (sum, item) => sum + item.stock * item.costPrice,
            0
        );
        const totalRetailValue = allItems.reduce(
            (sum, item) => sum + item.stock * item.salePrice,
            0
        );
        const totalUnitsInStock = allItems.reduce((sum, item) => sum + item.stock, 0);

        // Total revenue from all sales
        const salesRevenue = await prisma.transaction.aggregate({
            where: { type: 'SALE' },
            _sum: { price: true },
        });

        res.json({
            success: true,
            data: {
                totalItems,
                totalUnitsInStock,
                totalCategories,
                totalStockValue: Math.round(totalStockValue),
                totalRetailValue: Math.round(totalRetailValue),
                potentialProfit: Math.round(totalRetailValue - totalStockValue),
                recentSales,
                lowStockItems,
                totalSalesRevenue: salesRevenue._sum.price || 0,
            },
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/transactions/item-stats - Item-wise sales revenue and profit for charts
router.get('/item-stats', async (req, res) => {
    try {
        const sales = await prisma.transaction.findMany({
            where: { type: 'SALE' },
            include: {
                item: { select: { id: true, name: true, sku: true, costPrice: true } },
            },
        });

        // Aggregate by item: { itemId, itemName, sku, revenue, qtySold, profit }
        const byItem = new Map();
        for (const tx of sales) {
            const qty = Math.abs(tx.quantity);
            const revenue = qty * (tx.price || tx.item.costPrice);
            const cost = qty * tx.item.costPrice;
            const profit = revenue - cost;

            if (!byItem.has(tx.itemId)) {
                byItem.set(tx.itemId, {
                    itemId: tx.item.id,
                    itemName: tx.item.name,
                    sku: tx.item.sku,
                    revenue: 0,
                    qtySold: 0,
                    profit: 0,
                });
            }
            const row = byItem.get(tx.itemId);
            row.revenue += revenue;
            row.qtySold += qty;
            row.profit += profit;
        }

        const data = Array.from(byItem.values())
            .map((r) => ({
                ...r,
                revenue: Math.round(r.revenue * 100) / 100,
                profit: Math.round(r.profit * 100) / 100,
            }))
            .sort((a, b) => b.revenue - a.revenue);

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/transactions/category-stats - Category-wise sales revenue for pie chart
router.get('/category-stats', async (req, res) => {
    try {
        const sales = await prisma.transaction.findMany({
            where: { type: 'SALE' },
            include: {
                item: { include: { category: { select: { id: true, name: true } } } },
            },
        });

        const byCategory = new Map();
        for (const tx of sales) {
            const qty = Math.abs(tx.quantity);
            const revenue = qty * (tx.price || tx.item.costPrice);
            const cat = tx.item.category;
            if (!cat) continue;

            if (!byCategory.has(cat.id)) {
                byCategory.set(cat.id, { categoryId: cat.id, categoryName: cat.name, revenue: 0 });
            }
            byCategory.get(cat.id).revenue += revenue;
        }

        const data = Array.from(byCategory.values())
            .map((r) => ({ ...r, revenue: Math.round(r.revenue * 100) / 100 }))
            .sort((a, b) => b.revenue - a.revenue);

        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

export default router;
