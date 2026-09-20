-- ============================================================
-- Order Desk — Security & Integrity Fixes (0003)
-- Addresses review findings: pin_hash leak, cross-restaurant
-- menu_item insertion, public menu exposing all restaurants.
-- ============================================================

-- ---------- FIX 1: pin_hash leak via staff_users SELECT ----------
-- Column-level privilege: even rows a policy allows through, the
-- pin_hash column itself is never selectable over the normal
-- (anon/authenticated) connection.
revoke select on staff_users from authenticated;
grant select (id, restaurant_id, name, role, is_active, created_at)
  on staff_users to authenticated;

-- Replace the old "colleagues can view everyone" policy with:
--   - staff can see their OWN row
--   - admin/owner can see all rows in their restaurant (needed for staff management UI)
drop policy if exists "staff can view colleagues in same restaurant" on staff_users;

create policy "staff can view own row"
  on staff_users for select
  using (auth_user_id = auth.uid());

create policy "admin/owner can view all staff in restaurant"
  on staff_users for select
  using (
    restaurant_id = current_restaurant_id()
    and current_staff_role() in ('admin','owner')
  );

-- PIN verification must go through this SECURITY DEFINER function
-- (called via service role during login), which never returns the hash.
create or replace function verify_staff_pin(
  p_restaurant_id uuid,
  p_name text,
  p_pin text
)
returns table (id uuid, restaurant_id uuid, name text, role text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select su.id, su.restaurant_id, su.name, su.role
    from staff_users su
    where su.restaurant_id = p_restaurant_id
      and su.name = p_name
      and su.is_active = true
      and su.pin_hash = crypt(p_pin, su.pin_hash);
end;
$$;

-- ---------- FIX 2: order_items can reference a menu_item from another restaurant ----------
-- Orders must also reference a table owned by the same restaurant.
create or replace function check_order_table_restaurant_match()
returns trigger
language plpgsql
as $$
declare
  v_table_restaurant uuid;
begin
  select restaurant_id into v_table_restaurant
  from restaurant_tables
  where id = new.table_id;

  if v_table_restaurant is null or new.restaurant_id <> v_table_restaurant then
    raise exception 'table does not belong to the same restaurant as the order';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_check_order_table_restaurant on orders;
create trigger trg_check_order_table_restaurant
  before insert or update of restaurant_id, table_id on orders
  for each row execute function check_order_table_restaurant_match();

create or replace function check_order_item_restaurant_match()
returns trigger
language plpgsql
as $$
declare
  v_order_restaurant uuid;
  v_item_restaurant uuid;
begin
  select restaurant_id into v_order_restaurant from orders where id = new.order_id;
  select restaurant_id into v_item_restaurant from menu_items where id = new.menu_item_id;

  if v_order_restaurant is null or v_item_restaurant is null then
    raise exception 'Invalid order or menu item reference';
  end if;

  if v_order_restaurant <> v_item_restaurant then
    raise exception 'menu_item does not belong to the same restaurant as the order';
  end if;

  return new;
end;
$$;

create trigger trg_check_order_item_restaurant
  before insert or update of order_id, menu_item_id on order_items
  for each row execute function check_order_item_restaurant_match();

-- ---------- FIX 3: public menu views leak ALL restaurants' data ----------
-- Original design mistake: granting anon direct SELECT on menu_items_public
-- and menu_categories contradicts the stated architecture (customer traffic
-- should never query Postgres directly). Removing that access entirely —
-- the customer menu must be fetched through a server Route Handler
-- (service role) that already knows the verified restaurant_id from the
-- QR-token session, and explicitly filters by it there.
revoke select on menu_items_public from anon;
revoke select on menu_categories from anon;
drop view if exists menu_items_public;

-- Server-side helper (called with service role only, restaurant_id comes
-- from the verified QR session, never from client input at this stage):
create or replace function get_public_menu(p_restaurant_id uuid)
returns table (
  id uuid, category_id uuid, name text, description text,
  price numeric, photo_url text, is_veg boolean,
  is_available boolean, is_bestseller boolean
)
language sql
stable
as $$
  select id, category_id, name, description, price, photo_url,
         is_veg, is_available, is_bestseller
  from menu_items
  where restaurant_id = p_restaurant_id
    and is_available = true;
$$;
