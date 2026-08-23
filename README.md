# OxaPay TypeScript SDK

A small, composable TypeScript client for OxaPay's v1 API. It uses native `fetch`, keeps the documented response envelope intact, and exposes the complete current v1 route surface through cohesive resource namespaces.

The package is deliberately marked `private` while it is developed in this repository. Confirm the npm package name, scope ownership, repository URL, and license before publishing it.

## What it provides

- All 23 documented v1 API operations: payment, payout, swap, account, and public common-data endpoints.
- ESM-only output for modern Node.js, Bun, and Fetch-compatible runtimes.
- Camel-cased TypeScript inputs and outputs; OxaPay's snake-cased wire format stays internal.
- Credential routing that uses the correct custom header for each endpoint:
  `merchant_api_key`, `payout_api_key`, or `general_api_key`.
- Native `fetch` injection, per-request headers and cancellation, timeout controls, safe GET retries, hooks, and a public low-level route registry.
- Framework-native webhook handlers for Fetch/Next.js, Express, Fastify, and Hono that validate the `HMAC` SHA-512 signature against the exact raw bytes before parsing JSON.

## Local development

```sh
bun install
bun run check
bun test
bun run build
```

The build emits ESM JavaScript and declaration files to `dist/`. The source targets Node.js 18+, Bun, and runtimes with the Fetch and Web Crypto APIs.

## Verify an integration

The repository includes checks that exercise the public package boundary, not
only source imports:

```sh
bun run check:package
npm run fixtures:webhooks
npm run sandbox:check
```

`check:package` includes the emitted-package integration test, which uses only
local, ephemeral HTTP servers. Run `npm run test:integration` by itself while
iterating on that boundary. The webhook fixtures and sandbox check are also
local-only: they need no credentials and never make a network request. For an
explicit sandbox invoice and callback test, see [sandbox verification](./docs/sandbox.md).
The release/publish requirements that remain intentionally unconfigured are in the
[release checklist](./docs/releasing.md).

## Runnable webhook examples

Copyable applications for [Next.js App Router, Express, Fastify, and
Hono](./examples/webhooks/README.md) use the framework-local imports and strict
webhook validation. They point to this checkout before publication and can be
changed to the published package version afterward.

## Install

After the package is published, install the scoped ESM package with your normal package manager:

```sh
npm install oxapay-ts
# pnpm add oxapay-ts
# bun add oxapay-ts
```

It supports modern ESM runtimes with native Fetch and Web Crypto, including Node.js 18+ and Bun. CommonJS `require()` is intentionally not supported. If your TypeScript configuration replaces the default `lib` list, include `"DOM"` and `"DOM.Iterable"` for the standard Fetch types used by the SDK.

## Quick start

```ts
import { OxaPay } from "oxapay-ts";

const merchantApiKey = process.env.OXAPAY_MERCHANT_API_KEY;
if (!merchantApiKey) throw new Error("Missing OXAPAY_MERCHANT_API_KEY");

const oxapay = new OxaPay({
  merchantApiKey,
});

const invoice = await oxapay.payment.createInvoice({
  amount: 5,
  orderId: "order_123",
  sandbox: true, // Remove in production.
});

console.log(invoice.data.trackId);
console.log(invoice.data.paymentUrl);
```

Creating an invoice only needs a Merchant API key. Add keys as you need the matching service:

| Service | Key |
| --- | --- |
| `payment` | Merchant API key |
| `payout` | Payout API key |
| `swap` and `account` | General API key |
| `common` | None |
| Merchant / payout webhooks | Merchant and / or Payout API key |

Resource methods return OxaPay's full envelope, so API metadata remains available:

```ts
const result = await oxapay.payment.get("193139644");

result.data.status; // typed OxaPay payment status
result.message;
result.version;
```

## API surface

| Namespace | Key | Operations |
| --- | --- | --- |
| `payment` | Merchant | `createInvoice`, `createWhiteLabel`, `createStaticAddress`, `revokeStaticAddress`, `listStaticAddresses`, `get`, `list`, `statistics`, `acceptedCurrencies` |
| `payout` | Payout | `create`, `get`, `list` |
| `swap` | General | `create`, `list`, `pairs`, `calculate`, `rate` |
| `account` | General | `balance` |
| `common` | None | `prices`, `currencies`, `fiats`, `networks`, `monitor` |

List resources also provide lazy pagination:

