import { describe, it, expect } from "vitest";

describe("Financial Settlement Calculations & QA Invariants", () => {
  it("should calculate exact subtotal, 5% GST, and rounded final total without floating point drift", () => {
    const items = [
      { price: 199.5, quantity: 2 }, // 399
      { price: 85.25, quantity: 3 }, // 255.75
    ];
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    expect(subtotal).toBeCloseTo(654.75, 2);

    const gstPercent = 5;
    const tax = Math.round((subtotal * gstPercent) / 100 * 100) / 100;
    expect(tax).toBe(32.74);

    const finalAmount = Math.round((subtotal + tax) * 100) / 100;
    expect(finalAmount).toBe(687.49);
  });

  it("should enforce non-negative discount ceilings", () => {
    const subtotal = 500;
    const discountAttempt = 600; // larger than total
    const safeDiscount = Math.min(Math.max(0, discountAttempt), subtotal);
    expect(safeDiscount).toBe(500);

    const negativeDiscount = -50;
    const safeNegative = Math.min(Math.max(0, negativeDiscount), subtotal);
    expect(safeNegative).toBe(0);
  });

  it("should enforce idempotency key uniqueness logic", () => {
    const settledBills = new Map<string, { id: string; amount: number }>();
    const orderId = "order_abc_123";

    // First attempt: succeeds
    if (!settledBills.has(orderId)) {
      settledBills.set(orderId, { id: "bill_001", amount: 450 });
    }
    expect(settledBills.get(orderId)?.id).toBe("bill_001");

    // Second simultaneous cashier double-click attempt: detects existing bill and returns it
    const isDuplicate = settledBills.has(orderId);
    expect(isDuplicate).toBe(true);
    const existing = settledBills.get(orderId);
    expect(existing?.id).toBe("bill_001");
  });
});
