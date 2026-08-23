import "dotenv/config";
import { createApp } from "./app.js";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

const fastify = createApp({ merchantApiKey: requiredEnv("OXAPAY_MERCHANT_API_KEY") });

const port = Number(process.env.PORT ?? 3000);
await fastify.listen({ host: "0.0.0.0", port });
