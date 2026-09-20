-- Order Desk — Fix RLS helper recursion
-- The helper functions are used by staff_users policies. They must read the
-- membership row without re-entering staff_users RLS policies.

create or replace function current_restaurant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select restaurant_id from staff_users
  where auth_user_id = auth.uid()
  limit 1;
$$;

create or replace function current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from staff_users
  where auth_user_id = auth.uid()
  limit 1;
$$;

revoke all on function current_restaurant_id() from public;
revoke all on function current_staff_role() from public;
grant execute on function current_restaurant_id() to authenticated;
grant execute on function current_staff_role() to authenticated;
