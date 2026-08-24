import "dotenv/config";
import { createApp } from "./app.js";

const merchantApiKey = process.env.OXAPAY_MERCHANT_API_KEY?.trim();
if (!merchantApiKey) throw new Error("Missing OXAPAY_MERCHANT_API_KEY");

const fastify = createApp(merchantApiKey);

const port = Number(process.env.PORT ?? 3000);
await fastify.listen({ host: "0.0.0.0", port });
