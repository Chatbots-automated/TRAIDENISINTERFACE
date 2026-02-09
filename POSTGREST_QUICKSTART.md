# PostgREST Quick Start Guide

This is a quick reference for running the TRAIDENIS application with local PostgreSQL + PostgREST instead of Supabase.

## Quick Start (Automated)

Run the migration script:

```bash
./scripts/migrate-to-postgrest.sh
```

The script will:
1. ✅ Check prerequisites (Docker, Docker Compose)
2. ✅ Set up environment variables
3. ✅ Start PostgreSQL + PostgREST containers
4. ✅ Run database migrations
5. ✅ Switch to PostgREST client
6. ✅ Verify the migration

## Manual Setup

### 1. Start Services

```bash
# Load environment
export $(cat .env.postgrest | xargs)

# Start containers
docker-compose -f docker-compose.postgrest.yml up -d

# View logs
docker-compose -f docker-compose.postgrest.yml logs -f
```

### 2. Access Services

- **PostgreSQL**: localhost:5432
- **PostgREST API**: http://localhost:3000
- **pgAdmin** (optional): http://localhost:5050

### 3. Update Environment

Add to your `.env` file:

```env
VITE_POSTGREST_URL=http://localhost:3000
VITE_POSTGREST_ANON_KEY=anon
```

### 4. Start Application

```bash
npm run dev
```

## Testing the API

### List all tables

```bash
curl http://localhost:3000/
```

### Get webhooks

```bash
curl http://localhost:3000/webhooks
```

### Get nestandartiniai projects

```bash
curl http://localhost:3000/nestandartiniai_projects
```

### Get app users

```bash
curl http://localhost:3000/app_users?select=id,email,display_name,is_admin
```

### Filter example

```bash
# Get active webhooks only
curl "http://localhost:3000/webhooks?is_active=eq.true"

# Search projects by subject line
curl "http://localhost:3000/nestandartiniai_projects?subject_line=ilike.*project*"
```

## Database Access

### Using psql

```bash
# Access PostgreSQL CLI
docker exec -it traidenis_postgres psql -U postgres

# List tables
\dt

# Query nestandartiniai_projects view
SELECT * FROM nestandartiniai_projects LIMIT 5;

# Check n8n_vector_store data
SELECT project_name, klientas, pateikimo_data
FROM n8n_vector_store
WHERE project_name IS NOT NULL
LIMIT 10;

# Exit
\q
```

### Using pgAdmin

1. Open http://localhost:5050
2. Login with credentials from `.env.postgrest`:
   - Email: admin@traidenis.local
   - Password: admin (or as configured)
3. Add server:
   - Host: postgres (container name)
   - Port: 5432
   - Username: postgres
   - Password: from POSTGRES_PASSWORD in .env.postgrest

## Common Operations

### Stop Services

```bash
docker-compose -f docker-compose.postgrest.yml down
```

### Restart Services

```bash
docker-compose -f docker-compose.postgrest.yml restart
```

### View Logs

```bash
# All services
docker-compose -f docker-compose.postgrest.yml logs -f

# PostgreSQL only
docker logs -f traidenis_postgres

# PostgREST only
docker logs -f traidenis_postgrest
```

### Backup Database

```bash
# Backup all data
docker exec traidenis_postgres pg_dump -U postgres postgres > backup.sql

# Backup specific table
docker exec traidenis_postgres pg_dump -U postgres -t n8n_vector_store postgres > n8n_backup.sql
```

### Restore Database

```bash
# Copy backup file to container
docker cp backup.sql traidenis_postgres:/tmp/

# Restore
docker exec traidenis_postgres psql -U postgres -d postgres -f /tmp/backup.sql
```

## Troubleshooting

### PostgREST not responding

```bash
# Check if container is running
docker ps | grep postgrest

# Check logs
docker logs traidenis_postgrest

# Restart PostgREST
docker restart traidenis_postgrest
```

### Database connection issues

```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Test connection
docker exec traidenis_postgres pg_isready -U postgres

# Check PostgreSQL logs
docker logs traidenis_postgres
```

### Application can't connect

1. Verify VITE_POSTGREST_URL in .env:
   ```env
   VITE_POSTGREST_URL=http://localhost:3000
   ```

2. Check PostgREST is accessible:
   ```bash
   curl http://localhost:3000/
   ```

3. Check browser console for CORS errors

### No data in nestandartiniai_projects view

