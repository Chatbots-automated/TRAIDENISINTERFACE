-- Fix PostgREST anon role permissions
-- This migration ensures the anon role has access to all required tables

-- ============================================================================
-- DISABLE ROW LEVEL SECURITY (for local/internal deployment)
-- ============================================================================

-- Disable RLS on tables that should be publicly readable
ALTER TABLE IF EXISTS public.instruction_variables DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sdk_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.shared_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.prompt_template DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.application_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.webhooks DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.instruction_versions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.vadybininkai DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.documents DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.project_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_voiceflow_sessions DISABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RE-GRANT PERMISSIONS TO ANON ROLE
-- ============================================================================

-- Ensure anon role exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END
$$;

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO anon;

-- Grant SELECT on all existing tables to anon
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Grant INSERT, UPDATE, DELETE on specific tables that need write access
GRANT INSERT, UPDATE, DELETE ON public.sdk_conversations TO anon;
GRANT INSERT, UPDATE, DELETE ON public.shared_conversations TO anon;
GRANT INSERT, UPDATE, DELETE ON public.application_logs TO anon;
GRANT INSERT, UPDATE, DELETE ON public.chat_items TO anon;
GRANT INSERT, UPDATE, DELETE ON public.documents TO anon;
GRANT INSERT, UPDATE, DELETE ON public.user_voiceflow_sessions TO anon;
GRANT UPDATE ON public.instruction_variables TO anon;
GRANT UPDATE ON public.prompt_template TO anon;
GRANT INSERT, UPDATE, DELETE ON public.app_users TO anon;

-- Grant permissions on sequences
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;

-- Grant execute on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Check table permissions for anon role
SELECT
  schemaname,
  tablename,
  has_table_privilege('anon', schemaname || '.' || tablename, 'SELECT') as can_select,
  has_table_privilege('anon', schemaname || '.' || tablename, 'INSERT') as can_insert,
  has_table_privilege('anon', schemaname || '.' || tablename, 'UPDATE') as can_update,
  has_table_privilege('anon', schemaname || '.' || tablename, 'DELETE') as can_delete
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Check RLS status
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
