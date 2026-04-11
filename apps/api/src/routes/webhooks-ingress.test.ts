import { describe, expect, it } from "vitest";
import { detectProvider } from "./webhooks-ingress.js";
import { parseHublaToCanonical } from "../../../../packages/integrations/src/hubla.js";

const hublaCanceledSalePayload = {
  type: "CanceledSale",
  version: "1.0.0",
  event: {
    userId: "11111",
    userName: "teste",
    userEmail: "comprador-hubla-teste@example.com",
    userPhone: "(11) 98888-0000",
    userDocument: "123.456.789-11",
    groupId: "YtGoBv1N5CHTgWuUOXj",
    groupName: "teste",
    sellerId: "DnVZzJ5K9b5h6bBNYFuVuqjnMPJ3",
    recurring: "one_time_purchased",
    paymentMethod: "pix",
    transactionId: "53a0a7ba-d2f8-4285-addd-6cdf0a937568-tester",
    createdAt: "2026-04-09T16:51:50.039Z",
    expiresAt: "2026-05-09T16:51:50.039Z",
    paidAt: "2026-04-09T16:51:50.039Z",
    url: "https://example.com/53a0a7ba-d2f8-4285-addd-6cdf0a937568-tester",
    isRenewing: false,
    totalAmount: 10,
    discount: 0,
    affiliates: [],
    reason: "",
    creditCardLR: "",
  },
};

describe("Hubla webhook handling", () => {
  it("detects the Hubla canceled sale payload without relying on root id", () => {
    expect(detectProvider({}, hublaCanceledSalePayload)).toBe("hubla");
  });

  it("normalizes the Hubla canceled sale payload to a failed canonical event", () => {
    const canonical = parseHublaToCanonical({
      tenantId: "11111111-1111-1111-1111-111111111111",
      idempotencyKey: "hubla-test-1",
      payloadHash: "hash-1",
      payload: hublaCanceledSalePayload,
    });

    expect(canonical).not.toBeNull();
    expect(canonical?.integration).toBe("hubla");
    expect(canonical?.payment.outcome).toBe("failed");
    expect(canonical?.customer.email).toBe("comprador-hubla-teste@example.com");
    expect(canonical?.customer.phoneE164).toBe("(11) 98888-0000");
    expect(canonical?.customer.name).toBe("teste");
    expect(canonical?.order.amountCents).toBe(1000);
    expect(canonical?.order.currency).toBe("BRL");
    expect(canonical?.order.productName).toBe("teste");
  });
});
