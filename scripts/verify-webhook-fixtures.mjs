import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const fixtureSecret = "fixture-only-secret-not-an-oxapay-api-key";

const webhookFixtures = [
	{
		file: "merchant-invoice-paid.json",
		verifiedWith: "merchant",
		type: "invoice",
		status: "Paid",
	},
	{
		file: "payout-confirmed.json",
		verifiedWith: "payout",
		type: "payout",
		status: "Confirmed",
	},
];

function fixtureUrl(file) {
	return new URL(`../fixtures/webhooks/${file}`, import.meta.url);
}

function signatureFor(bytes) {
	return createHmac("sha512", fixtureSecret).update(bytes).digest("hex");
}

/**
 * Validates synthetic, documented callback bodies against the SDK's strict
 * parser. The signature is generated locally for the exact stored bytes; no
 * credential or network request is involved.
 */
export async function verifyWebhookFixtures({
	parseAndVerifyKnownWebhook,
	write = (message) => console.log(message),
} = {}) {
	if (!parseAndVerifyKnownWebhook) {
		throw new TypeError("parseAndVerifyKnownWebhook is required");
	}

	for (const fixture of webhookFixtures) {
		const rawBody = await readFile(fixtureUrl(fixture.file));
		const event = await parseAndVerifyKnownWebhook(rawBody, {
			signature: signatureFor(rawBody),
			[fixture.verifiedWith === "merchant" ? "merchantApiKey" : "payoutApiKey"]: fixtureSecret,
		});
		if (
			event.verifiedWith !== fixture.verifiedWith ||
			event.data.type !== fixture.type ||
			event.data.status !== fixture.status
		) {
			throw new Error(`Webhook fixture ${fixture.file} did not match its expected verified event`);
		}
	}

	write(`Verified ${webhookFixtures.length} local OxaPay webhook fixtures (no network request made).`);
	return webhookFixtures.length;
}

async function main() {
const { parseAndVerifyKnownWebhook } = await import("../dist/webhooks.js");
	await verifyWebhookFixtures({ parseAndVerifyKnownWebhook });
}

function isExecutedDirectly() {
	return process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isExecutedDirectly()) {
	main().catch((error) => {
		console.error("OxaPay webhook fixture verification failed.", error);
		process.exitCode = 1;
	});
}