```sql
-- Check if n8n_vector_store has data
SELECT COUNT(*) FROM n8n_vector_store;

-- Check project names
SELECT DISTINCT project_name FROM n8n_vector_store WHERE project_name IS NOT NULL;

-- Manually test the view query
SELECT DISTINCT ON (project_name)
  komercinis_id as id,
  project_name as subject_line
FROM n8n_vector_store
WHERE project_name IS NOT NULL
ORDER BY project_name, pateikimo_data DESC;
```

## Architecture

```
Frontend (React)
      ↓
   PostgREST (REST API)
      ↓
   PostgreSQL
      ↓
   Tables & Views:
   - n8n_vector_store (existing)
   - nestandartiniai_projects (view)
   - webhooks
   - app_users
   - application_logs
   - sdk_conversations
   - etc.
```

## Key Differences from Supabase

| Feature | Supabase | PostgREST + PostgreSQL |
|---------|----------|------------------------|
| **Auth** | Supabase Auth | Local password-based auth |
| **API** | Supabase JS Client | PostgREST HTTP API |
| **Real-time** | Supabase Realtime | Not included (can add separately) |
| **Storage** | Supabase Storage | Not included (use S3/MinIO) |
| **Database** | Hosted PostgreSQL | Local PostgreSQL |
| **Cost** | Subscription-based | Free (self-hosted) |
| **Control** | Limited | Full control |

## PostgREST Query Examples

### Select

```javascript
// Get all webhooks
const { data } = await supabase.from('webhooks').select('*');

// Becomes HTTP request:
// GET http://localhost:3000/webhooks?select=*
```

### Filter

```javascript
// Get active webhooks only
const { data } = await supabase
  .from('webhooks')
  .select('*')
  .eq('is_active', true);

// Becomes HTTP request:
// GET http://localhost:3000/webhooks?is_active=eq.true
```

### Insert

```javascript
// Insert new webhook
const { data } = await supabase
  .from('webhooks')
  .insert([{ webhook_key: 'test', url: 'http://example.com' }])
  .select();

// Becomes HTTP request:
// POST http://localhost:3000/webhooks
// Body: [{ webhook_key: 'test', url: 'http://example.com' }]
```

### Update

```javascript
// Update webhook
const { data } = await supabase
  .from('webhooks')
  .update({ url: 'http://new-url.com' })
  .eq('webhook_key', 'test')
  .select();

// Becomes HTTP request:
// PATCH http://localhost:3000/webhooks?webhook_key=eq.test
// Body: { url: 'http://new-url.com' }
```

### Delete

```javascript
// Delete webhook
const { data } = await supabase
  .from('webhooks')
  .delete()
  .eq('webhook_key', 'test');

// Becomes HTTP request:
// DELETE http://localhost:3000/webhooks?webhook_key=eq.test
```

## Useful SQL Queries

### Check webhook status

```sql
SELECT webhook_key, webhook_name, url, is_active, last_test_status
FROM webhooks
ORDER BY webhook_name;
```

### View recent logs

```sql
SELECT level, category, action, message, timestamp, user_email
FROM application_logs
ORDER BY timestamp DESC
LIMIT 20;
```

### Count projects by client

```sql
SELECT
  klientas,
  COUNT(DISTINCT project_name) as project_count,
  MAX(pateikimo_data) as latest_submission
FROM n8n_vector_store
WHERE project_name IS NOT NULL
GROUP BY klientas
ORDER BY project_count DESC;
```

### Search projects

```sql
SELECT DISTINCT
  project_name,
  klientas,
  pateikimo_data
FROM n8n_vector_store
WHERE
  project_name ILIKE '%search_term%'
  OR klientas ILIKE '%search_term%'
ORDER BY pateikimo_data DESC
LIMIT 20;
```

## Production Deployment

For production deployment, consider:

1. **SSL/TLS**: Enable SSL for PostgreSQL and HTTPS for PostgREST
2. **Authentication**: Implement JWT-based authentication
3. **Backups**: Set up automated backups
4. **Monitoring**: Add monitoring for PostgreSQL and PostgREST
5. **Scaling**: Use connection pooling (PgBouncer)
6. **Security**: Harden PostgreSQL configuration
7. **Firewall**: Restrict access to PostgreSQL and PostgREST ports

## Resources

- [PostgREST Documentation](https://postgrest.org)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Docker Documentation](https://docs.docker.com/)
- [Migration Guide](./MIGRATION_GUIDE.md) - Detailed migration instructions

## Need Help?

1. Check the logs: `docker-compose -f docker-compose.postgrest.yml logs`
2. Review the [Migration Guide](./MIGRATION_GUIDE.md)
3. Test API endpoints with curl or Postman
4. Check PostgreSQL directly with psql
5. Verify environment variables in `.env.postgrest`
