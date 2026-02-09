-- Fix PostgREST permissions for web_anon role
-- The PostgREST config uses "web_anon" not "anon"

-- ============================================================================
-- CREATE web_anon ROLE
-- ============================================================================

-- Create the web_anon role (this is what PostgREST config uses)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'web_anon') THEN
    CREATE ROLE web_anon NOLOGIN;
  END IF;
END
$$;

-- Also ensure authenticator role exists and can switch to web_anon
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticator') THEN
    CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'your_secure_password_here';
  END IF;
END
$$;

-- Allow authenticator to switch to web_anon role
GRANT web_anon TO authenticator;

-- ============================================================================
-- GRANT PERMISSIONS TO web_anon
-- ============================================================================

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO web_anon;

-- Grant SELECT on all existing tables
GRANT SELECT ON ALL TABLES IN SCHEMA public TO web_anon;

-- Grant INSERT/UPDATE/DELETE on tables that need write access
GRANT INSERT, UPDATE, DELETE ON TABLE public.application_logs TO web_anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.sdk_conversations TO web_anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.shared_conversations TO web_anon;
GRANT INSERT, UPDATE ON TABLE public.instruction_variables TO web_anon;
GRANT INSERT, UPDATE ON TABLE public.instruction_versions TO web_anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.app_users TO web_anon;
GRANT INSERT, UPDATE ON TABLE public.webhooks TO web_anon;
GRANT INSERT, UPDATE ON TABLE public.prompt_template TO web_anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.chat_items TO web_anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.documents TO web_anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.user_voiceflow_sessions TO web_anon;
GRANT INSERT, UPDATE, DELETE ON TABLE public.project_members TO web_anon;

-- Grant sequence usage (for auto-increment IDs)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO web_anon;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO web_anon;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
GRANT USAGE, SELECT ON SEQUENCES TO web_anon;

-- Grant execute on all functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO web_anon;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

-- Verify web_anon role exists
SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname IN ('web_anon', 'authenticator');

-- Check permissions for web_anon
SELECT
  tablename,
  has_table_privilege('web_anon', 'public.' || tablename, 'SELECT') as can_select,
  has_table_privilege('web_anon', 'public.' || tablename, 'INSERT') as can_insert,
  has_table_privilege('web_anon', 'public.' || tablename, 'UPDATE') as can_update,
  has_table_privilege('web_anon', 'public.' || tablename, 'DELETE') as can_delete
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
