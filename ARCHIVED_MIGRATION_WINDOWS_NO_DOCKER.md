# Run Migration on Windows WITHOUT Docker

This guide shows you how to run the migration using native Windows PostgreSQL installation.

## What You Need

1. **PostgreSQL for Windows**
   - Download: https://www.postgresql.org/download/windows/
   - Or use the EDB installer: https://www.enterprisedb.com/downloads/postgres-postgresql-downloads
   - Install it with default settings

2. **psql command-line tool** (comes with PostgreSQL)

## Quick Setup

### Step 1: Install PostgreSQL

1. Download PostgreSQL installer for Windows
2. Run the installer
3. Remember the password you set for the `postgres` user
4. Keep the default port: `5432`

### Step 2: Verify PostgreSQL is Running

Open Command Prompt or PowerShell and test:

```powershell
psql --version
```

If this doesn't work, you need to add PostgreSQL to your PATH:
- Default location: `C:\Program Files\PostgreSQL\15\bin`
- Add it to your System Environment Variables PATH

### Step 3: Run the Migration

```powershell
# Navigate to your project
cd C:\path\to\TRAIDENISINTERFACE

# Run the migration SQL file
psql -U postgres -d postgres -f migrations\001_migrate_from_supabase.sql
```

It will ask for your postgres password (the one you set during installation).

That's it! The migration is done.

### Step 4: Install PostgREST (Optional)

If you want to use PostgREST instead of direct database access:

1. Download PostgREST for Windows:
   - Go to: https://github.com/PostgREST/postgrest/releases
   - Download the latest Windows `.zip` file (e.g., `postgrest-v11.2.2-windows-x64.zip`)
   - Extract it somewhere (e.g., `C:\postgrest\`)

2. Create a config file `postgrest.conf`:
   ```
   db-uri = "postgres://authenticator:your_password@localhost:5432/postgres"
   db-schemas = "public"
   db-anon-role = "anon"
   server-port = 3000
   ```

3. Run PostgREST:
   ```powershell
   cd C:\postgrest
   .\postgrest.exe postgrest.conf
   ```

## Alternative: Use Online PostgreSQL

If you don't want to install PostgreSQL locally, use a cloud service:

### Option 1: Supabase (Free Tier)
1. Go to https://supabase.com
2. Create a new project
3. Get your database connection details
4. Run the migration:
   ```powershell
   psql "postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres" -f migrations\001_migrate_from_supabase.sql
   ```

### Option 2: ElephantSQL (Free Tier)
1. Go to https://www.elephantsql.com
2. Create a free "Tiny Turtle" instance
3. Get your connection URL
4. Run the migration:
   ```powershell
   psql "[YOUR_CONNECTION_URL]" -f migrations\001_migrate_from_supabase.sql
   ```

### Option 3: Neon (Free Tier)
1. Go to https://neon.tech
2. Create a new project
3. Get your connection string
4. Run the migration:
   ```powershell
   psql "[YOUR_CONNECTION_STRING]" -f migrations\001_migrate_from_supabase.sql
   ```

## Just Want to See What the Migration Does?

Open the file `migrations\001_migrate_from_supabase.sql` in a text editor. It's just SQL commands that create tables.

You can:
- Copy and paste the SQL into any PostgreSQL database tool (pgAdmin, DBeaver, etc.)
- Run it in Supabase's SQL editor
- Run it in any PostgreSQL GUI tool

## Simplest Method: Use Existing Database

If you already have a PostgreSQL database somewhere (local, cloud, Supabase, etc.):

1. Open your database tool (pgAdmin, Supabase dashboard, etc.)
2. Open the SQL editor
3. Copy the contents of `migrations\001_migrate_from_supabase.sql`
4. Paste and run it
5. Done!

## Update Your Application

After running the migration, update your `.env` file:

```
# If using local PostgreSQL
VITE_POSTGREST_URL=postgresql://postgres:password@localhost:5432/postgres

# If using cloud PostgreSQL
VITE_POSTGREST_URL=[your connection string]
```

## Troubleshooting

### "psql is not recognized"
- PostgreSQL bin folder is not in your PATH
- Manually navigate to it: `cd "C:\Program Files\PostgreSQL\15\bin"`
- Then run: `.\psql -U postgres -f "C:\path\to\migrations\001_migrate_from_supabase.sql"`

### "password authentication failed"
- Use the password you set when installing PostgreSQL
- Default username is `postgres`

### "connection refused"
- PostgreSQL service is not running
- Open Services (Win+R, type `services.msc`)
- Look for "postgresql-x64-15" (or similar)
- Start it if it's stopped

### Still stuck?
The migration file is just a SQL file. You can:
1. Open it in any text editor
2. Copy the SQL
3. Run it in any PostgreSQL tool you have access to (even online tools)
