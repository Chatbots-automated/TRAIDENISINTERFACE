-- Track actor user (app_users.id) that created/updated standartiniai_projektai records.

ALTER TABLE IF EXISTS public.standartiniai_projektai
  ADD COLUMN IF NOT EXISTS app_user uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'standartiniai_projektai_app_user_fkey'
      AND table_schema = 'public'
      AND table_name = 'standartiniai_projektai'
  ) THEN
    ALTER TABLE public.standartiniai_projektai
      ADD CONSTRAINT standartiniai_projektai_app_user_fkey
      FOREIGN KEY (app_user) REFERENCES public.app_users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS standartiniai_projektai_app_user_idx
  ON public.standartiniai_projektai (app_user);
