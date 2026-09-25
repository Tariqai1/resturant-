-- ============================================================
-- Order Desk — Production Hardening & Performance Indexes (0007)
-- ============================================================

-- 1. Index on restaurant_tables(qr_token)
-- Eliminates sequential scans on every customer table scan via /table/[token]
CREATE INDEX IF NOT EXISTS idx_tables_qr_token ON restaurant_tables(qr_token);

-- 2. Index on staff_users(auth_user_id)
-- Speeds up the current_restaurant_id() and current_staff_role() RLS helper functions on EVERY query
CREATE INDEX IF NOT EXISTS idx_staff_auth_user_id ON staff_users(auth_user_id);

-- 3. Composite Index on orders(table_id, status)
-- Accelerates active order resolution in /api/public/order and customer table views
CREATE INDEX IF NOT EXISTS idx_orders_table_status ON orders(table_id, status);

-- 4. Unique Index on bills(order_id)
-- Prevents double-billing and ensures financial transaction integrity
CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_order_id_unique ON bills(order_id);

-- 5. Index on bills(paid_at)
-- Accelerates daily, weekly, and monthly GMV and revenue reports
CREATE INDEX IF NOT EXISTS idx_bills_paid_at ON bills(paid_at);

-- 6. Postgres-Backed Platform State Storage Table
-- Provides shared, durable serverless storage for features, themes, and platform state
CREATE TABLE IF NOT EXISTS platform_state_store (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS on platform_state_store
ALTER TABLE platform_state_store ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "service role manages platform_state_store"
  ON platform_state_store FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated staff read access
CREATE POLICY "authenticated staff can read platform_state_store"
  ON platform_state_store FOR SELECT
  TO authenticated
  USING (true);
