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

export type PendingOrderApprovalBatch = {
  id: string;
  orderId: string;
  restaurantId: string;
  tableId: string;
  tableNumber: string;
  customerName?: string | null;
  itemIds: string[];
  totalAmount: number;
  totalItems: number;
  status: "awaiting_approval" | "approved" | "rejected";
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedReason?: string;
};

export type RestaurantFeatures = {
  callWaiter: boolean;        // 🛎️ Staff buzzer module
  prepTimeTracker: boolean;   // ⏳ Live countdown timer & chef/waiter time setter
  customRequests: boolean;    // 🥄 Cutlery, dips, baby chair, custom notes
  tablePayUpi: boolean;       // 💳 Direct UPI QR settlement at table
  dishNotes: boolean;         // ✏️ Special cooking instructions per dish
  smartUpsell: boolean;       // 💡 Smart pairing recommendations in cart
  feedbackReview: boolean;    // ⭐ 5-star Google review booster
  loyaltyOffers?: boolean;    // 🎁 Dynamic discount banner, scratch card & referrals
  waiterOrderApproval?: boolean; // 👨‍💼 Captain/waiter verification required before kitchen dispatch
  persistentAlarm?: boolean;     // 🚨 Swiggy/Zomato style repeating acoustic alarm until acknowledged
  alarmEscalationSec?: number;   // ⏱️ Seconds before escalating to Manager (Default: 90)
  whatsappAlerts?: boolean;      // 📱 Automated WhatsApp Captain / Group Dispatch
  whatsappCaptainPhone?: string; // Recipient Phone or WhatsApp group number (e.g. 919876543210)
  whatsappWebhookUrl?: string;   // Optional custom WhatsApp/Webhook gateway URL
  mobileNavStyle?: "bottom_bar" | "sidebar"; // 📱 Mobile Navigation Style (Default: 'bottom_bar')
  mobileSheetModals?: boolean; // 📲 Native Bottom Sheet Drawers for mobile forms (Default: true)
  autoMobileCards?: boolean;  // 🖼️ Auto-switch from dense tables to touch cards on mobile (Default: true)
  orderJourneyLayout?: "floating_capsule" | "split_card" | "slim_accordion"; // 🗺️ Customer live order journey UX layout
};

export const DEFAULT_RESTAURANT_FEATURES: RestaurantFeatures = {
  callWaiter: true,
  prepTimeTracker: true,
  customRequests: true,
  tablePayUpi: true,
  dishNotes: true,
  smartUpsell: true,
  feedbackReview: true,
  loyaltyOffers: true,
  waiterOrderApproval: true,
  persistentAlarm: true,
  alarmEscalationSec: 90,
  whatsappAlerts: false,
  whatsappCaptainPhone: "",
  whatsappWebhookUrl: "",
  mobileNavStyle: "bottom_bar",
  mobileSheetModals: true,
  autoMobileCards: true,
  orderJourneyLayout: "floating_capsule",
};

import {
  RestaurantOfferConfig,
  DEFAULT_OFFER_CONFIG,
  RestaurantThemeType,
  RestaurantBrandingConfig,
  DEFAULT_BRANDING_CONFIG,
  SmartUpsellConfig,
  DEFAULT_UPSELL_CONFIG,
  UpsellStrategy,
} from "@/lib/types/offers";
export {
  type RestaurantOfferConfig,
  DEFAULT_OFFER_CONFIG,
  type RestaurantThemeType,
  type RestaurantBrandingConfig,
  DEFAULT_BRANDING_CONFIG,
  type SmartUpsellConfig,
  DEFAULT_UPSELL_CONFIG,
  type UpsellStrategy,
};

export type OrderPrepEstimate = {
  orderId: string;
  minutes: number;
  setAt: string;
  setBy: "chef" | "waiter" | "admin";
};

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
  restaurantBrandings?: Record<string, RestaurantBrandingConfig>;
  restaurantFeatures?: Record<string, RestaurantFeatures>;
  restaurantOffers?: Record<string, RestaurantOfferConfig>;
  restaurantUpsellConfigs?: Record<string, SmartUpsellConfig>;
  orderPrepEstimates?: Record<string, OrderPrepEstimate>;
  restaurantPhones?: Record<string, string>;
  dishSpecialTags?: Record<string, string>;
  pendingOrderApprovals?: Record<string, PendingOrderApprovalBatch>;
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
  restaurantBrandings: {},
  restaurantFeatures: {},
  restaurantOffers: {},
  restaurantUpsellConfigs: {},
  orderPrepEstimates: {},
  restaurantPhones: {},
  dishSpecialTags: {},
  pendingOrderApprovals: {},
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

