# OxaPay webhook fixtures

These bodies are synthetic, sanitized examples of the documented invoice and
payout callback shapes. They contain no OxaPay credential, customer, wallet, or
transaction data.

`npm run fixtures:webhooks` signs each file with a test-only local value and
validates the exact stored bytes through the SDK's strict webhook parser. It
does not send a network request. Do not copy that test-only signature setup into
an application: a real endpoint must validate the `HMAC` header using its own
merchant or payout API key.

When adding a fixture, retain its raw wire shape (including snake_case fields),
remove real data, and add its expected callback family to
`scripts/verify-webhook-fixtures.mjs`.
