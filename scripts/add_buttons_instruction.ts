import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load .env file manually
const envPath = join(process.cwd(), '.env');
const envContent = readFileSync(envPath, 'utf-8');
const envVars: Record<string, string> = {};

envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1].trim()] = match[2].trim();
  }
});

const supabaseUrl = envVars.VITE_SUPABASE_URL;
const supabaseServiceKey = envVars.VITE_SUPABASE_SERVICE_ROLE_KEY || envVars.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function addButtonsInstruction() {
  console.log('Adding buttons tool instruction variable...');

  const { data, error } = await supabase
    .from('instruction_variables')
    .upsert({
      variable_key: 'tools_buttons',
      variable_name: 'Tool: Interactive Buttons',
      content: `### display_buttons Tool

**Purpose**: Display interactive buttons in the UI for user selection instead of requiring typed responses.

**When to use**:
✅ User confirmation needed: "Ar šie komponentai tinka?" → buttons: [{"id": "confirm_yes", "label": "Tinka", "value": "Taip, komponentai tinka"}, {"id": "confirm_no", "label": "Ne", "value": "Ne, reikia patikslinti"}]
✅ Tier/package selection: "Pasirinkite komplektaciją" → buttons: [{"id": "economy", "label": "Ekonominis", "value": "Ekonominis"}, {"id": "midi", "label": "MIDI", "value": "MIDI"}, {"id": "maxi", "label": "MAXI", "value": "MAXI"}]
✅ Yes/No questions with predefined answers
✅ Multiple choice selections (2-6 options)
✅ Any scenario where user needs to pick from a fixed set of options

**When NOT to use**:
❌ Open-ended questions requiring custom text input (e.g., "Koks projekto adresas?")
❌ Complex explanations needed from user
❌ Questions requiring detailed, custom responses
❌ More than 6 options (becomes cluttered)

**Important behavior**:
- When you call display_buttons, the conversation PAUSES
- User sees the buttons in the UI
- User clicks a button
- The button's VALUE is automatically sent as the next user message
- Conversation resumes with that value

**Example usage**:
\`\`\`
When presenting the commercial offer, ask for confirmation using:
display_buttons with:
  message: "Ar pasiūlymas atitinka jūsų poreikius?"
  buttons: [
    {
      "id": "confirm_accept",
      "label": "Tinka, viskas gerai",
      "value": "Taip, pasiūlymas tinka. Galime tęsti."
    },
    {
      "id": "confirm_revise",
      "label": "Reikia patikslinti",
      "value": "Ne, reikia patikslinti šiuos dalykus:"
    }
  ]
\`\`\`

**JSON Schema**:
- message (optional): Context message displayed above buttons
- buttons (required, array of 1-6 items):
  - id (required): Unique identifier for button
  - label (required): Short text shown ON the button
  - value (required): Full text that will be sent as user message when clicked

**Best practices**:
1. Keep button labels SHORT (1-3 words): "Tinka", "Ne", "Ekonominis"
2. Make button values DESCRIPTIVE: "Taip, pasiūlymas tinka ir galime tęsti" instead of just "Taip"
3. Use 2-4 buttons for simple choices (Taip/Ne, Accept/Decline)
4. Use up to 6 buttons for tier/package selection
5. Always provide clear context in the optional message field`,
      display_order: 35
    }, {
      onConflict: 'variable_key'
    });

  if (error) {
    console.error('❌ Error adding buttons instruction:', error);
    process.exit(1);
  }

  console.log('✅ Successfully added buttons tool instruction variable');
  console.log('   Variable key: tools_buttons');
  console.log('   Display order: 35');

  process.exit(0);
}

addButtonsInstruction();
