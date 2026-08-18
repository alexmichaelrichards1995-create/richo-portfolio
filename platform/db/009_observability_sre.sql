CREATE TABLE IF NOT EXISTS richo_traces (
  trace_id text PRIMARY KEY,
  root_span_id text,
  service text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms bigint,
  correlation_id text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS richo_spans (
  span_id text PRIMARY KEY,
  trace_id text NOT NULL REFERENCES richo_traces(trace_id) ON DELETE CASCADE,
  parent_span_id text,
  service text NOT NULL,
  operation text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms bigint,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  error jsonb
);
CREATE INDEX IF NOT EXISTS richo_spans_trace_idx ON richo_spans(trace_id, started_at);

CREATE TABLE IF NOT EXISTS richo_metric_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key text NOT NULL,
  service text,
  section_id text,
  value numeric NOT NULL,
  unit text NOT NULL,
  labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  observed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS richo_metric_samples_key_time_idx ON richo_metric_samples(metric_key, observed_at DESC);

CREATE TABLE IF NOT EXISTS richo_slos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slo_key text UNIQUE NOT NULL,
  name text NOT NULL,
  service text,
  section_id text,
  objective numeric NOT NULL,
  window_seconds bigint NOT NULL,
  indicator_metric_key text NOT NULL,
  comparison text NOT NULL CHECK (comparison IN ('gte','lte')),
  enabled boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_slo_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slo_id uuid NOT NULL REFERENCES richo_slos(id) ON DELETE CASCADE,
  measured_value numeric,
  objective numeric NOT NULL,
  compliant boolean NOT NULL,
  error_budget_remaining numeric,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  evaluated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_dependencies (
  dependency_key text PRIMARY KEY,
  kind text NOT NULL,
  service text NOT NULL,
  provider text,
  criticality text NOT NULL DEFAULT 'medium',
  health_state text NOT NULL DEFAULT 'unknown',
  last_checked_at timestamptz,
  last_error jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS richo_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_key text UNIQUE NOT NULL,
  title text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('sev1','sev2','sev3','sev4')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','mitigating','monitoring','resolved','closed')),
  source text NOT NULL,
  section_id text,
  service text,
  correlation_id text,
  summary text,
  commander_identity_id uuid,
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  mitigated_at timestamptz,
  resolved_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS richo_incidents_status_severity_idx ON richo_incidents(status, severity, detected_at DESC);

CREATE TABLE IF NOT EXISTS richo_incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES richo_incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  actor text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_incident_diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES richo_incidents(id) ON DELETE CASCADE,
  agent_id text,
  hypothesis text NOT NULL,
  confidence numeric(5,4),
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_remediation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES richo_incidents(id) ON DELETE CASCADE,
  operation text NOT NULL,
  risk text NOT NULL DEFAULT 'low',
  policy_decision text,
  status text NOT NULL,
  tool_receipt jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
