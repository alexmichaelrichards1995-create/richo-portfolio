CREATE TABLE IF NOT EXISTS richo_sales_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text,
  source text,
  email_hash text,
  company text,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  qualification jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS richo_sales_leads_status_idx ON richo_sales_leads(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS richo_sales_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES richo_sales_leads(id) ON DELETE SET NULL,
  product_id text,
  stage text NOT NULL DEFAULT 'qualified' CHECK (stage IN ('qualified','discovery','offer','checkout','won','lost','nurture')),
  confidence numeric(5,4),
  estimated_value numeric(18,4),
  currency text NOT NULL DEFAULT 'AUD',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_sales_offers (
  id uuid PRIMARY KEY,
  opportunity_id uuid NOT NULL REFERENCES richo_sales_opportunities(id) ON DELETE CASCADE,
  product_id text,
  price numeric(18,4) NOT NULL,
  discount_pct numeric(8,4) NOT NULL DEFAULT 0,
  final_price numeric(18,4) NOT NULL,
  currency text NOT NULL DEFAULT 'AUD',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_approval','approved_for_send','sent','accepted','expired','rejected')),
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS richo_sales_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid NOT NULL REFERENCES richo_sales_opportunities(id) ON DELETE CASCADE,
  order_id text NOT NULL,
  revenue numeric(18,4) NOT NULL,
  gross_profit numeric(18,4),
  correlation_id text,
  converted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id)
);

CREATE TABLE IF NOT EXISTS richo_sales_touchpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES richo_sales_leads(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES richo_sales_opportunities(id) ON DELETE CASCADE,
  channel text NOT NULL,
  action text NOT NULL,
  outcome text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
