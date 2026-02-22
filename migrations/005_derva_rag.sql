-- Migration 005: Derva RAG tables
-- Two tables: derva_files (file tracking for UI) and derva (vectorized chunks for RAG)

-- Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS "vector";

-- Table: derva_files — tracks uploaded files (for UI listing)
CREATE TABLE IF NOT EXISTS public.derva_files (
  id SERIAL PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  directus_file_id TEXT,
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: derva — stores vectorized chunks (n8n PGVector Store compatible)
-- Managed via Directus; columns: id, content, file_id, metadata, embedding
CREATE TABLE IF NOT EXISTS public.derva (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  file_id INTEGER REFERENCES public.derva_files(id) ON DELETE CASCADE,
  metadata JSONB DEFAULT '{}',
  embedding vector(3072),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS derva_embedding_idx
  ON public.derva USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS derva_file_id_idx
  ON public.derva (file_id);

-- Permissions (match existing pattern from 002/003 migrations)
ALTER TABLE public.derva_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.derva DISABLE ROW LEVEL SECURITY;

GRANT ALL ON public.derva_files TO anon;
GRANT ALL ON public.derva TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.derva_files_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE public.derva_id_seq TO anon;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'web_anon') THEN
    EXECUTE 'GRANT ALL ON public.derva_files TO web_anon';
    EXECUTE 'GRANT ALL ON public.derva TO web_anon';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.derva_files_id_seq TO web_anon';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.derva_id_seq TO web_anon';
  END IF;
END
$$;
