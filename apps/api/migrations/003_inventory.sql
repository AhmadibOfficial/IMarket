-- Synthetic inventory only; no financial capture or fulfilment.
BEGIN;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS lifecycle TEXT NOT NULL DEFAULT 'open'
  CHECK (lifecycle IN ('open','confirmed','expired','cancelled'));
ALTER TABLE campaign_members ADD COLUMN IF NOT EXISTS inventory_reserved BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE demo_orders ADD COLUMN IF NOT EXISTS lifecycle TEXT NOT NULL DEFAULT 'legacy'
  CHECK (lifecycle IN ('legacy','reserved','cancelled'));
ALTER TABLE demo_orders ADD COLUMN IF NOT EXISTS idempotency_key TEXT
  CHECK (idempotency_key ~ '^[a-zA-Z0-9_-]{8,80}$');
CREATE UNIQUE INDEX IF NOT EXISTS order_account_idempotency ON demo_orders(account_id,idempotency_key);
COMMIT;
