CREATE TABLE IF NOT EXISTS richo_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_type text NOT NULL CHECK (identity_type IN ('owner','human','service','agent')),
  external_key text,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(identity_type, external_key)
);

CREATE TABLE IF NOT EXISTS richo_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_role_capabilities (
  role_id uuid NOT NULL REFERENCES richo_roles(id) ON DELETE CASCADE,
  capability text NOT NULL,
  PRIMARY KEY(role_id, capability)
);

CREATE TABLE IF NOT EXISTS richo_identity_roles (
  identity_id uuid NOT NULL REFERENCES richo_identities(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES richo_roles(id) ON DELETE CASCADE,
  environment text NOT NULL DEFAULT 'all',
  granted_by uuid REFERENCES richo_identities(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY(identity_id, role_id, environment)
);

CREATE TABLE IF NOT EXISTS richo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES richo_identities(id) ON DELETE CASCADE,
  session_hash text NOT NULL UNIQUE,
  assurance_level text NOT NULL DEFAULT 'standard',
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS richo_secret_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_key text UNIQUE NOT NULL,
  provider text NOT NULL,
  provider_reference text NOT NULL,
  purpose text NOT NULL,
  environment text NOT NULL,
  rotation_interval_days integer,
  last_rotated_at timestamptz,
  next_rotation_at timestamptz,
  status text NOT NULL DEFAULT 'healthy',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_break_glass_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identity_id uuid NOT NULL REFERENCES richo_identities(id),
  reason text NOT NULL,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved_by uuid REFERENCES richo_identities(id),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_privileged_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  identity_id uuid REFERENCES richo_identities(id),
  session_id uuid REFERENCES richo_sessions(id),
  action text NOT NULL,
  resource_type text,
  resource_id text,
  environment text,
  decision text NOT NULL,
  correlation_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS richo_privileged_audit_identity_idx ON richo_privileged_audit(identity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS richo_privileged_audit_action_idx ON richo_privileged_audit(action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS richo_secret_rotation_idx ON richo_secret_references(next_rotation_at) WHERE status = 'healthy';
