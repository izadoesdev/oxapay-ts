import express, { type ErrorRequestHandler } from "express";
import { OxaPay, type KnownOxaPayWebhookEvent, type VerifiedWebhook } from "oxapay-ts";
import { createWebhookHandler, rawBodyOptions } from "oxapay-ts/express";

export interface CreateAppOptions {
  merchantApiKey: string;
}

export function createApp({ merchantApiKey }: CreateAppOptions) {
  const oxapay = new OxaPay({ merchantApiKey });

  // Demo-only duplicate visibility. Use a database uniqueness constraint on
  // `trackId` in production, inside the transaction that fulfills the order.
  const handledTrackIds = new Set<string>();

  async function recordPaidPayment(event: VerifiedWebhook<KnownOxaPayWebhookEvent>): Promise<void> {
    const { data } = event;
    if (data.type === "payout" || data.status !== "Paid") return;
    if (handledTrackIds.has(data.trackId)) return;

    // Replace this with durable, idempotent work. A thrown error reaches the
    // error middleware below, which returns a retryable 500 rather than "ok".
    console.info("Recording paid OxaPay order", {
      trackId: data.trackId,
      orderId: data.orderId,
      amount: data.amount,
      currency: data.currency,
    });
    handledTrackIds.add(data.trackId);
  }

  const app = express();

  app.post(
    "/webhooks/oxapay",
    // This must be route-local and registered before express.json().
    express.raw(rawBodyOptions()),
    createWebhookHandler(oxapay, recordPaidPayment, {
      eventValidation: "known",
    }),
  );

  // Other application routes can safely use parsed JSON after the webhook route.
  app.use(express.json());
  app.get("/healthz", (_request, response) => response.json({ ok: true }));

  const webhookErrorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
    console.error("OxaPay webhook processing failed", error);
    response.status(500).type("text/plain").send("Webhook processing failed");
  };
  app.use(webhookErrorHandler);

  return app;
}
