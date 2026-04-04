import { describe, expect, it } from "vitest";
import { requiresReapproval } from "./tenant-recovery-links.js";

const baseLink = {
  id: "11111111-1111-1111-1111-111111111111",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  tenantId: "22222222-2222-2222-2222-222222222222",
  label: "Checkout recovery",
  url: "https://checkout.exemplo.com/link-a",
  platform: "Hotmart",
  triggerEventType: "payment_failed",
  productName: "Produto X",
  active: true,
  priority: 100,
  approvalStatus: "approved" as const,
  approvalNote: null,
  submittedBy: "cliente@exemplo.com",
  reviewedBy: "ops@recpay.com.br",
  reviewedAt: new Date("2026-01-02T00:00:00.000Z"),
};

describe("requiresReapproval", () => {
  it("requests a new review when a sensitive field changes", () => {
    expect(
      requiresReapproval(baseLink, {
        url: "https://checkout.exemplo.com/link-b",
      }),
    ).toBe(true);
  });

  it("does not request a new review for operational-only changes", () => {
    expect(
      requiresReapproval(baseLink, {
        label: baseLink.label,
        url: baseLink.url,
        platform: baseLink.platform,
        triggerEventType: baseLink.triggerEventType,
        productName: baseLink.productName,
      }),
    ).toBe(false);
  });
});
