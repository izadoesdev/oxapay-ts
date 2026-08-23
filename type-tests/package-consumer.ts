import * as sdk from "oxapay-ts";
import { OxaPay, type OxaPayRequestOptions } from "oxapay-ts";
import { createWebhookHandler as createExpressWebhookHandler, rawBodyOptions } from "oxapay-ts/express";
import { createWebhookHandler as createFetchWebhookHandler } from "oxapay-ts/fetch";
import { createWebhookPlugin } from "oxapay-ts/fastify";
import { createWebhookHandler as createHonoWebhookHandler } from "oxapay-ts/hono";
import { createWebhookHandler as createNextjsWebhookHandler } from "oxapay-ts/nextjs";
import { parseAndVerifyKnownWebhook, parseAndVerifyWebhook } from "oxapay-ts/webhooks";

const oxapay = new OxaPay({ merchantApiKey: "merchant-secret" });
const options: OxaPayRequestOptions = { timeoutMs: 0 };
const requestTypesAreAvailable: Request | undefined = undefined;

oxapay.account.balance(options);

createNextjsWebhookHandler(oxapay, (event) => {
	if (event.data.type === "payout") return;
	const trackId: string = event.data.trackId;
	void trackId;
});
createNextjsWebhookHandler(oxapay, (event) => {
	const type: string = event.data.type;
	void type;
	// @ts-expect-error passthrough payloads are not typed as documented events
	const trackId: string = event.data.trackId;
	void trackId;
}, { eventValidation: "passthrough" });
createFetchWebhookHandler(oxapay, (event) => {
	const trackId: string = event.data.trackId;
	void trackId;
}, { bodyLimit: 1_024 });
createExpressWebhookHandler(oxapay, (event) => {
	const trackId: string = event.data.trackId;
	void trackId;
});
createWebhookPlugin(oxapay, {
	path: "/webhooks/oxapay",
	onEvent(event) {
		const trackId: string = event.data.trackId;
		void trackId;
	},
});
createHonoWebhookHandler(oxapay, (event) => {
	const trackId: string = event.data.trackId;
	void trackId;
});

void rawBodyOptions;
void parseAndVerifyWebhook;
void parseAndVerifyKnownWebhook;
void requestTypesAreAvailable;

// @ts-expect-error standalone raw-webhook helpers live at oxapay-ts/webhooks
void sdk.parseAndVerifyWebhook;
