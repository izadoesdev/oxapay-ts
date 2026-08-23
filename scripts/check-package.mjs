import assert from "node:assert/strict";
import * as rootSdk from "oxapay-ts";
import { OxaPay } from "oxapay-ts";
import { createWebhookHandler as createExpressWebhookHandler, rawBodyOptions } from "oxapay-ts/express";
import { createWebhookHandler as createFetchWebhookHandler } from "oxapay-ts/fetch";
import { createWebhookPlugin } from "oxapay-ts/fastify";
import { createWebhookHandler as createHonoWebhookHandler } from "oxapay-ts/hono";
import { createWebhookHandler as createNextjsWebhookHandler } from "oxapay-ts/nextjs";
import { parseAndVerifyKnownWebhook, parseAndVerifyWebhook } from "oxapay-ts/webhooks";

const oxapay = new OxaPay({ merchantApiKey: "merchant-secret" });

assert.equal(typeof oxapay.payment.createInvoice, "function");
assert.equal("parseAndVerifyWebhook" in rootSdk, false);
assert.equal("OxaPayWebhooks" in rootSdk, false);
assert.equal(typeof parseAndVerifyWebhook, "function");
assert.equal(typeof parseAndVerifyKnownWebhook, "function");
assert.equal(typeof createFetchWebhookHandler, "function");
assert.equal(typeof createNextjsWebhookHandler, "function");
assert.equal(typeof createExpressWebhookHandler, "function");
assert.deepEqual(rawBodyOptions(), { type: "application/json", inflate: false, limit: 1_048_576 });
assert.equal(typeof createWebhookPlugin, "function");
assert.equal(typeof createHonoWebhookHandler, "function");
