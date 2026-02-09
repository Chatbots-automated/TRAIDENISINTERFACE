-- Migration from Supabase to Local PostgreSQL with PostgREST
-- This script creates all necessary tables for the TRAIDENIS application

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- TABLES (in dependency order)
-- ============================================================================

-- Table: app_users (already exists, but here for reference)
-- DROP TABLE IF EXISTS app_users CASCADE;
CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  email text,
  display_name text,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  password text,
  phone text UNIQUE,
  kodas text,
  full_name text,
  role text,
  CONSTRAINT app_users_pkey PRIMARY KEY (id)
);

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS app_users_email_idx ON public.app_users (lower(email));

-- Table: application_logs
CREATE TABLE IF NOT EXISTS public.application_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level = ANY (ARRAY['debug'::text, 'info'::text, 'warn'::text, 'error'::text, 'critical'::text])),
  category text NOT NULL CHECK (category = ANY (ARRAY['auth'::text, 'chat'::text, 'document'::text, 'user_management'::text, 'system'::text, 'api'::text, 'error'::text])),
  action text NOT NULL,
  message text NOT NULL,
  session_id text,
  user_id uuid,
  user_email text,
  metadata jsonb DEFAULT '{}'::jsonb,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT application_logs_pkey PRIMARY KEY (id),
  CONSTRAINT application_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE SET NULL
);

-- Indexes for application_logs
CREATE INDEX IF NOT EXISTS application_logs_user_id_idx ON public.application_logs(user_id);
CREATE INDEX IF NOT EXISTS application_logs_timestamp_idx ON public.application_logs(timestamp);
CREATE INDEX IF NOT EXISTS application_logs_category_idx ON public.application_logs(category);
CREATE INDEX IF NOT EXISTS application_logs_level_idx ON public.application_logs(level);

-- Table: instruction_variables
CREATE TABLE IF NOT EXISTS public.instruction_variables (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  variable_key text NOT NULL UNIQUE,
  variable_name text NOT NULL,
  content text NOT NULL DEFAULT ''::text,
  display_order integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT instruction_variables_pkey PRIMARY KEY (id),
  CONSTRAINT instruction_variables_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.app_users(id) ON DELETE SET NULL
);

-- Table: instruction_versions
CREATE SEQUENCE IF NOT EXISTS instruction_versions_version_number_seq;

CREATE TABLE IF NOT EXISTS public.instruction_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  version_number integer NOT NULL DEFAULT nextval('instruction_versions_version_number_seq'::regclass),
  snapshot jsonb NOT NULL,
  change_description text,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid,
  is_revert boolean DEFAULT false,
  reverted_from_version integer,
  CONSTRAINT instruction_versions_pkey PRIMARY KEY (id),
  CONSTRAINT instruction_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.app_users(id) ON DELETE SET NULL
);

-- Table: prompt_template
CREATE TABLE IF NOT EXISTS public.prompt_template (
  id integer NOT NULL DEFAULT 1 CHECK (id = 1),
  template_content text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT prompt_template_pkey PRIMARY KEY (id)
);

-- Table: sdk_conversations
CREATE TABLE IF NOT EXISTS public.sdk_conversations (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  project_id uuid NOT NULL,
  title text NOT NULL DEFAULT 'Naujas pokalbis'::text,
  author_id uuid NOT NULL,
  author_email text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  message_count integer DEFAULT 0,
  last_message_at timestamp with time zone DEFAULT now(),
  messages jsonb DEFAULT '[]'::jsonb,
  artifact jsonb,
  total_input_tokens integer DEFAULT 0,
  total_output_tokens integer DEFAULT 0,
  total_cache_creation_tokens integer DEFAULT 0,
  total_cache_read_tokens integer DEFAULT 0,
  CONSTRAINT sdk_conversations_pkey PRIMARY KEY (id)
);

-- Indexes for sdk_conversations
CREATE INDEX IF NOT EXISTS sdk_conversations_project_id_idx ON public.sdk_conversations(project_id);
CREATE INDEX IF NOT EXISTS sdk_conversations_author_id_idx ON public.sdk_conversations(author_id);

-- Table: shared_conversations
CREATE TABLE IF NOT EXISTS public.shared_conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id uuid,
  shared_with_user_id uuid,
  shared_by_user_id uuid,
  shared_at timestamp with time zone DEFAULT now(),
  is_read boolean DEFAULT false,
  CONSTRAINT shared_conversations_pkey PRIMARY KEY (id),
  CONSTRAINT shared_conversations_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.sdk_conversations(id) ON DELETE CASCADE,
  CONSTRAINT shared_conversations_shared_with_user_id_fkey FOREIGN KEY (shared_with_user_id) REFERENCES public.app_users(id) ON DELETE CASCADE,
  CONSTRAINT shared_conversations_shared_by_user_id_fkey FOREIGN KEY (shared_by_user_id) REFERENCES public.app_users(id) ON DELETE CASCADE
);

-- Indexes for shared_conversations
CREATE INDEX IF NOT EXISTS shared_conversations_conversation_id_idx ON public.shared_conversations(conversation_id);
CREATE INDEX IF NOT EXISTS shared_conversations_shared_with_user_id_idx ON public.shared_conversations(shared_with_user_id);

-- Table: vadybininkai
CREATE TABLE IF NOT EXISTS public.vadybininkai (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  kodas text,
  full_name text,
  role text,
  CONSTRAINT vadybininkai_pkey PRIMARY KEY (id)
);

