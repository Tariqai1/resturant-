# Order Desk — Restaurant Operating System

> **Design Philosophy: "Warm Paper Kitchen Ticket"**  
> Grounded in real restaurant chits and receipts. Built for people using this screen 200+ times a day under intense rush-hour time pressure — not for a generic SaaS portfolio.

---

## 1. Visual & Motion System

| Design Element | Specification | Rationale |
| :--- | :--- | :--- |
| **Paper Canvas** | `#FAF6EC` (Warm Cream), `#F1EADA` (Dim Chits) | Calm, paper chits under harsh kitchen fluorescent lights; zero eye fatigue. |
| **Ink Typography** | `#2A241C` (Dark Ink), `#6B6153` (Soft Ink) | High contrast tactile ink feel. |
| **Hairline Borders** | `#DCD1B7` | Subtly structural; mimics printed chit perforations. |
| **Status: Pending** | `#C1652C` (Warm Amber/Rust) + Dot + Monospace Tag | High peripheral visibility for incoming orders. |
| **Status: Preparing** | `#3C5A72` (Ink Blue) + Dot + Monospace Tag | Distinguishes active cooking tickets from new alerts. |
| **Status: Served / Paid** | `#5B7A55` (Sage Green) + Dot + Monospace Tag | Clear confirmation of completed actions. |
| **Status: Urgent / Unpaid** | `#A8412F` (Brick Red) + Alert Pill | Demands immediate attention without blinking/playfulness. |
| **Display Font** | `Oswald` (Condensed, Confident) | Compact numeric clarity for table numbers, totals, and times. |
| **Body Font** | `Inter` (Clear, Neutral) | Instant legibility on low-cost Android tablets and phones. |
| **Chit Font** | `JetBrains Mono` | Authentic kitchen printer output; strict tabular numerical alignment. |

### Motion Budget
- **Routine Actions (Taps, Quantities, Tabs)**: `100ms - 150ms` (GPU `transform` / `opacity` only).
- **Hero State Change (Send Order to Kitchen, Settle Bill)**: `200ms - 250ms` gentle scale/receipt-tear feedback.
- **Physical Urgency (New Kitchen Ticket Arrives)**: Subtle slide-in with single calm pulse. Zero playful bounces or confetti.
- **Accessibility**: Full `@media (prefers-reduced-motion: reduce)` support with instant fallbacks.

---

## 2. Features Jo Ban Gaye Hain (Completed Features)

### Architecture & Database
- [x] **Relational Schema (`0001`)**: `restaurants`, `staff_users`, `restaurant_tables`, `menu_categories`, `menu_items`, `orders`, `order_items`, `bills`.
- [x] **Row-Level Security (`0002` & `0003`)**: Isolated tenant policies ensuring staff can never read or mutate cross-restaurant records.
- [x] **Financial State Machine & Ledger (`0004`)**:
  - Auto bill numbering sequence (`bill_number_seq`).
  - CGST / SGST tax calculation columns.
  - State machine triggers for table status transitions (`empty` → `pending` → `preparing` → `served` → `payment_pending`).
  - Ledger-backed `payment_transactions` with automatic bill status recalculation (`unpaid` → `partially_paid` → `paid`).
- [x] **Safe RLS Helper Functions (`0005`)**: `current_restaurant_id()` and `current_staff_role()` with `security definer` to eliminate policy recursion.
- [x] **Database Smoke Tests (`database_smoke_test.sql`)**: Automated assertions for multi-tenant boundaries and invalid status jump rejections.

### Authentication, Security & Proxy
- [x] **Next.js 16 Proxy (`src/proxy.ts`)**: Replaces legacy middleware. Manages session cookie hydration via `@supabase/ssr`.
- [x] **API Route Guarding**: All `/api/*` endpoints (except `/api/health` and `/api/setup`) immediately return `401 JSON` (`Staff authentication required`) rather than redirecting API callers to HTML.
- [x] **First-Time Restaurant Provisioning (`/setup` & `/api/setup`)**: Single-tenant initializer locking out further account creation once the first administrator exists (`409 Conflict`).
- [x] **Staff Password Authentication (`/login`)**: Cookie-based server session establishment via Supabase Auth.
- [x] **Privileged Server Operations (`src/lib/supabase/admin.ts`)**: Service-role execution bypass for administrative permission checks while enforcing tenant filtering.

### Operations Dashboard (`/`)
- [x] **Live Identity Binding**: Displays real restaurant name (`Tauheed Resto`), logged-in staff member (`Tauheed`), role badges, and initial avatars.
- [x] **Dynamic Table Grid**: Renders live tables from Supabase with status-tone mapping (`empty`, `pending`, `preparing`, `served`, `payment_pending`).
- [x] **Slide-Out Table Order Drawer**:
  - Modal backdrop with spatial context.
  - Active selection showing live bill total, guests, and current table status.
