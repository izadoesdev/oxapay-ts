import { Hono } from "hono";
import { OxaPay } from "oxapay-ts";
import { createWebhookHandler } from "oxapay-ts/hono";

export function createApp(merchantApiKey: string) {
  const oxapay = new OxaPay({ merchantApiKey });
  const app = new Hono();

  app.post(
    "/webhooks/oxapay",
    createWebhookHandler(oxapay, async ({ data }) => {
      if (data.type === "payout" || data.status !== "Paid") return;
      // Persist idempotently by trackId before returning.
      console.info("Paid OxaPay order", data.trackId);
    }),
  );
  return app;
}
