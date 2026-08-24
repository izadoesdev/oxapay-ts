import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const merchantApiKey = process.env.OXAPAY_MERCHANT_API_KEY?.trim();
if (!merchantApiKey) throw new Error("Missing OXAPAY_MERCHANT_API_KEY");

const app = createApp(merchantApiKey);

const port = Number(process.env.PORT ?? 3000);
console.info(`Hono webhook example listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
