-- ============================================================
-- Order Desk — Super Admin & Platform Management (0006)
-- ============================================================

-- ---------- Super Admins Table ----------
create table if not exists super_admins (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete set null,
  email text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

-- Index for fast lookup by email and auth_user_id
create index if not exists idx_super_admins_email on super_admins(email);
create index if not exists idx_super_admins_auth_user on super_admins(auth_user_id);

-- ---------- Additional Restaurant Metadata ----------
alter table restaurants add column if not exists plan_expires_at timestamptz;
alter table restaurants add column if not exists contact_phone text;
alter table restaurants add column if not exists upi_id text;

-- ---------- Seed Initial Super Admin ----------
insert into super_admins (email, name)
values ('tariqfsd9@gmail.com', 'Tarique (Platform Owner)')
on conflict (email) do nothing;

-- ---------- Row Level Security ----------
alter table super_admins enable row level security;

-- Policy: super admin can view super_admins table
create policy super admins can view records
  on super_admins for select
  to authenticated
  using (
    email = (select email from auth.users where id = auth.uid())
    or auth_user_id = auth.uid()
  );
