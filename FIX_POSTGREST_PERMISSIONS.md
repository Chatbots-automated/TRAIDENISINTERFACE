# Fix PostgREST Permission Issues

## Problem Summary

The PostgREST API is returning **401 Unauthorized** errors for several tables:
- `instruction_variables` - Error code 42501 (permission denied)
- `sdk_conversations` - Error code 42501
- `shared_conversations` - Error code 42501
- `prompt_template` - Error code 42501

While `app_users` table works fine (200 OK).

**Root Cause:** The `anon` role doesn't have proper permissions on these tables, likely due to Row Level Security (RLS) policies blocking access.

## Solution

Apply the migration file `migrations/002_fix_anon_permissions.sql` to your PostgreSQL database.

## How to Apply the Fix

### Option 1: SSH to VM and Apply Migration

If you have SSH access to your VM running api.traidenis.org:

```bash
# 1. SSH into your VM
ssh your-username@api.traidenis.org

# 2. Navigate to your project directory
cd /path/to/TRAIDENISINTERFACE

# 3. Apply the migration using psql
psql -U postgres -d postgres -f migrations/002_fix_anon_permissions.sql

# Alternative: If using Docker
docker exec -i traidenis_postgres psql -U postgres -d postgres < migrations/002_fix_anon_permissions.sql
```

### Option 2: Apply via Docker (if PostgreSQL is in a container)

```bash
# Copy the migration file to the container
docker cp migrations/002_fix_anon_permissions.sql traidenis_postgres:/tmp/

# Execute the migration
docker exec traidenis_postgres psql -U postgres -d postgres -f /tmp/002_fix_anon_permissions.sql
```

### Option 3: Apply via pgAdmin (GUI)

1. Open pgAdmin at `http://your-vm-ip:5050`
2. Login with credentials from your `.env.postgrest` file
3. Connect to the PostgreSQL server
4. Open Query Tool (Tools → Query Tool)
5. Copy the contents of `migrations/002_fix_anon_permissions.sql`
6. Paste and execute

### Option 4: Apply Manually via SQL

Connect to your database and run these key commands:

```sql
-- Disable RLS on the problematic tables
ALTER TABLE public.instruction_variables DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sdk_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_conversations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_template DISABLE ROW LEVEL SECURITY;

-- Grant SELECT permissions to anon role
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- Grant write permissions on tables that need them
GRANT INSERT, UPDATE, DELETE ON public.sdk_conversations TO anon;
GRANT INSERT, UPDATE, DELETE ON public.shared_conversations TO anon;
GRANT UPDATE ON public.instruction_variables TO anon;
GRANT UPDATE ON public.prompt_template TO anon;

-- Grant sequence permissions
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- Grant function execution
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon;
```

## Verification

After applying the fix, verify the permissions:

### Test 1: Check Table Permissions

```sql
SELECT
  tablename,
  has_table_privilege('anon', 'public.' || tablename, 'SELECT') as can_select
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('instruction_variables', 'sdk_conversations', 'shared_conversations', 'prompt_template')
ORDER BY tablename;
```

Expected output: All tables should show `can_select = true`

### Test 2: Check RLS Status

```sql
SELECT
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('instruction_variables', 'sdk_conversations', 'shared_conversations', 'prompt_template')
ORDER BY tablename;
```

Expected output: All tables should show `rls_enabled = false`

### Test 3: Test API Access

```bash
# Test instruction_variables
curl "https://api.traidenis.org/instruction_variables?select=*&limit=1"

# Test sdk_conversations
curl "https://api.traidenis.org/sdk_conversations?select=*&limit=1"

# Test shared_conversations
curl "https://api.traidenis.org/shared_conversations?select=*&limit=1"

# Test prompt_template
curl "https://api.traidenis.org/prompt_template?select=*&limit=1"
```

Expected: All should return `200 OK` with JSON data (or empty arrays if no data exists)

### Test 4: Test in Browser

Refresh your application and check the browser console. The errors should be gone:
- ✅ No more "401 Unauthorized" errors
- ✅ No more "permission denied for table" messages
- ✅ Data loads successfully

## Rollback (if needed)

If you need to rollback the changes:

```sql
-- Re-enable RLS
ALTER TABLE public.instruction_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sdk_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shared_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_template ENABLE ROW LEVEL SECURITY;

-- Revoke permissions
REVOKE INSERT, UPDATE, DELETE ON public.sdk_conversations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.shared_conversations FROM anon;
REVOKE UPDATE ON public.instruction_variables FROM anon;
REVOKE UPDATE ON public.prompt_template FROM anon;
```

## Security Notes

⚠️ **Important:** This fix disables Row Level Security (RLS) on these tables to allow the `anon` role full access.

**For local/internal deployment:** This is acceptable since the database is not exposed to the public internet.

**For production/public deployment:** You should implement proper JWT authentication and RLS policies:

1. Generate JWT tokens when users log in
2. Include JWT in `Authorization: Bearer <token>` header
3. Enable RLS policies that check the JWT user ID
4. Grant permissions to `authenticated` role instead of `anon`

See [POSTGREST_QUICKSTART.md](./POSTGREST_QUICKSTART.md) line 386 for production security recommendations.

## Troubleshooting

### Migration fails with "role anon does not exist"

The `anon` role hasn't been created yet. Run:

```sql
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticator NOINHERIT LOGIN PASSWORD 'your_password';
GRANT anon TO authenticator;
```

### Still getting 401 errors after applying the fix

1. **Restart PostgREST:**
   ```bash
   docker restart traidenis_postgrest
   # or
   docker-compose -f docker-compose.postgrest.yml restart
   ```

2. **Check PostgREST logs:**
   ```bash
   docker logs traidenis_postgrest
   ```

3. **Verify the migration was applied:**
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
   ```

### Different error codes

- **42P01**: Table doesn't exist - check table name spelling
- **42501**: Permission denied - migration wasn't applied correctly
- **3D000**: Database doesn't exist - check database name
- **28P01**: Authentication failed - check PostgREST DB_URI in docker-compose

## Next Steps

After fixing the permissions:

1. ✅ Test all application features that were failing
2. ✅ Monitor the console for any remaining errors
3. ✅ Consider implementing JWT authentication for production
4. ✅ Document any custom RLS policies you need
5. ✅ Set up automated backups before making more changes

## Need More Help?

- Check PostgREST logs: `docker logs traidenis_postgrest`
- Check PostgreSQL logs: `docker logs traidenis_postgres`
- Review [POSTGREST_QUICKSTART.md](./POSTGREST_QUICKSTART.md)
- Review [POSTGREST_MIGRATION_COMPLETE.md](./POSTGREST_MIGRATION_COMPLETE.md)
