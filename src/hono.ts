import type { OxaPay } from "./oxapay.js";
import { createOxaPayHonoWebhookHandler } from "./webhook-adapters.js";
import type {
	OxaPayFetchWebhookOptions,
	OxaPayHonoContext,
	OxaPayHonoWebhookEventHandler,
	OxaPayHonoWebhookHandler,
} from "./webhook-adapters.js";
import type { KnownOxaPayWebhookEvent, OxaPayWebhookEvent } from "./types.js";

type KnownHonoWebhookOptions = OxaPayFetchWebhookOptions & { eventValidation?: "known" };
type PassthroughHonoWebhookOptions = OxaPayFetchWebhookOptions & { eventValidation: "passthrough" };

/** Creates a Hono handler that verifies the untouched `c.req.raw` request. */
export function createWebhookHandler<
	Context extends OxaPayHonoContext = OxaPayHonoContext,
>(
	oxapay: OxaPay,
	onEvent: OxaPayHonoWebhookEventHandler<KnownOxaPayWebhookEvent, Context>,
	options?: KnownHonoWebhookOptions,
): OxaPayHonoWebhookHandler<Context>;
/** Receives a valid signed event without documented-shape validation. Validate custom payloads before trusting them. */
export function createWebhookHandler<
	T extends OxaPayWebhookEvent = OxaPayWebhookEvent,
	Context extends OxaPayHonoContext = OxaPayHonoContext,
>(
	oxapay: OxaPay,
	onEvent: OxaPayHonoWebhookEventHandler<T, Context>,
	options: PassthroughHonoWebhookOptions,
): OxaPayHonoWebhookHandler<Context>;
export function createWebhookHandler<Context extends OxaPayHonoContext = OxaPayHonoContext>(
	oxapay: OxaPay,
	onEvent: OxaPayHonoWebhookEventHandler<never, Context>,
	options: OxaPayFetchWebhookOptions = {},
): OxaPayHonoWebhookHandler<Context> {
	return createOxaPayHonoWebhookHandler(
		oxapay.webhooks,
		onEvent as OxaPayHonoWebhookEventHandler<OxaPayWebhookEvent, Context>,
		options,
	);
}

export type {
	OxaPayHonoContext as HonoContext,
	OxaPayHonoWebhookEventHandler as HonoWebhookEventHandler,
	OxaPayHonoWebhookHandler as HonoWebhookHandler,
	OxaPayFetchWebhookOptions as HonoWebhookOptions,
} from "./webhook-adapters.js";
