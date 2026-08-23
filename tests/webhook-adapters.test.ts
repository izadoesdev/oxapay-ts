import { describe, expect, test } from "bun:test";
import { OxaPay, OxaPayConfigurationError } from "../src/index.js";
import { createWebhookHandler as createExpressWebhookHandler, rawBodyOptions } from "../src/express.js";
import { createWebhookPlugin as createFastifyWebhookPlugin } from "../src/fastify.js";
import { createWebhookHandler as createHonoWebhookHandler } from "../src/hono.js";
import { createWebhookHandler as createNextjsWebhookHandler } from "../src/nextjs.js";

const body = '{"track_id":"track_1","status":"Paid","type":"invoice","amount":10,"value":10,"sent_value":10,"currency":"USDT","date":1}';

async function signatureFor(value: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
	const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
	return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function signedRequest(value = body, secret = "merchant-secret"): Promise<Request> {
	return signatureFor(value, secret).then((signature) => new Request("https://merchant.example/webhooks/oxapay", {
		method: "POST",
		headers: { "content-type": "application/json", hmac: signature },
		body: value,
	}));
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

function fastifyReply() {
	const state: { status?: number; type?: string; body?: unknown } = {};
	const reply = {
		sent: false,
		code(status: number) {
			state.status = status;
			return reply;
		},
		type(type: string) {
			state.type = type;
			return reply;
		},
		send(value?: unknown) {
			state.body = value;
			reply.sent = true;
			return reply;
		},
	};
	return { reply, state };
}

describe("OxaPay webhook adapters", () => {
	test("makes a Next.js/Fetch endpoint a one-line verified handler", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		let receivedTrackId: string | undefined;
		const handler = createNextjsWebhookHandler(api, async (event, request) => {
			receivedTrackId = event.data.trackId;
			expect(request.method).toBe("POST");
			expect(request.bodyUsed).toBe(true);
			expect(new TextDecoder().decode(event.rawBody)).toBe(body);
		});

		const response = await handler(await signedRequest());

		expect(receivedTrackId).toBe("track_1");
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});

	test("rejects an oversized Fetch payload before webhook verification or callback execution", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		let calls = 0;
		const handler = createNextjsWebhookHandler(api, async () => {
			calls += 1;
		}, { bodyLimit: 8 });

		const response = await handler(await signedRequest("this body is too large"));

		expect(response.status).toBe(413);
		expect(await response.text()).toBe("OxaPay webhook payload is too large");
		expect(calls).toBe(0);
	});

	test("does not consume a Fetch body when its HMAC header is absent", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		const request = new Request("https://merchant.example/webhooks/oxapay", { method: "POST", body });
		const handler = createNextjsWebhookHandler(api, async () => undefined);

		const response = await handler(request);
		expect(response.status).toBe(400);
		expect(request.bodyUsed).toBe(false);
	});

	test("rejects invalid Fetch body-limit configuration when creating the endpoint", () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });

		expect(() => createNextjsWebhookHandler(api, async () => undefined, { bodyLimit: 0 })).toThrow(
			OxaPayConfigurationError,
		);
		expect(() => createNextjsWebhookHandler(api, async () => undefined, { eventValidation: "future" as never })).toThrow(
			OxaPayConfigurationError,
		);
	});

	test("returns 400 before the Fetch handler runs when the signature is invalid", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		let calls = 0;
		const handler = createNextjsWebhookHandler(api, async () => {
			calls += 1;
		});

		const response = await handler(new Request("https://merchant.example/webhooks/oxapay", {
			method: "POST",
			headers: { hmac: "0".repeat(128) },
			body,
		}));

		expect(response.status).toBe(400);
		expect(await response.text()).toBe("Invalid OxaPay webhook");
		expect(calls).toBe(0);
	});

	test("returns 400 before the Fetch handler runs when a validly signed payload is not JSON", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		let calls = 0;
		const handler = createNextjsWebhookHandler(api, async () => {
			calls += 1;
		});

		const response = await handler(await signedRequest("not-json"));

		expect(response.status).toBe(400);
		expect(calls).toBe(0);
	});

	test("rejects signed payloads that do not satisfy the default documented event contract", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		let calls = 0;
		const handler = createNextjsWebhookHandler(api, async () => {
			calls += 1;
		});

		const malformed = '{"track_id":"track_1","status":"Paid","type":"invoice"}';
		const response = await handler(await signedRequest(malformed));

		expect(response.status).toBe(400);
		expect(calls).toBe(0);
	});

	test("keeps future event types available behind explicit passthrough validation", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		const future = '{"type":"subscription_renewed","subscription_id":"sub_1"}';
		let receivedType: string | undefined;

		const strict = createNextjsWebhookHandler(api, async () => {
			throw new Error("strict handler must not run");
		});
		const strictResponse = await strict(await signedRequest(future));
		expect(strictResponse.status).toBe(400);

		const handler = createNextjsWebhookHandler(api, async (event) => {
			receivedType = event.data.type;
		}, { eventValidation: "passthrough" });
		const response = await handler(await signedRequest(future));

		expect(receivedType).toBe("subscription_renewed");
		expect(response.status).toBe(200);
	});

	test("does not let a verified payout key impersonate a merchant callback", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret", payoutApiKey: "payout-secret" });
		let calls = 0;
		const handler = createNextjsWebhookHandler(api, async () => {
			calls += 1;
		});

		const response = await handler(await signedRequest(body, "payout-secret"));

		expect(response.status).toBe(400);
		expect(calls).toBe(0);
	});

	test("does not acknowledge a Fetch webhook when application handling fails", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		const handler = createNextjsWebhookHandler(api, async () => {
			throw new Error("persistence unavailable");
		});

		await expect(handler(await signedRequest())).rejects.toThrow("persistence unavailable");
	});

	test("forwards an explicit Fetch handler response instead of replacing it with an acknowledgement", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		const handler = createNextjsWebhookHandler(api, async () => new Response("retry later", { status: 503 }));

		const response = await handler(await signedRequest());

		expect(response.status).toBe(503);
		expect(await response.text()).toBe("retry later");
	});

	test("reports a consumed Fetch body as a configuration error", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		const request = await signedRequest();
		await request.text();

		await expect(createNextjsWebhookHandler(api, async () => undefined)(request)).rejects.toBeInstanceOf(
			OxaPayConfigurationError,
		);
	});

	test("adapts Express raw middleware and routes configuration failures to next", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		const signature = await signatureFor(body, "merchant-secret");
		const { response, state } = expressResponse();
		const errors: unknown[] = [];
		let receivedTrackId: string | undefined;

		await createExpressWebhookHandler(api, async (event) => {
			receivedTrackId = event.data.trackId;
		})(
			{ body: new TextEncoder().encode(body), get: (name) => name.toLowerCase() === "hmac" ? signature : undefined },
			response,
			(error) => errors.push(error),
		);

		expect(receivedTrackId).toBe("track_1");
		expect(state).toEqual({ status: 200, type: "text/plain", body: "ok" });
		expect(errors).toEqual([]);
		expect(rawBodyOptions()).toEqual({ type: "application/json", inflate: false, limit: 1_048_576 });
		expect(rawBodyOptions({ bodyLimit: 8 })).toEqual({ type: "application/json", inflate: false, limit: 8 });
		expect(() => rawBodyOptions({ bodyLimit: 0 })).toThrow(OxaPayConfigurationError);

		const misconfigured = expressResponse();
		await createExpressWebhookHandler(api, async () => undefined)(
			{ body: { type: "invoice" }, headers: { hmac: signature } },
			misconfigured.response,
			(error) => errors.push(error),
		);

		expect(errors).toHaveLength(1);
		expect(errors[0]).toBeInstanceOf(OxaPayConfigurationError);
	});

	test("adapts Hono's raw Fetch Request", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		let contextSeen = false;
		const handler = createHonoWebhookHandler(api, async (event, context) => {
			contextSeen = context.req.raw.method === "POST";
			expect(event.verifiedWith).toBe("merchant");
		});

		const response = await handler({ req: { raw: await signedRequest() } });

		expect(contextSeen).toBe(true);
		expect(response.status).toBe(200);
		expect(await response.text()).toBe("ok");
	});

	test("creates a scoped Fastify plugin that preserves raw JSON bytes", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		const signature = await signatureFor(body, "merchant-secret");
		let parser: ((request: unknown, value: Uint8Array, done: (error: Error | null, parsed?: unknown) => void) => void) | undefined;
		let route: ((request: { headers: Record<string, string>; body: unknown }, reply: ReturnType<typeof fastifyReply>["reply"]) => Promise<unknown>) | undefined;
		let parserOptions: unknown;
		let routePath: string | undefined;
		let receivedTrackId: string | undefined;

		const plugin = createFastifyWebhookPlugin(api, {
			path: "/webhooks/oxapay",
			onEvent: async (event) => {
				receivedTrackId = event.data.trackId;
			},
		});
		plugin({
			addContentTypeParser(_contentType, options, callback) {
				parserOptions = options;
				parser = callback as typeof parser;
			},
			post(path, callback) {
				routePath = path;
				route = callback as typeof route;
			},
		});

		expect(routePath).toBe("/webhooks/oxapay");
		expect(parserOptions).toEqual({ parseAs: "buffer", bodyLimit: 1_048_576 });
		const parsed: unknown[] = [];
		parser?.({}, new TextEncoder().encode(body), (error, value) => parsed.push(error, value));
		expect(parsed).toEqual([null, new TextEncoder().encode(body)]);

		const success = fastifyReply();
		await route?.({ headers: { hmac: signature }, body: new TextEncoder().encode(body) }, success.reply);
		expect(receivedTrackId).toBe("track_1");
		expect(success.state).toEqual({ status: 200, type: "text/plain", body: "ok" });

		const invalid = fastifyReply();
		await route?.({ headers: { hmac: "0".repeat(128) }, body: new TextEncoder().encode(body) }, invalid.reply);
		expect(invalid.state).toEqual({ status: 400, type: "text/plain", body: "Invalid OxaPay webhook" });
	});

	test("preserves a Fastify handler return value instead of replacing it with ok", async () => {
		const api = new OxaPay({ merchantApiKey: "merchant-secret" });
		const signature = await signatureFor(body, "merchant-secret");
		let route: ((request: { headers: Record<string, string>; body: unknown }, reply: ReturnType<typeof fastifyReply>["reply"]) => Promise<unknown>) | undefined;

		createFastifyWebhookPlugin(api, {
			path: "/webhooks/oxapay",
			onEvent: async () => ({ accepted: true }),
		})({
			addContentTypeParser() {
				return undefined;
			},
			post(_path, callback) {
				route = callback as typeof route;
			},
		});

		const custom = fastifyReply();
		await expect(route?.({ headers: { hmac: signature }, body: new TextEncoder().encode(body) }, custom.reply)).resolves.toEqual({
			accepted: true,
		});
		expect(custom.state).toEqual({});
	});
});
