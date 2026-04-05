import assert from "node:assert/strict";
import { config } from "dotenv";
import { resolve } from "node:path";
import {
  parseHotmartToCanonical,
  parseHublaToCanonical,
  parseKiwifyToCanonical,
  verifyHotmartWebhook,
  verifyHublaWebhook,
  verifyKiwifyWebhook,
} from "@re/integrations";

config({ path: resolve(process.cwd(), ".env"), override: true });

function expectVerified(result, label) {
  assert.equal(result.ok, true, `${label}: assinatura/token deveria validar`);
}

function expectOutcomeAndIntegration(canonical, outcome, integration, label) {
  assert.ok(canonical, `${label}: canonical não pode ser null`);
  assert.equal(canonical.payment.outcome, outcome, `${label}: outcome incorreto`);
  assert.equal(canonical.integration, integration, `${label}: integração incorreta`);
  assert.ok(canonical.order.externalId, `${label}: order.externalId obrigatório`);
}

function runHotmart() {
  process.env.HOTMART_HOTTOK = "smoke_hotmart_token";
  const headers = { "x-hotmart-hottok": "smoke_hotmart_token" };
  const payload = {
    event: "PURCHASE_CANCELED",
    data: {
      purchase: { status: "CANCELED", transaction: "HOT-1", price: 120.5, currency_code: "BRL" },
      buyer: {
        id: "buyer-hot-1",
        email: "buyer.hot@example.com",
        phone: "5511999999999",
        name: "Buyer Hotmart",
      },
    },
  };
  expectVerified(verifyHotmartWebhook(headers, payload), "hotmart");
  const canonical = parseHotmartToCanonical({
    tenantId: "tenant-1",
    idempotencyKey: "key-hot-1",
    payloadHash: "hash-hot-1",
    payload,
  });
  expectOutcomeAndIntegration(canonical, "failed", "hotmart", "hotmart");

  const pendingPayload = {
    event: "PURCHASE_BILLET_PRINTED",
    creation_date: 1775412124935,
    data: {
      product: { name: "Produto teste" },
      purchase: {
        status: "BILLET_PRINTED",
        transaction: "HOT-2",
        price: { value: 1500, currency_value: "BRL" },
      },
      buyer: {
        email: "buyer.pending@example.com",
        checkout_phone_code: "55",
        checkout_phone: "11999999999",
        name: "Buyer Pending",
      },
    },
  };
  const pendingCanonical = parseHotmartToCanonical({
    tenantId: "tenant-1",
    idempotencyKey: "key-hot-2",
    payloadHash: "hash-hot-2",
    payload: pendingPayload,
  });
  expectOutcomeAndIntegration(pendingCanonical, "pending", "hotmart", "hotmart");
}

function runKiwify() {
  process.env.KIWIFY_WEBHOOK_TOKEN = "smoke_kiwify_token";
  const headers = { "x-kiwify-token": "smoke_kiwify_token" };
  const payload = {
    event: "order.refused",
    order_id: "KWF-1",
    payment_status: "failed",
    amount: 99.9,
    currency: "BRL",
    customer: {
      id: "buyer-kwf-1",
      email: "buyer.kiwify@example.com",
      phone: "5511888888888",
      name: "Buyer Kiwify",
    },
  };
  expectVerified(verifyKiwifyWebhook(headers, payload), "kiwify");
  const canonical = parseKiwifyToCanonical({
    tenantId: "tenant-1",
    idempotencyKey: "key-kwf-1",
    payloadHash: "hash-kwf-1",
    payload,
  });
  expectOutcomeAndIntegration(canonical, "failed", "kiwify", "kiwify");
}

function runHubla() {
  process.env.HUBLA_WEBHOOK_TOKEN = "smoke_hubla_token";
  const headers = { "x-hubla-token": "smoke_hubla_token" };
  const payload = {
    event: "payment.failed",
    id: "HBL-1",
    payment_status: "failed",
    amount: 89.9,
    currency: "BRL",
    customer: {
      id: "buyer-hubla-1",
      email: "buyer.hubla@example.com",
      phone: "5511777777777",
      name: "Buyer Hubla",
    },
  };
  expectVerified(verifyHublaWebhook(headers, payload), "hubla");
  const canonical = parseHublaToCanonical({
    tenantId: "tenant-1",
    idempotencyKey: "key-hbl-1",
    payloadHash: "hash-hbl-1",
    payload,
  });
  expectOutcomeAndIntegration(canonical, "failed", "hubla", "hubla");
}

try {
  runHotmart();
  runKiwify();
  runHubla();
  console.log("SMOKE_ADAPTERS_OK");
} catch (error) {
  console.error("SMOKE_ADAPTERS_FAIL", error instanceof Error ? error.message : error);
  process.exit(1);
}
