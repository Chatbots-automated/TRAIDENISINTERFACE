# Migration Guide: Supabase to Local PostgreSQL + PostgREST

This guide explains how to migrate the TRAIDENIS application from Supabase to a local PostgreSQL instance with PostgREST.

## Overview

The migration involves:
1. Setting up local PostgreSQL + PostgREST using Docker
2. Running database migrations to create all necessary tables
3. Switching the application to use PostgREST client instead of Supabase
4. Using the n8n_vector_store table for project data (replacing nestandartiniai_projects)

## Prerequisites

- Docker and Docker Compose installed
- Existing local PostgreSQL with `n8n_vector_store` and `app_users` tables
- Node.js and npm/pnpm installed

## Step 1: Backup Existing Data

Before migrating, backup your current Supabase data if needed:

```bash
# Export data from Supabase (if you have data to preserve)
# Use Supabase dashboard or pg_dump if you have direct access
```

## Step 2: Set Up Environment Variables

1. Copy the example environment file:

```bash
cp .env.postgrest.example .env.postgrest
```

2. Edit `.env.postgrest` and update the values:

```env
# PostgreSQL Configuration
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# PostgREST Configuration
POSTGREST_URL=http://localhost:3000
POSTGREST_PASSWORD=your_authenticator_password
POSTGREST_JWT_SECRET=generate_a_random_32_character_string_here
POSTGREST_PROXY_URI=http://localhost:3000

# Application Configuration
VITE_POSTGREST_URL=http://localhost:3000
VITE_POSTGREST_ANON_KEY=anon
```

3. Generate a secure JWT secret (32+ characters):

```bash
openssl rand -base64 32
```

## Step 3: Start PostgreSQL + PostgREST

```bash
# Load environment variables
export $(cat .env.postgrest | xargs)

# Start services
docker-compose -f docker-compose.postgrest.yml up -d

# Check logs
docker-compose -f docker-compose.postgrest.yml logs -f
```

This will start:
- **PostgreSQL** on port 5432
- **PostgREST** on port 3000
- **pgAdmin** (optional) on port 5050

## Step 4: Run Database Migrations

The migration script will automatically run when PostgreSQL starts (via docker-entrypoint-initdb.d), but you can also run it manually:

```bash
# Connect to PostgreSQL
docker exec -it traidenis_postgres psql -U postgres -d postgres

# Run migration
\i /docker-entrypoint-initdb.d/001_migrate_from_supabase.sql

# Verify tables were created
\dt

# Check the nestandartiniai_projects view
SELECT * FROM nestandartiniai_projects LIMIT 5;

# Exit
\q
```

## Step 5: Update Application Code

### Option A: Quick Switch (Recommended)

Replace the Supabase client import with the PostgREST client:

1. Rename the original supabase.ts:

```bash
mv src/lib/supabase.ts src/lib/supabase.original.ts
```

2. Rename the PostgREST version:

```bash
mv src/lib/supabase.postgrest.ts src/lib/supabase.ts
```

3. Update your `.env` file:

```bash
# Comment out old Supabase variables
# VITE_SUPABASE_URL=...
# VITE_SUPABASE_ANON_KEY=...

# Add PostgREST variables
VITE_POSTGREST_URL=http://localhost:3000
VITE_POSTGREST_ANON_KEY=anon
```

### Option B: Gradual Migration

Keep both clients and migrate services one by one:

```typescript
// In services that are ready to migrate
import { supabase } from './supabase.postgrest';

// In services still using Supabase
import { supabase } from './supabase';
```

## Step 6: Update nestandartiniai Service

The `nestandartiniai_projects` table has been replaced with a view that queries `n8n_vector_store`. The service code in `src/lib/nestandardiniaiService.ts` will continue to work without changes because the view provides the same interface:

```sql
-- View definition (already created by migration)
CREATE VIEW nestandartiniai_projects AS
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
FROM n8n_vector_store
WHERE project_name IS NOT NULL
ORDER BY project_name, pateikimo_data DESC;
```

## Step 7: Verify Migration

1. Start the development server:

```bash
npm run dev
# or
pnpm dev
```

2. Test key functionality:
   - ✅ User login/logout
   - ✅ EML file upload (Nestandartiniai interface)
   - ✅ Project search and selection
   - ✅ Webhook management
   - ✅ Application logging
   - ✅ SDK conversations

3. Check PostgREST endpoint:

```bash
# Test the API directly
curl http://localhost:3000/

# Get webhooks
curl http://localhost:3000/webhooks

# Get nestandartiniai projects
curl http://localhost:3000/nestandartiniai_projects
```

## Step 8: Data Migration (if needed)

If you have existing data in Supabase that needs to be migrated:

### Export from Supabase

```bash
# Use Supabase dashboard to export data as CSV or SQL
# Or use the Supabase CLI
npx supabase db dump --data-only > supabase_data.sql
```

### Import to Local PostgreSQL

```bash
# Copy SQL file to Docker container
docker cp supabase_data.sql traidenis_postgres:/tmp/

# Import data
docker exec -it traidenis_postgres psql -U postgres -d postgres -f /tmp/supabase_data.sql
```

## Step 9: Update Webhooks Configuration

The webhooks are now stored in the database instead of environment variables:

1. Access pgAdmin (optional):
   - URL: http://localhost:5050
   - Email: admin@traidenis.local (or as configured)
   - Password: admin (or as configured)

