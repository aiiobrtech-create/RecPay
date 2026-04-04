import { randomBytes, createHash } from "node:crypto";
import { hashWebhookIngressToken } from "@re/core";
import { eq, sql } from "drizzle-orm";
import { memberships, tenants, webhookIngressTokens, type DbClient } from "@re/db";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ProvisionLimits = {
  planMonthlyEventsLimit: number | null;
  planMonthlyRecoveryLimit: number | null;
};

function parsePositiveInt(raw: string | undefined | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Limites: metadata da Checkout Session (`re_events_limit`, `re_recovery_limit`) ou do Price (expand),
 * senão env `STRIPE_DEFAULT_PLAN_*` ou fallback numérico.
 */
export function resolveLimitsFromStripeSession(session: Stripe.Checkout.Session): ProvisionLimits {
  const md = session.metadata ?? {};
  let events = parsePositiveInt(md.re_events_limit ?? md.plan_monthly_events_limit);
  let recovery = parsePositiveInt(md.re_recovery_limit ?? md.plan_monthly_recovery_limit);

  const items = session.line_items?.data;
  if (items?.length && (events == null || recovery == null)) {
    const price = items[0]?.price;
    if (price && typeof price === "object" && "metadata" in price) {
      const pm = (price as Stripe.Price).metadata ?? {};
      if (events == null) {
        events = parsePositiveInt(pm.re_events_limit ?? pm.plan_monthly_events_limit);
      }
      if (recovery == null) {
        recovery = parsePositiveInt(pm.re_recovery_limit ?? pm.plan_monthly_recovery_limit);
      }
    }
  }

  if (events == null) {
    const d = process.env.STRIPE_DEFAULT_PLAN_EVENTS_LIMIT?.trim();
    events = d ? parsePositiveInt(d) : 5000;
  }
  if (recovery == null) {
    const d = process.env.STRIPE_DEFAULT_PLAN_RECOVERY_LIMIT?.trim();
    recovery = d ? parsePositiveInt(d) : 1000;
  }

  return {
    planMonthlyEventsLimit: events,
    planMonthlyRecoveryLimit: recovery,
  };
}

async function authUserIdByEmail(db: DbClient, email: string): Promise<string | null> {
  const rows = await db.execute(
    sql`select id::text as id from auth.users where lower(email) = lower(${email}) limit 1`,
  );
  const row = rows[0] as { id?: string } | undefined;
  return row?.id ?? null;
}

async function createAuthUser(supabase: SupabaseClient, email: string): Promise<string> {
  const password = `re-${randomBytes(18).toString("base64url")}`;
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { provisioned_via: "stripe_checkout" },
  });
  if (error) throw error;
  if (!data.user?.id) throw new Error("createUser_missing_id");
  return data.user.id;
}

async function getOrCreateAuthUserId(
  db: DbClient,
  supabase: SupabaseClient,
  email: string,
): Promise<string> {
  const existing = await authUserIdByEmail(db, email);
  if (existing) return existing;
  try {
    return await createAuthUser(supabase, email);
  } catch (e: unknown) {
    const msg =
      e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : "";
    if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")) {
      const again = await authUserIdByEmail(db, email);
      if (again) return again;
    }
    throw e;
  }
}

function advisoryLockExpr(sessionId: string) {
  const buf = createHash("sha256").update(sessionId, "utf8").digest();
  const k1 = buf.readUInt32BE(0);
  const k2 = buf.readUInt32BE(4);
  return sql`select pg_advisory_xact_lock(${k1}::int, ${k2}::int)`;
}

async function resolveCheckoutCustomerEmail(
  stripe: Stripe,
  session: Stripe.Checkout.Session,
): Promise<string | null> {
  const direct =
    session.customer_details?.email?.trim() ||
    session.customer_email?.trim() ||
    null;
  if (direct) return direct;

  const custRef = session.customer;
  if (typeof custRef === "string") {
    const c = await stripe.customers.retrieve(custRef);
    if (!c.deleted && "email" in c && typeof c.email === "string" && c.email.trim()) {
      return c.email.trim();
    }
  }
  return null;
}

export async function provisionStripeCheckoutSession(params: {
  db: DbClient;
  supabase: SupabaseClient;
  stripe: Stripe;
  session: Stripe.Checkout.Session;
}): Promise<{ tenantId: string; duplicate: boolean }> {
  const { db, supabase, stripe, session } = params;
  const sessionId = session.id;

  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.stripeCheckoutSessionId, sessionId))
    .limit(1);
  if (existing) {
    return { tenantId: existing.id, duplicate: true };
  }

  const email = await resolveCheckoutCustomerEmail(stripe, session);
  if (!email) {
    throw new Error("checkout_missing_customer_email");
  }

  let fullSession = session;
  if (!session.metadata?.re_events_limit && !session.metadata?.re_recovery_limit) {
    try {
      fullSession = await stripe.checkout.sessions.retrieve(sessionId, {
        expand: ["line_items.data.price"],
      });
    } catch {
      fullSession = session;
    }
  }

  const limits = resolveLimitsFromStripeSession(fullSession);
  const tenantName =
    session.customer_details?.name?.trim() || email.split("@")[0] || "Cliente";

  const userId = await getOrCreateAuthUserId(db, supabase, email);

  return await db.transaction(async (tx) => {
    await tx.execute(advisoryLockExpr(sessionId));

    const [dup] = await tx
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.stripeCheckoutSessionId, sessionId))
      .limit(1);
    if (dup) {
      return { tenantId: dup.id, duplicate: true };
    }

    const webhookToken = randomBytes(32).toString("hex");
    const tokenHash = hashWebhookIngressToken(webhookToken);

    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: tenantName,
        stripeCheckoutSessionId: sessionId,
        planMonthlyEventsLimit: limits.planMonthlyEventsLimit,
        planMonthlyRecoveryLimit: limits.planMonthlyRecoveryLimit,
        recoveryContactCooldownMinutes: 180,
        recoveryContactMaxAttemptsPerDay: 3,
      })
      .returning({ id: tenants.id });

    if (!tenant) throw new Error("tenant_insert_failed");

    await tx.insert(memberships).values({
      tenantId: tenant.id,
      userId,
      role: "owner",
    });

    await tx.insert(webhookIngressTokens).values({
      tenantId: tenant.id,
      tokenHash,
    });

    return { tenantId: tenant.id, duplicate: false };
  });
}
