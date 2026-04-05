-- Migrate derva_musu values from talpos.json JSONB column to dedicated talpos.derva_musu column.
-- After migration, the derva_musu key is removed from the json column.

-- Step 1: Copy derva_musu from json column to dedicated column (only where not already set)
UPDATE public.talpos
SET derva_musu = json->>'derva_musu'
WHERE json IS NOT NULL
  AND json->>'derva_musu' IS NOT NULL
  AND json->>'derva_musu' != ''
  AND (derva_musu IS NULL OR derva_musu = '');

-- Step 2: Remove derva_musu key from json column
UPDATE public.talpos
SET json = json - 'derva_musu'
WHERE json IS NOT NULL
  AND json ? 'derva_musu';