- [x] **Session Sign-Out**: One-tap sign-out action clearing Supabase cookies and returning to `/login`.

### Staff Management (`/staff`)
- [x] **Role-Gated Access (`/api/staff`)**: Restricted exclusively to `owner` and `admin` roles.
- [x] **Active Team Directory**: Displays team members, role tags, active/inactive status badges, and localized join dates.

---

## 3. Features Jo Baki Hain (Roadmap / Next Features)

### 🧑‍🍳 Persona 1: Kitchen Staff (Kitchen Display System — KDS)
*Conditions: Glanced from 4–6 feet away, heat, noise, greasy hands. Zero small text.*
- [ ] **Dedicated KDS View (`/kitchen`)**: High-contrast, full-screen ticket rail.
- [ ] **Printed Chit Aesthetic**: Orders displayed in `JetBrains Mono` with table number in bold `Oswald`.
- [ ] **Elapsed Timer Alerts**: Tickets turn from `pending` (amber) to `warning` (8+ min) to `critical` (12+ min brick red).
- [ ] **1-Tap Chit Status Advancement**: Giant touch target button (`Start Cooking` → `Mark Served`) with instant optimistic transition.
- [ ] **Audio Chime on New Ticket**: Subtle chime when a waiter/customer dispatches a new order.

### 🏃 Persona 2: Floor Waiter / Staff (Speed POS)
*Conditions: One-handed phone/tablet, fast walking, loud floor, customer waiting.*
- [ ] **Fast Table Order Pad**: Tap table → tap menu item (+/- quantity) → tap "Send to Kitchen" (Max 2 taps).
- [ ] **Instant Optimistic Cart**: Zero latency when adding items; offline-safe buffer.
- [ ] **Hero Confirm Motion**: Receipt chits drop with a clean 200ms slide-down confirming the kitchen has received the ticket.
- [ ] **Quick Table Status Switch**: Change table from `Served` to `Payment Pending` or `Clear Table` with a 2-tap confirmation sheet.

### 📱 Persona 3: Customer (QR Table Ordering)
*Conditions: Mobile browser, casual, low patience, wants food fast without downloading an app.*
- [ ] **Public QR Landing Route (`/table/[token]`)**: Validates token and renders the restaurant's live digital menu without login.
- [ ] **Visual Food Menu**: Filter by Veg / Non-Veg, bestsellers, spice level tags, and descriptions.
- [ ] **Group Ordering Chits**: Customers at the same table can add their name to item notes.
- [ ] **Server-Side Write Bypass**: Order submission validates QR token and creates orders via Service Role on the backend.

### 💼 Persona 4: Owner / Admin (Operations & Control)
*Conditions: Desk-based, high focus, wants financial accuracy and team governance.*
- [ ] **Add Staff Modal (`/staff`)**: Unblock the `+ Add staff` button with an invite form (Name, Role, 4-digit PIN hash).
- [ ] **Menu Management (`/menu`)**:
  - Add / edit menu categories (Starters, Mains, Desserts, Drinks).
  - Toggle item availability in real-time (instant 86ing an out-of-stock dish).
  - Cost price tracking (visible only to Admin/Owner).
- [ ] **Billing & Payment Desk (`/billing`)**:
  - Bill generation with CGST & SGST breakdowns.
  - Multi-mode payment recording (`cash`, `upi`, `card`).
  - Thermal receipt printing layout.

---

## 4. Order Desk — Admin Panel (Poore App Ka Control Center)

Admin panel wo jagah hai jaha se **poori application control hoti hai** — bina developer ki madad ke, restaurant owner/manager khud sab kuch manage kar sake. Neeche sab features category-wise organized hain, MVP vs future marked hai.

### 1. Restaurant Profile & Settings
- Restaurant naam, address, contact number, GSTIN edit karna
- Operating hours set karna (kab tak orders accept honge)
- Logo/branding upload (customer-facing menu par dikhega)
- Subscription plan/status dekhna (trial/basic/pro)
> **MVP:** Naam, GSTIN, basic settings ✅ | Operating hours, logo ⏳ v2

### 2. Table Management
- Table count set karna (1-60)
- Har table ka QR code generate/download/print karna
- Table status manually override karna (jaise "under cleaning", "reserved")
- Table merge/split (bade group ke liye) — future
- QR token regenerate karna (agar kisi table ka QR compromise ho jaaye)
> **MVP:** Table count, QR generate ✅ | Merge/split, manual override ⏳ v2

### 3. Menu Management
- Category add/edit/archive
- Item add/edit/archive — naam, price, description, photo, veg/non-veg, spice level, bestseller tag
- Item availability toggle (turant "sold out" mark karna)
- Bulk price update
- Price history dekhna
- Cost price set karna → automatic profit margin % dikhna (sirf admin ko)
- Combo/thali deals banana — future
> **MVP:** Full CRUD, availability toggle ✅ | Bulk update, cost/margin, combos ⏳ v2

