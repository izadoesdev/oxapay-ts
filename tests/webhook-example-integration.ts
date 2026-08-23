import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createServer } from "node:http";
import { test } from "bun:test";

const exampleName = process.env.OXAPAY_TEST_EXAMPLE;
if (exampleName !== "express" && exampleName !== "fastify" && exampleName !== "hono" && exampleName !== "nextjs-app-router") {
	throw new Error("Set OXAPAY_TEST_EXAMPLE to express, fastify, hono, or nextjs-app-router");
}

const merchantApiKey = "example-runtime-integration-merchant-secret";
process.env.OXAPAY_MERCHANT_API_KEY = merchantApiKey;

const paidInvoice = `{
  "track_id": "track_example_runtime_integration_1",
  "status": "Paid",
  "type": "invoice",
  "amount": 12.5,
  "value": 12.5,
  "sent_value": 12.5,
  "currency": "USDT",
  "date": 1700000000
}`;

const futureInvoice = paidInvoice.replace('"type": "invoice"', '"type": "future_event"');

function signatureFor(body: string): string {
	return createHmac("sha512", merchantApiKey).update(body).digest("hex");
}

type WebhookResponse = Pick<Response, "status" | "text">;
type SendWebhook = (body: string, signature?: string) => Promise<WebhookResponse>;

async function assertWebhookResponses(send: SendWebhook): Promise<void> {
	const valid = await send(paidInvoice);
	assert.equal(valid.status, 200);
	assert.equal(await valid.text(), "ok");

	const invalidSignature = await send(paidInvoice, "0".repeat(128));
	assert.equal(invalidSignature.status, 400);
	assert.equal(await invalidSignature.text(), "Invalid OxaPay webhook");

	const unknownEvent = await send(futureInvoice);
	assert.equal(unknownEvent.status, 400);
	assert.equal(await unknownEvent.text(), "Invalid OxaPay webhook");
}

async function listen(app: Parameters<typeof createServer>[0]): Promise<{ origin: string; close(): Promise<void> }> {
	const server = createServer(app);
	await new Promise<void>((resolve, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", reject);
			resolve();
		});
	});
	const address = server.address();
	if (!address || typeof address === "string") {
		throw new Error("Example test server must have a TCP address");
	}

	return {
		origin: `http://127.0.0.1:${address.port}`,
		close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
	};
}

function requestFor(body: string, signature = signatureFor(body)): Request {
	return new Request("http://localhost/webhooks/oxapay", {
		method: "POST",
		headers: { "content-type": "application/json", hmac: signature },
		body,
	});
}

test(`delivers a signed webhook through the ${exampleName} example source`, async () => {
	if (exampleName === "express") {
		const { createApp } = await import("../examples/webhooks/express/src/app.ts");
		const listener = await listen(createApp({ merchantApiKey }));
		try {
			await assertWebhookResponses((body, signature) => fetch(`${listener.origin}/webhooks/oxapay`, {
				method: "POST",
				headers: { "content-type": "application/json", hmac: signature ?? signatureFor(body) },
				body,
			}));
		} finally {
			await listener.close();
		}
		return;
	}

	if (exampleName === "fastify") {
		const { createApp } = await import("../examples/webhooks/fastify/src/app.ts");
		const app = createApp({ merchantApiKey });
		await app.ready();
		try {
			await assertWebhookResponses(async (body, signature) => {
				const response = await app.inject({
					method: "POST",
					url: "/webhooks/oxapay",
					headers: { "content-type": "application/json", hmac: signature ?? signatureFor(body) },
					payload: body,
				});
				return { status: response.statusCode, text: async () => response.body };
			});
		} finally {
			await app.close();
		}
		return;
	}

	if (exampleName === "hono") {
		const { createApp } = await import("../examples/webhooks/hono/src/app.ts");
		const app = createApp({ merchantApiKey });
		await assertWebhookResponses((body, signature) => app.request(requestFor(body, signature)));
		return;
	}

	const { POST } = await import("../examples/webhooks/nextjs-app-router/app/api/webhooks/oxapay/route.ts");
	await assertWebhookResponses((body, signature) => POST(requestFor(body, signature)));
});
