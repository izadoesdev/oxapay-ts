import type { OxaPay } from "./oxapay.js";
import { createOxaPayFastifyWebhookPlugin } from "./webhook-adapters.js";
import type {
	OxaPayFastifyWebhookEventHandler,
	OxaPayFastifyWebhookPlugin,
	OxaPayWebhookValidationOptions,
} from "./webhook-adapters.js";
import type { KnownOxaPayWebhookEvent, OxaPayWebhookEvent } from "./types.js";

export interface FastifyWebhookOptions<T extends OxaPayWebhookEvent = KnownOxaPayWebhookEvent>
	extends OxaPayWebhookValidationOptions {
	path: string;
	onEvent: OxaPayFastifyWebhookEventHandler<T>;
	/** Maximum raw request size in bytes. Defaults to 1 MiB. */
	bodyLimit?: number;
}

type KnownFastifyWebhookOptions = FastifyWebhookOptions<KnownOxaPayWebhookEvent> & {
	eventValidation?: "known";
};
type PassthroughFastifyWebhookOptions<T extends OxaPayWebhookEvent> = FastifyWebhookOptions<T> & {
	eventValidation: "passthrough";
};

/** Creates the scoped Fastify plugin for one OxaPay webhook route. */
export function createWebhookPlugin(
	oxapay: OxaPay,
	options: KnownFastifyWebhookOptions,
): OxaPayFastifyWebhookPlugin;
/** Receives a valid signed event without documented-shape validation. Validate custom payloads before trusting them. */
export function createWebhookPlugin<T extends OxaPayWebhookEvent = OxaPayWebhookEvent>(
	oxapay: OxaPay,
	options: PassthroughFastifyWebhookOptions<T>,
): OxaPayFastifyWebhookPlugin;
export function createWebhookPlugin(
	oxapay: OxaPay,
	options: FastifyWebhookOptions<never>,
): OxaPayFastifyWebhookPlugin {
	return createOxaPayFastifyWebhookPlugin(oxapay.webhooks, {
		path: options.path,
		handler: options.onEvent as OxaPayFastifyWebhookEventHandler<OxaPayWebhookEvent>,
		...(options.bodyLimit === undefined ? {} : { bodyLimit: options.bodyLimit }),
		...(options.eventValidation === undefined ? {} : { eventValidation: options.eventValidation }),
	});
}

export type {
	OxaPayFastifyInstance as FastifyInstance,
	OxaPayFastifyReply as FastifyReply,
	OxaPayFastifyRequest as FastifyRequest,
	OxaPayFastifyWebhookEventHandler as FastifyWebhookEventHandler,
	OxaPayFastifyWebhookPlugin as FastifyWebhookPlugin,
} from "./webhook-adapters.js";
