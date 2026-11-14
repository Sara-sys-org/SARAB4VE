-- Append-only audit trail for administrative actions.
-- Weight policy: before_data/after_data store only the fields that changed.

CREATE TABLE IF NOT EXISTS audit_log (
  id          BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- No FK: the history must survive deletion of the actor account, and a
  -- referential action would collide with the append-only trigger below.
  actor_id    UUID,
  actor_role  TEXT NOT NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT NOT NULL,
  before_data JSONB,
  after_data  JSONB,
  reason      TEXT,
  CONSTRAINT audit_log_action_check CHECK (
    action IN ('create','update','replace','delete','approve','reject','transition','review')
  )
);

CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON audit_log (entity_type, entity_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON audit_log (actor_id, occurred_at DESC);

-- BRIN is tiny for an append-only table and handles time-range scans well.
CREATE INDEX IF NOT EXISTS idx_audit_time_brin
  ON audit_log USING BRIN (occurred_at);

CREATE OR REPLACE FUNCTION audit_log_prevent_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log;
CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION audit_log_prevent_mutation();

DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
CREATE TRIGGER audit_log_no_truncate
BEFORE TRUNCATE ON audit_log
FOR EACH STATEMENT EXECUTE FUNCTION audit_log_prevent_mutation();
