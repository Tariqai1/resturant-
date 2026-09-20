-- ============================================================
-- Order Desk — Payments, State Machines, Audit (0004)
-- ============================================================

-- ---------- FIX 4: real payment transaction ledger ----------
alter table bills
  drop constraint if exists bills_payment_status_check,
  add constraint bills_payment_status_check
    check (payment_status in ('unpaid','partially_paid','paid','refunded'));

alter table bills add column if not exists bill_number bigint;
alter table bills add column if not exists cgst_amount numeric(10,2) not null default 0;
alter table bills add column if not exists sgst_amount numeric(10,2) not null default 0;

create sequence if not exists bill_number_seq;
create or replace function assign_bill_number()
returns trigger language plpgsql as $$
begin
  if new.bill_number is null then
    new.bill_number := nextval('bill_number_seq');
  end if;
  return new;
end;
$$;
create trigger trg_assign_bill_number
  before insert on bills
  for each row execute function assign_bill_number();

create table payment_transactions (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references bills(id) on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  mode text not null check (mode in ('cash','upi','card','online')),
  type text not null check (type in ('payment','refund')),
  reference_number text,
  recorded_by uuid references staff_users(id),
  created_at timestamptz not null default now()
);

-- Recompute bill payment_status whenever a transaction is recorded
create or replace function recompute_bill_status()
returns trigger language plpgsql as $$
declare
  v_total numeric;
  v_paid numeric;
begin
  select total into v_total from bills where id = coalesce(new.bill_id, old.bill_id);

  select coalesce(sum(case when type = 'payment' then amount else -amount end), 0)
    into v_paid
    from payment_transactions
    where bill_id = coalesce(new.bill_id, old.bill_id);

  update bills
    set payment_status = case
          when v_paid <= 0 then 'unpaid'
          when v_paid < v_total then 'partially_paid'
          when v_paid >= v_total then 'paid'
        end,
        paid_at = case when v_paid >= v_total then now() else paid_at end
    where id = coalesce(new.bill_id, old.bill_id);

  return new;
end;
$$;

create trigger trg_recompute_bill_status
  after insert or update or delete on payment_transactions
  for each row execute function recompute_bill_status();

alter table payment_transactions enable row level security;
create policy "staff can view own restaurant payments"
  on payment_transactions for select using (
    bill_id in (
      select b.id from bills b
      join orders o on o.id = b.order_id
      where o.restaurant_id = current_restaurant_id()
    )
  );
create policy "staff/admin can record payments"
  on payment_transactions for insert with check (
    current_staff_role() in ('staff','admin','owner')
    and bill_id in (
      select b.id from bills b
      join orders o on o.id = b.order_id
      where o.restaurant_id = current_restaurant_id()
    )
  );

-- ---------- FIX 5: enforce one open order per table ----------
create unique index if not exists one_open_order_per_table
  on orders (table_id)
  where status = 'open';

-- ---------- FIX 6: enforce valid status transitions ----------
create or replace function check_order_status_transition()
returns trigger language plpgsql as $$
begin
  if old.status = new.status then
    return new;
  end if;
  if (old.status, new.status) not in (
    ('open','closed'), ('open','cancelled')
  ) then
    raise exception 'Invalid order status transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;
create trigger trg_order_status_transition
  before update of status on orders
  for each row execute function check_order_status_transition();

create or replace function check_table_status_transition()
returns trigger language plpgsql as $$
begin
  if old.status = new.status then
    return new;
  end if;
  if (old.status, new.status) not in (
    ('empty','pending'), ('pending','preparing'), ('pending','served'),
    ('preparing','served'), ('served','payment_pending'),
    ('payment_pending','empty'), ('pending','payment_pending'),
    ('preparing','payment_pending')
  ) then
    raise exception 'Invalid table status transition: % -> %', old.status, new.status;
  end if;
  return new;
end;
$$;
create trigger trg_table_status_transition
  before update of status on restaurant_tables
  for each row execute function check_table_status_transition();

