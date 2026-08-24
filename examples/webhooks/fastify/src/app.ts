import Fastify from "fastify";
import { OxaPay } from "oxapay-ts";
import { createWebhookPlugin } from "oxapay-ts/fastify";

export function createApp(merchantApiKey: string) {
  const oxapay = new OxaPay({ merchantApiKey });
  const fastify = Fastify();

  fastify.register(
    createWebhookPlugin(oxapay, {
      path: "/webhooks/oxapay",
      onEvent: async ({ data }) => {
        if (data.type === "payout" || data.status !== "Paid") return;
        // Persist idempotently by trackId before returning.
        console.info("Paid OxaPay order", data.trackId);
      },
    }),
  );
  return fastify;
}
