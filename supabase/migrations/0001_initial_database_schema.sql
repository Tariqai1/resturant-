-- ============================================================
-- Order Desk — MVP Schema (0001)
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Restaurants ----------
create table restaurants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_email text not null,
  gstin text,
  subscription_plan text not null default 'trial' check (subscription_plan in ('trial','basic','pro')),
  subscription_status text not null default 'active' check (subscription_status in ('active','expired','cancelled')),
  created_at timestamptz not null default now()
);

-- ---------- Staff / Kitchen / Admin users ----------
create table staff_users (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null, -- linked once they log in via Supabase Auth
  name text not null,
  role text not null check (role in ('staff','kitchen','admin','owner')),
  pin_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_staff_auth_user on staff_users(auth_user_id);

-- ---------- Tables ----------
create table restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_number text not null,
  qr_token text not null unique default encode(gen_random_bytes(16), 'hex'),
  status text not null default 'empty' check (status in ('empty','pending','preparing','served','payment_pending')),
  created_at timestamptz not null default now(),
  unique (restaurant_id, table_number)
);

-- ---------- Menu ----------
create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_archived boolean not null default false
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  category_id uuid references menu_categories(id) on delete set null,
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  cost_price numeric(10,2),                 -- visible to admin/owner only (enforced in RLS + app layer)
  photo_url text,
  is_veg boolean not null default true,
  is_available boolean not null default true,
  is_bestseller boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Orders (one "open" order per table session) ----------
create table orders (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  table_id uuid not null references restaurant_tables(id) on delete cascade,
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  menu_item_id uuid not null references menu_items(id),
  customer_name text,                        -- optional, for group ordering
  qty int not null check (qty > 0),
  unit_price numeric(10,2) not null,          -- snapshot of price at order time (menu price may change later)
  notes text,
  item_status text not null default 'pending' check (item_status in ('pending','preparing','served')),
  created_at timestamptz not null default now()
);

-- ---------- Billing ----------
create table bills (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  subtotal numeric(10,2) not null,
  tax_amount numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  payment_mode text check (payment_mode in ('cash','upi','card')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid')),
  paid_at timestamptz
);

-- ---------- Indexes (performance) ----------
create index idx_tables_restaurant on restaurant_tables(restaurant_id);
create index idx_menu_items_restaurant on menu_items(restaurant_id, category_id);
create index idx_orders_restaurant_status on orders(restaurant_id, status);
create index idx_order_items_order on order_items(order_id);
create index idx_staff_restaurant on staff_users(restaurant_id);
