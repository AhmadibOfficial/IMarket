BEGIN;
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','suspended'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS moderation TEXT NOT NULL DEFAULT 'pending' CHECK(moderation IN ('pending','approved','rejected'));
-- Existing unowned sample catalog remains available; owned listings require explicit review.
UPDATE products SET published=false WHERE merchant_id IS NOT NULL AND moderation <> 'approved';
CREATE TABLE IF NOT EXISTS marketplace_audit (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), actor_id UUID NOT NULL REFERENCES accounts(id),
 action TEXT NOT NULL, subject_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS disputes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), order_id UUID NOT NULL UNIQUE REFERENCES demo_orders(id),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','responded','resolved','rejected')),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 3 AND 2000),
 evidence TEXT NOT NULL CHECK(length(evidence)<=4000),
 response TEXT CHECK(length(response) BETWEEN 3 AND 2000),
 resolution TEXT CHECK(length(resolution) BETWEEN 3 AND 2000),
 refund_requested BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMIT;
