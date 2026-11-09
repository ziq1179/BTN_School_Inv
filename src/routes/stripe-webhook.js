import express from 'express';
import { stripe, STRIPE_WEBHOOK_SECRET } from '../stripe.js';
import prisma from '../db.js';
import { PLANS } from '../plans.js';

// Raw-body Stripe webhook — mounted BEFORE express.json() in app.js
const router = express.Router();

function planFromSubscription(sub) {
    const status = sub?.status;
    if (status === 'active' || status === 'trialing') return { plan: 'PRO', status: 'active' };
    if (status === 'past_due' || status === 'unpaid' || status === 'incomplete') return { plan: 'PRO', status: 'past_due' };
    return { plan: 'FREE', status: 'canceled' };
}

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe || !STRIPE_WEBHOOK_SECRET) {
        return res.status(503).json({ success: false, error: 'Billing webhook is not configured' });
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Stripe webhook signature verification failed:', err.message);
        return res.status(400).json({ success: false, error: 'Invalid signature' });
    }

    const tenantIdFrom = (obj) => {
        const raw = obj?.metadata?.tenantId || obj?.client_reference_id || obj?.subscription_details?.metadata?.tenantId;
        const id = parseInt(raw, 10);
        return Number.isInteger(id) ? id : null;
    };

    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const tenantId = tenantIdFrom(session);
                if (!tenantId) break;
                const subscription = session.subscription
                    ? await stripe.subscriptions.retrieve(session.subscription)
                    : null;
                await prisma.tenant.update({
                    where: { id: tenantId },
                    data: {
                        plan: 'PRO',
                        status: 'active',
                        stripeCustomerId: session.customer,
                        stripeSubscriptionId: subscription?.id || session.subscription,
                        currentPeriodEnd: subscription?.current_period_end
                            ? new Date(subscription.current_period_end * 1000)
                            : null,
                    },
                });
                console.log(`Stripe: tenant ${tenantId} upgraded to PRO (checkout.session.completed)`);
                break;
            }
            case 'customer.subscription.created':
            case 'customer.subscription.updated': {
                const sub = event.data.object;
                const tenantId = tenantIdFrom(sub);
                if (!tenantId) break;
                const { plan, status } = planFromSubscription(sub);
                await prisma.tenant.update({
                    where: { id: tenantId },
                    data: {
                        plan,
                        status,
                        stripeSubscriptionId: sub.id,
                        stripeCustomerId: sub.customer,
                        currentPeriodEnd: sub.current_period_end
                            ? new Date(sub.current_period_end * 1000)
                            : null,
                    },
                });
                console.log(`Stripe: tenant ${tenantId} subscription ${sub.status} (${plan})`);
                break;
            }
            case 'customer.subscription.deleted': {
                const sub = event.data.object;
                const tenantId = tenantIdFrom(sub);
                if (!tenantId) break;
                await prisma.tenant.update({
                    where: { id: tenantId },
                    data: {
                        plan: 'FREE',
                        status: 'canceled',
                        stripeSubscriptionId: null,
                        currentPeriodEnd: null,
                    },
                });
                console.log(`Stripe: tenant ${tenantId} subscription canceled`);
                break;
            }
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const tenantId = tenantIdFrom(invoice);
                if (!tenantId) break;
                await prisma.tenant.update({
                    where: { id: tenantId },
                    data: { status: 'past_due' },
                });
                console.log(`Stripe: tenant ${tenantId} payment failed`);
                break;
            }
            default:
                console.log(`Stripe: unhandled event type ${event.type}`);
        }
    } catch (err) {
        console.error('Stripe webhook handler error:', err);
        return res.status(500).json({ success: false, error: 'Webhook handler failed' });
    }

    res.json({ received: true });
});

export default router;