create or replace function check_item_status_transition()
returns trigger language plpgsql as $$
begin
  if old.item_status = new.item_status then
    return new;
  end if;
  if (old.item_status, new.item_status) not in (
    ('pending','preparing'), ('preparing','served')
  ) then
    raise exception 'Invalid item status transition: % -> %', old.item_status, new.item_status;
  end if;
  return new;
end;
$$;
create trigger trg_item_status_transition
  before update of item_status on order_items
  for each row execute function check_item_status_transition();

-- ---------- Order status history (audit trail) ----------
create table order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references staff_users(id),
  changed_at timestamptz not null default now()
);

create or replace function log_order_status_change()
returns trigger language plpgsql as $$
begin
  insert into order_status_history (order_id, from_status, to_status)
  values (new.id, old.status, new.status);
  return new;
end;
$$;
create trigger trg_log_order_status_change
  after update of status on orders
  for each row execute function log_order_status_change();

-- ---------- Missing audit columns ----------
alter table orders add column if not exists created_by uuid references staff_users(id);
alter table orders add column if not exists updated_at timestamptz not null default now();
alter table order_items add column if not exists updated_at timestamptz not null default now();
alter table menu_items add column if not exists created_by uuid references staff_users(id);
alter table menu_items add column if not exists updated_at timestamptz not null default now();
alter table menu_items add column if not exists is_archived boolean not null default false;
alter table bills add column if not exists updated_at timestamptz not null default now();

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger trg_touch_orders before update on orders
  for each row execute function touch_updated_at();
create trigger trg_touch_order_items before update on order_items
  for each row execute function touch_updated_at();
create trigger trg_touch_menu_items before update on menu_items
  for each row execute function touch_updated_at();
create trigger trg_touch_bills before update on bills
  for each row execute function touch_updated_at();

-- ---------- Table sessions (separate from billing order) ----------
create table table_sessions (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references restaurant_tables(id) on delete cascade,
  order_id uuid references orders(id),
  session_token text not null default encode(gen_random_bytes(16), 'hex'),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
alter table orders add column if not exists table_session_id uuid references table_sessions(id);

-- ---------- QR token expiry / rotation ----------
alter table restaurant_tables add column if not exists qr_token_version int not null default 1;
alter table restaurant_tables add column if not exists qr_token_issued_at timestamptz not null default now();
alter table restaurant_tables add column if not exists qr_token_expires_at timestamptz;
alter table restaurant_tables add column if not exists qr_token_revoked_at timestamptz;

-- ---------- GST configuration ----------
create table restaurant_tax_config (
  restaurant_id uuid primary key references restaurants(id) on delete cascade,
  cgst_rate numeric(5,2) not null default 2.5,
  sgst_rate numeric(5,2) not null default 2.5,
  tax_inclusive_pricing boolean not null default false
);

-- ---------- Generic audit log (admin actions: menu edits, discounts, PIN resets, etc.) ----------
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references restaurants(id) on delete cascade,
  actor_staff_id uuid references staff_users(id),
  action text not null,               -- e.g. 'menu_item.updated', 'staff.pin_reset'
  target_table text,
  target_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
alter table audit_log enable row level security;
create policy "admin/owner can view audit log"
  on audit_log for select using (
    restaurant_id = current_restaurant_id()
    and current_staff_role() in ('admin','owner')
  );

-- ---------- Rate limiting (lightweight DB fallback — prefer edge/Redis in production) ----------
create table qr_request_log (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references restaurant_tables(id) on delete cascade,
  requested_at timestamptz not null default now()
);
create index idx_qr_request_log_table_time on qr_request_log(table_id, requested_at);
-- Application/edge layer should count rows in the last N seconds for a
-- table_id and reject if over threshold; a Postgres-only solution here
-- doesn't scale well under real load — recommend Redis/Upstash at the
-- edge for production rate limiting, this table is a functional fallback.

-- ---------- Consistency: bills.payment_mode must match MVP's allowed modes ----------
alter table bills
  drop constraint if exists bills_payment_mode_check,
  add constraint bills_payment_mode_check
    check (payment_mode in ('cash','upi','card','online'));
