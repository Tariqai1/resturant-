import fs from "fs";
import path from "path";

export type BroadcastType = "info" | "warning" | "alert" | "maintenance";

export type BroadcastBanner = {
  id: string;
  title: string;
  message: string;
  type: BroadcastType;
  active: boolean;
  dismissible: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SuperAdminAction =
  | "ONBOARD"
  | "PLAN_CHANGE"
  | "STATUS_CHANGE"
  | "ARCHIVE"
  | "RESTORE"
  | "DELETE"
  | "RESET_CREDENTIALS"
  | "IMPERSONATE"
  | "BROADCAST_UPDATE";

export type SuperAdminActivityItem = {
  id: string;
  action: SuperAdminAction;
  actorEmail: string;
  targetId?: string;
  targetName?: string;
  details: string;
  createdAt: string;
};

export type ArchivedRestaurantRecord = {
  id: string;
  name: string;
  archivedAt: string;
  archivedBy: string;
  reason?: string;
};

export type StaffOrderPermissions = {
  canEditOrders: boolean;
  canDeleteOrders: boolean;
  assignedPin?: string;
  phone?: string;
};

export type WaiterCallType = "waiter" | "water" | "bill" | "clean" | "cutlery" | "condiments" | "chair" | "ac" | "custom";

export type WaiterCallRequest = {
  id: string;
  tableId: string;
  tableNumber: string;
  restaurantId: string;
  type: WaiterCallType;
  customNote?: string;
  paymentMode?: "upi" | "cash" | "card";
  status: "active" | "acknowledged" | "resolved";
  createdAt: string;
  acknowledgedAt?: string;
};

export type RestaurantFeatures = {
  callWaiter: boolean;        // 🛎️ Staff buzzer module
  prepTimeTracker: boolean;   // ⏳ Live countdown timer & chef/waiter time setter
  customRequests: boolean;    // 🥄 Cutlery, dips, baby chair, custom notes
  tablePayUpi: boolean;       // 💳 Direct UPI QR settlement at table
  dishNotes: boolean;         // ✏️ Special cooking instructions per dish
  smartUpsell: boolean;       // 💡 Smart pairing recommendations in cart
  feedbackReview: boolean;    // ⭐ 5-star Google review booster
};

export const DEFAULT_RESTAURANT_FEATURES: RestaurantFeatures = {
  callWaiter: true,
  prepTimeTracker: true,
  customRequests: true,
  tablePayUpi: true,
  dishNotes: true,
  smartUpsell: true,
  feedbackReview: true,
};

export type OrderPrepEstimate = {
  orderId: string;
  minutes: number;
  setAt: string;
  setBy: "chef" | "waiter" | "admin";
};

export type RestaurantThemeType = "amber" | "crimson";

export type RestaurantThemeConfig = {
  theme: RestaurantThemeType;
  primaryColor?: string;
  darkColor?: string;
};

export type PlatformState = {
  broadcast: BroadcastBanner | null;
  activities: SuperAdminActivityItem[];
  archivedRestaurants: Record<string, ArchivedRestaurantRecord>;
  staffPermissions: Record<string, StaffOrderPermissions>;
  waiterCalls?: WaiterCallRequest[];
  restaurantThemes?: Record<string, RestaurantThemeType>;
  restaurantFeatures?: Record<string, RestaurantFeatures>;
  orderPrepEstimates?: Record<string, OrderPrepEstimate>;
  restaurantPhones?: Record<string, string>;
};

const DATA_DIR = path.join(process.cwd(), "data");
const STATE_FILE = path.join(DATA_DIR, "platform-state.json");

// In-memory fallback
let memoryState: PlatformState = {
  broadcast: {
    id: "bcast-default-1",
    title: "Order Desk System Online",
    message: "All POS terminals and multi-tenant nodes operating normally with realtime synchronization.",
    type: "info",
    active: false,
    dismissible: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  activities: [
    {
      id: "act-init-1",
      action: "STATUS_CHANGE",
      actorEmail: "tariqfsd9@gmail.com",
      targetName: "System Fleet",
      details: "Platform Command Deck initialized with active tenant sync",
      createdAt: new Date().toISOString(),
    },
  ],
  archivedRestaurants: {},
  staffPermissions: {},
  waiterCalls: [],
  restaurantThemes: {},
  restaurantFeatures: {},
  orderPrepEstimates: {},
};

function ensureDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (err) {
    console.warn("[platform-state] Could not create data directory:", err);
  }
}

export function getPlatformState(): PlatformState {
  ensureDataDir();
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      memoryState = {
        broadcast: parsed.broadcast || null,
        activities: Array.isArray(parsed.activities) ? parsed.activities : [],
        archivedRestaurants: parsed.archivedRestaurants || {},
        staffPermissions: parsed.staffPermissions || {},
        waiterCalls: Array.isArray(parsed.waiterCalls) ? parsed.waiterCalls : [],
        restaurantThemes: parsed.restaurantThemes || {},
        restaurantFeatures: parsed.restaurantFeatures || {},
        orderPrepEstimates: parsed.orderPrepEstimates || {},
      };
    } else {
      savePlatformState(memoryState);
    }
  } catch (err) {
    console.warn("[platform-state] Error reading state file, using memory:", err);
  }
  return memoryState;
}

