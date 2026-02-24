-- Add derva_musu column to n8n_vector_store for team-assigned derva value
ALTER TABLE public.n8n_vector_store
  ADD COLUMN IF NOT EXISTS derva_musu TEXT;
