-- Create prompt_template table for storing the editable system prompt template
CREATE TABLE IF NOT EXISTS prompt_template (
  id INTEGER PRIMARY KEY DEFAULT 1,
  template_content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_template_row CHECK (id = 1)
);

-- Enable RLS (Row Level Security)
ALTER TABLE prompt_template ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role full access
CREATE POLICY "Allow service role full access"
  ON prompt_template
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add helpful comment
COMMENT ON TABLE prompt_template IS 'Stores the editable system prompt template for SDK interface. Only one row with id=1 is allowed.';