export function savePlatformState(state: PlatformState): void {
  ensureDataDir();
  memoryState = state;
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
  } catch (err) {
    console.warn("[platform-state] Error writing state file:", err);
  }
}

export function getBroadcast(): BroadcastBanner | null {
  const state = getPlatformState();
  return state.broadcast;
}

export function setBroadcast(
  data: Partial<BroadcastBanner> & { title: string; message: string; type: BroadcastType }
): BroadcastBanner {
  const state = getPlatformState();
  const now = new Date().toISOString();
  const updated: BroadcastBanner = {
    id: state.broadcast?.id || "bcast-" + Date.now().toString(36),
    title: data.title.trim(),
    message: data.message.trim(),
    type: data.type || "info",
    active: data.active !== undefined ? data.active : true,
    dismissible: data.dismissible !== undefined ? data.dismissible : true,
    createdAt: state.broadcast?.createdAt || now,
    updatedAt: now,
  };

  state.broadcast = updated;
  savePlatformState(state);
  return updated;
}

export function clearBroadcast(): void {
  const state = getPlatformState();
  if (state.broadcast) {
    state.broadcast.active = false;
    state.broadcast.updatedAt = new Date().toISOString();
    savePlatformState(state);
  }
}

export function getActivities(limit = 100): SuperAdminActivityItem[] {
  const state = getPlatformState();
  return [...state.activities]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export function logActivity(
  entry: Omit<SuperAdminActivityItem, "id" | "createdAt">
): SuperAdminActivityItem {
  const state = getPlatformState();
  const newActivity: SuperAdminActivityItem = {
    ...entry,
    id: "act-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6),
    createdAt: new Date().toISOString(),
  };

  // Prepend activity
  state.activities.unshift(newActivity);
  // Cap history at 500 records
  if (state.activities.length > 500) {
    state.activities = state.activities.slice(0, 500);
  }

  savePlatformState(state);
  return newActivity;
}

export function isRestaurantArchived(restaurantId: string): boolean {
  const state = getPlatformState();
  return Boolean(state.archivedRestaurants[restaurantId]);
}

export function archiveRestaurant(record: ArchivedRestaurantRecord): void {
  const state = getPlatformState();
  state.archivedRestaurants[record.id] = record;
  savePlatformState(state);
}

export function restoreRestaurant(restaurantId: string): void {
  const state = getPlatformState();
  delete state.archivedRestaurants[restaurantId];
  savePlatformState(state);
}

export function getStaffPermissions(staffId: string, role?: string): StaffOrderPermissions {
  const state = getPlatformState();
  if (state.staffPermissions && state.staffPermissions[staffId]) {
    return state.staffPermissions[staffId];
  }

  // Default permissions based on role
  const r = (role || "waiter").toLowerCase();
  if (r === "owner" || r === "manager" || r === "admin") {
    return { canEditOrders: true, canDeleteOrders: true };
  }
  if (r === "captain") {
    return { canEditOrders: true, canDeleteOrders: false };
  }
  // Waiter, cashier, kitchen default
  return { canEditOrders: false, canDeleteOrders: false };
}

export function setStaffPermissions(
  staffId: string,
  permissions: Partial<StaffOrderPermissions>,
  role?: string
): StaffOrderPermissions {
  const state = getPlatformState();
  if (!state.staffPermissions) {
    state.staffPermissions = {};
  }
  const current = getStaffPermissions(staffId, role);
  state.staffPermissions[staffId] = {
    canEditOrders: permissions.canEditOrders !== undefined ? Boolean(permissions.canEditOrders) : current.canEditOrders,
    canDeleteOrders: permissions.canDeleteOrders !== undefined ? Boolean(permissions.canDeleteOrders) : current.canDeleteOrders,
    assignedPin: permissions.assignedPin !== undefined ? permissions.assignedPin : current.assignedPin,
    phone: permissions.phone !== undefined ? permissions.phone : current.phone,
  };
  savePlatformState(state);
  return state.staffPermissions[staffId];
}

export function getActiveWaiterCalls(restaurantId?: string): WaiterCallRequest[] {
  const state = getPlatformState();
  const list = state.waiterCalls || [];
  if (!restaurantId) return list.filter((c) => c.status === "active");
  return list.filter((c) => c.restaurantId === restaurantId && c.status === "active");
}

export function createWaiterCall(call: {
  tableId: string;
  tableNumber: string;
  restaurantId: string;
  type: WaiterCallType;
  customNote?: string;
  paymentMode?: "upi" | "cash" | "card";
}): WaiterCallRequest {
  const state = getPlatformState();
  if (!state.waiterCalls) state.waiterCalls = [];

  // Check if active call already exists for same table & type within last 2 minutes
  const existing = state.waiterCalls.find(
    (c) => c.tableId === call.tableId && c.type === call.type && c.status === "active"
  );
  if (existing) return existing;

  const newCall: WaiterCallRequest = {
    id: "call-" + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
    tableId: call.tableId,
    tableNumber: call.tableNumber,
    restaurantId: call.restaurantId,
    type: call.type,
    customNote: call.customNote,
    paymentMode: call.paymentMode,
    status: "active",
    createdAt: new Date().toISOString(),
  };

  state.waiterCalls.unshift(newCall);
  if (state.waiterCalls.length > 100) {
    state.waiterCalls = state.waiterCalls.slice(0, 100);
  }
  savePlatformState(state);
  return newCall;
}

export function resolveWaiterCall(callId: string): boolean {
  const state = getPlatformState();
  if (!state.waiterCalls) return false;
  const target = state.waiterCalls.find((c) => c.id === callId);
  if (target) {
    target.status = "resolved";
    target.acknowledgedAt = new Date().toISOString();
    savePlatformState(state);
    return true;
  }
  return false;
}

export function getRestaurantTheme(restaurantId?: string): RestaurantThemeType {
  if (!restaurantId) return "amber";
  const state = getPlatformState();
  if (state.restaurantThemes && state.restaurantThemes[restaurantId]) {
    return state.restaurantThemes[restaurantId];
  }
  return "amber";
}

export function setRestaurantTheme(restaurantId: string, theme: RestaurantThemeType): RestaurantThemeType {
  const state = getPlatformState();
  if (!state.restaurantThemes) {
    state.restaurantThemes = {};
  }
  state.restaurantThemes[restaurantId] = theme;
  savePlatformState(state);
  return theme;
}


export function getRestaurantFeatures(restaurantId?: string): RestaurantFeatures {
  if (!restaurantId) return { ...DEFAULT_RESTAURANT_FEATURES };
  const state = getPlatformState();
  if (state.restaurantFeatures && state.restaurantFeatures[restaurantId]) {
    return { ...DEFAULT_RESTAURANT_FEATURES, ...state.restaurantFeatures[restaurantId] };
  }
  return { ...DEFAULT_RESTAURANT_FEATURES };
}

export function setRestaurantFeatures(restaurantId: string, features: Partial<RestaurantFeatures>): RestaurantFeatures {
  const state = getPlatformState();
  if (!state.restaurantFeatures) {
    state.restaurantFeatures = {};
  }
  const current = state.restaurantFeatures[restaurantId] || { ...DEFAULT_RESTAURANT_FEATURES };
  const updated: RestaurantFeatures = { ...current, ...features };
  state.restaurantFeatures[restaurantId] = updated;
  savePlatformState(state);
  return updated;
}

export function getOrderPrepTime(orderId?: string): OrderPrepEstimate | null {
  if (!orderId) return null;
  const state = getPlatformState();
  if (state.orderPrepEstimates && state.orderPrepEstimates[orderId]) {
    return state.orderPrepEstimates[orderId];
  }
  return null;
}

export function setOrderPrepTime(
  orderId: string,
  minutes: number,
  setBy: "chef" | "waiter" | "admin" = "chef"
): OrderPrepEstimate {
  const state = getPlatformState();
  if (!state.orderPrepEstimates) {
    state.orderPrepEstimates = {};
  }
  const estimate: OrderPrepEstimate = {
    orderId,
    minutes,
    setAt: new Date().toISOString(),
    setBy,
  };
  state.orderPrepEstimates[orderId] = estimate;
  savePlatformState(state);
  return estimate;
}

export function getRestaurantPhone(restaurantId?: string): string | null {
  if (!restaurantId) return null;
  const state = getPlatformState();
  return state.restaurantPhones?.[restaurantId] || null;
}

export function setRestaurantPhone(restaurantId: string, phone: string): string {
  const state = getPlatformState();
  if (!state.restaurantPhones) {
    state.restaurantPhones = {};
  }
  state.restaurantPhones[restaurantId] = phone;
  savePlatformState(state);
  return phone;
}

