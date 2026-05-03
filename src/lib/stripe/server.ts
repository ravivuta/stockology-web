import Stripe from "stripe";

function requiredEnv(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

let cachedStripe: Stripe | null = null;

export function getStripe() {
  if (cachedStripe) return cachedStripe;
  cachedStripe = new Stripe(requiredEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2026-04-22.dahlia",
  });
  return cachedStripe;
}

export function getStripePriceId() {
  return requiredEnv("STRIPE_PRICE_ID");
}

export function getStripeWebhookSecret() {
  return requiredEnv("STRIPE_WEBHOOK_SECRET");
}
