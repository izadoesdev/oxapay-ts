import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { test } from "node:test";

// These self-references deliberately exercise package.json exports, which point
// at dist/. Do not replace them with relative imports from src/.
import { OxaPay } from "oxapay-ts";
import { createWebhookHandler as createFetchWebhookHandler } from "oxapay-ts/fetch";
import { createWebhookHandler as createNextjsWebhookHandler } from "oxapay-ts/nextjs";

const merchantApiKey = "integration-merchant-secret";
const payoutApiKey = "integration-payout-secret";
const [merchantWebhookBody, payoutWebhookBody] = await Promise.all([
	readFile(new URL("../fixtures/webhooks/merchant-invoice-paid.json", import.meta.url)),
	readFile(new URL("../fixtures/webhooks/payout-confirmed.json", import.meta.url)),
]);
const malformedMerchantWebhookBody = Buffer.from(JSON.stringify({
	track_id: "malformed_invoice",
	type: "invoice",
	status: "Paid",
}));
const futureMerchantWebhookBody = Buffer.from(JSON.stringify({
	track_id: "future_invoice",
	type: "future_event",
	status: "Paid",
	amount: 5,
	value: 5,
	sent_value: 5,
	currency: "USDT",
	date: 1_700_000_000,
}));

function envelope(data, status = 200) {
	return { data, message: "ok", error: null, status, version: "1" };
}

function signatureFor(body, apiKey) {
	return createHmac("sha512", apiKey).update(body).digest("hex");
}

function readBody(request) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
		request.once("end", () => resolve(Buffer.concat(chunks)));
		request.once("error", reject);
		request.once("aborted", () => reject(new Error("Request was aborted")));
	});
}

function sendJson(response, body, status = 200) {
	const payload = JSON.stringify(body);
	response.writeHead(status, {
		"content-type": "application/json",
		"content-length": String(Buffer.byteLength(payload)),
	});
	response.end(payload);
}

async function toFetchRequest(request, origin) {
	const rawBody = await readBody(request);
	const headers = new Headers();
	for (const [name, value] of Object.entries(request.headers)) {
		if (Array.isArray(value)) headers.set(name, value.join(", "));
		else if (value !== undefined) headers.set(name, value);
	}

	return new Request(new URL(request.url ?? "/", origin), {
		method: request.method,
		headers,
		...(rawBody.byteLength === 0 ? {} : { body: rawBody }),
	});
}

async function sendFetchResponse(response, fetchResponse) {
	const body = Buffer.from(await fetchResponse.arrayBuffer());
	const headers = Object.fromEntries(fetchResponse.headers);
	if (!("content-length" in headers)) headers["content-length"] = String(body.byteLength);
	response.writeHead(fetchResponse.status, headers);
	response.end(body);
}

async function startServer(t, handler) {
	let origin = "";
	const server = createServer((request, response) => {
		void Promise.resolve(handler(request, response, origin)).catch((error) => {
			if (!response.headersSent) {
				response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
				response.end(error instanceof Error ? error.stack ?? error.message : "Unexpected test server error");
				return;
			}
			response.destroy(error instanceof Error ? error : undefined);
		});
	});

	await new Promise((resolve, reject) => {
		const onError = (error) => {
			server.off("error", onError);
			reject(error);
		};
		server.once("error", onError);
		server.listen(0, "127.0.0.1", () => {
			server.off("error", onError);
			resolve();
		});
	});

	const address = server.address();
	assert.ok(address && typeof address !== "string", "test server must have a TCP address");
	origin = `http://127.0.0.1:${address.port}`;

	t.after(async () => {
		await new Promise((resolve, reject) => {
			server.close((error) => error ? reject(error) : resolve());
			server.closeIdleConnections?.();
		});
	});

	return { origin };
}

async function postWebhook(url, body, signature) {
	return fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json", hmac: signature },
		body,
	});
}

