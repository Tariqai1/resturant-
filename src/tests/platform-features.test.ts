import { describe, it, expect } from "vitest";
import { DEFAULT_RESTAURANT_FEATURES, getStaffPermissions } from "@/lib/platform/state";

describe("Platform Features & RBAC Invariants", () => {
  it("should have correct defaults for high-conversion restaurant UX", () => {
    expect(DEFAULT_RESTAURANT_FEATURES.callWaiter).toBe(true);
    expect(DEFAULT_RESTAURANT_FEATURES.prepTimeTracker).toBe(true);
    expect(DEFAULT_RESTAURANT_FEATURES.smartUpsell).toBe(true);
    expect(DEFAULT_RESTAURANT_FEATURES.mobileSheetModals).toBe(true);
    expect(DEFAULT_RESTAURANT_FEATURES.autoMobileCards).toBe(true);
    expect(DEFAULT_RESTAURANT_FEATURES.orderJourneyLayout).toBe("floating_capsule");
  });

  it("should enforce strict role-based order permission defaults", () => {
    // Owner / Manager / Admin should have both edit and delete
    const ownerPerms = getStaffPermissions("staff-1", "owner");
    expect(ownerPerms.canEditOrders).toBe(true);
    expect(ownerPerms.canDeleteOrders).toBe(true);

    const managerPerms = getStaffPermissions("staff-2", "manager");
    expect(managerPerms.canEditOrders).toBe(true);
    expect(managerPerms.canDeleteOrders).toBe(true);

    // Captain can edit orders but CANNOT delete orders
    const captainPerms = getStaffPermissions("staff-3", "captain");
    expect(captainPerms.canEditOrders).toBe(true);
    expect(captainPerms.canDeleteOrders).toBe(false);

    // Waiter CANNOT edit or delete orders by default
    const waiterPerms = getStaffPermissions("staff-4", "waiter");
    expect(waiterPerms.canEditOrders).toBe(false);
    expect(waiterPerms.canDeleteOrders).toBe(false);
  });
});
