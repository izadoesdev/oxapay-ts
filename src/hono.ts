import type { OxaPay } from "./oxapay.js";
import { createOxaPayHonoWebhookHandler } from "./webhook-adapters.js";
import type {
	OxaPayFetchWebhookOptions,
	OxaPayHonoContext,
	OxaPayHonoWebhookEventHandler,
	OxaPayHonoWebhookHandler,
} from "./webhook-adapters.js";

/** Creates a Hono handler that verifies the untouched `c.req.raw` request. */
export function createWebhookHandler<
	Context extends OxaPayHonoContext = OxaPayHonoContext,
>(
	oxapay: OxaPay,
	onEvent: OxaPayHonoWebhookEventHandler<Context>,
	options: OxaPayFetchWebhookOptions = {},
): OxaPayHonoWebhookHandler<Context> {
	return createOxaPayHonoWebhookHandler(
		() => oxapay.client.getWebhookCredentials(),
		onEvent,
		options,
	);
}

export type {
	OxaPayHonoContext as HonoContext,
	OxaPayHonoWebhookEventHandler as HonoWebhookEventHandler,
	OxaPayHonoWebhookHandler as HonoWebhookHandler,
	OxaPayFetchWebhookOptions as HonoWebhookOptions,
} from "./webhook-adapters.js";
