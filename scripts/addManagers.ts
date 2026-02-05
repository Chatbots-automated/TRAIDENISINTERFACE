/**
 * Script to add managers (vadybininkai) to the app_users table
 * Run with: npx tsx scripts/addManagers.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: VITE_SUPABASE_URL or VITE_SUPABASE_SERVICE_ROLE_KEY not found in environment');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const managers = [
  { email: 'edvinas.linkus@traidenis.org', full_name: 'Edvinas Linkus', kodas: 'EL' },
  { email: 'karolis.sadauskas@traidenis.org', full_name: 'Karolis Sadauskas', kodas: 'KS' },
  { email: 'arvydas.jukna@traidenis.org', full_name: 'Arvydas Jukna', kodas: 'AJ' },
  { email: 'algirdas.kairys@traidenis.org', full_name: 'Algirdas Kairys', kodas: 'AK' },
  { email: 'vaidas.kavaliauskas@traidenis.org', full_name: 'Vaidas Kavaliauskas', kodas: 'VK' },
  { email: 'vytenis.leonavicius@traidenis.org', full_name: 'Vytenis Leonavičius', kodas: 'VL' },
  { email: 'stasys.planutis@traidenis.org', full_name: 'Stasys Planutis', kodas: 'SP' },
];

async function addManagers() {
  console.log('Adding managers to app_users table...');

  for (const manager of managers) {
    try {
      // Check if user exists
      const { data: existing, error: checkError } = await supabaseAdmin
        .from('app_users')
        .select('id, email')
        .eq('email', manager.email)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 = not found, which is expected for new users
        console.error(`Error checking for ${manager.email}:`, checkError);
        continue;
      }

      if (existing) {
        // Update existing user
        console.log(`Updating existing user: ${manager.email}`);
        const { error: updateError } = await supabaseAdmin
          .from('app_users')
          .update({
            kodas: manager.kodas,
            role: 'vadybininkas',
            full_name: manager.full_name,
            display_name: manager.full_name
          })
          .eq('email', manager.email);

        if (updateError) {
          console.error(`Error updating ${manager.email}:`, updateError);
        } else {
          console.log(`✓ Updated ${manager.full_name} (${manager.kodas})`);
        }
      } else {
        // Insert new user
        console.log(`Inserting new user: ${manager.email}`);
        const { error: insertError } = await supabaseAdmin
          .from('app_users')
          .insert({
            email: manager.email,
            display_name: manager.full_name,
            full_name: manager.full_name,
            kodas: manager.kodas,
            role: 'vadybininkas',
            is_admin: false
          });

        if (insertError) {
          console.error(`Error inserting ${manager.email}:`, insertError);
        } else {
          console.log(`✓ Inserted ${manager.full_name} (${manager.kodas})`);
        }
      }
    } catch (error) {
      console.error(`Exception processing ${manager.email}:`, error);
    }
  }

  console.log('\nDone! Managers have been added/updated.');
}

addManagers().catch(console.error);