### 4. Staff & Access Management (RBAC)
- Naye staff/kitchen/admin accounts banana
- Role assign karna (Staff / Kitchen / Admin)
- PIN reset karna
- Staff ko deactivate karna (jab koi chhod de)
- Kaun kya kar sakta hai — permission matrix control (advanced, future)
> **MVP:** Add/edit/deactivate staff, PIN reset, role assign ✅

### 5. Order & Kitchen Oversight
- Sab active orders live dekhna (sirf apne role ke tabs tak limited nahi — admin sab dekh sakta hai)
- Kisi order/item ko manually cancel karna (with reason — audit ho)
- Kitchen ke response-time thresholds set karna (jaise "10 min = warning, 20 min = critical")
> **MVP:** Live view, manual cancel ✅ | Configurable thresholds ⏳ v2

### 6. Billing & Payments Control
- Sab bills/payments ka record dekhna
- Discount/complimentary item dena (reason ke saath, audit-logged)
- Tax configuration — CGST/SGST rate set karna
- Payment mode settings (cash/UPI/card/online enable-disable)
- Refund process karna
> **MVP:** Bill view, tax config ✅ | Discount UI, refund workflow ⏳ v2

### 7. Offers, Pricing & Growth Tools
- Offer/discount banana (%, fixed, date-range, minimum-order)
- Happy-hour/time-based pricing set karna
- Loyalty program configure karna (visits → reward)
- Referral program on/off aur reward amount set karna
> ⏳ **Sab v2 mein** — MVP mein nahi

### 8. Analytics & Reports Dashboard
- Aaj ka collection, order count, average order value
- Best-selling / slow-moving items
- Table turnover time
- Staff performance
- Daily/weekly/monthly custom-range reports
> ⏳ **v2** — MVP mein sirf basic order-history rahega, dashboard nahi

### 9. Feature Toggles (App-wide switches)
- Staff order taking — on/off
- Customer self-order (QR) — on/off
- Kitchen display — on/off
- Billing module — on/off
- (Future) Offers engine, loyalty, notifications — on/off
> **MVP:** Core 4 toggles ✅ (already prototype mein hai)

### 10. QR Code / Customer-facing Control
- QR token expiry/rotation trigger karna
- Customer-order flow ka preview dekhna (jaisa customer dekhta hai)
- Festival/occasion banner on-off karna (customer screen par)
> **MVP:** Basic QR management ✅ | Banner, rotation-schedule ⏳ v2

### 11. Notifications Configuration
- Owner ko kab alert milega (jaise negative rating, daily summary) — configure karna
- WhatsApp/SMS integration on-off aur templates edit karna
> ⏳ **v2**

### 12. Security & Audit
- Audit log dekhna — kisne kab kya change kiya (menu edit, discount diya, PIN reset kiya)
- Login history dekhna (kaun kab login hua kis device se)
- Data export (apna data download karna — backup/portability ke liye)
> **MVP:** Basic audit_log table hai (already schema mein bana) ✅ | UI se dekhna ⏳ v2

### 13. Multi-branch / SaaS-level control
- Ek owner ke multiple restaurant-branches manage karna, ek hi login se switch karna
- Branch-wise reports compare karna
> ⏳ **Future** — sirf tab zaroori jab ek hi owner ke 2+ branches hon

---

### Admin Panel Ka Structure (Navigation)

```
Admin
├── Dashboard          (revenue snapshot — v2)
├── Restaurant Profile
├── Tables             (count, QR)
├── Menu               (categories, items, pricing)
├── Staff              (accounts, roles, PINs)
├── Orders             (live view, history)
├── Billing            (bills, tax, discounts)
├── Offers/Loyalty     (v2)
├── Settings           (feature toggles)
└── Audit Log
```

---

### Priority — MVP Admin Panel Mein Sabse Pehle Kya Ho

1. **Feature toggles** — already prototype mein hai
2. **Menu management (full CRUD)** — roz ka kaam (Starters, Mains, Pricing, Veg/Non-veg)
3. **Table + QR management** — floor setup aur QR generation ke liye zaroori
4. **Staff/PIN management** — security foundation (Waiter/Kitchen/Admin accounts)
5. **Billing view + tax config** — daily operations aur GST compliance
6. **Baaki sab (offers, analytics, loyalty)** — v2 roadmap mein

---

## 5. Operational Principles Checklist

Before shipping any component or screen:
1. **Legibility Test**: Can a tired waiter at 11pm read the status in under half a second?
2. **Action Proximity**: Is the primary action in the bottom half of the screen for one-handed operation?
3. **Motion Purpose**: Does every transition communicate a state change (or is it just decoration)?
4. **Touch Targets**: Are all interactive elements at least 44×44px?
5. **Color Accessibility**: Is status conveyed via **Color + Icon + Text** together?

