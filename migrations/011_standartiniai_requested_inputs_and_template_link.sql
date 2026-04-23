-- Persist structured user-request inputs and template linkage per chat/project document record.
-- This enables safe regeneration/review of older YAML against newer DOCX templates.

ALTER TABLE IF EXISTS public.standartiniai_projektai
  ADD COLUMN IF NOT EXISTS requested_inputs jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE IF EXISTS public.standartiniai_projektai
  ADD COLUMN IF NOT EXISTS template_file_id text;

CREATE INDEX IF NOT EXISTS standartiniai_projektai_conversation_id_idx
  ON public.standartiniai_projektai (conversation_id);
