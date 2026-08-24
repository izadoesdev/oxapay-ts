import express from "express";
import { OxaPay } from "oxapay-ts";
import { createWebhookHandler, rawBodyOptions } from "oxapay-ts/express";

export function createApp(merchantApiKey: string) {
  const oxapay = new OxaPay({ merchantApiKey });
  const app = express();

  app.post(
    "/webhooks/oxapay",
    express.raw(rawBodyOptions()),
    createWebhookHandler(oxapay, async ({ data }) => {
      if (data.type === "payout" || data.status !== "Paid") return;
      // Persist idempotently by trackId before returning.
      console.info("Paid OxaPay order", data.trackId);
    }),
  );
  return app;
}
