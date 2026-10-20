BEGIN;
CREATE TABLE IF NOT EXISTS admin_mfa (
 account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
 encrypted_seed TEXT NOT NULL CHECK(encrypted_seed ~ '^[a-f0-9]{24}\.[a-f0-9]{32}\.[a-f0-9]{80}$'),
 last_step BIGINT NOT NULL DEFAULT -1 CHECK(last_step>=-1),
 enrolled_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMPTZ;
COMMIT;
