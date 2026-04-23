-- Enforce deterministic template selection for SDK prompt runtime.
-- 1) Remove duplicate instruction_variables rows per variable_key (keep most recently updated)
-- 2) Ensure a unique constraint/index exists for variable_key

WITH ranked AS (
  SELECT
    id,
    variable_key,
    ROW_NUMBER() OVER (
      PARTITION BY variable_key
      ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC, id DESC
    ) AS rn
  FROM public.instruction_variables
)
DELETE FROM public.instruction_variables iv
USING ranked r
WHERE iv.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS instruction_variables_variable_key_unique_idx
  ON public.instruction_variables (variable_key);
