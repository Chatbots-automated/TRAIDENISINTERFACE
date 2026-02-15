-- Migration: Global Template with versioning (max 30 versions)
-- Moves the global HTML template from localStorage to the database so it's
-- truly shared across all users.  Includes a version history table for undo
-- with automatic cleanup to keep only the newest 30 entries.

-- ============================================================================
-- Table: global_template (singleton — always id=1)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.global_template (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  html_content text NOT NULL,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  updated_by_name text,
  version integer NOT NULL DEFAULT 1,
  CONSTRAINT global_template_pkey PRIMARY KEY (id),
  CONSTRAINT global_template_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_users(id) ON DELETE SET NULL
);

-- ============================================================================
-- Table: global_template_versions (append-only history, max 30 rows)
-- ============================================================================

CREATE SEQUENCE IF NOT EXISTS global_template_versions_version_seq;

CREATE TABLE IF NOT EXISTS public.global_template_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version_number integer NOT NULL DEFAULT nextval('global_template_versions_version_seq'::regclass),
  html_content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  created_by_name text,
  change_description text,
  CONSTRAINT global_template_versions_pkey PRIMARY KEY (id),
  CONSTRAINT global_template_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS global_template_versions_version_idx
  ON public.global_template_versions(version_number DESC);

-- ============================================================================
-- Trigger: auto-prune versions beyond 30 after each INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION prune_global_template_versions()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.global_template_versions
  WHERE id IN (
    SELECT id
    FROM public.global_template_versions
    ORDER BY version_number DESC
    OFFSET 30
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prune_global_template_versions ON public.global_template_versions;

CREATE TRIGGER trg_prune_global_template_versions
  AFTER INSERT ON public.global_template_versions
  FOR EACH STATEMENT
  EXECUTE FUNCTION prune_global_template_versions();

-- ============================================================================
-- Permissions — Directus manages access via its own DB user.
-- Grant full access to the role Directus connects as (typically the DB owner).
-- No Supabase-specific roles needed.
-- ============================================================================
