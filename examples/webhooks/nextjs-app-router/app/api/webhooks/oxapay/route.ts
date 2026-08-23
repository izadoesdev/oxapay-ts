import { OxaPay, type KnownOxaPayWebhookEvent, type VerifiedWebhook } from "oxapay-ts";
import { createWebhookHandler } from "oxapay-ts/nextjs";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const oxapay = new OxaPay({
  merchantApiKey: requiredEnv("OXAPAY_MERCHANT_API_KEY"),
});

// Demo-only duplicate visibility. In production, make `trackId` unique in the
// same database transaction that records or fulfills the order.
const handledTrackIds = new Set<string>();

async function recordPaidPayment(event: VerifiedWebhook<KnownOxaPayWebhookEvent>): Promise<void> {
  const { data } = event;

  // This example accepts merchant payment callbacks only. OxaPay can send
  // "Paying" before "Paid"; do not fulfill an order until it is paid.
  if (data.type === "payout" || data.status !== "Paid") return;
  if (handledTrackIds.has(data.trackId)) return;

  // Replace with durable, idempotent application work. If it throws, the
  // adapter does not acknowledge the callback and OxaPay can retry it.
  console.info("Recording paid OxaPay order", {
    trackId: data.trackId,
    orderId: data.orderId,
    amount: data.amount,
    currency: data.currency,
  });
  handledTrackIds.add(data.trackId);
}

export const runtime = "nodejs";

export const POST = createWebhookHandler(oxapay, recordPaidPayment, {
  // This is the default. Keeping it explicit makes the trust boundary clear.
  eventValidation: "known",
});
