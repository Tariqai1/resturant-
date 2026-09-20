-- ============================================================
-- Order Desk — Row Level Security (0002)
--
-- Architecture note:
--   STAFF / KITCHEN / ADMIN  → authenticated via Supabase Auth,
--     RLS scoped by their own restaurant_id (looked up from staff_users).
--   CUSTOMER (QR ordering)   → NO Supabase Auth session. Their requests
--     go through a Next.js server Route Handler which validates the
--     QR token first, then writes using the SERVICE ROLE key
--     (bypasses RLS on the server, never exposed to the browser).
--     This avoids trying to force anonymous multi-party cart writes
--     through client-side RLS, which gets fragile fast.
-- ============================================================

-- Helper: current logged-in staff member's restaurant_id
create or replace function current_restaurant_id()
returns uuid
language sql stable
as $$
  select restaurant_id from staff_users
  where auth_user_id = auth.uid()
  limit 1;
$$;

-- Helper: current logged-in staff member's role
create or replace function current_staff_role()
returns text
language sql stable
as $$
  select role from staff_users
  where auth_user_id = auth.uid()
  limit 1;
$$;

alter table restaurants enable row level security;
alter table staff_users enable row level security;
alter table restaurant_tables enable row level security;
alter table menu_categories enable row level security;
alter table menu_items enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table bills enable row level security;

-- ---------- restaurants ----------
create policy "staff can view own restaurant"
  on restaurants for select
  using (id = current_restaurant_id());

-- ---------- staff_users ----------
create policy "staff can view colleagues in same restaurant"
  on staff_users for select
  using (restaurant_id = current_restaurant_id());


create policy "only admin/owner can manage staff"
  on staff_users for insert with check (
    restaurant_id = current_restaurant_id()
    and current_staff_role() in ('admin','owner')
  );

create policy "only admin/owner can update staff"
  on staff_users for update using (
    restaurant_id = current_restaurant_id()
    and current_staff_role() in ('admin','owner')
  );

-- ---------- restaurant_tables ----------
create policy "staff can view own restaurant tables"
  on restaurant_tables for select
  using (restaurant_id = current_restaurant_id());

create policy "admin/owner can manage tables"
  on restaurant_tables for all using (
    restaurant_id = current_restaurant_id()
    and current_staff_role() in ('admin','owner')
  );

-- ---------- menu_categories / menu_items (staff-side full access) ----------
create policy "staff can view own restaurant menu"
  on menu_categories for select using (restaurant_id = current_restaurant_id());

create policy "admin/owner can manage categories"
  on menu_categories for all using (
    restaurant_id = current_restaurant_id()
    and current_staff_role() in ('admin','owner')
  );

create policy "staff can view own restaurant menu items"
  on menu_items for select using (restaurant_id = current_restaurant_id());

create policy "admin/owner can manage menu items"
  on menu_items for all using (
    restaurant_id = current_restaurant_id()
    and current_staff_role() in ('admin','owner')
  );

-- Public (customer, anon key) menu access WITHOUT cost_price:
-- expose a view instead of the raw table so cost_price never leaks.
create view menu_items_public as
  select id, restaurant_id, category_id, name, description, price,
         photo_url, is_veg, is_available, is_bestseller
  from menu_items
  where is_available = true;

-- ---------- orders / order_items (staff + kitchen) ----------
create policy "staff/kitchen can view own restaurant orders"
  on orders for select using (restaurant_id = current_restaurant_id());

create policy "staff/admin can create/update orders"
  on orders for all using (
    restaurant_id = current_restaurant_id()
    and current_staff_role() in ('staff','admin','owner')
  );

create policy "staff/kitchen can view order items"
  on order_items for select using (
    order_id in (select id from orders where restaurant_id = current_restaurant_id())
  );

create policy "staff can add items"
  on order_items for insert with check (
    order_id in (select id from orders where restaurant_id = current_restaurant_id())
    and current_staff_role() in ('staff','admin','owner')
  );

create policy "staff/kitchen can update item status"
  on order_items for update using (
    order_id in (select id from orders where restaurant_id = current_restaurant_id())
    and current_staff_role() in ('staff','kitchen','admin','owner')
  );

-- ---------- bills ----------
create policy "admin/staff can view bills"
  on bills for select using (
    order_id in (select id from orders where restaurant_id = current_restaurant_id())
  );

create policy "admin/staff can manage bills"
  on bills for all using (
    order_id in (select id from orders where restaurant_id = current_restaurant_id())
    and current_staff_role() in ('staff','admin','owner')
  );

-- ---------- Note on cost_price / kitchen role ----------
-- Kitchen role gets SELECT on order_items (to see tickets) but has
-- NO policy granting access to menu_items.cost_price or bills totals —
-- enforce this additionally at the application layer by never
-- selecting cost_price in kitchen-facing queries.
