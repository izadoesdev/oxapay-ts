# OxaPay TypeScript SDK

Small, typed ESM client for the [OxaPay v1 API](https://docs.oxapay.com/). It uses native `fetch`, preserves OxaPay's response envelope, and includes framework-local webhook handlers.

> Not published to npm yet.

## Install

```sh
npm install oxapay-ts
```

Node.js 18+, Bun, or another Fetch/Web Crypto runtime is required. CommonJS is not supported.

## Quick start

```ts
import { OxaPay } from "oxapay-ts";

const oxapay = new OxaPay({
  merchantApiKey: process.env.OXAPAY_MERCHANT_API_KEY!,
});

const invoice = await oxapay.payment.createInvoice({
  amount: 5,
  orderId: "order_123",
  sandbox: true,
});

console.log(invoice.data.paymentUrl);
```

| Namespace | Key | Operations |
| --- | --- | --- |
| `payment` | Merchant | invoices, white-label payments, static addresses, history, statistics |
| `payout` | Payout | create, get, history |
| `swap` | General | create, history, pairs, quotes, rates |
| `account` | General | balances |
| `common` | None | prices, currencies, fiats, networks, monitor |

Inputs and responses are camel-cased. Use `oxapay.client.request()` with an `OxaPayOperation` for an endpoint released before this SDK catches up.

## Webhooks

Use the adapter at the framework boundary. It verifies the `HMAC` SHA-512 signature against the untouched request bytes before parsing JSON, validates OxaPay's documented event shape, and acknowledges only after your callback completes.

```ts
const onOxaPayEvent = async ({ data }: { data: { type: string; status: string; trackId: string } }) => {
  if (data.type === "payout" || data.status !== "Paid") return;
  // Persist idempotently by trackId before this resolves.
};
```

### Next.js App Router

```ts
import { createWebhookHandler } from "oxapay-ts/nextjs";

export const POST = createWebhookHandler(oxapay, onOxaPayEvent);
```

### Fetch, Remix, and SvelteKit

```ts
import { createWebhookHandler } from "oxapay-ts/fetch";

const webhook = createWebhookHandler(oxapay, onOxaPayEvent);
export const action = ({ request }: { request: Request }) => webhook(request);
```

### Express

Mount the raw parser on this route before `express.json()`.

```ts
import express from "express";
import { createWebhookHandler, rawBodyOptions } from "oxapay-ts/express";

app.post("/webhooks/oxapay", express.raw(rawBodyOptions()), createWebhookHandler(oxapay, onOxaPayEvent));
```

### Fastify

```ts
import { createWebhookPlugin } from "oxapay-ts/fastify";

fastify.register(createWebhookPlugin(oxapay, {
  path: "/webhooks/oxapay",
  onEvent: onOxaPayEvent,
}));
```

### Hono

```ts
import { createWebhookHandler } from "oxapay-ts/hono";

app.post("/webhooks/oxapay", createWebhookHandler(oxapay, onOxaPayEvent));
```

Fetch, Next.js, and Hono retain at most 1 MiB by default; pass `{ bodyLimit }` to change it. For a custom runtime, use the raw helpers from `oxapay-ts/webhooks`:

```ts
import { parseAndVerifyKnownWebhook } from "oxapay-ts/webhooks";

const event = await parseAndVerifyKnownWebhook(rawBody, {
  signature: request.headers.get("hmac"),
  merchantApiKey: process.env.OXAPAY_MERCHANT_API_KEY!,
});
```

## Development

```sh
bun install
bun run check
bun test
bun run test:package
```

`test:package` builds the package, checks its public declarations, and runs it through a local HTTP request.

## Sandbox smoke test

This creates one USD 5 sandbox invoice only when both variables are set. It reads `OXAPAY_SANDBOX_MERCHANT_API_KEY` only—never `OXAPAY_MERCHANT_API_KEY`.

```sh
set -a && source .env && set +a
OXAPAY_RUN_SANDBOX_SMOKE=1 bun run sandbox
```

Optionally set `OXAPAY_SANDBOX_CALLBACK_URL` to a public HTTPS webhook endpoint. Without the opt-in variable, `bun run sandbox` makes no request.