-- Table: webhooks
CREATE TABLE IF NOT EXISTS public.webhooks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  webhook_key character varying NOT NULL UNIQUE,
  webhook_name character varying NOT NULL,
  description text,
  url text NOT NULL,
  is_active boolean DEFAULT true,
  last_tested_at timestamp with time zone,
  last_test_status integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT webhooks_pkey PRIMARY KEY (id)
);

-- Table: n8n_vector_store (already exists, but add indexes for better performance)
-- This table replaces nestandartiniai_projects
CREATE INDEX IF NOT EXISTS n8n_vector_store_project_name_idx ON public.n8n_vector_store(project_name);
CREATE INDEX IF NOT EXISTS n8n_vector_store_klientas_idx ON public.n8n_vector_store(klientas);
CREATE INDEX IF NOT EXISTS n8n_vector_store_pateikimo_data_idx ON public.n8n_vector_store(pateikimo_data);
CREATE INDEX IF NOT EXISTS n8n_vector_store_embedding_idx ON public.n8n_vector_store USING ivfflat (embedding vector_cosine_ops);

-- Table: project_members (for future use)
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT project_members_pkey PRIMARY KEY (id),
  CONSTRAINT project_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE,
  UNIQUE (project_id, user_id)
);

-- Table: chat_items (for future use)
CREATE TABLE IF NOT EXISTS public.chat_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('thread', 'message')),
  project_id uuid NOT NULL,
  title text,
  author_ref text,
  author_id uuid,
  participants text[],
  message_count integer DEFAULT 0,
  last_message_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'active',
  chat_history jsonb DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  deleted_at timestamp with time zone,
  CONSTRAINT chat_items_pkey PRIMARY KEY (id),
  CONSTRAINT chat_items_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.app_users(id) ON DELETE SET NULL
);

-- Indexes for chat_items
CREATE INDEX IF NOT EXISTS chat_items_project_id_idx ON public.chat_items(project_id);
CREATE INDEX IF NOT EXISTS chat_items_type_idx ON public.chat_items(type);
CREATE INDEX IF NOT EXISTS chat_items_deleted_at_idx ON public.chat_items(deleted_at);

-- Table: documents (for future use)
CREATE TABLE IF NOT EXISTS public.documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  content text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT documents_pkey PRIMARY KEY (id)
);

-- Table: user_voiceflow_sessions (for future use)
CREATE TABLE IF NOT EXISTS public.user_voiceflow_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  last_active_at timestamp with time zone DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT user_voiceflow_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT user_voiceflow_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE CASCADE,
  UNIQUE (user_id, session_id)
);

-- ============================================================================
-- VIEWS (for compatibility with nestandartiniai_projects)
-- ============================================================================

-- Create a view that maps n8n_vector_store to nestandartiniai_projects interface
CREATE OR REPLACE VIEW public.nestandartiniai_projects AS
SELECT DISTINCT ON (project_name)
  komercinis_id as id,
  project_name as subject_line,
  pateikimo_data::timestamp with time zone as created_at,
  pateikimo_data::timestamp with time zone as updated_at,
  jsonb_build_object(
    'klientas', klientas,
    'uzklausos_path', uzklausos_path,
    'komercinis_path', komercinis_path,
    'pateikimo_data', pateikimo_data
  ) as project_metadata
FROM public.n8n_vector_store
WHERE project_name IS NOT NULL
ORDER BY project_name, pateikimo_data DESC;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger for webhooks
DROP TRIGGER IF EXISTS update_webhooks_updated_at ON public.webhooks;
CREATE TRIGGER update_webhooks_updated_at
    BEFORE UPDATE ON public.webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for instruction_variables
DROP TRIGGER IF EXISTS update_instruction_variables_updated_at ON public.instruction_variables;
CREATE TRIGGER update_instruction_variables_updated_at
    BEFORE UPDATE ON public.instruction_variables
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Insert default webhooks (update URLs as needed)
INSERT INTO public.webhooks (webhook_key, webhook_name, description, url, is_active)
VALUES
  ('n8n_upload_new', 'N8N Upload New Request', 'Webhook for uploading new EML files and documents', 'http://localhost:5678/webhook/upload-new', true),
  ('n8n_find_similar', 'N8N Find Similar Products', 'Webhook for finding similar products from EML files', 'http://localhost:5678/webhook/find-similar', true),
  ('n8n_upload_solution', 'N8N Upload Solution', 'Webhook for uploading commercial offer solutions', 'http://localhost:5678/webhook/upload-solution', true)
ON CONFLICT (webhook_key) DO NOTHING;

-- Insert default prompt template if not exists
INSERT INTO public.prompt_template (id, template_content)
VALUES (1, 'Default prompt template content')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- PERMISSIONS (for PostgREST)
-- ============================================================================

-- Create a role for PostgREST if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'your_authenticator_password';
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;

  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END
$$;

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant access to authenticator
GRANT anon, authenticated TO authenticator;

-- Grant permissions on all tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Grant permissions on sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, anon;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated, anon;

-- Grant execute on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, anon;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON VIEW public.nestandartiniai_projects IS 'Compatibility view mapping n8n_vector_store to nestandartiniai_projects interface. Since nestandartiniai_projects table was dropped from Supabase, this view provides the same interface using existing data.';
COMMENT ON TABLE public.n8n_vector_store IS 'Vector embeddings storage for project documents. Contains embeddings, metadata, and paths to commercial offers and requests.';
COMMENT ON TABLE public.webhooks IS 'Webhook configuration for n8n integrations. Stores URLs, active status, and test results.';
COMMENT ON TABLE public.application_logs IS 'Application-level logging for auth, chat, document operations, and errors.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- List all tables
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Verify view
SELECT COUNT(*) as project_count FROM public.nestandartiniai_projects;
