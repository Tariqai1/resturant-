# Order Desk — Admin Panel (Poore App Ka Control Center)

Admin panel wo jagah hai jaha se **poori application control hoti hai** — bina developer ki madad ke, restaurant owner/manager khud sab kuch manage kar sake. Neeche sab features category-wise organized hain, MVP vs future marked hai.

---

## 1. Restaurant Profile & Settings
- Restaurant naam, address, contact number, GSTIN edit karna
- Operating hours set karna (kab tak orders accept honge)
- Logo/branding upload (customer-facing menu par dikhega)
- Subscription plan/status dekhna (trial/basic/pro)
> **MVP:** Naam, GSTIN, basic settings ✅ | Operating hours, logo ⏳ v2

---

## 2. Table Management
- Table count set karna (1-60)
- Har table ka QR code generate/download/print karna
- Table status manually override karna (jaise "under cleaning", "reserved")
- Table merge/split (bade group ke liye) — future
- QR token regenerate karna (agar kisi table ka QR compromise ho jaaye)
> **MVP:** Table count, QR generate ✅ | Merge/split, manual override ⏳ v2

---

## 3. Menu Management
- Category add/edit/archive
- Item add/edit/archive — naam, price, description, photo, veg/non-veg, spice level, bestseller tag
- Item availability toggle (turant "sold out" mark karna)
- Bulk price update
- Price history dekhna
- Cost price set karna → automatic profit margin % dikhna (sirf admin ko)
- Combo/thali deals banana — future
> **MVP:** Full CRUD, availability toggle ✅ | Bulk update, cost/margin, combos ⏳ v2

---

## 4. Staff & Access Management (RBAC)
- Naye staff/kitchen/admin accounts banana
- Role assign karna (Staff / Kitchen / Admin)
- PIN reset karna
- Staff ko deactivate karna (jab koi chhod de)
- Kaun kya kar sakta hai — permission matrix control (advanced, future)
> **MVP:** Add/edit/deactivate staff, PIN reset, role assign ✅

---

## 5. Order & Kitchen Oversight
- Sab active orders live dekhna (sirf apne role ke tabs tak limited nahi — admin sab dekh sakta hai)
- Kisi order/item ko manually cancel karna (with reason — audit ho)
- Kitchen ke response-time thresholds set karna (jaise "10 min = warning, 20 min = critical")
> **MVP:** Live view, manual cancel ✅ | Configurable thresholds ⏳ v2

---

## 6. Billing & Payments Control
- Sab bills/payments ka record dekhna
- Discount/complimentary item dena (reason ke saath, audit-logged)
- Tax configuration — CGST/SGST rate set karna
- Payment mode settings (cash/UPI/card/online enable-disable)
- Refund process karna
> **MVP:** Bill view, tax config ✅ | Discount UI, refund workflow ⏳ v2

---

## 7. Offers, Pricing & Growth Tools
- Offer/discount banana (%, fixed, date-range, minimum-order)
- Happy-hour/time-based pricing set karna
- Loyalty program configure karna (visits → reward)
- Referral program on/off aur reward amount set karna
> ⏳ **Sab v2 mein** — MVP mein nahi

---

## 8. Analytics & Reports Dashboard
- Aaj ka collection, order count, average order value
- Best-selling / slow-moving items
- Table turnover time
- Staff performance
- Daily/weekly/monthly custom-range reports
> ⏳ **v2** — MVP mein sirf basic order-history rahega, dashboard nahi

---

## 9. Feature Toggles (App-wide switches)
- Staff order taking — on/off
- Customer self-order (QR) — on/off
- Kitchen display — on/off
- Billing module — on/off
- (Future) Offers engine, loyalty, notifications — on/off
> **MVP:** Core 4 toggles ✅ (already prototype mein hai)

---

## 10. QR Code / Customer-facing Control
- QR token expiry/rotation trigger karna
- Customer-order flow ka preview dekhna (jaisa customer dekhta hai)
- Festival/occasion banner on-off karna (customer screen par)
> **MVP:** Basic QR management ✅ | Banner, rotation-schedule ⏳ v2

---

## 11. Notifications Configuration
- Owner ko kab alert milega (jaise negative rating, daily summary) — configure karna
- WhatsApp/SMS integration on-off aur templates edit karna
> ⏳ **v2**

---

## 12. Security & Audit
- Audit log dekhna — kisne kab kya change kiya (menu edit, discount diya, PIN reset kiya)
- Login history dekhna (kaun kab login hua kis device se)
- Data export (apna data download karna — backup/portability ke liye)
> **MVP:** Basic audit_log table hai (already schema mein bana) ✅ | UI se dekhna ⏳ v2

---

## 13. Multi-branch / SaaS-level control (agar future mein multiple restaurants ek hi owner ke)
- Ek owner ke multiple restaurant-branches manage karna, ek hi login se switch karna
- Branch-wise reports compare karna
> ⏳ **Future** — sirf tab zaroori jab ek hi owner ke 2+ branches hon

---

## Admin Panel Ka Structure (Navigation)

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

## Priority — MVP Admin Panel Mein Sabse Pehle Kya Ho

1. **Feature toggles** — already prototype mein hai
2. **Menu management (full CRUD)** — roz ka kaam (Starters, Mains, Pricing, Veg/Non-veg)
3. **Table + QR management** — floor setup aur QR generation ke liye zaroori
4. **Staff/PIN management** — security foundation (Waiter/Kitchen/Admin accounts)
5. **Billing view + tax config** — daily operations aur GST compliance
6. **Baaki sab (offers, analytics, loyalty)** — v2 roadmap mein
