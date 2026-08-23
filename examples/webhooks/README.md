# Runnable webhook examples

Each directory is a small application that exposes `POST /webhooks/oxapay` with the SDK's framework-local adapter. They deliberately use the default, strict `{ eventValidation: "known" }` mode: the HMAC is checked against the original bytes, the payload is checked against OxaPay's documented callback shape, and its matched key scope must agree with that shape.

The examples currently reference the SDK checkout with `"oxapay-ts": "file:../../.."`. That makes them useful before the package is published. Build the SDK once:

```sh
# From the SDK repository root
bun run build
```

Then run one of the following:

```sh
# Next.js App Router
cd examples/webhooks/nextjs-app-router
cp .env.local.example .env.local
npm install
npm run dev
```

```sh
# Express
cd examples/webhooks/express
cp .env.example .env
npm install
npm run dev
```

```sh
# Fastify
cd examples/webhooks/fastify
cp .env.example .env
npm install
npm run dev
```

```sh
# Hono on Node.js
cd examples/webhooks/hono
cp .env.example .env
npm install
npm run dev
```

| Example | Start command | Callback URL |
| --- | --- | --- |
| [Next.js App Router](./nextjs-app-router) | `npm run dev` | `http://localhost:3000/api/webhooks/oxapay` |
| [Express](./express) | `npm run dev` | `http://localhost:3000/webhooks/oxapay` |
| [Fastify](./fastify) | `npm run dev` | `http://localhost:3000/webhooks/oxapay` |
| [Hono on Node.js](./hono) | `npm run dev` | `http://localhost:3000/webhooks/oxapay` |

Next.js uses `.env.local`; the other examples use `.env`. Copy the matching `*.example` file and set `OXAPAY_MERCHANT_API_KEY`. Do not commit either real environment file. OxaPay needs a publicly reachable HTTPS callback URL, so use a tunnel or deployed environment while testing callbacks.

The `Set` in each example only makes duplicate delivery visible while that one process is alive. Replace it with a transaction and unique constraint keyed by `trackId` before fulfilling orders. The handler deliberately throws if that durable work fails, allowing OxaPay to retry instead of acknowledging an unrecorded event.

To use an example after publishing the SDK, replace its local SDK dependency with the published version, for example `"oxapay-ts": "^0.1.0"`, then run `npm install` again.

CI type-checks every example, builds the Next.js application, and delivers
valid, invalid, and future-event signed callbacks through each example's actual
route. After installing an example's dependencies, maintainers can run the
matching check from the repository root:

```sh
OXAPAY_TEST_EXAMPLE=express bun test ./tests/webhook-example-integration.ts
```