import { createAdminClient } from "@/lib/supabase/admin";

export async function syncPlatformStateToDb(state: PlatformState): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("platform_state_store")
      .upsert({
        id: "global_platform_state",
        state: state as any,
        updated_at: new Date().toISOString(),
      });
  } catch {
    // Non-blocking fallback if DB is not reachable or credentials absent
  }
}

export async function syncPlatformStateFromDb(): Promise<PlatformState> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platform_state_store")
      .select("state")
      .eq("id", "global_platform_state")
      .maybeSingle();

    if (!error && data?.state) {
      const dbState = data.state as PlatformState;
      memoryState = {
        ...memoryState,
        ...dbState,
      };
      try {
        ensureDataDir();
        fs.writeFileSync(STATE_FILE, JSON.stringify(memoryState, null, 2), "utf-8");
      } catch {}
      return memoryState;
    }
  } catch {
    // Non-blocking fallback
  }
  return getPlatformState();
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
        restaurantBrandings: parsed.restaurantBrandings || {},
        restaurantFeatures: parsed.restaurantFeatures || {},
        restaurantOffers: parsed.restaurantOffers || {},
        restaurantUpsellConfigs: parsed.restaurantUpsellConfigs || {},
        orderPrepEstimates: parsed.orderPrepEstimates || {},
        restaurantPhones: parsed.restaurantPhones || {},
        dishSpecialTags: parsed.dishSpecialTags || {},
        pendingOrderApprovals: parsed.pendingOrderApprovals || {},
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
    // In serverless / read-only filesystem environments, writing to disk might fail.
    // Memory state and Supabase DB sync handle persistence.
  }

  // Background async persistence to database
  try {
    syncPlatformStateToDb(state).catch(() => {});
  } catch {}
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

export function getRestaurantBranding(restaurantId?: string): RestaurantBrandingConfig {
  if (!restaurantId) return { ...DEFAULT_BRANDING_CONFIG };
  const state = getPlatformState();
  const theme = getRestaurantTheme(restaurantId);
  if (state.restaurantBrandings && state.restaurantBrandings[restaurantId]) {
    return { ...DEFAULT_BRANDING_CONFIG, ...state.restaurantBrandings[restaurantId], theme };
  }
  return { ...DEFAULT_BRANDING_CONFIG, theme };
}

