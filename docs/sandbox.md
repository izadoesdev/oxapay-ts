# Sandbox and callback verification

The repository has two deliberately separate checks:

```sh
npm run fixtures:webhooks
npm run sandbox:check
```

Both are local-only. They do not require credentials and never make a network
request. The fixture command signs the synthetic callback bodies in
`fixtures/webhooks/` with a test-only value, then verifies their exact raw bytes
against the SDK's strict webhook parser. It is useful for checking that adapter
and parser changes still accept the documented merchant and payout callback
shapes.

## Opt-in sandbox invoice smoke test

The smoke test creates exactly one **sandbox** invoice. It is disabled by
default and intentionally ignores `OXAPAY_MERCHANT_API_KEY` so a production key
cannot activate it accidentally. It reads only its explicit opt-in variable,
dedicated sandbox key, and optional sandbox callback URL—whether its caller
supplied them from a shell, CI secret store, or an environment-file loader.

After obtaining a sandbox merchant API key, run it from a shell or CI secret
store:

```sh
OXAPAY_SANDBOX_MERCHANT_API_KEY=your-sandbox-key \
OXAPAY_RUN_SANDBOX_SMOKE=1 \
npm run sandbox:smoke
```

If you keep the sandbox key in the ignored root `.env`, load it first in a
POSIX shell. The opt-in remains deliberately separate:

```sh
set -a && source .env && set +a
OXAPAY_RUN_SANDBOX_SMOKE=1 npm run sandbox:smoke
```

To include a callback URL in the sandbox invoice, expose one of the webhook
examples (or your application) at a public HTTPS endpoint. The smoke script
only creates the invoice and supplies its `callback_url`; complete the sandbox
payment while the endpoint is live to observe a real callback. It rejects HTTP
URLs and URLs containing credentials before importing the SDK or making a
request.

```sh
OXAPAY_SANDBOX_MERCHANT_API_KEY=your-sandbox-key \
OXAPAY_SANDBOX_CALLBACK_URL=https://your-public-endpoint.example/webhooks/oxapay \
OXAPAY_RUN_SANDBOX_SMOKE=1 \
npm run sandbox:smoke
```

The script uses a fixed USD 5 invoice, `sandbox: true`, a fresh `orderId`, a
15-second timeout, and no request retry. It prints only the returned track ID
and expiration timestamp; it never prints the API key or payment URL.

`OXAPAY_RUN_SANDBOX_SMOKE=1` without `OXAPAY_SANDBOX_MERCHANT_API_KEY` exits
with an error before importing the SDK or making a request. Without the opt-in
variable, `npm run sandbox:smoke` exits successfully without contacting OxaPay.

Use a dedicated sandbox key and treat callback handling as idempotent: OxaPay
may redeliver failed callbacks.