2. Update webhook URLs in the database:

```sql
UPDATE webhooks
SET url = 'http://your-n8n-server:5678/webhook/upload-new'
WHERE webhook_key = 'n8n_upload_new';

UPDATE webhooks
SET url = 'http://your-n8n-server:5678/webhook/find-similar'
WHERE webhook_key = 'n8n_find_similar';

UPDATE webhooks
SET url = 'http://your-n8n-server:5678/webhook/upload-solution'
WHERE webhook_key = 'n8n_upload_solution';
```

3. Or use the admin interface in the application (WebhooksModal component)

## Troubleshooting

### PostgREST Connection Issues

```bash
# Check if PostgREST is running
docker ps | grep postgrest

# Check PostgREST logs
docker logs traidenis_postgrest

# Test direct connection
curl http://localhost:3000/
```

### PostgreSQL Connection Issues

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check PostgreSQL logs
docker logs traidenis_postgres

# Test connection
docker exec -it traidenis_postgres psql -U postgres -c "SELECT version();"
```

### CORS Issues

If you encounter CORS issues, update the PostgREST configuration in `docker-compose.postgrest.yml`:

```yaml
environment:
  PGRST_SERVER_PROXY_URI: ${POSTGREST_PROXY_URI:-http://localhost:3000}
  # Add CORS headers if needed
```

### View Returns No Data

Check if `n8n_vector_store` has data:

```sql
-- Check n8n_vector_store
SELECT COUNT(*) FROM n8n_vector_store;

-- Check distinct project names
SELECT DISTINCT project_name FROM n8n_vector_store WHERE project_name IS NOT NULL;

-- Test the view
SELECT * FROM nestandartiniai_projects LIMIT 10;
```

## Performance Optimization

### Add Indexes

The migration already creates indexes, but you can add more based on your query patterns:

```sql
-- Example: Add index for frequently searched fields
CREATE INDEX IF NOT EXISTS idx_vector_store_project_klientas
ON n8n_vector_store(project_name, klientas);

-- Add more indexes as needed based on slow queries
```

### Enable Query Logging

```sql
-- Enable slow query logging (adjust threshold as needed)
ALTER SYSTEM SET log_min_duration_statement = 1000; -- 1 second
SELECT pg_reload_conf();
```

## Security Considerations

1. **Change default passwords**: Update all default passwords in `.env.postgrest`

2. **Enable SSL**: For production, enable SSL connections:

```yaml
# In docker-compose.postgrest.yml
postgres:
  command: >
    postgres
    -c ssl=on
    -c ssl_cert_file=/path/to/cert.pem
    -c ssl_key_file=/path/to/key.pem
```

3. **Restrict access**: Use firewall rules to restrict access to PostgreSQL and PostgREST

4. **Regular backups**: Set up automated backups:

```bash
# Backup script
docker exec traidenis_postgres pg_dump -U postgres postgres > backup_$(date +%Y%m%d).sql
```

## Rollback Plan

If you need to rollback to Supabase:

1. Restore the original files:

```bash
mv src/lib/supabase.ts src/lib/supabase.postgrest.ts
mv src/lib/supabase.original.ts src/lib/supabase.ts
```

2. Restore environment variables in `.env`:

```bash
# Restore Supabase variables
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

3. Restart the development server

## Next Steps

After successful migration:

1. ✅ Remove Supabase dependencies from package.json (optional)
2. ✅ Update CI/CD pipelines if any
3. ✅ Document the new architecture for team members
4. ✅ Set up monitoring for PostgreSQL and PostgREST
5. ✅ Configure automated backups

## Support

For issues or questions:
- Check PostgREST documentation: https://postgrest.org
- Check PostgreSQL documentation: https://www.postgresql.org/docs/
- Review application logs in the browser console

## Architecture Diagram

```
┌─────────────────┐
│   React App     │
│  (Frontend)     │
└────────┬────────┘
         │
         │ HTTP REST API
         │
┌────────▼────────┐
│   PostgREST     │ (Port 3000)
│   API Server    │
└────────┬────────┘
         │
         │ PostgreSQL Protocol
         │
┌────────▼────────┐
│  PostgreSQL DB  │ (Port 5432)
│                 │
│ Tables:         │
│ - app_users     │
│ - webhooks      │
│ - n8n_vector... │
│ - sdk_conver... │
│ - etc.          │
└─────────────────┘
```

## Migration Checklist

- [ ] Backup existing Supabase data (if any)
- [ ] Set up `.env.postgrest` with secure credentials
- [ ] Start Docker containers (PostgreSQL + PostgREST)
- [ ] Run database migrations
- [ ] Verify all tables and views created successfully
- [ ] Switch application to use PostgREST client
- [ ] Test user authentication
- [ ] Test EML upload functionality
- [ ] Test project search and selection
- [ ] Test webhook management
- [ ] Verify logging works
- [ ] Update webhook URLs in database
- [ ] Test all critical user flows
- [ ] Set up automated backups
- [ ] Document any custom configurations
- [ ] Update team documentation

## Conclusion

This migration provides several benefits:
- ✅ Full control over your database
- ✅ No vendor lock-in
- ✅ Lower costs (no Supabase subscription needed)
- ✅ Better performance for local development
- ✅ Easier debugging and monitoring
- ✅ Ability to use advanced PostgreSQL features

The application code requires minimal changes thanks to the PostgREST client wrapper that mimics Supabase's API.
