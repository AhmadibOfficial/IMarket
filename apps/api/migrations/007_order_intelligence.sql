BEGIN;
-- Record insertion time after row-lock waits rather than transaction start time.
ALTER TABLE marketplace_audit ALTER COLUMN created_at SET DEFAULT clock_timestamp();
CREATE OR REPLACE FUNCTION reject_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'Marketplace audit history is immutable' USING ERRCODE='23514';
END $$;
DROP TRIGGER IF EXISTS immutable_marketplace_audit ON marketplace_audit;
CREATE TRIGGER immutable_marketplace_audit BEFORE UPDATE OR DELETE OR TRUNCATE ON marketplace_audit
 FOR EACH STATEMENT EXECUTE FUNCTION reject_audit_mutation();
CREATE TABLE IF NOT EXISTS order_notifications (
 id UUID PRIMARY KEY REFERENCES marketplace_audit(id),
 account_id UUID NOT NULL REFERENCES accounts(id),
 order_id UUID NOT NULL REFERENCES demo_orders(id),
 read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS order_notifications_account ON order_notifications(account_id);
CREATE OR REPLACE FUNCTION notify_order_activity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owned demo_orders%ROWTYPE;
BEGIN
 IF NEW.action LIKE 'order.%' THEN
  SELECT * INTO owned FROM demo_orders WHERE id=NEW.subject_id;
 ELSIF NEW.action LIKE 'dispute.%' THEN
  SELECT o.* INTO owned FROM demo_orders o JOIN disputes d ON d.order_id=o.id WHERE d.id=NEW.subject_id;
 ELSE RETURN NEW;
 END IF;
 IF owned.account_id IS NOT NULL THEN
  INSERT INTO order_notifications(id,account_id,order_id) VALUES(NEW.id,owned.account_id,owned.id);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_activity_notification ON marketplace_audit;
CREATE TRIGGER order_activity_notification AFTER INSERT ON marketplace_audit FOR EACH ROW EXECUTE FUNCTION notify_order_activity();
COMMIT;
