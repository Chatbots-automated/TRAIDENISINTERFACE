-- Migration: Create pricing-related tables for commercial offer generation
-- Tables: products, pricing, price_multiplier
-- These tables are required for the query_supabase tool to function

-- =============================================================================
-- 1. PRODUCTS TABLE
-- Maps product codes to unique IDs
-- =============================================================================
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  product_code TEXT NOT NULL UNIQUE,
  product_name TEXT,
  description TEXT,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_code ON products(product_code);

COMMENT ON TABLE products IS 'Product catalog with unique codes and IDs for pricing lookup';
COMMENT ON COLUMN products.product_code IS 'Unique product code (e.g., HNVN13.18.0)';

-- =============================================================================
-- 2. PRICING TABLE
-- Stores product prices with creation dates (for price history)
-- =============================================================================
CREATE TABLE IF NOT EXISTS pricing (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  created TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_users(id),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_pricing_product_id ON pricing(product_id);
CREATE INDEX IF NOT EXISTS idx_pricing_created_desc ON pricing(created DESC);

COMMENT ON TABLE pricing IS 'Product pricing history. Use ORDER BY created DESC LIMIT 1 to get latest price';
COMMENT ON COLUMN pricing.product_id IS 'Foreign key to products.id';
COMMENT ON COLUMN pricing.price IS 'Base price in specified currency';
COMMENT ON COLUMN pricing.created IS 'When this price was set (use for getting latest price)';

-- =============================================================================
-- 3. PRICE_MULTIPLIER TABLE
-- Stores price multiplication coefficients with creation dates
-- =============================================================================
CREATE TABLE IF NOT EXISTS price_multiplier (
  id SERIAL PRIMARY KEY,
  multiplier DECIMAL(5, 4) NOT NULL,
  description TEXT,
  created TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_users(id),
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_price_multiplier_created_desc ON price_multiplier(created DESC);
CREATE INDEX IF NOT EXISTS idx_price_multiplier_active ON price_multiplier(is_active) WHERE is_active = TRUE;

COMMENT ON TABLE price_multiplier IS 'Price multiplication coefficients. Use ORDER BY created DESC LIMIT 1 to get latest';
COMMENT ON COLUMN price_multiplier.multiplier IS 'Price multiplication factor (e.g., 1.2000 for 20% markup)';
COMMENT ON COLUMN price_multiplier.created IS 'When this multiplier was created (use for getting latest)';

-- =============================================================================
-- EXAMPLE DATA (Optional - remove if you want to start with empty tables)
-- =============================================================================

-- Example products
-- INSERT INTO products (product_code, product_name, description, category) VALUES
-- ('HNVN13.18.0', 'System 13 PE 18m', 'Wastewater treatment system', 'Standard'),
-- ('HNVN15.20.0', 'System 15 PE 20m', 'Wastewater treatment system', 'Standard'),
-- ('HNVN20.25.0', 'System 20 PE 25m', 'Wastewater treatment system', 'Standard');

-- Example pricing (uncomment to add sample data)
-- INSERT INTO pricing (product_id, price, currency) VALUES
-- (1, 5500.00, 'EUR'),
-- (2, 6200.00, 'EUR'),
-- (3, 7800.00, 'EUR');

-- Example price multiplier (uncomment to add sample data)
-- INSERT INTO price_multiplier (multiplier, description, is_active) VALUES
-- (1.2000, 'Standard markup 20%', TRUE);

-- =============================================================================
-- ENABLE ROW LEVEL SECURITY (Optional - adjust based on your needs)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_multiplier ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all data
CREATE POLICY "Allow read access to all authenticated users" ON products
  FOR SELECT USING (true);

CREATE POLICY "Allow read access to all authenticated users" ON pricing
  FOR SELECT USING (true);

CREATE POLICY "Allow read access to all authenticated users" ON price_multiplier
  FOR SELECT USING (true);

-- Allow only admins to insert/update/delete (using service role key or admin check)
-- You can customize these policies based on your auth setup
CREATE POLICY "Allow admin insert" ON products
  FOR INSERT WITH CHECK (true); -- Customize with admin check if needed

CREATE POLICY "Allow admin update" ON products
  FOR UPDATE USING (true); -- Customize with admin check if needed

CREATE POLICY "Allow admin insert" ON pricing
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow admin insert" ON price_multiplier
  FOR INSERT WITH CHECK (true);
