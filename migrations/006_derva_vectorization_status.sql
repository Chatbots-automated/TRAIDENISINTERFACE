-- Migration 006: Add vectorization_status to derva_files
-- Enables multi-user awareness of in-progress vectorization

ALTER TABLE public.derva_files
  ADD COLUMN IF NOT EXISTS vectorization_status TEXT;

-- Optional index for quick filtering on status
CREATE INDEX IF NOT EXISTS derva_files_vectorization_status_idx
  ON public.derva_files (vectorization_status)
  WHERE vectorization_status IS NOT NULL;
