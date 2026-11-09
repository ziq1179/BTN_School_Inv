// Plan definitions and limit enforcement for the SaaS tiers.
export const PLANS = Object.freeze({
  FREE: {
    name: 'Free',
    maxItems: 50,
    maxUsers: 3,
    ai: false,
    priceCents: 0,
  },
  PRO: {
    name: 'Pro',
    maxItems: Infinity,
    maxUsers: Infinity,
    ai: true,
    priceCents: 2900, // USD $29/mo — adjust in Stripe product price
  },
});

export function planName(code) {
  return (PLANS[code] || PLANS.FREE).name;
}

export function getPlan(tenant) {
  return PLANS[tenant?.plan] || PLANS.FREE;
}

// Load the tenant fresh from DB (plan/status can change via Stripe webhook at any time)
export async function loadTenant(prisma, tenantId) {
  return prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true, name: true, slug: true, plan: true, status: true,
      stripeCustomerId: true, currentPeriodEnd: true,
    },
  });
}
