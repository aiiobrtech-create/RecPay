import { describe, expect, it } from "vitest";
import { detectProvider } from "./webhooks-ingress.js";
import { parseHublaToCanonical } from "../../../../packages/integrations/src/hubla.js";

const hublaInvoiceFailedPayload = {
  type: "invoice.payment_failed",
  version: "2.0.0",
  event: {
    product: {
      id: "inAVzweR0QYw5y03K5mq",
      name: "Integrações com Webhook 2.0",
    },
    products: [
      {
        id: "inAVzweR0QYw5y03K5mq",
        name: "Integrações com Webhook 2.0",
      },
    ],
    invoice: {
      id: "7614b1bb-1d1a-43ba-890c-50d74216eb56",
      payerId: "J0kmLJmCj1TO4m3pqW0GDlEjROQ2",
      payer: {
        id: "J0kmLJmCj1TO4m3pqW0GDlEjROQ2",
        firstName: "John",
        lastName: "Doe",
        document: "12345678000190",
        email: "johndoe.payer@example.com",
        phone: "+5511999999999",
      },
      currency: "BRL",
      amount: {
        totalCents: 112320,
      },
      status: "draft",
      saleDate: "2024-03-28T20:35:22.671Z",
      createdAt: "2024-03-28T20:35:22.671Z",
      modifiedAt: "2024-03-28T20:35:22.671Z",
    },
    user: {
      id: "J0kmLJmCj1TO4m3pqW0GDlEjROQ2",
      firstName: "John",
      lastName: "Doe",
      document: "12345678900",
      email: "johndoe.user@example.com",
      phone: "+5511999999999",
    },
  },
};

describe("Hubla webhook handling", () => {
  it("detects the official Hubla v2 payload without relying on root id", () => {
    expect(detectProvider({}, hublaInvoiceFailedPayload)).toBe("hubla");
  });

  it("normalizes the official Hubla invoice failure payload to a failed canonical event", () => {
    const canonical = parseHublaToCanonical({
      tenantId: "11111111-1111-1111-1111-111111111111",
      idempotencyKey: "hubla-test-1",
      payloadHash: "hash-1",
      payload: hublaInvoiceFailedPayload,
    });

    expect(canonical).not.toBeNull();
    expect(canonical?.integration).toBe("hubla");
    expect(canonical?.payment.outcome).toBe("failed");
    expect(canonical?.customer.email).toBe("johndoe.payer@example.com");
    expect(canonical?.customer.phoneE164).toBe("+5511999999999");
    expect(canonical?.customer.name).toBe("John Doe");
    expect(canonical?.order.amountCents).toBe(112320);
    expect(canonical?.order.currency).toBe("BRL");
    expect(canonical?.order.productName).toBe("Integrações com Webhook 2.0");
  });
});