test("uses the emitted public client package against a real local API server", async (t) => {
	let received;
	const apiServer = await startServer(t, async (request, response) => {
		received = {
			method: request.method,
			path: request.url,
			merchantApiKey: request.headers.merchant_api_key,
			body: JSON.parse((await readBody(request)).toString("utf8")),
		};
		sendJson(response, envelope({
			track_id: "track_from_local_server",
			payment_url: "https://pay.example.test/invoice",
			expired_at: 1_700_000_060,
			date: 1_700_000_000,
		}));
	});

	const oxapay = new OxaPay({
		merchantApiKey,
		baseUrl: `${apiServer.origin}/v1`,
		retry: false,
	});
	const invoice = await oxapay.payment.createInvoice({
		amount: 12.5,
		callbackUrl: "https://merchant.example.test/webhooks/oxapay",
		mixedPayment: true,
		orderId: "order_integration_1",
	});

	assert.deepEqual(received, {
		method: "POST",
		path: "/v1/payment/invoice",
		merchantApiKey,
		body: {
			amount: 12.5,
			callback_url: "https://merchant.example.test/webhooks/oxapay",
			mixed_payment: true,
			order_id: "order_integration_1",
		},
	});
	assert.deepEqual(invoice.data, {
		trackId: "track_from_local_server",
		paymentUrl: "https://pay.example.test/invoice",
		expiredAt: 1_700_000_060,
		date: 1_700_000_000,
	});
});

test("delivers and rejects signed webhook fixtures over real HTTP through Fetch and Next.js exports", async (t) => {
	const oxapay = new OxaPay({ merchantApiKey, payoutApiKey });
	const received = [];
	const fetchHandler = createFetchWebhookHandler(oxapay, async (event) => {
		received.push({ adapter: "fetch", trackId: event.data.trackId, type: event.data.type, verifiedWith: event.verifiedWith });
	});
	const nextjsHandler = createNextjsWebhookHandler(oxapay, async (event) => {
		received.push({ adapter: "nextjs", trackId: event.data.trackId, type: event.data.type, verifiedWith: event.verifiedWith });
		return new Response("accepted", { status: 202 });
	});
	let failedAttempts = 0;
	const failingNextjsHandler = createNextjsWebhookHandler(oxapay, async () => {
		failedAttempts += 1;
		throw new Error("persistence unavailable");
	});
	const endpoint = await startServer(t, async (request, response, origin) => {
		const handler = request.url === "/nextjs" ? nextjsHandler : request.url === "/failure" ? failingNextjsHandler : fetchHandler;
		await sendFetchResponse(response, await handler(await toFetchRequest(request, origin)));
	});

	for (const [path, body, apiKey, status, text] of [
		["/fetch", merchantWebhookBody, merchantApiKey, 200, "ok"],
		["/fetch", payoutWebhookBody, payoutApiKey, 200, "ok"],
		["/nextjs", merchantWebhookBody, merchantApiKey, 202, "accepted"],
		["/nextjs", payoutWebhookBody, payoutApiKey, 202, "accepted"],
	]) {
		const response = await postWebhook(`${endpoint.origin}${path}`, body, signatureFor(body, apiKey));
		assert.equal(response.status, status);
		assert.equal(await response.text(), text);
	}

	const malformedResponse = await postWebhook(
		`${endpoint.origin}/nextjs`,
		malformedMerchantWebhookBody,
		signatureFor(malformedMerchantWebhookBody, merchantApiKey),
	);
	assert.equal(malformedResponse.status, 400);
	assert.equal(await malformedResponse.text(), "Invalid OxaPay webhook");

	const futureResponse = await postWebhook(
		`${endpoint.origin}/fetch`,
		futureMerchantWebhookBody,
		signatureFor(futureMerchantWebhookBody, merchantApiKey),
	);
	assert.equal(futureResponse.status, 400);
	assert.equal(await futureResponse.text(), "Invalid OxaPay webhook");

	const invalidResponse = await postWebhook(`${endpoint.origin}/fetch`, merchantWebhookBody, "0".repeat(128));
	assert.equal(invalidResponse.status, 400);
	assert.equal(await invalidResponse.text(), "Invalid OxaPay webhook");

	const failedResponse = await postWebhook(
		`${endpoint.origin}/failure`,
		merchantWebhookBody,
		signatureFor(merchantWebhookBody, merchantApiKey),
	);
	assert.equal(failedResponse.status, 500);
	assert.notEqual(await failedResponse.text(), "ok");
	assert.equal(failedAttempts, 1);
	assert.deepEqual(received, [
		{ adapter: "fetch", trackId: "fixture_invoice_paid_0001", type: "invoice", verifiedWith: "merchant" },
		{ adapter: "fetch", trackId: "fixture_payout_confirmed_0001", type: "payout", verifiedWith: "payout" },
		{ adapter: "nextjs", trackId: "fixture_invoice_paid_0001", type: "invoice", verifiedWith: "merchant" },
		{ adapter: "nextjs", trackId: "fixture_payout_confirmed_0001", type: "payout", verifiedWith: "payout" },
	]);
});
