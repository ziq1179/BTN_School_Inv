import Stripe from 'stripe';

// Stripe client. Returns null when the secret key isn't configured — billing
// endpoints then answer 503 instead of crashing the app (local dev without keys).
const key = process.env.STRIPE_SECRET_KEY;
export const stripe = key ? new Stripe(key) : null;

export const STRIPE_PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || null;
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || null;

export function billingConfigured() {
  return Boolean(stripe && STRIPE_PRO_PRICE_ID);
}
