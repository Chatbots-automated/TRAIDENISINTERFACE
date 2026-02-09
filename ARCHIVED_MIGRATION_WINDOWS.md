# How to Run the Migration on Windows

This guide explains how to run the Supabase to PostgreSQL + PostgREST migration on Windows.

## Prerequisites

1. **Docker Desktop for Windows**
   - Download and install from: https://www.docker.com/products/docker-desktop
   - Make sure Docker Desktop is running (you should see the whale icon in your system tray)

2. **Git Bash or PowerShell**
   - PowerShell comes with Windows
   - Or use Git Bash if you have Git for Windows installed

## Running the Migration

### Option 1: Double-click the Batch File (Easiest)

1. Open Windows Explorer
2. Navigate to your project folder: `TRAIDENISINTERFACE\scripts`
3. Double-click on `migrate-to-postgrest.bat`
4. Follow the prompts in the window

### Option 2: Run PowerShell Script

1. Open PowerShell as Administrator (Right-click Start menu → Windows PowerShell (Admin))
2. Navigate to your project folder:
   ```powershell
   cd C:\path\to\TRAIDENISINTERFACE
   ```
3. Run the migration script:
   ```powershell
   .\scripts\migrate-to-postgrest.ps1
   ```

### Option 3: Manual Step-by-Step (If scripts don't work)

If the automated scripts don't work, here's the manual process:

#### Step 1: Start Docker Containers

```powershell
# Make sure you're in the project root directory
cd C:\path\to\TRAIDENISINTERFACE

# Start the containers
docker-compose -f docker-compose.postgrest.yml up -d
```

#### Step 2: Wait for PostgreSQL to Start

```powershell
# Wait about 10-15 seconds, then check if it's ready
docker exec traidenis_postgres pg_isready -U postgres
```

If you get "accepting connections", it's ready. If not, wait a bit longer and try again.

#### Step 3: Run the Migration SQL

```powershell
# Copy the migration file to the container
docker cp migrations\001_migrate_from_supabase.sql traidenis_postgres:/tmp/

# Run the migration
docker exec -it traidenis_postgres psql -U postgres -d postgres -f /tmp/001_migrate_from_supabase.sql
```

#### Step 4: Verify It Worked

```powershell
# Check that tables were created
docker exec traidenis_postgres psql -U postgres -d postgres -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"

# Test the PostgREST API
curl http://localhost:3000/
```

If you see a response from the curl command, PostgREST is working!

#### Step 5: Update Your .env File

Add these lines to your `.env` file in the project root:

```
VITE_POSTGREST_URL=http://localhost:3000
VITE_POSTGREST_ANON_KEY=anon
```

## Troubleshooting

### "Docker is not running"
- Open Docker Desktop from the Start menu
- Wait for it to fully start (the whale icon should be steady, not animated)
- Try the migration again

### "Port 5432 is already in use"
- You might have another PostgreSQL instance running
- Stop it or change the port in `docker-compose.postgrest.yml`

### "Permission denied" or "Execution Policy" errors with PowerShell
- Run PowerShell as Administrator
- Or use this command to allow the script to run:
  ```powershell
  Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
  ```

### Migration SQL fails
- Check the Docker logs:
  ```powershell
  docker-compose -f docker-compose.postgrest.yml logs postgres
  ```
- Make sure the `migrations/001_migrate_from_supabase.sql` file exists

## After Migration

Once migration is complete:

1. Start your development server:
   ```powershell
   npm run dev
   # or
   pnpm dev
   ```

2. Test your application to make sure everything works

3. The services are running at:
   - PostgreSQL: `localhost:5432`
   - PostgREST API: `http://localhost:3000`
   - pgAdmin (database GUI): `http://localhost:5050`

## Useful Commands

```powershell
# View container logs
docker-compose -f docker-compose.postgrest.yml logs -f

# Stop all services
docker-compose -f docker-compose.postgrest.yml down

# Access PostgreSQL directly
docker exec -it traidenis_postgres psql -U postgres

# Restart services
docker-compose -f docker-compose.postgrest.yml restart
```

## Rollback

If you need to rollback to Supabase:

```powershell
# Restore the original Supabase client
Copy-Item src\lib\supabase.original.ts src\lib\supabase.ts

# Stop the Docker containers
docker-compose -f docker-compose.postgrest.yml down
```

## Need Help?

If you're still stuck, check:
- Docker Desktop is running
- You're in the correct directory
- The migration files exist in the `migrations` folder
- Your antivirus isn't blocking Docker
