-- 002_create_deliveries_table.sql
-- Track GitHub delivery GUIDs to ensure idempotent webhook processing

CREATE TABLE IF NOT EXISTS deliveries (
  delivery_id TEXT PRIMARY KEY,
  received_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE NULL
);

CREATE INDEX IF NOT EXISTS idx_deliveries_processed ON deliveries(processed);
