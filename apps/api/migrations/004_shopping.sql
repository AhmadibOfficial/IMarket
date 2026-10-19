BEGIN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE demo_orders DROP CONSTRAINT IF EXISTS demo_orders_lifecycle_check;
ALTER TABLE demo_orders ADD CONSTRAINT demo_orders_lifecycle_check CHECK (lifecycle IN ('legacy','reserved','cancelled','processing','shipped','delivered'));
CREATE TABLE IF NOT EXISTS checkout_batches (
 account_id UUID NOT NULL REFERENCES accounts(id), key TEXT NOT NULL,
 payload JSONB NOT NULL, order_ids UUID[] NOT NULL, PRIMARY KEY(account_id,key)
);
COMMIT;
