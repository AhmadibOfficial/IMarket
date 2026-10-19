-- Local synthetic accounts only. No built-in credentials or public registration.
BEGIN;
CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias TEXT NOT NULL UNIQUE CHECK (alias ~ '^[a-zA-Z0-9_-]{3,32}$')
);
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias TEXT NOT NULL UNIQUE CHECK (alias ~ '^[a-zA-Z0-9_-]{3,32}$'),
  password_hash TEXT NOT NULL CHECK (password_hash ~ '^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{64}$'),
  role TEXT NOT NULL CHECK (role IN ('buyer','merchant','admin')),
  merchant_id UUID REFERENCES merchants(id),
  disabled BOOLEAN NOT NULL DEFAULT false,
  CHECK ((role = 'merchant') = (merchant_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_limits (
  key_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  resets_at TIMESTAMPTZ NOT NULL
);
ALTER TABLE products ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS merchant_id UUID REFERENCES merchants(id);
CREATE UNIQUE INDEX IF NOT EXISTS products_tenant_id ON products(id,merchant_id);
-- Composite FK prevents a campaign from claiming another merchant's product.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaign_product_tenant' AND conrelid='campaigns'::regclass) THEN
    ALTER TABLE campaigns ADD CONSTRAINT campaign_product_tenant
      FOREIGN KEY (product_id,merchant_id) REFERENCES products(id,merchant_id);
  END IF;
END $$;
ALTER TABLE demo_orders ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);
ALTER TABLE campaign_members ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts(id);
CREATE UNIQUE INDEX IF NOT EXISTS campaign_account_unique ON campaign_members(campaign_id,account_id);
COMMIT;