export function setRestaurantBranding(
  restaurantId: string,
  branding: Partial<RestaurantBrandingConfig>
): RestaurantBrandingConfig {
  const state = getPlatformState();
  if (!state.restaurantBrandings) {
    state.restaurantBrandings = {};
  }
  const current = getRestaurantBranding(restaurantId);
  const updated: RestaurantBrandingConfig = { ...current, ...branding };
  state.restaurantBrandings[restaurantId] = updated;
  if (branding.theme) {
    setRestaurantTheme(restaurantId, branding.theme);
  }
  savePlatformState(state);
  return updated;
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

export function getRestaurantOfferConfig(restaurantId?: string): RestaurantOfferConfig {
  if (!restaurantId) return { ...DEFAULT_OFFER_CONFIG };
  const state = getPlatformState();
  if (state.restaurantOffers && state.restaurantOffers[restaurantId]) {
    return { ...DEFAULT_OFFER_CONFIG, ...state.restaurantOffers[restaurantId] };
  }
  return { ...DEFAULT_OFFER_CONFIG };
}

export function setRestaurantOfferConfig(
  restaurantId: string,
  config: Partial<RestaurantOfferConfig>
): RestaurantOfferConfig {
  const state = getPlatformState();
  if (!state.restaurantOffers) {
    state.restaurantOffers = {};
  }
  const current = state.restaurantOffers[restaurantId] || { ...DEFAULT_OFFER_CONFIG };
  const updated: RestaurantOfferConfig = { ...current, ...config };
  state.restaurantOffers[restaurantId] = updated;
  savePlatformState(state);
  return updated;
}

export function getRestaurantUpsellConfig(restaurantId?: string): SmartUpsellConfig {
  if (!restaurantId) return { ...DEFAULT_UPSELL_CONFIG };
  const state = getPlatformState();
  if (state.restaurantUpsellConfigs && state.restaurantUpsellConfigs[restaurantId]) {
    return { ...DEFAULT_UPSELL_CONFIG, ...state.restaurantUpsellConfigs[restaurantId] };
  }
  return { ...DEFAULT_UPSELL_CONFIG };
}

export function setRestaurantUpsellConfig(
  restaurantId: string,
  config: Partial<SmartUpsellConfig>
): SmartUpsellConfig {
  const state = getPlatformState();
  if (!state.restaurantUpsellConfigs) {
    state.restaurantUpsellConfigs = {};
  }
  const current = state.restaurantUpsellConfigs[restaurantId] || { ...DEFAULT_UPSELL_CONFIG };
  const updated: SmartUpsellConfig = { ...current, ...config };
  state.restaurantUpsellConfigs[restaurantId] = updated;
  // Also sync the features.smartUpsell boolean flag
  if (config.enabled !== undefined) {
    setRestaurantFeatures(restaurantId, { smartUpsell: config.enabled });
  }
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

export function getDishSpecialTag(dishId: string): string | null {
  if (!dishId) return null;
  const state = getPlatformState();
  return state.dishSpecialTags?.[dishId] || null;
}

export function setDishSpecialTag(dishId: string, tag: string | null): void {
  if (!dishId) return;
  const state = getPlatformState();
  if (!state.dishSpecialTags) {
    state.dishSpecialTags = {};
  }
  if (tag && tag.trim()) {
    state.dishSpecialTags[dishId] = tag.trim();
  } else {
    delete state.dishSpecialTags[dishId];
  }
  savePlatformState(state);
}

export function registerPendingOrderBatch(
  batch: Omit<PendingOrderApprovalBatch, "id" | "status" | "createdAt">
): PendingOrderApprovalBatch {
  const state = getPlatformState();
  if (!state.pendingOrderApprovals) {
    state.pendingOrderApprovals = {};
  }
  const id = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const record: PendingOrderApprovalBatch = {
    ...batch,
    id,
    status: "awaiting_approval",
    createdAt: new Date().toISOString(),
  };
  state.pendingOrderApprovals[id] = record;
  savePlatformState(state);
  return record;
}

export function getActivePendingApprovals(restaurantId: string): PendingOrderApprovalBatch[] {
  const state = getPlatformState();
  if (!state.pendingOrderApprovals) return [];
  return Object.values(state.pendingOrderApprovals).filter(
    (b) => b.restaurantId === restaurantId && b.status === "awaiting_approval"
  );
}

export function isTableAwaitingApproval(tableId: string): boolean {
  const state = getPlatformState();
  if (!state.pendingOrderApprovals) return false;
  return Object.values(state.pendingOrderApprovals).some(
    (b) => b.tableId === tableId && b.status === "awaiting_approval"
  );
}

export function getPendingApprovalItemIds(restaurantId: string): Set<string> {
  const activeBatches = getActivePendingApprovals(restaurantId);
  const itemIds = new Set<string>();
  for (const batch of activeBatches) {
    for (const id of batch.itemIds) {
      itemIds.add(id);
    }
  }
  return itemIds;
}

export function approveOrderBatch(batchId: string, approvedBy?: string): PendingOrderApprovalBatch | null {
  const state = getPlatformState();
  if (!state.pendingOrderApprovals || !state.pendingOrderApprovals[batchId]) return null;
  const batch = state.pendingOrderApprovals[batchId];
  batch.status = "approved";
  batch.approvedAt = new Date().toISOString();
  if (approvedBy) batch.approvedBy = approvedBy;
  savePlatformState(state);
  return batch;
}

export function rejectOrderBatch(batchId: string, reason?: string): PendingOrderApprovalBatch | null {
  const state = getPlatformState();
  if (!state.pendingOrderApprovals || !state.pendingOrderApprovals[batchId]) return null;
  const batch = state.pendingOrderApprovals[batchId];
  batch.status = "rejected";
  if (reason) batch.rejectedReason = reason;
  savePlatformState(state);
  return batch;
}



