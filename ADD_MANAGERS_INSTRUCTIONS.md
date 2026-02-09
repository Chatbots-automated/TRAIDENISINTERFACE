# Adding Managers (Vadybininkai) to Database

## Method 1: Run SQL directly in Supabase Dashboard

Go to your Supabase project dashboard → SQL Editor and run:

```sql
INSERT INTO app_users (email, display_name, full_name, kodas, role, is_admin, created_at, id)
VALUES
  ('edvinas.linkus@traidenis.org', 'Edvinas Linkus', 'Edvinas Linkus', 'EL', 'vadybininkas', false, NOW(), gen_random_uuid()),
  ('karolis.sadauskas@traidenis.org', 'Karolis Sadauskas', 'Karolis Sadauskas', 'KS', 'vadybininkas', false, NOW(), gen_random_uuid()),
  ('arvydas.jukna@traidenis.org', 'Arvydas Jukna', 'Arvydas Jukna', 'AJ', 'vadybininkas', false, NOW(), gen_random_uuid()),
  ('algirdas.kairys@traidenis.org', 'Algirdas Kairys', 'Algirdas Kairys', 'AK', 'vadybininkas', false, NOW(), gen_random_uuid()),
  ('vaidas.kavaliauskas@traidenis.org', 'Vaidas Kavaliauskas', 'Vaidas Kavaliauskas', 'VK', 'vadybininkas', false, NOW(), gen_random_uuid()),
  ('vytenis.leonavicius@traidenis.org', 'Vytenis Leonavičius', 'Vytenis Leonavičius', 'VL', 'vadybininkas', false, NOW(), gen_random_uuid()),
  ('stasys.planutis@traidenis.org', 'Stasys Planutis', 'Stasys Planutis', 'SP', 'vadybininkas', false, NOW(), gen_random_uuid())
ON CONFLICT (email) DO UPDATE SET
  kodas = EXCLUDED.kodas,
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name,
  display_name = EXCLUDED.display_name;
```

## Method 2: Run from Browser Console

1. Open your application in the browser
2. Log in as a user
3. Open browser Developer Tools (F12)
4. Go to Console tab
5. Copy and paste this code:

```javascript
async function addManagers() {
  const { supabase } = await import('./src/lib/supabase.js');

  const managers = [
    { email: 'edvinas.linkus@traidenis.org', full_name: 'Edvinas Linkus', kodas: 'EL' },
    { email: 'karolis.sadauskas@traidenis.org', full_name: 'Karolis Sadauskas', kodas: 'KS' },
    { email: 'arvydas.jukna@traidenis.org', full_name: 'Arvydas Jukna', kodas: 'AJ' },
    { email: 'algirdas.kairys@traidenis.org', full_name: 'Algirdas Kairys', kodas: 'AK' },
    { email: 'vaidas.kavaliauskas@traidenis.org', full_name: 'Vaidas Kavaliauskas', kodas: 'VK' },
    { email: 'vytenis.leonavicius@traidenis.org', full_name: 'Vytenis Leonavičius', kodas: 'VL' },
    { email: 'stasys.planutis@traidenis.org', full_name: 'Stasys Planutis', kodas: 'SP' },
  ];

  console.log('Adding managers...');

  for (const manager of managers) {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .upsert({
          email: manager.email,
          display_name: manager.full_name,
          full_name: manager.full_name,
          kodas: manager.kodas,
          role: 'vadybininkas',
          is_admin: false,
          id: crypto.randomUUID()
        }, {
          onConflict: 'email'
        });

      if (error) {
        console.error(`Error adding ${manager.full_name}:`, error);
      } else {
        console.log(`✓ Added ${manager.full_name} (${manager.kodas})`);
      }
    } catch (err) {
      console.error(`Exception adding ${manager.full_name}:`, err);
    }
  }

  console.log('Done!');
}

addManagers();
```

## Verification

After running either method, verify by running this in SQL Editor or browser console:

```sql
SELECT full_name, kodas, role FROM app_users WHERE role = 'vadybininkas' ORDER BY full_name;
```

Or in browser console:
```javascript
const { supabase } = await import('./src/lib/supabase.js');
const { data } = await supabase.from('app_users').select('full_name, kodas, role').eq('role', 'vadybininkas').order('full_name');
console.table(data);
```