```ts
for await (const payment of oxapay.payment.iterateHistory({
  fromDate: 1_735_689_600,
  sortType: "desc",
})) {
  await storePayment(payment);
}
```

All public models are exported, including `CreateInvoiceInput`, `Payment`, `Payout`, `Swap`, `SupportedCurrencies`, and every query/input type.

## Composition and custom transport

The client does not rely on global configuration. You can pass a custom Fetch implementation for tests, a proxy, observability, or a runtime adapter:

```ts
const oxapay = new OxaPay({
  merchantApiKey: async () => await keyStore.currentMerchantKey(),
  fetch: async (request) => tracedFetch(request),
  onRequest(request) {
    // Runs before the SDK attaches an API-key header.
    request.headers.set("x-request-id", crypto.randomUUID());
  },
  onResponse(response) {
    metrics.record("oxapay.http_status", response.status);
  },
});
```

`onResponse` receives a bodyless request snapshot with API-key headers and query values removed, so ordinary telemetry hooks can log it safely. Use the injected `fetch` only when you deliberately need full wire-level access.

Create a tenant-specific view without changing its transport or retry settings. `withCredentials` replaces the credential set rather than merging it, so a tenant cannot accidentally inherit another tenant's payout or general key:

```ts
const tenantOxaPay = oxapay.withCredentials({
  merchantApiKey: tenant.merchantApiKey,
});
```

For a newly released endpoint, use the low-level client with a typed operation. The built-in `routes` registry is also exported and is the source of truth for every high-level resource.

```ts
import { OxaPay, type OxaPayOperation } from "oxapay-ts";

const oxapay = new OxaPay({ merchantApiKey: process.env.OXAPAY_MERCHANT_API_KEY! });
const operation = {
  method: "GET",
  path: "/common/a-new-endpoint",
  auth: "none",
} as const satisfies OxaPayOperation;

const response = await oxapay.client.request<{ status: boolean }>(operation);
```

## Retries, cancellation, and errors

Safe `GET` operations retry network failures and 408, 429, and 5xx responses up to three total attempts by default. A server-supplied `Retry-After` is honored; otherwise retries use bounded exponential backoff. `POST` operations never retry unless a call opts in with `retryUnsafeRequests`; OxaPay does not document a universal idempotency key for creation operations.

```ts
await oxapay.common.monitor({
  signal: AbortSignal.timeout(5_000),
  retry: { maxAttempts: 2 },
});
```

Errors are typed and retain safe request metadata. Query values are intentionally omitted from error metadata so logs do not leak email, address, or order data:

```ts
import { OxaPayAbortError, OxaPayApiError, OxaPayRateLimitError } from "oxapay-ts";

try {
  await oxapay.payout.create({ address, currency: "USDT", amount: 100 });
} catch (error) {
  if (error instanceof OxaPayAbortError) {
    console.log("The caller cancelled the request");
  } else if (error instanceof OxaPayRateLimitError) {
    console.log(error.retryAfterMs);
  } else if (error instanceof OxaPayApiError) {
    console.log(error.status, error.apiError);
  }
  throw error;
}
```

## Webhooks

Import the adapter at the framework boundary—not from `oxapay.webhooks`. Each adapter reads the untouched bytes, extracts the `HMAC` header, verifies it before parsing JSON, returns `400` for an invalid webhook, and replies with `200 ok` only after your handler finishes. Fetch and Hono handlers can return a custom `Response`; if your handler throws, the error is allowed to produce a retryable 5xx response. In Fetch/Next handlers, the callback's `Request` body is already consumed for verification—use `event.rawBody` if you need the original bytes.

The SDK tries configured merchant and payout keys rather than trusting an unverified payload `type` to choose a secret. Framework adapters then validate the documented callback shape and require the matching key scope by default. To deliberately receive a future event type while you supply your own runtime validation, set `{ eventValidation: "passthrough" }`.

### Next.js App Router

```ts
import { OxaPay } from "oxapay-ts";
import { createWebhookHandler } from "oxapay-ts/nextjs";

const oxapay = new OxaPay({
  merchantApiKey: process.env.OXAPAY_MERCHANT_API_KEY!,
});

export const POST = createWebhookHandler(oxapay, async (event) => {
  // OxaPay can send "Paying" first. Only "Paid" is safe to fulfill.
  if (event.data.status !== "Paid") return;

  // Persist idempotently by trackId before acknowledging the callback.
  await handleOxaPayEvent(event.data);
});
```

