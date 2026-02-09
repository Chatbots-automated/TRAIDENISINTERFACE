# TRAIDENIS Migration Script - No Docker Version
# Run migration using native PostgreSQL installation

$ErrorActionPreference = "Stop"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "TRAIDENIS Migration (No Docker)" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# Check if psql is available
Write-Host "Checking for PostgreSQL..." -ForegroundColor Yellow

try {
    $psqlVersion = & psql --version 2>&1
    Write-Host "[OK] PostgreSQL found: $psqlVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] psql command not found" -ForegroundColor Red
    Write-Host ""
    Write-Host "You need to install PostgreSQL first:" -ForegroundColor Yellow
    Write-Host "  1. Download from: https://www.postgresql.org/download/windows/" -ForegroundColor White
    Write-Host "  2. Install with default settings" -ForegroundColor White
    Write-Host "  3. Add to PATH: C:\Program Files\PostgreSQL\15\bin" -ForegroundColor White
    Write-Host ""
    exit 1
}

Write-Host ""

# Get database connection details
Write-Host "Database Connection Settings" -ForegroundColor Cyan
Write-Host ""

$defaultHost = "localhost"
$defaultPort = "5432"
$defaultUser = "postgres"
$defaultDb = "postgres"

$host = Read-Host "PostgreSQL host [$defaultHost]"
if ([string]::IsNullOrWhiteSpace($host)) { $host = $defaultHost }

$port = Read-Host "PostgreSQL port [$defaultPort]"
if ([string]::IsNullOrWhiteSpace($port)) { $port = $defaultPort }

$user = Read-Host "PostgreSQL user [$defaultUser]"
if ([string]::IsNullOrWhiteSpace($user)) { $user = $defaultUser }

$database = Read-Host "PostgreSQL database [$defaultDb]"
if ([string]::IsNullOrWhiteSpace($database)) { $database = $defaultDb }

Write-Host ""
Write-Host "Will connect to: $user@$host:$port/$database" -ForegroundColor Cyan
Write-Host ""

# Check if migration file exists
if (-Not (Test-Path "migrations\001_migrate_from_supabase.sql")) {
    Write-Host "[ERROR] Migration file not found: migrations\001_migrate_from_supabase.sql" -ForegroundColor Red
    Write-Host "Make sure you're running this from the project root directory." -ForegroundColor Yellow
    exit 1
}

# Test connection
Write-Host "Testing database connection..." -ForegroundColor Yellow
$env:PGPASSWORD = Read-Host "Enter password for user '$user'" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($env:PGPASSWORD))

try {
    $testQuery = "SELECT version();"
    $result = & psql -h $host -p $port -U $user -d $database -c $testQuery 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Database connection successful" -ForegroundColor Green
    } else {
        Write-Host "[ERROR] Could not connect to database" -ForegroundColor Red
        Write-Host $result -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[ERROR] Connection failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Backup warning
Write-Host "WARNING: This will create tables and modify your database" -ForegroundColor Yellow
Write-Host "Make sure you have a backup if this is a production database" -ForegroundColor Yellow
Write-Host ""
$confirm = Read-Host "Continue with migration? (yes/no)"

if ($confirm -ne "yes") {
    Write-Host "Migration cancelled" -ForegroundColor Yellow
    exit 0
}

Write-Host ""

# Run migration
Write-Host "Running migration script..." -ForegroundColor Yellow
Write-Host ""

try {
    & psql -h $host -p $port -U $user -d $database -f "migrations\001_migrate_from_supabase.sql"

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "[OK] Migration completed successfully!" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[ERROR] Migration failed. Check the output above for errors." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "[ERROR] Migration failed: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Verify migration
Write-Host "Verifying migration..." -ForegroundColor Yellow

try {
    $tableCount = & psql -h $host -p $port -U $user -d $database -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>&1
    $tableCount = $tableCount.Trim()
    Write-Host "Tables created: $tableCount" -ForegroundColor Cyan

    if ([int]$tableCount -gt 5) {
        Write-Host "[OK] Verification passed" -ForegroundColor Green
    } else {
        Write-Host "[WARNING] Expected more tables" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[WARNING] Could not verify migration" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Next Steps" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Update your .env file with:" -ForegroundColor White
Write-Host ""
Write-Host "   VITE_DATABASE_URL=postgresql://$user:PASSWORD@$host:$port/$database" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Update your application code to use the new database" -ForegroundColor White
Write-Host ""
Write-Host "3. Test your application thoroughly" -ForegroundColor White
Write-Host ""
Write-Host "[SUCCESS] Migration complete!" -ForegroundColor Green
Write-Host ""

# Clear password from environment
$env:PGPASSWORD = $null
