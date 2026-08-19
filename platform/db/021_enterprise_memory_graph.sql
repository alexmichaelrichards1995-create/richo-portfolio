CREATE TABLE IF NOT EXISTS richo_enterprise_memories(
 id uuid PRIMARY KEY,
 type text NOT NULL,
 external_key text,
 label text NOT NULL,
 content jsonb NOT NULL DEFAULT '{}'::jsonb,
 source text NOT NULL,
 confidence numeric(6,5) NOT NULL DEFAULT .8,
 valid_from timestamptz NOT NULL DEFAULT now(),
 valid_to timestamptz,
 sensitivity text NOT NULL DEFAULT 'internal' CHECK(sensitivity IN('public','internal','confidential','restricted')),
 visibility jsonb NOT NULL DEFAULT '["owner"]'::jsonb,
 supersedes uuid REFERENCES richo_enterprise_memories(id) ON DELETE SET NULL,
 is_superseded boolean NOT NULL DEFAULT false,
 tags jsonb NOT NULL DEFAULT '[]'::jsonb,
 correlation_id text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS richo_enterprise_memories_lookup_idx ON richo_enterprise_memories(type,external_key,valid_from DESC);
CREATE INDEX IF NOT EXISTS richo_enterprise_memories_source_idx ON richo_enterprise_memories(source,created_at DESC);

CREATE TABLE IF NOT EXISTS richo_enterprise_memory_edges(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 from_memory_id uuid NOT NULL REFERENCES richo_enterprise_memories(id) ON DELETE CASCADE,
 relation text NOT NULL,
 to_memory_id uuid NOT NULL REFERENCES richo_enterprise_memories(id) ON DELETE CASCADE,
 confidence numeric(6,5) NOT NULL DEFAULT 1,
 evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(from_memory_id,relation,to_memory_id)
);
CREATE INDEX IF NOT EXISTS richo_enterprise_memory_edges_from_idx ON richo_enterprise_memory_edges(from_memory_id,relation);

CREATE TABLE IF NOT EXISTS richo_memory_access_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 memory_id uuid REFERENCES richo_enterprise_memories(id) ON DELETE SET NULL,
 actor_id text NOT NULL,
 section_id text,
 operation text NOT NULL,
 decision text NOT NULL,
 reason text,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 correlation_id text
);

CREATE TABLE IF NOT EXISTS richo_memory_ingestion_receipts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source text NOT NULL,
 source_reference text,
 content_hash text,
 items_created integer NOT NULL DEFAULT 0,
 items_updated integer NOT NULL DEFAULT 0,
 status text NOT NULL CHECK(status IN('accepted','partial','rejected','failed')),
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
