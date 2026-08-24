import { OxaPay } from "oxapay-ts";
import { createWebhookHandler } from "oxapay-ts/nextjs";

const merchantApiKey = process.env.OXAPAY_MERCHANT_API_KEY?.trim();
if (!merchantApiKey) throw new Error("Missing OXAPAY_MERCHANT_API_KEY");

const oxapay = new OxaPay({ merchantApiKey });

export const runtime = "nodejs";

export const POST = createWebhookHandler(oxapay, async ({ data }) => {
  if (data.type === "payout" || data.status !== "Paid") return;
  // Persist idempotently by trackId before returning.
  console.info("Paid OxaPay order", data.trackId);
});