Add `payoutApiKey` when this endpoint accepts payout callbacks. Do not read the request body before passing it to the generated handler. This adapter is for Next.js App Router route handlers (not Pages Router API routes). OxaPay retries a failed callback up to five times, so handlers must be idempotent.

### Remix, SvelteKit, and standard Fetch

Use the framework-neutral Fetch adapter when your framework supplies a `Request` rather than exposing it as the route handler argument:

```ts
import { createWebhookHandler } from "oxapay-ts/fetch";

const webhook = createWebhookHandler(oxapay, async (event) => {
  await handleOxaPayEvent(event.data);
});

export async function action({ request }: { request: Request }) {
  return webhook(request);
}
```

Fetch, Next.js, and Hono adapters limit the retained raw body to 1 MiB by default. Set `bodyLimit` when your endpoint needs a different limit:

```ts
const webhook = createWebhookHandler(oxapay, onOxaPayEvent, { bodyLimit: 2 * 1024 * 1024 });
```

### Express

Express must retain the raw Buffer on this route. `rawBodyOptions()` supplies the correct route-local parser options; mount the webhook route before a global `express.json()` middleware.

```ts
import express from "express";
import { createWebhookHandler, rawBodyOptions } from "oxapay-ts/express";

const app = express();

app.post(
  "/webhooks/oxapay",
  express.raw(rawBodyOptions()),
  createWebhookHandler(oxapay, async (event) => {
    await handleOxaPayEvent(event.data);
  }),
);

app.use(express.json());
```

For a different limit, use `express.raw(rawBodyOptions({ bodyLimit: 2 * 1024 * 1024 }))`. If Express has already parsed the JSON body, the adapter fails with a configuration error rather than silently re-serializing it and verifying the wrong bytes.

### Nest on Express

Nest's default body parser runs before controller methods. Enable its raw-body capture, then delegate to the same Express adapter; it prefers `request.rawBody` when present.

```ts
import { createWebhookHandler } from "oxapay-ts/express";

const webhook = createWebhookHandler(oxapay, async (event) => {
  await handleOxaPayEvent(event.data);
});

const app = await NestFactory.create(AppModule, { rawBody: true });

// In a controller method, forward the native request/response/next values:
return webhook(request, response, next);
```

### Fastify

The Fastify adapter is an encapsulated plugin: it changes JSON parsing only for the registered webhook route and leaves the rest of your app alone.

```ts
import { createWebhookPlugin } from "oxapay-ts/fastify";

fastify.register(
  createWebhookPlugin(oxapay, {
    path: "/webhooks/oxapay",
    onEvent: async (event) => {
      await handleOxaPayEvent(event.data);
    },
  }),
);
```

Register it before `fastify.listen()`. Set `bodyLimit` in the adapter options if the default 1 MiB limit is unsuitable.

### Hono

```ts
import { createWebhookHandler } from "oxapay-ts/hono";

app.post(
  "/webhooks/oxapay",
  createWebhookHandler(oxapay, async (event) => {
    await handleOxaPayEvent(event.data);
  }),
);
```

### Advanced: custom runtimes

For a custom framework adapter, `oxapay.webhooks.parse`, `parseKnown`, and
`verify` use the credentials already configured on that client and accept only
the exact raw bytes plus the incoming signature. Do not parse and re-serialize
JSON first:

```ts
const event = await oxapay.webhooks.parseKnown(rawBody, {
  signature: request.headers.get("hmac"),
});
```

If you do not have an `OxaPay` instance, import the standalone raw helpers from
`oxapay-ts/webhooks` and provide their merchant and/or payout API keys
explicitly.

OxaPay documents retries for failed webhook deliveries, so applications should make handling idempotent. The payload status unions are intentionally open because the documentation shows both title-cased webhook values and lower-cased API status values.

## Contract sources

The implementation is derived from OxaPay's current v1 documentation: [API index](https://docs.oxapay.com/llms.txt), [payment endpoints](https://docs.oxapay.com/api-reference/payment), [payout endpoints](https://docs.oxapay.com/api-reference/payout), [swap endpoints](https://docs.oxapay.com/api-reference/swap), [common endpoints](https://docs.oxapay.com/api-reference/common), and [webhook verification](https://docs.oxapay.com/webhook).
