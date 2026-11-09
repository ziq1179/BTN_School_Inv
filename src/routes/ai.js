import express from 'express';
import prisma from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { getPlan } from '../plans.js';
import { groqChat, groqEnabled, GROQ_MODEL } from '../groq.js';
import { validate, chatSchema, describeSchema } from '../validation.js';

const router = express.Router();
router.use(requireAuth);

// Every AI endpoint requires the PRO plan (and a configured Groq key)
async function requirePro(req, res, next) {
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: req.session.tenantId },
            select: { plan: true, status: true },
        });
        const plan = getPlan(tenant);
        if (!plan.ai) {
            return res.status(403).json({
                success: false,
                code: 'AI_REQUIRES_PRO',
                error: 'AI features are part of the Pro plan. Upgrade to unlock them.',
            });
        }
        if (!groqEnabled()) {
            return res.status(503).json({
                success: false,
                error: 'AI is not configured on this deployment yet',
            });
        }
        next();
    } catch (err) {
        console.error('AI gate failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
}

async function buildTenantContext(tenantId) {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sincePrev30 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    const [totalItems, totalCategories, allItems, recentSales, lowStock, salesLast30, salesPrev30Txs, topSellers] = await Promise.all([
        prisma.item.count({ where: { tenantId } }),
        prisma.category.count({ where: { tenantId } }),
        prisma.item.findMany({
            where: { tenantId },
            select: { sku: true, name: true, stock: true, costPrice: true, salePrice: true, category: { select: { name: true } } },
        }),
        prisma.transaction.findMany({
            where: { type: 'SALE', tenantId },
            include: { item: { select: { name: true, sku: true } } },
            orderBy: { createdAt: 'desc' },
            take: 10,
        }),
        prisma.item.findMany({
            where: { stock: { lte: 10 }, tenantId },
            select: { sku: true, name: true, stock: true, category: { select: { name: true } } },
            orderBy: { stock: 'asc' },
            take: 10,
        }),
        prisma.transaction.findMany({
            where: { type: 'SALE', tenantId, createdAt: { gte: since30 } },
            select: { itemId: true, quantity: true, price: true },
        }),
        prisma.transaction.findMany({
            where: { type: 'SALE', tenantId, createdAt: { gte: sincePrev30, lt: since30 } },
            select: { quantity: true, price: true },
        }),
        prisma.transaction.groupBy({
            by: ['itemId'],
            where: { type: 'SALE', tenantId, createdAt: { gte: since30 } },
            _sum: { quantity: true },
            orderBy: { _sum: { quantity: 'asc' } },
            take: 10,
        }),
    ]);

    const totalUnits = allItems.reduce((s, i) => s + i.stock, 0);
    const stockValue = allItems.reduce((s, i) => s + i.stock * i.costPrice, 0);
    const retailValue = allItems.reduce((s, i) => s + i.stock * i.salePrice, 0);
    const txRevenue = (txs) => txs.reduce((s, tx) => s + Math.abs(tx.quantity) * (tx.price || 0), 0);
    const revenueLast30 = txRevenue(salesLast30);
    const revenuePrev30 = txRevenue(salesPrev30Txs);

    const itemIds = topSellers.map(r => r.itemId);
    const topItems = itemIds.length
        ? await prisma.item.findMany({ where: { id: { in: itemIds }, tenantId }, select: { id: true, name: true, sku: true } })
        : [];
    const topById = new Map(topItems.map(i => [i.id, i]));
    const topSellersList = topSellers
        .map(r => ({ name: topById.get(r.itemId)?.name, sku: topById.get(r.itemId)?.sku, qtySold: Math.abs(r._sum.quantity || 0) }))
        .filter(r => r.name);

    return {
        inventory: { totalItems, totalCategories, totalUnitsInStock: totalUnits, stockValue: Math.round(stockValue), retailValue: Math.round(retailValue) },
        lowStock,
        recentSales: recentSales.map(s => ({ item: s.item?.name, qty: Math.abs(s.quantity), price: s.price, at: s.createdAt })),
        revenueLast30: Math.round(revenueLast30),
        revenuePrev30: Math.round(revenuePrev30),
        topSellers30: topSellersList,
        lowStockNames: lowStock.map(i => `${i.name} (${i.stock} left)`),
    };
}

const SYSTEM_PROMPT = `You are an expert inventory analyst for a school store (uniforms, books, supplies).
Answer questions ONLY using the JSON context provided. If the answer is not in the context, say so briefly.
Be concise, specific with numbers, and action-oriented. Use short paragraphs or bullet lists.
Currency is PKR unless the data says otherwise.`;

// POST /api/ai/chat - natural-language Q&A over this tenant's live inventory
router.post('/chat', validate(chatSchema), requirePro, async (req, res) => {
    try {
        const { question } = req.body;

        const tenantId = req.session.tenantId;
        const context = await buildTenantContext(tenantId);
        const answer = await groqChat([
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Inventory context (JSON):\n${JSON.stringify(context)}\n\nQuestion: ${question.trim()}` },
        ], { temperature: 0.3, maxTokens: 800 });

        res.json({ success: true, data: { answer, model: GROQ_MODEL } });
    } catch (err) { console.error('AI chat failed:', err);
        if (err.status) return res.status(err.status).json({ success: false, error: err.message });
        res.status(500).json({ success: false, error: 'AI request failed. Please try again.' });
    }
});

// POST /api/ai/insights - analyst summary of the last 30 days
router.post('/insights', requirePro, async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const context = await buildTenantContext(tenantId);
        const insight = await groqChat([
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Analyze this store's last 30 days. Give 4-6 crisp bullet insights (what's working, what's not, what to do next). No fluff.\n\nData (JSON):\n${JSON.stringify(context)}` },
        ], { temperature: 0.5, maxTokens: 900 });

        res.json({ success: true, data: { insights: insight } });
    } catch (err) { console.error('AI insights failed:', err);
        if (err.status) return res.status(err.status).json({ success: false, error: err.message });
        res.status(500).json({ success: false, error: 'AI request failed. Please try again.' });
    }
});

