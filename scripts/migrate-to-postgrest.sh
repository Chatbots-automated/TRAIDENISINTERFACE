#!/bin/bash

# TRAIDENIS Migration Script: Supabase to PostgreSQL + PostgREST
# This script automates the migration process

set -e

echo "================================================"
echo "TRAIDENIS Migration to PostgreSQL + PostgREST"
echo "================================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
echo "Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed${NC}"
    exit 1
fi

# Check Docker Compose
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Error: Docker Compose is not installed${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"
echo ""

# Step 1: Environment setup
echo "Step 1: Setting up environment variables..."

if [ ! -f .env.postgrest ]; then
    if [ -f .env.postgrest.example ]; then
        cp .env.postgrest.example .env.postgrest
        echo -e "${YELLOW}⚠ Created .env.postgrest from example${NC}"
        echo -e "${YELLOW}⚠ Please edit .env.postgrest and update the credentials${NC}"
        echo ""
        read -p "Press Enter after updating .env.postgrest..."
    else
        echo -e "${RED}Error: .env.postgrest.example not found${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ .env.postgrest already exists${NC}"
fi

# Load environment variables
export $(cat .env.postgrest | grep -v '^#' | xargs)

echo -e "${GREEN}✓ Environment variables loaded${NC}"
echo ""

# Step 2: Backup existing files
echo "Step 2: Backing up existing Supabase integration..."

if [ -f src/lib/supabase.ts ] && [ ! -f src/lib/supabase.original.ts ]; then
    cp src/lib/supabase.ts src/lib/supabase.original.ts
    echo -e "${GREEN}✓ Backed up src/lib/supabase.ts to src/lib/supabase.original.ts${NC}"
else
    echo -e "${YELLOW}⚠ Backup already exists or supabase.ts not found${NC}"
fi

echo ""

# Step 3: Start Docker containers
echo "Step 3: Starting PostgreSQL + PostgREST containers..."

docker-compose -f docker-compose.postgrest.yml up -d

echo "Waiting for services to start..."
sleep 10

# Check if containers are running
if docker ps | grep -q traidenis_postgres && docker ps | grep -q traidenis_postgrest; then
    echo -e "${GREEN}✓ Docker containers started successfully${NC}"
else
    echo -e "${RED}Error: Failed to start Docker containers${NC}"
    echo "Check logs with: docker-compose -f docker-compose.postgrest.yml logs"
    exit 1
fi

echo ""

# Step 4: Run migrations
echo "Step 4: Running database migrations..."

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
for i in {1..30}; do
    if docker exec traidenis_postgres pg_isready -U postgres &> /dev/null; then
        echo -e "${GREEN}✓ PostgreSQL is ready${NC}"
        break
    fi
    echo "Attempt $i/30..."
    sleep 2
done

# Check if migration file exists
if [ ! -f migrations/001_migrate_from_supabase.sql ]; then
    echo -e "${RED}Error: Migration file not found at migrations/001_migrate_from_supabase.sql${NC}"
    exit 1
fi

# Copy migration file to container
docker cp migrations/001_migrate_from_supabase.sql traidenis_postgres:/tmp/

# Run migration
echo "Running migration script..."
docker exec -it traidenis_postgres psql -U postgres -d postgres -f /tmp/001_migrate_from_supabase.sql

echo -e "${GREEN}✓ Database migrations completed${NC}"
echo ""

# Step 5: Verify migration
echo "Step 5: Verifying migration..."

# Check tables
TABLES=$(docker exec traidenis_postgres psql -U postgres -d postgres -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';")
echo "Created tables: $TABLES"

# Check nestandartiniai_projects view
PROJECTS=$(docker exec traidenis_postgres psql -U postgres -d postgres -t -c "SELECT COUNT(*) FROM nestandartiniai_projects;" 2>/dev/null || echo "0")
echo "Projects in view: $PROJECTS"

if [ "$TABLES" -gt 5 ]; then
    echo -e "${GREEN}✓ Database verification passed${NC}"
else
    echo -e "${YELLOW}⚠ Warning: Expected more tables. Check migration logs.${NC}"
fi

echo ""

# Step 6: Switch to PostgREST client
echo "Step 6: Switching to PostgREST client..."

read -p "Do you want to switch to PostgREST client now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Backup original if not already done
    if [ ! -f src/lib/supabase.original.ts ]; then
        cp src/lib/supabase.ts src/lib/supabase.original.ts
    fi

    # Replace with PostgREST version
    cp src/lib/supabase.postgrest.ts src/lib/supabase.ts

    echo -e "${GREEN}✓ Switched to PostgREST client${NC}"
    echo -e "${YELLOW}⚠ Don't forget to update your .env file with VITE_POSTGREST_URL${NC}"
else
    echo -e "${YELLOW}⚠ Skipped client switch. You can do this manually later.${NC}"
fi

echo ""

# Step 7: Test PostgREST endpoint
echo "Step 7: Testing PostgREST endpoint..."

if curl -s http://localhost:3000/ > /dev/null; then
    echo -e "${GREEN}✓ PostgREST is responding${NC}"

    # Try to fetch webhooks
    if curl -s http://localhost:3000/webhooks > /dev/null; then
        echo -e "${GREEN}✓ Can query webhooks table${NC}"
    else
        echo -e "${YELLOW}⚠ Warning: Cannot query webhooks table${NC}"
    fi
else
    echo -e "${RED}Error: PostgREST is not responding at http://localhost:3000${NC}"
fi

echo ""

# Final summary
echo "================================================"
echo "Migration Summary"
echo "================================================"
echo ""
echo "Services:"
echo "  PostgreSQL:  http://localhost:5432"
echo "  PostgREST:   http://localhost:3000"
echo "  pgAdmin:     http://localhost:5050"
echo ""
echo "Next steps:"
echo "  1. Update your .env file:"
echo "     VITE_POSTGREST_URL=http://localhost:3000"
echo "     VITE_POSTGREST_ANON_KEY=anon"
echo ""
echo "  2. Start your development server:"
echo "     npm run dev (or pnpm dev)"
echo ""
echo "  3. Test the application thoroughly"
echo ""
echo "  4. Update webhook URLs in the database or via admin panel"
echo ""
echo "Useful commands:"
echo "  View logs:     docker-compose -f docker-compose.postgrest.yml logs -f"
echo "  Stop services: docker-compose -f docker-compose.postgrest.yml down"
echo "  Access DB:     docker exec -it traidenis_postgres psql -U postgres"
echo "  Rollback:      cp src/lib/supabase.original.ts src/lib/supabase.ts"
echo ""
echo -e "${GREEN}Migration completed successfully!${NC}"
echo ""
