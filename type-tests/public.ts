import * as rootSdk from "oxapay-ts";
import { OxaPay, routes, type OxaPayJsonObject } from "oxapay-ts";
import { createWebhookHandler as createExpressWebhookHandler, rawBodyOptions } from "oxapay-ts/express";
import { createWebhookHandler as createFetchWebhookHandler } from "oxapay-ts/fetch";
import { createWebhookPlugin } from "oxapay-ts/fastify";
import { createWebhookHandler as createHonoWebhookHandler } from "oxapay-ts/hono";
import { createWebhookHandler as createNextjsWebhookHandler } from "oxapay-ts/nextjs";
import { parseAndVerifyKnownWebhook } from "oxapay-ts/webhooks";

const oxapay = new OxaPay({ merchantApiKey: "merchant-secret" });
const body = { amount: 10, metadata: { orderId: "order_1" } } satisfies OxaPayJsonObject;

oxapay.client.request<{ status: boolean }>(routes.common.monitor);
oxapay.payment.createInvoice({ amount: 10, callbackUrl: "https://merchant.example/oxapay" });
oxapay.client.request({ method: "POST", path: "/custom", auth: "merchant" }, { body });
// @ts-expect-error named inputs reject misspelled API fields
oxapay.payment.createInvoice({ amount: 10, callbakUrl: "https://merchant.example/oxapay" });

createFetchWebhookHandler(oxapay, (event) => {
	const trackId: string = event.data.trackId;
	void trackId;
});
createNextjsWebhookHandler(oxapay, (event) => void event.data.trackId);
createExpressWebhookHandler(oxapay, (event) => void event.data.trackId);
createWebhookPlugin(oxapay, { path: "/webhooks/oxapay", onEvent: (event) => void event.data.trackId });
createHonoWebhookHandler(oxapay, (event) => void event.data.trackId);
rawBodyOptions({ bodyLimit: 1_024 });
void parseAndVerifyKnownWebhook;

// @ts-expect-error raw helpers belong at oxapay-ts/webhooks
void rootSdk.parseAndVerifyWebhook;
// @ts-expect-error framework adapters do not hang off the SDK instance
void oxapay.webhooks;
