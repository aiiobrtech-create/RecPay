import { Readable } from "node:stream";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import Stripe from "stripe";
import { getDb } from "../db.js";
import { getSupabaseAdmin } from "../lib/supabase-admin.js";
import { provisionStripeCheckoutSession } from "../lib/stripe-provision.js";

export type FastifyRequestWithStripeRaw = FastifyRequest & { stripeRawBody?: Buffer };

/**
 * Corpo bruto necessário para `stripe.webhooks.constructEvent`.
 * Registar `preParsing` no `app.ts` antes das rotas para `/webhooks/stripe`.
 */
export const stripePreParsingHook = async (
  request: FastifyRequest,
  _reply: unknown,
  payload: AsyncIterable<Buffer | string> | Buffer | string,
): Promise<AsyncIterable<Buffer | string> | Buffer | string> => {
  if (request.method !== "POST" || !request.url.startsWith("/webhooks/stripe")) {
    return payload;
  }
  const chunks: Buffer[] = [];
  if (Symbol.asyncIterator in Object(payload)) {
    for await (const chunk of payload as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } else if (Buffer.isBuffer(payload)) {
    chunks.push(payload);
  } else {
    chunks.push(Buffer.from(payload as string));
  }
  const raw = Buffer.concat(chunks);
  (request as FastifyRequestWithStripeRaw).stripeRawBody = raw;
  return Readable.from(raw);
};

export const stripeBillingWebhookRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/webhooks/stripe",
    {
      config: {
        rateLimit: {
          max: 600,
          timeWindow: "1 minute",
        },
      },
    },
    async (req, reply) => {
      const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
      const apiKey = process.env.STRIPE_SECRET_KEY?.trim();
      if (!secret || !apiKey) {
        return reply.status(503).send({ ok: false, error: "stripe_not_configured" });
      }

      const raw = (req as FastifyRequestWithStripeRaw).stripeRawBody;
      if (!raw?.length) {
        return reply.status(400).send({ ok: false, error: "missing_raw_body" });
      }

      const sig = req.headers["stripe-signature"];
      if (!sig || typeof sig !== "string") {
        return reply.status(400).send({ ok: false, error: "stripe_signature_missing" });
      }

      const stripe = new Stripe(apiKey);
      let event: Stripe.Event;
      try {
        event = stripe.webhooks.constructEvent(raw, sig, secret);
      } catch {
        return reply.status(400).send({ ok: false, error: "stripe_signature_invalid" });
      }

      if (event.type !== "checkout.session.completed") {
        return reply.status(200).send({ ok: true, ignored: true, type: event.type });
      }

      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
        return reply.status(200).send({ ok: true, skipped: true, reason: "payment_not_completed" });
      }

      const db = getDb();
      const supabase = getSupabaseAdmin();
      if (!db) {
        return reply.status(503).send({ ok: false, error: "database_unavailable" });
      }
      if (!supabase) {
        return reply.status(503).send({ ok: false, error: "auth_not_configured" });
      }

      try {
        const result = await provisionStripeCheckoutSession({
          db,
          supabase,
          stripe,
          session,
        });
        return reply.status(200).send({
          ok: true,
          tenantId: result.tenantId,
          duplicate: result.duplicate,
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "checkout_missing_customer_email") {
          return reply.status(400).send({ ok: false, error: "missing_customer_email" });
        }
        app.log.error({ err: msg }, "stripe_provision_failed");
        return reply.status(500).send({ ok: false, error: "provision_failed" });
      }
    },
  );
};
