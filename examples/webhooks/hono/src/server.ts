import "dotenv/config";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const app = createApp({ merchantApiKey: requiredEnv("OXAPAY_MERCHANT_API_KEY") });

const port = Number(process.env.PORT ?? 3000);
console.info(`Hono webhook example listening on http://localhost:${port}`);
serve({ fetch: app.fetch, port });
