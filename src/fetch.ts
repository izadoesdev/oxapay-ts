import type { OxaPay } from "./oxapay.js";
import { createOxaPayFetchWebhookHandler } from "./webhook-adapters.js";
import type {
	OxaPayFetchWebhookHandler,
	OxaPayFetchWebhookOptions,
	OxaPayWebhookHandler,
} from "./webhook-adapters.js";
import type { KnownOxaPayWebhookEvent, OxaPayWebhookEvent } from "./types.js";

type KnownFetchWebhookOptions = OxaPayFetchWebhookOptions & { eventValidation?: "known" };
type PassthroughFetchWebhookOptions = OxaPayFetchWebhookOptions & { eventValidation: "passthrough" };

/**
 * Creates a verified webhook handler for Fetch-compatible runtimes.
 *
 * Use this directly in Remix, SvelteKit, and standard Fetch endpoints. For
 * Next.js App Router, import the same helper from `oxapay-ts/nextjs`.
 */
export function createWebhookHandler(
	oxapay: OxaPay,
	onEvent: OxaPayWebhookHandler<KnownOxaPayWebhookEvent>,
	options?: KnownFetchWebhookOptions,
): OxaPayFetchWebhookHandler<KnownOxaPayWebhookEvent>;
/**
 * Receives a valid signed event without the SDK's documented-shape validation.
 * Supply a type only after validating that custom payload in your own handler.
 */
export function createWebhookHandler<T extends OxaPayWebhookEvent = OxaPayWebhookEvent>(
	oxapay: OxaPay,
	onEvent: OxaPayWebhookHandler<T>,
	options: PassthroughFetchWebhookOptions,
): OxaPayFetchWebhookHandler<T>;
export function createWebhookHandler(
	oxapay: OxaPay,
	onEvent: OxaPayWebhookHandler<never>,
	options: OxaPayFetchWebhookOptions = {},
): OxaPayFetchWebhookHandler<never> {
	return createOxaPayFetchWebhookHandler(
		oxapay.webhooks,
		onEvent as OxaPayWebhookHandler<OxaPayWebhookEvent>,
		options,
	) as OxaPayFetchWebhookHandler<never>;
}

export type {
	OxaPayFetchWebhookHandler as FetchWebhookHandler,
	OxaPayFetchWebhookOptions as FetchWebhookOptions,
	OxaPayWebhookHandler as FetchWebhookEventHandler,
} from "./webhook-adapters.js";
