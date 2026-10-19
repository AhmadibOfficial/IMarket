-- IMK-001 DEV ONLY. No real customer IDs, card data, finance, payment captures or inventory settlement.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  price_kobo BIGINT NOT NULL CHECK (price_kobo > 0),
  group_price_kobo BIGINT NOT NULL CHECK (group_price_kobo > 0),
  CHECK (group_price_kobo <= price_kobo),
  stock_demo INTEGER NOT NULL CHECK (stock_demo >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  min_members INTEGER NOT NULL CHECK (min_members BETWEEN 2 AND 100),
  max_members INTEGER NOT NULL CHECK (max_members BETWEEN min_members AND 100),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS campaign_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  demo_alias TEXT NOT NULL CHECK (length(demo_alias) BETWEEN 3 AND 32),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, demo_alias)
);
CREATE INDEX IF NOT EXISTS idx_campaign_members_campaign ON campaign_members(campaign_id);
CREATE TABLE IF NOT EXISTS demo_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
  total_kobo BIGINT NOT NULL CHECK (total_kobo >= 0),
  mode TEXT NOT NULL DEFAULT 'SIMULATED_ONLY' CHECK (mode = 'SIMULATED_ONLY'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO products (slug,name,category,description,price_kobo,group_price_kobo,stock_demo)
VALUES
  ('powerbank-20000', '20,000mAh Power Bank', 'Electronics', 'Demo sample only — no merchant or actual stock verified', 2250000, 1950000, 30),
  ('rice-bag-25kg', 'Premium Rice, 25kg', 'Groceries', 'Demo sample only — no merchant or actual stock verified', 8750000, 8125000, 25),
  ('sewing-machine', 'Portable Sewing Machine', 'Home & Business', 'Demo sample only — no merchant or actual stock verified', 14500000, 13000000, 12)
ON CONFLICT (slug) DO NOTHING;
COMMIT;
