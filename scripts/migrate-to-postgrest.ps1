# TRAIDENIS Migration Script: Supabase to PostgreSQL + PostgREST
# Windows PowerShell version
# This script automates the migration process on Windows

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "TRAIDENIS Migration to PostgreSQL + PostgREST" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "Checking prerequisites..." -ForegroundColor Yellow

# Check Docker
try {
    docker --version | Out-Null
    Write-Host "[OK] Docker is installed" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Docker is not installed or not in PATH" -ForegroundColor Red
    Write-Host "Please install Docker Desktop for Windows from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Check Docker Compose
try {
    docker-compose --version | Out-Null
    Write-Host "[OK] Docker Compose is installed" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Docker Compose is not installed" -ForegroundColor Red
    exit 1
}

# Check if Docker is running
try {
    docker ps | Out-Null
    Write-Host "[OK] Docker is running" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 1: Environment setup
Write-Host "Step 1: Setting up environment variables..." -ForegroundColor Yellow

if (-Not (Test-Path ".env.postgrest")) {
    if (Test-Path ".env.postgrest.example") {
        Copy-Item ".env.postgrest.example" ".env.postgrest"
        Write-Host "[WARNING] Created .env.postgrest from example" -ForegroundColor Yellow
        Write-Host "[WARNING] Please edit .env.postgrest and update the credentials" -ForegroundColor Yellow
        Write-Host ""
        Read-Host "Press Enter after updating .env.postgrest"
    } else {
        Write-Host "[ERROR] .env.postgrest.example not found" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[OK] .env.postgrest already exists" -ForegroundColor Green
}

Write-Host ""

# Step 2: Backup existing files
Write-Host "Step 2: Backing up existing Supabase integration..." -ForegroundColor Yellow

if ((Test-Path "src/lib/supabase.ts") -and -Not (Test-Path "src/lib/supabase.original.ts")) {
    Copy-Item "src/lib/supabase.ts" "src/lib/supabase.original.ts"
    Write-Host "[OK] Backed up src/lib/supabase.ts to src/lib/supabase.original.ts" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Backup already exists or supabase.ts not found" -ForegroundColor Yellow
}

Write-Host ""

# Step 3: Start Docker containers
Write-Host "Step 3: Starting PostgreSQL + PostgREST containers..." -ForegroundColor Yellow

docker-compose -f docker-compose.postgrest.yml up -d

Write-Host "Waiting for services to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check if containers are running
$postgresRunning = docker ps --filter "name=traidenis_postgres" --format "{{.Names}}"
$postgrestRunning = docker ps --filter "name=traidenis_postgrest" --format "{{.Names}}"

if ($postgresRunning -and $postgrestRunning) {
    Write-Host "[OK] Docker containers started successfully" -ForegroundColor Green
} else {
    Write-Host "[ERROR] Failed to start Docker containers" -ForegroundColor Red
    Write-Host "Check logs with: docker-compose -f docker-compose.postgrest.yml logs" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Step 4: Run migrations
Write-Host "Step 4: Running database migrations..." -ForegroundColor Yellow

# Wait for PostgreSQL to be ready
Write-Host "Waiting for PostgreSQL to be ready..." -ForegroundColor Yellow
$maxAttempts = 30
$attempt = 0
$ready = $false

while ($attempt -lt $maxAttempts) {
    $attempt++
    try {
        docker exec traidenis_postgres pg_isready -U postgres 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "[OK] PostgreSQL is ready" -ForegroundColor Green
            $ready = $true
            break
        }
    } catch {
        # Ignore error and retry
    }
    Write-Host "Attempt $attempt/$maxAttempts..." -ForegroundColor Gray
    Start-Sleep -Seconds 2
}

if (-not $ready) {
    Write-Host "[ERROR] PostgreSQL did not become ready in time" -ForegroundColor Red
    exit 1
}

# Check if migration file exists
if (-Not (Test-Path "migrations/001_migrate_from_supabase.sql")) {
    Write-Host "[ERROR] Migration file not found at migrations/001_migrate_from_supabase.sql" -ForegroundColor Red
    exit 1
}

# Copy migration file to container
Write-Host "Copying migration file to container..." -ForegroundColor Yellow
docker cp migrations/001_migrate_from_supabase.sql traidenis_postgres:/tmp/

# Run migration
Write-Host "Running migration script..." -ForegroundColor Yellow
docker exec -it traidenis_postgres psql -U postgres -d postgres -f /tmp/001_migrate_from_supabase.sql

Write-Host "[OK] Database migrations completed" -ForegroundColor Green
Write-Host ""

# Step 5: Verify migration
Write-Host "Step 5: Verifying migration..." -ForegroundColor Yellow

# Check tables
$tables = docker exec traidenis_postgres psql -U postgres -d postgres -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';"
$tables = $tables.Trim()
Write-Host "Created tables: $tables" -ForegroundColor Cyan

# Check nestandartiniai_projects view
try {
    $projects = docker exec traidenis_postgres psql -U postgres -d postgres -t -c "SELECT COUNT(*) FROM nestandartiniai_projects;" 2>&1
    $projects = $projects.Trim()
    Write-Host "Projects in view: $projects" -ForegroundColor Cyan
} catch {
    Write-Host "Projects in view: 0" -ForegroundColor Yellow
}

if ([int]$tables -gt 5) {
    Write-Host "[OK] Database verification passed" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Expected more tables. Check migration logs." -ForegroundColor Yellow
}

Write-Host ""

# Step 6: Switch to PostgREST client
Write-Host "Step 6: Switching to PostgREST client..." -ForegroundColor Yellow

$response = Read-Host "Do you want to switch to PostgREST client now? (y/n)"
if ($response -eq "y" -or $response -eq "Y") {
    # Backup original if not already done
    if (-Not (Test-Path "src/lib/supabase.original.ts")) {
        Copy-Item "src/lib/supabase.ts" "src/lib/supabase.original.ts"
    }

    # Replace with PostgREST version
    if (Test-Path "src/lib/supabase.postgrest.ts") {
        Copy-Item "src/lib/supabase.postgrest.ts" "src/lib/supabase.ts"
        Write-Host "[OK] Switched to PostgREST client" -ForegroundColor Green
        Write-Host "[WARNING] Don't forget to update your .env file with VITE_POSTGREST_URL" -ForegroundColor Yellow
    } else {
        Write-Host "[ERROR] src/lib/supabase.postgrest.ts not found" -ForegroundColor Red
    }
} else {
    Write-Host "[WARNING] Skipped client switch. You can do this manually later." -ForegroundColor Yellow
}

Write-Host ""

# Step 7: Test PostgREST endpoint
Write-Host "Step 7: Testing PostgREST endpoint..." -ForegroundColor Yellow

try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/" -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "[OK] PostgREST is responding" -ForegroundColor Green

    # Try to fetch webhooks
    try {
        $webhooks = Invoke-WebRequest -Uri "http://localhost:3000/webhooks" -Method GET -TimeoutSec 5 -UseBasicParsing
        Write-Host "[OK] Can query webhooks table" -ForegroundColor Green
    } catch {
        Write-Host "[WARNING] Cannot query webhooks table" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[ERROR] PostgREST is not responding at http://localhost:3000" -ForegroundColor Red
}

Write-Host ""

# Final summary
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Migration Summary" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Services:" -ForegroundColor White
Write-Host "  PostgreSQL:  http://localhost:5432" -ForegroundColor Cyan
Write-Host "  PostgREST:   http://localhost:3000" -ForegroundColor Cyan
Write-Host "  pgAdmin:     http://localhost:5050" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Update your .env file:" -ForegroundColor Yellow
Write-Host "     VITE_POSTGREST_URL=http://localhost:3000" -ForegroundColor Gray
Write-Host "     VITE_POSTGREST_ANON_KEY=anon" -ForegroundColor Gray
Write-Host ""
Write-Host "  2. Start your development server:" -ForegroundColor Yellow
Write-Host "     npm run dev (or pnpm dev)" -ForegroundColor Gray
Write-Host ""
Write-Host "  3. Test the application thoroughly" -ForegroundColor Yellow
Write-Host ""
Write-Host "  4. Update webhook URLs in the database or via admin panel" -ForegroundColor Yellow
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor White
Write-Host "  View logs:     docker-compose -f docker-compose.postgrest.yml logs -f" -ForegroundColor Gray
Write-Host "  Stop services: docker-compose -f docker-compose.postgrest.yml down" -ForegroundColor Gray
Write-Host "  Access DB:     docker exec -it traidenis_postgres psql -U postgres" -ForegroundColor Gray
Write-Host "  Rollback:      Copy-Item src/lib/supabase.original.ts src/lib/supabase.ts" -ForegroundColor Gray
Write-Host ""
Write-Host "[SUCCESS] Migration completed successfully!" -ForegroundColor Green
Write-Host ""
