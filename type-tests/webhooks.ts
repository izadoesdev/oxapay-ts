import {
	OxaPay,
	type KnownOxaPayWebhookEvent,
	type OxaPayWebhookEvent,
	type PayoutWebhookEvent,
} from "../src/index.js";
import { createWebhookHandler as createExpressWebhookHandler } from "../src/express.js";
import { createWebhookHandler as createFetchWebhookHandler } from "../src/fetch.js";
import { createWebhookPlugin } from "../src/fastify.js";
import { createWebhookHandler as createHonoWebhookHandler } from "../src/hono.js";
import {
	createWebhookHandler as createNextjsWebhookHandler,
	type NextjsWebhookHandler,
} from "../src/nextjs.js";

const oxapay = new OxaPay({ merchantApiKey: "merchant-secret" });

declare const documentedEvent: KnownOxaPayWebhookEvent;
if (documentedEvent.type !== "payout") {
	const orderId: string | undefined = documentedEvent.orderId;
	void orderId;
}
if (documentedEvent.type === "payout") {
	const transactionHash: string = documentedEvent.txHash;
	void transactionHash;
}

const nextjsHandler = createNextjsWebhookHandler(oxapay, (event, request) => {
	const trackId: string = event.data.trackId;
	const verifiedWith: "merchant" | "payout" = event.verifiedWith;
	const method: string = request.method;
	void trackId;
	void verifiedWith;
	void method;
});
const typedNextjsHandler: NextjsWebhookHandler = nextjsHandler;
void typedNextjsHandler;

createFetchWebhookHandler(oxapay, (event) => {
	const trackId: string = event.data.trackId;
	void trackId;
});

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

// Strict validation confirms the documented union; it does not promise a
// caller-selected subtype without a matching runtime guard.
// @ts-expect-error select a subtype only after using passthrough and validating it yourself
createNextjsWebhookHandler<PayoutWebhookEvent>(oxapay, () => undefined);

// Advanced users can deliberately opt into the broad, forward-compatible event union.
createNextjsWebhookHandler<OxaPayWebhookEvent>(oxapay, (event) => {
	const type: string = event.data.type;
	void type;
}, { eventValidation: "passthrough" });

// Without an explicit custom schema, passthrough callbacks are broad rather
// than pretending unvalidated payloads have known OxaPay fields.
createNextjsWebhookHandler(oxapay, (event) => {
	const type: string = event.data.type;
	void type;
	// @ts-expect-error passthrough payloads need a caller-owned runtime guard
	const trackId: string = event.data.trackId;
	void trackId;
}, { eventValidation: "passthrough" });

createExpressWebhookHandler(oxapay, (event) => {
	// @ts-expect-error passthrough payloads need a caller-owned runtime guard
	const trackId: string = event.data.trackId;
	void trackId;
}, { eventValidation: "passthrough" });

createWebhookPlugin(oxapay, {
	path: "/webhooks/oxapay/future",
	eventValidation: "passthrough",
	onEvent(event) {
		// @ts-expect-error passthrough payloads need a caller-owned runtime guard
		const trackId: string = event.data.trackId;
		void trackId;
	},
});

createHonoWebhookHandler(oxapay, (event) => {
	// @ts-expect-error passthrough payloads need a caller-owned runtime guard
	const trackId: string = event.data.trackId;
	void trackId;
}, { eventValidation: "passthrough" });

// Framework adapters are intentionally package-local, not methods on the core webhook facade.
// @ts-expect-error use oxapay-ts/nextjs instead
void oxapay.webhooks.handle;
// @ts-expect-error use oxapay-ts/express instead
void oxapay.webhooks.express;
// @ts-expect-error use oxapay-ts/fastify instead
void oxapay.webhooks.fastify;
// @ts-expect-error use oxapay-ts/hono instead
void oxapay.webhooks.hono;
// @ts-expect-error Fetch request helpers live in oxapay-ts/fetch, not the core facade
void oxapay.webhooks.parseRequest;

oxapay.webhooks.verify("{}", { signature: "a".repeat(128) });
// @ts-expect-error bound webhook helpers use the OxaPay client's credential set
oxapay.webhooks.verify("{}", { signature: "a".repeat(128), merchantApiKey: "other-secret" });
