-- Smoke test: exercises real logic (triggers/constraints), not just DDL.
\set ON_ERROR_STOP off

\echo '--- Setup: restaurant, table, staff, menu ---'
insert into restaurants (id, name, owner_email) values
  ('11111111-1111-1111-1111-111111111111', 'Test Restaurant A', 'a@test.com'),
  ('22222222-2222-2222-2222-222222222222', 'Test Restaurant B', 'b@test.com');

insert into restaurant_tables (id, restaurant_id, table_number) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'T1');

insert into menu_items (id, restaurant_id, name, price) values
  ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Paneer Tikka', 220),
  ('cccccccc-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Wrong Restaurant Item', 100);

\echo '--- Test 1: create an open order ---'
insert into orders (id, restaurant_id, table_id, status) values
  ('dddddddd-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'open');

\echo '--- Test 1b: SHOULD FAIL - order/table restaurant mismatch ---'
insert into orders (restaurant_id, table_id, status) values
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-0000-0000-0000-000000000001', 'open');

\echo '--- Test 2: SHOULD FAIL - second open order on same table (unique index) ---'
insert into orders (restaurant_id, table_id, status) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'open');

\echo '--- Test 3: SHOULD SUCCEED - order_item with matching restaurant menu_item ---'
insert into order_items (order_id, menu_item_id, qty, unit_price) values
  ('dddddddd-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000001', 2, 220);

\echo '--- Test 4: SHOULD FAIL - order_item with cross-restaurant menu_item ---'
insert into order_items (order_id, menu_item_id, qty, unit_price) values
  ('dddddddd-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001', 1, 100);

\echo '--- Test 5: SHOULD FAIL - invalid table status jump (empty -> served) ---'
update restaurant_tables set status = 'served' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- Test 6: SHOULD SUCCEED - valid table status transition (empty -> pending) ---'
update restaurant_tables set status = 'pending' where id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo '--- Test 7: SHOULD FAIL - invalid order_item status jump (pending -> served) ---'
update order_items set item_status = 'served'
  where order_id = 'dddddddd-0000-0000-0000-000000000001' and menu_item_id = 'bbbbbbbb-0000-0000-0000-000000000001';

\echo '--- Test 8: bill + payment_transactions -> auto payment_status recompute ---'
insert into bills (id, order_id, subtotal, total) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'dddddddd-0000-0000-0000-000000000001', 440, 440);
insert into payment_transactions (bill_id, amount, mode, type) values
  ('eeeeeeee-0000-0000-0000-000000000001', 200, 'cash', 'payment');
select payment_status from bills where id = 'eeeeeeee-0000-0000-0000-000000000001'; -- expect partially_paid
insert into payment_transactions (bill_id, amount, mode, type) values
  ('eeeeeeee-0000-0000-0000-000000000001', 240, 'upi', 'payment');
select payment_status from bills where id = 'eeeeeeee-0000-0000-0000-000000000001'; -- expect paid

\echo '--- Test 9: verify_staff_pin function (insert a staff user with a real crypt hash) ---'
insert into staff_users (restaurant_id, name, role, pin_hash) values
  ('11111111-1111-1111-1111-111111111111', 'Ramesh', 'admin', crypt('1234', gen_salt('bf')));
select * from verify_staff_pin('11111111-1111-1111-1111-111111111111', 'Ramesh', '1234'); -- expect 1 row
select * from verify_staff_pin('11111111-1111-1111-1111-111111111111', 'Ramesh', '9999'); -- expect 0 rows

\echo '--- Test 10: bill_number auto-assigned ---'
select bill_number from bills where id = 'eeeeeeee-0000-0000-0000-000000000001';

\echo '--- Test 11: order_status_history logged on status change ---'
update orders set status = 'closed' where id = 'dddddddd-0000-0000-0000-000000000001';
select from_status, to_status from order_status_history where order_id = 'dddddddd-0000-0000-0000-000000000001';

\echo '--- ALL TESTS EXECUTED ---'
