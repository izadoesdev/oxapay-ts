import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";

// These imports intentionally resolve through package.json exports into dist/.
import * as rootSdk from "oxapay-ts";
import { OxaPay } from "oxapay-ts";
import { createWebhookHandler as createExpressWebhookHandler } from "oxapay-ts/express";
import { createWebhookHandler as createFetchWebhookHandler } from "oxapay-ts/fetch";
import { createWebhookPlugin } from "oxapay-ts/fastify";
import { createWebhookHandler as createHonoWebhookHandler } from "oxapay-ts/hono";
import { createWebhookHandler as createNextjsWebhookHandler } from "oxapay-ts/nextjs";
import * as webhookSdk from "oxapay-ts/webhooks";

test("runs the emitted client and every public entrypoint", async (t) => {
	assert.equal(typeof OxaPay, "function");
	assert.equal("parseAndVerifyWebhook" in rootSdk, false);
	for (const internalExport of ["AccountResource", "CommonResource", "OXAPAY_DEFAULT_BASE_URL", "PaymentResource", "PayoutResource", "SwapResource"]) {
		assert.equal(internalExport in rootSdk, false);
	}
	assert.equal("webhooks" in new OxaPay(), false);
	assert.deepEqual(Object.keys(webhookSdk).sort(), ["parseAndVerifyKnownWebhook", "parseAndVerifyWebhook", "verifyWebhookSignature"]);
	for (const entrypoint of [createExpressWebhookHandler, createFetchWebhookHandler, createWebhookPlugin, createHonoWebhookHandler, createNextjsWebhookHandler]) {
		assert.equal(typeof entrypoint, "function");
	}

	let received;
	const server = createServer((request, response) => {
		const chunks = [];
		request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
		request.once("end", () => {
			received = {
				method: request.method,
				path: request.url,
				merchantApiKey: request.headers.merchant_api_key,
				body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
			};
			response.end(JSON.stringify({
				data: { track_id: "track_from_local_server", payment_url: "https://pay.example.test/invoice", expired_at: 1_700_000_060, date: 1_700_000_000 },
				message: "ok",
				error: null,
				status: 200,
				version: "1",
			}));
		});
	});
	await new Promise((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => resolve());
	});
	t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
	const address = server.address();
	assert.ok(address && typeof address !== "string");

	const invoice = await new OxaPay({
		merchantApiKey: "integration-merchant-secret",
		baseUrl: `http://127.0.0.1:${address.port}/v1`,
		retry: false,
	}).payment.createInvoice({
		amount: 12.5,
		callbackUrl: "https://merchant.example.test/webhooks/oxapay",
		mixedPayment: true,
		orderId: "order_integration_1",
	});

	assert.deepEqual(received, {
		method: "POST",
		path: "/v1/payment/invoice",
		merchantApiKey: "integration-merchant-secret",
		body: { amount: 12.5, callback_url: "https://merchant.example.test/webhooks/oxapay", mixed_payment: true, order_id: "order_integration_1" },
	});
	assert.deepEqual(invoice.data, {
		trackId: "track_from_local_server",
		paymentUrl: "https://pay.example.test/invoice",
		expiredAt: 1_700_000_060,
		date: 1_700_000_000,
	});
});
