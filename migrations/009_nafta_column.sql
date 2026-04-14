-- Add nafta (oil price analysis) column to medziagos_prognoze_internetas table
ALTER TABLE public.medziagos_prognoze_internetas
  ADD COLUMN IF NOT EXISTS nafta TEXT DEFAULT '';
