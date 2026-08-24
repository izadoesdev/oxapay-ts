import { randomUUID } from "node:crypto";

const sandboxKey = process.env.OXAPAY_SANDBOX_MERCHANT_API_KEY?.trim();
const callbackUrl = process.env.OXAPAY_SANDBOX_CALLBACK_URL?.trim();

function checkedCallbackUrl(value) {
	if (!value) return undefined;
	const url = new URL(value);
	if (url.protocol !== "https:" || url.username || url.password) {
		throw new Error("OXAPAY_SANDBOX_CALLBACK_URL must be an HTTPS URL without credentials");
	}
	return url.toString();
}

async function main() {
	if (process.env.OXAPAY_RUN_SANDBOX_SMOKE !== "1") {
		console.log("No request made. Set OXAPAY_RUN_SANDBOX_SMOKE=1 and OXAPAY_SANDBOX_MERCHANT_API_KEY to create one sandbox invoice.");
		return;
	}
	if (!sandboxKey) throw new Error("OXAPAY_SANDBOX_MERCHANT_API_KEY is required");

	const { OxaPay } = await import("../dist/index.js");
	const invoice = await new OxaPay({ merchantApiKey: sandboxKey, retry: false, timeoutMs: 15_000 }).payment.createInvoice({
		amount: 5,
		currency: "USD",
		sandbox: true,
		orderId: `oxapay-smoke-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
		...(callbackUrl === undefined ? {} : { callbackUrl: checkedCallbackUrl(callbackUrl) }),
	});

	console.log(`Sandbox invoice created: trackId=${invoice.data.trackId}, expiresAt=${invoice.data.expiredAt}`);
}

await main().catch((error) => {
	console.error("Sandbox smoke test failed.", error);
	process.exitCode = 1;
});