// POST /api/ai/reorder - suggested reorder quantities based on 60-day velocity
router.post('/reorder', requirePro, async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const since60 = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
        const [items, sales] = await Promise.all([
            prisma.item.findMany({
                where: { tenantId },
                select: { id: true, sku: true, name: true, stock: true, costPrice: true, salePrice: true },
            }),
            prisma.transaction.groupBy({
                by: ['itemId'],
                where: { type: 'SALE', tenantId, createdAt: { gte: since60 } },
                _sum: { quantity: true },
            }),
        ]);
        const sold60 = new Map(sales.map(r => [r.itemId, Math.abs(r._sum.quantity || 0)]));
        const candidates = items
            .map(i => ({
                name: i.name,
                sku: i.sku,
                stock: i.stock,
                sold60d: sold60.get(i.id) || 0,
                dailyVelocity: Math.round(((sold60.get(i.id) || 0) / 60) * 100) / 100,
            }))
            .filter(i => i.sold60d > 0)
            .sort((a, b) => b.sold60d - a.sold60d)
            .slice(0, 25);

        const suggestion = await groqChat([
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Given 60-day sales velocity, suggest reorder quantities for low-stock items. One bullet per item with reason (stock vs velocity). Mark anything with days-of-stock under 30 clearly.\n\nItems (JSON):\n${JSON.stringify(candidates)}` },
        ], { temperature: 0.4, maxTokens: 1000 });

        res.json({ success: true, data: { suggestions: suggestion, items: candidates } });
    } catch (err) { console.error('AI reorder failed:', err);
        if (err.status) return res.status(err.status).json({ success: false, error: err.message });
        res.status(500).json({ success: false, error: 'AI request failed. Please try again.' });
    }
});

// POST /api/ai/describe - generate a catalog description from item name/category
router.post('/describe', validate(describeSchema), requirePro, async (req, res) => {
    try {
        const { name, category, size, itemClass, subject } = req.body || {};
        const details = [
            `Item: ${name.trim()}`,
            category ? `Category: ${category}` : null,
            size ? `Size: ${size}` : null,
            itemClass ? `Class: ${itemClass}` : null,
            subject ? `Subject: ${subject}` : null,
        ].filter(Boolean).join('\n');

        const description = await groqChat([
            { role: 'system', content: 'You write concise, professional catalog descriptions for school store items. One or two sentences, plain text, no quotes, no markdown.' },
            { role: 'user', content: `Write a description for:\n${details}` },
        ], { temperature: 0.6, maxTokens: 200 });

        res.json({ success: true, data: { description } });
    } catch (err) { console.error('AI describe failed:', err);
        if (err.status) return res.status(err.status).json({ success: false, error: err.message });
        res.status(500).json({ success: false, error: 'AI request failed. Please try again.' });
    }
});

export default router;
