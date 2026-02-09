-- Add managers (vadybininkai) to app_users table
-- These users will have role='vadybininkas' and their specific codes in the 'kodas' field

INSERT INTO app_users (email, display_name, full_name, kodas, role, is_admin, created_at)
VALUES
  ('edvinas.linkus@traidenis.org', 'Edvinas Linkus', 'Edvinas Linkus', 'EL', 'vadybininkas', false, NOW()),
  ('karolis.sadauskas@traidenis.org', 'Karolis Sadauskas', 'Karolis Sadauskas', 'KS', 'vadybininkas', false, NOW()),
  ('arvydas.jukna@traidenis.org', 'Arvydas Jukna', 'Arvydas Jukna', 'AJ', 'vadybininkas', false, NOW()),
  ('algirdas.kairys@traidenis.org', 'Algirdas Kairys', 'Algirdas Kairys', 'AK', 'vadybininkas', false, NOW()),
  ('vaidas.kavaliauskas@traidenis.org', 'Vaidas Kavaliauskas', 'Vaidas Kavaliauskas', 'VK', 'vadybininkas', false, NOW()),
  ('vytenis.leonavicius@traidenis.org', 'Vytenis Leonavičius', 'Vytenis Leonavičius', 'VL', 'vadybininkas', false, NOW()),
  ('stasys.planutis@traidenis.org', 'Stasys Planutis', 'Stasys Planutis', 'SP', 'vadybininkas', false, NOW())
ON CONFLICT (email) DO UPDATE SET
  kodas = EXCLUDED.kodas,
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  display_name = EXCLUDED.display_name;

-- Note: If emails already exist in the system, their role and kodas will be updated
-- If you need to run this multiple times, it will not create duplicates
