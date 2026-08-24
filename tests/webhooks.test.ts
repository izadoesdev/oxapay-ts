import { describe, expect, test } from "bun:test";
import {
	OxaPayWebhookParseError,
	OxaPayWebhookSignatureError,
} from "../src/index.js";
import {
	parseAndVerifyKnownWebhook,
	parseAndVerifyWebhook,
	verifyWebhookSignature,
} from "../src/webhooks.js";

async function signatureFor(body: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
	const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
	return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("OxaPay webhooks", () => {
	test("verifies the exact raw body before decoding it", async () => {
		const body = '{"track_id":"track_1","status":"Paid","type":"invoice","amount":10,"currency":"USDT","date":1}';
		const signature = await signatureFor(body, "merchant-secret");

		await expect(verifyWebhookSignature(body, { signature, merchantApiKey: "merchant-secret" })).resolves.toEqual({
			valid: true,
			verifiedWith: "merchant",
		});
		const event = await parseAndVerifyWebhook(body, { signature, merchantApiKey: "merchant-secret" });
		expect(event.verifiedWith).toBe("merchant");
		expect(event.data).toMatchObject({ trackId: "track_1", status: "Paid", type: "invoice" });
	});

	test("never selects a webhook key from unverified JSON and rejects tampering", async () => {
		const body = '{"track_id":"track_1","status":"Confirmed","type":"payout","amount":10,"currency":"USDT","date":1}';
		const signature = await signatureFor(body, "payout-secret");

		await expect(
			verifyWebhookSignature(body, {
				signature,
				merchantApiKey: "merchant-secret",
				payoutApiKey: "payout-secret",
			}),
		).resolves.toEqual({ valid: true, verifiedWith: "payout" });
		await expect(
			parseAndVerifyWebhook(`${body} `, { signature, merchantApiKey: "merchant-secret", payoutApiKey: "payout-secret" }),
		).rejects.toBeInstanceOf(OxaPayWebhookSignatureError);
	});

	test("offers an explicit low-level parser for documented callback shapes", async () => {
		const body = '{"track_id":"track_1","status":"Paid","type":"invoice","amount":10,"value":10,"sent_value":10,"currency":"USDT","date":1}';
		const signature = await signatureFor(body, "merchant-secret");

		await expect(parseAndVerifyKnownWebhook(body, { signature, merchantApiKey: "merchant-secret" })).resolves.toMatchObject({
			data: { trackId: "track_1", type: "invoice" },
			verifiedWith: "merchant",
		});

		const malformed = '{"track_id":"track_1","status":"Paid","type":"invoice"}';
		const malformedSignature = await signatureFor(malformed, "merchant-secret");
		await expect(
			parseAndVerifyKnownWebhook(malformed, { signature: malformedSignature, merchantApiKey: "merchant-secret" }),
		).rejects.toBeInstanceOf(OxaPayWebhookParseError);

		const unknownType = '{"track_id":"track_1","status":"Paid","type":"future_event","amount":10,"value":10,"sent_value":10,"currency":"USDT","date":1}';
		const unknownTypeSignature = await signatureFor(unknownType, "merchant-secret");
		await expect(
			parseAndVerifyKnownWebhook(unknownType, { signature: unknownTypeSignature, merchantApiKey: "merchant-secret" }),
		).rejects.toBeInstanceOf(OxaPayWebhookParseError);

		const payoutSignedMerchant = await signatureFor(body, "payout-secret");
		await expect(
			parseAndVerifyKnownWebhook(body, {
				signature: payoutSignedMerchant,
				merchantApiKey: "merchant-secret",
				payoutApiKey: "payout-secret",
			}),
		).rejects.toBeInstanceOf(OxaPayWebhookParseError);
	});
});
