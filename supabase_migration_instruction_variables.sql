-- Create instruction_variables table for SDK prompt variable injection
CREATE TABLE IF NOT EXISTS instruction_variables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variable_name TEXT UNIQUE NOT NULL,
  variable_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (Row Level Security)
ALTER TABLE instruction_variables ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations for authenticated users
-- Note: Since the app uses custom auth, this won't work for regular supabase client
-- The app uses supabaseAdmin which bypasses RLS
CREATE POLICY "Allow all operations for authenticated users"
  ON instruction_variables
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create policy to allow service role full access
CREATE POLICY "Allow service role full access"
  ON instruction_variables
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create index on variable_name for faster lookups
CREATE INDEX IF NOT EXISTS idx_instruction_variables_name
  ON instruction_variables(variable_name);

-- Insert sample/placeholder variables (replace with actual content later)
INSERT INTO instruction_variables (variable_name, variable_value, description) VALUES
  ('darbo_eigos_apzvalga', 'Workflow overview content goes here', 'Overview of the workflow process'),
  ('busenos_valdymas', 'State management content goes here', 'State management instructions'),
  ('_faze_reikalavimu_rinkimas', 'Requirements gathering phase content goes here', 'Phase 1: Requirements Collection'),
  ('_faze_komponentu_pasirinkimas', 'Component selection phase content goes here', 'Phase 2: Component Selection'),
  ('nestandartinio_nasumo_tvarkymas', 'Non-standard capacity handling content goes here', 'Handling out-of-range capacity requests'),
  ('_faze_komplektaciju_isdestymas', 'Tier arrangement phase content goes here', 'Phase 3: Tier Arrangement'),
  ('_faze_kainu_skaiciavimas', 'Pricing calculation phase content goes here', 'Phase 4: Pricing Calculation'),
  ('privalomos_patikros', 'Mandatory validations content goes here', 'Required validation checks'),
  ('klaidu_sprendimas', 'Error recovery content goes here', 'Error handling and recovery'),
  ('pilnas_darbo_eigos_pavyzdys', 'Complete workflow example goes here', 'Sample complete workflow'),
  ('komponentu_pavadinimu_atvaizdavimas', 'Component name mapping content goes here', 'Component name mapping reference')
ON CONFLICT (variable_name) DO NOTHING;

-- Add helpful comment
COMMENT ON TABLE instruction_variables IS 'Stores variables for SDK system prompt injection';
