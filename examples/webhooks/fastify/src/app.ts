import Fastify from "fastify";
import { OxaPay, type KnownOxaPayWebhookEvent, type VerifiedWebhook } from "oxapay-ts";
import { createWebhookPlugin } from "oxapay-ts/fastify";

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

    // Throw on failed durable work. Fastify then returns a retryable 500 instead
    // of acknowledging the callback.
    console.info("Recording paid OxaPay order", {
      trackId: data.trackId,
      orderId: data.orderId,
      amount: data.amount,
      currency: data.currency,
    });
    handledTrackIds.add(data.trackId);
  }

  const fastify = Fastify({ logger: true });

  fastify.register(
    createWebhookPlugin(oxapay, {
      path: "/webhooks/oxapay",
      eventValidation: "known",
      onEvent: recordPaidPayment,
    }),
  );

  fastify.get("/healthz", async () => ({ ok: true }));

  return fastify;
}
