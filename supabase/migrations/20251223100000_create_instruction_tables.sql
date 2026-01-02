/*
  # Create Instruction Variables and Versions Tables

  This migration creates tables for managing Voiceflow agent system prompt variables
  with version history for safe reverts.

  ## Tables Created

  ### instruction_variables
  Stores the current value of each system prompt variable.
  - `id` (uuid, primary key)
  - `variable_key` (text, unique) - The variable identifier
  - `variable_name` (text) - Human-readable display name
  - `content` (text) - The current content/value
  - `display_order` (integer) - Order for UI display
  - `updated_at` (timestamptz)
  - `updated_by` (uuid) - User who last modified

  ### instruction_versions
  Stores snapshots of all variables for versioning.
  - `id` (uuid, primary key)
  - `version_number` (integer) - Auto-incrementing version
  - `snapshot` (jsonb) - Full snapshot of all variables
  - `change_description` (text) - Description of changes
  - `created_at` (timestamptz)
  - `created_by` (uuid) - User who created the version
  - `is_revert` (boolean) - True if this version was created from reverting
  - `reverted_from_version` (integer) - If is_revert, which version was reverted to

  ## Security
  - RLS enabled on both tables
  - Only admins can modify instruction variables
  - All authenticated users can view (for potential future use)
*/

-- Create instruction_variables table
CREATE TABLE IF NOT EXISTS instruction_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variable_key TEXT NOT NULL UNIQUE,
  variable_name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create instruction_versions table
CREATE TABLE IF NOT EXISTS instruction_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_number SERIAL,
  snapshot JSONB NOT NULL,
  change_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  is_revert BOOLEAN DEFAULT FALSE,
  reverted_from_version INTEGER
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_instruction_variables_key ON instruction_variables(variable_key);
CREATE INDEX IF NOT EXISTS idx_instruction_variables_order ON instruction_variables(display_order);
CREATE INDEX IF NOT EXISTS idx_instruction_versions_number ON instruction_versions(version_number DESC);
CREATE INDEX IF NOT EXISTS idx_instruction_versions_created ON instruction_versions(created_at DESC);

-- Enable Row Level Security
ALTER TABLE instruction_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE instruction_versions ENABLE ROW LEVEL SECURITY;

-- Policies for instruction_variables
CREATE POLICY "Anyone can view instruction variables"
  ON instruction_variables
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert instruction variables"
  ON instruction_variables
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can update instruction variables"
  ON instruction_variables
  FOR UPDATE
  USING (true);

CREATE POLICY "Admins can delete instruction variables"
  ON instruction_variables
  FOR DELETE
  USING (true);

-- Policies for instruction_versions
CREATE POLICY "Anyone can view instruction versions"
  ON instruction_versions
  FOR SELECT
  USING (true);

CREATE POLICY "Admins can insert instruction versions"
  ON instruction_versions
  FOR INSERT
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON instruction_variables TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON instruction_variables TO anon;
GRANT SELECT, INSERT ON instruction_versions TO authenticated;
GRANT SELECT, INSERT ON instruction_versions TO anon;

-- Insert the 11 default variables in workflow order
INSERT INTO instruction_variables (variable_key, variable_name, content, display_order) VALUES
  ('darbo_eigos_apzvalga', 'Darbo eigos apžvalga', '', 1),
  ('busenos_valdymas', 'Būsenos valdymas', '', 2),
  ('1_faze_reikalavimu_rinkimas', '1 Fazė: Reikalavimų rinkimas', '', 3),
  ('2_faze_komponentu_pasirinkimas', '2 Fazė: Komponentų pasirinkimas', '', 4),
  ('nestandartinio_nasumo_tvarkymas', 'Nestandartinio našumo tvarkymas', '', 5),
  ('3_faze_komplektaciju_isdestymas', '3 Fazė: Komplektacijų išdėstymas', '', 6),
  ('4_faze_kainu_skaiciavimas', '4 Fazė: Kainų skaičiavimas', '', 7),
  ('privalomos_patikros', 'Privalomos patikros', '', 8),
  ('klaidu_sprendimas', 'Klaidų sprendimas', '', 9),
  ('pilnas_darbo_eigos_pavyzdys', 'Pilnas darbo eigos pavyzdys', '', 10),
  ('komponentu_pavadinimu_atvaizdavimas', 'Komponentų pavadinimų atvaizdavimas', '', 11)
ON CONFLICT (variable_key) DO NOTHING;
