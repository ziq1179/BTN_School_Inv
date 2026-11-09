import express from 'express';
import prisma from '../db.js';
import { requireAuth, requireRole, ROLES } from '../middleware/auth.js';
import { getPlan, PLANS } from '../plans.js';
import { stripe, billingConfigured, STRIPE_PRO_PRICE_ID, STRIPE_WEBHOOK_SECRET } from '../stripe.js';

const router = express.Router();
router.use(requireAuth);

async function usageFor(tenantId) {
    const [items, users] = await Promise.all([
        prisma.item.count({ where: { tenantId } }),
        prisma.user.count({ where: { tenantId } }),
    ]);
    return { items, users };
}

// GET /api/billing/status - current plan, subscription state and FREE-tier usage
router.get('/status', async (req, res) => {
    try {
        const tenantId = req.session.tenantId;
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

        const plan = getPlan(tenant);
        const usage = await usageFor(tenantId);

        res.json({
            success: true,
            data: {
                plan: tenant.plan,
                planName: plan.name,
                status: tenant.status,
                currentPeriodEnd: tenant.currentPeriodEnd,
                stripeCustomerId: tenant.stripeCustomerId,
                maxItems: plan.maxItems === Infinity ? null : plan.maxItems,
                maxUsers: plan.maxUsers === Infinity ? null : plan.maxUsers,
                ai: plan.ai,
                usage,
                billingConfigured: billingConfigured(),
            },
        });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// POST /api/billing/checkout - create a Stripe Checkout session for Pro upgrade
router.post('/checkout', requireRole(ROLES.ADMIN), async (req, res) => {
    try {
        if (!billingConfigured()) {
            return res.status(503).json({ success: false, error: 'Billing is not configured yet' });
        }
        const tenantId = req.session.tenantId;
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });
        if (tenant.plan === 'PRO' && tenant.status === 'active') {
            return res.status(400).json({ success: false, error: 'You are already on the Pro plan' });
        }

        const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
        let customerId = tenant.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: req.session.email,
                name: tenant.name,
                metadata: { tenantId: String(tenantId) },
            });
            customerId = customer.id;
            await prisma.tenant.update({
                where: { id: tenantId },
                data: { stripeCustomerId: customerId },
            });
        }

        const session = await stripe.checkout.sessions.create({
            mode: 'subscription',
            line_items: [{ price: STRIPE_PRO_PRICE_ID, quantity: 1 }],
            customer: customerId,
            client_reference_id: String(tenantId),
            metadata: { tenantId: String(tenantId) },
            subscription_data: { metadata: { tenantId: String(tenantId) } },
            success_url: `${origin}/?billing=success`,
            cancel_url: `${origin}/?billing=cancel`,
            allow_promotion_codes: true,
        });

        res.json({ success: true, url: session.url });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// POST /api/billing/portal - Stripe customer portal (manage/cancel subscription)
router.post('/portal', requireRole(ROLES.ADMIN), async (req, res) => {
    try {
        if (!billingConfigured()) {
            return res.status(503).json({ success: false, error: 'Billing is not configured yet' });
        }
        const tenantId = req.session.tenantId;
        const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
        if (!tenant?.stripeCustomerId) {
            return res.status(400).json({ success: false, error: 'No billing account yet — upgrade first' });
        }

        const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
        const portal = await stripe.billingPortal.sessions.create({
            customer: tenant.stripeCustomerId,
            return_url: `${origin}/`,
        });
        res.json({ success: true, url: portal.url });
    } catch (err) { console.error('Request failed:', err);
        res.status(500).json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

export default router;
