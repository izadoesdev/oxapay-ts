import { describe, expect, test } from "bun:test";
import { parseAndVerifyKnownWebhook } from "../src/webhooks.js";
import { runSandboxSmoke, sandboxSmokeStatus } from "../scripts/sandbox-smoke.mjs";
import { verifyWebhookFixtures } from "../scripts/verify-webhook-fixtures.mjs";

describe("sandbox workflow", () => {
	test("validates the local webhook fixtures without credentials or a network request", async () => {
		const output: string[] = [];
		await expect(verifyWebhookFixtures({ parseAndVerifyKnownWebhook, write: (message) => output.push(message) })).resolves.toBe(2);
		expect(output).toEqual(["Verified 2 local OxaPay webhook fixtures (no network request made)."]);
	});

	test("never loads the SDK when sandbox execution was not explicitly enabled", async () => {
		let loaded = false;
		const output: string[] = [];

		const result = await runSandboxSmoke({
			environment: { OXAPAY_MERCHANT_API_KEY: "production-key-must-be-ignored" },
			loadSdk: async () => {
				loaded = true;
				throw new Error("must not load the SDK");
			},
			write: (message) => output.push(message),
			writeError: (message) => output.push(message),
		});

		expect(result).toEqual({ executed: false, exitCode: 0 });
		expect(loaded).toBe(false);
		expect(output[0]).toContain("No network call will be made");
	});

	test("fails closed when execution is enabled without the dedicated sandbox key", async () => {
		let loaded = false;
		const result = await runSandboxSmoke({
			environment: { OXAPAY_RUN_SANDBOX_SMOKE: "1", OXAPAY_MERCHANT_API_KEY: "production-key-must-be-ignored" },
			loadSdk: async () => {
				loaded = true;
				throw new Error("must not load the SDK");
			},
			write: () => undefined,
			writeError: () => undefined,
		});

		expect(result).toEqual({ executed: false, exitCode: 1 });
		expect(loaded).toBe(false);
		expect(sandboxSmokeStatus({ OXAPAY_RUN_SANDBOX_SMOKE: "1" }).message).toContain(
			"OXAPAY_SANDBOX_MERCHANT_API_KEY",
		);
	});

	test("fails closed before importing the SDK when the optional callback URL is unsafe", async () => {
		let loaded = false;
		const result = await runSandboxSmoke({
			environment: {
				OXAPAY_RUN_SANDBOX_SMOKE: "1",
				OXAPAY_SANDBOX_MERCHANT_API_KEY: "sandbox-key",
				OXAPAY_SANDBOX_CALLBACK_URL: "http://localhost:3000/webhooks/oxapay",
			},
			loadSdk: async () => {
				loaded = true;
				throw new Error("must not load the SDK");
			},
			write: () => undefined,
			writeError: () => undefined,
		});

		expect(result).toEqual({ executed: false, exitCode: 1 });
		expect(loaded).toBe(false);
	});

	test("creates exactly one sandbox invoice after explicit opt-in", async () => {
		let clientOptions: unknown;
		let requestInput: unknown;
		let requestOptions: unknown;
		class FakeOxaPay {
			payment = {
				createInvoice: async (input: unknown, options: unknown) => {
					requestInput = input;
					requestOptions = options;
					return { data: { trackId: "sandbox-track", expiredAt: 1_700_000_000, paymentUrl: "https://example.test/pay" } };
				},
			};

			constructor(options: unknown) {
				clientOptions = options;
			}
		}

		const output: string[] = [];
		const result = await runSandboxSmoke({
			environment: { OXAPAY_RUN_SANDBOX_SMOKE: "1", OXAPAY_SANDBOX_MERCHANT_API_KEY: "sandbox-key" },
			loadSdk: async () => ({ OxaPay: FakeOxaPay }),
			now: () => 1_700_000_000_000,
			randomId: () => "0123456789abcdef0123456789abcdef",
			write: (message) => output.push(message),
			writeError: (message) => output.push(message),
		});

		expect(clientOptions).toEqual({ merchantApiKey: "sandbox-key", retry: false, timeoutMs: 15_000 });
		expect(requestInput).toEqual({
			amount: 5,
			currency: "USD",
			sandbox: true,
			orderId: "oxapay-smoke-loyw3v28-0123456789abcdef",
		});
		expect((requestInput as { orderId: string }).orderId.length).toBeLessThanOrEqual(50);
		expect(requestOptions).toEqual({ retry: false, timeoutMs: 15_000 });
		expect(result).toMatchObject({ executed: true, exitCode: 0, invoice: { trackId: "sandbox-track" } });
		expect(output).toEqual(["Sandbox invoice created: trackId=sandbox-track, expiresAt=1700000000"]);
	});

	test("adds an explicitly configured HTTPS callback URL to the sandbox invoice", async () => {
		let requestInput: unknown;
		class FakeOxaPay {
			payment = {
				createInvoice: async (input: unknown) => {
					requestInput = input;
					return { data: { trackId: "sandbox-track", expiredAt: 1_700_000_000 } };
				},
			};
		}

		await runSandboxSmoke({
			environment: {
				OXAPAY_RUN_SANDBOX_SMOKE: "1",
				OXAPAY_SANDBOX_MERCHANT_API_KEY: "sandbox-key",
				OXAPAY_SANDBOX_CALLBACK_URL: "https://tunnel.example/webhooks/oxapay",
			},
			loadSdk: async () => ({ OxaPay: FakeOxaPay }),
			write: () => undefined,
			writeError: () => undefined,
		});

		expect(requestInput).toMatchObject({ callbackUrl: "https://tunnel.example/webhooks/oxapay" });
	});
});
