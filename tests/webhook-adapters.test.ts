import { describe, expect, test } from "bun:test";
import { OxaPay, OxaPayConfigurationError } from "../src/index.js";
import { createWebhookHandler as createExpressWebhookHandler, rawBodyOptions } from "../src/express.js";
import { createWebhookPlugin as createFastifyWebhookPlugin } from "../src/fastify.js";
import { createWebhookHandler as createNextjsWebhookHandler } from "../src/nextjs.js";

const body = '{"track_id":"track_1","status":"Paid","type":"invoice","amount":10,"value":10,"sent_value":10,"currency":"USDT","date":1}';

async function signatureFor(value: string, secret = "merchant-secret"): Promise<string> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
	const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
	return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function signedRequest(value = body): Promise<Request> {
	return new Request("https://merchant.example/webhooks/oxapay", {
		method: "POST",
		headers: { "content-type": "application/json", hmac: await signatureFor(value) },
		body: value,
	});
}

function expressResponse() {
	const state: { status?: number; type?: string; body?: unknown } = {};
	const response = {
		headersSent: false,
		status(status: number) {
			state.status = status;
			return response;
		},
		type(type: string) {
			state.type = type;
			return response;
		},
		send(value?: unknown) {
			state.body = value;
			response.headersSent = true;
		},
	};
	return { response, state };
}

describe("OxaPay webhook adapters", () => {
	test("protects Fetch request bytes and limits", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		let calls = 0;
		const limited = createNextjsWebhookHandler(api, async () => {
			calls += 1;
		}, { bodyLimit: 8 });
		const oversized = await limited(await signedRequest("this body is too large"));
		expect(oversized.status).toBe(413);
		expect(calls).toBe(0);

		const unsigned = new Request("https://merchant.example/webhooks/oxapay", { method: "POST", body });
		expect((await createNextjsWebhookHandler(api, async () => undefined)(unsigned)).status).toBe(400);
		expect(unsigned.bodyUsed).toBe(false);

		const consumed = await signedRequest();
		await consumed.text();
		await expect(createNextjsWebhookHandler(api, async () => undefined)(consumed)).rejects.toBeInstanceOf(OxaPayConfigurationError);
		expect(() => createNextjsWebhookHandler(api, async () => undefined, { bodyLimit: 0 })).toThrow(OxaPayConfigurationError);
	});

	test("rejects signed events outside OxaPay's documented shapes", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		const future = '{"type":"subscription_renewed","subscription_id":"sub_1"}';
		const response = await createNextjsWebhookHandler(api, async () => undefined)(await signedRequest(future));
		expect(response.status).toBe(400);
	});

	test("does not acknowledge failed work and forwards explicit responses", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		await expect(createNextjsWebhookHandler(api, async () => {
			throw new Error("persistence unavailable");
		})(await signedRequest())).rejects.toThrow("persistence unavailable");

		const response = await createNextjsWebhookHandler(api, async () => new Response("retry later", { status: 503 }))(await signedRequest());
		expect(response.status).toBe(503);
		expect(await response.text()).toBe("retry later");
	});

	test("requires Express raw middleware instead of reserializing JSON", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		const signature = await signatureFor(body);
		const valid = expressResponse();
		await createExpressWebhookHandler(api, async () => undefined)(
			{ body: new TextEncoder().encode(body), get: (name) => name.toLowerCase() === "hmac" ? signature : undefined },
			valid.response,
			(error) => { throw error; },
		);
		expect(valid.state).toEqual({ status: 200, type: "text/plain", body: "ok" });
		expect(rawBodyOptions()).toEqual({ type: "application/json", inflate: false, limit: 1_048_576 });

		const invalid = expressResponse();
		const errors: unknown[] = [];
		await createExpressWebhookHandler(api, async () => undefined)(
			{ body: { type: "invoice" }, headers: { hmac: signature } },
			invalid.response,
			(error) => errors.push(error),
		);
		expect(errors[0]).toBeInstanceOf(OxaPayConfigurationError);
	});

	test("registers a scoped Fastify raw parser", () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		let parser: ((request: unknown, value: Uint8Array, done: (error: Error | null, parsed?: unknown) => void) => void) | undefined;
		let parserOptions: unknown;
		let routePath: string | undefined;
		createFastifyWebhookPlugin(api, { path: "/webhooks/oxapay", onEvent: async () => undefined })({
			addContentTypeParser(_contentType, options, callback) {
				parserOptions = options;
				parser = callback as typeof parser;
			},
			post(path) {
				routePath = path;
			},
		});
		expect(routePath).toBe("/webhooks/oxapay");
		expect(parserOptions).toEqual({ parseAs: "buffer", bodyLimit: 1_048_576 });
		const parsed: unknown[] = [];
		parser?.({}, new TextEncoder().encode(body), (error, value) => parsed.push(error, value));
		expect(parsed).toEqual([null, new TextEncoder().encode(body)]);
	});
});
