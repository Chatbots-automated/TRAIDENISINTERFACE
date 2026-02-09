# SDK Tab Setup Guide

## Overview
The SDK tab provides direct integration with Anthropic's Claude Sonnet 4 API using prompt caching for cost-efficient commercial offer generation.

## Prerequisites
- Anthropic API key (get one at: https://console.anthropic.com/)
- PostgreSQL database with `instruction_variables` table populated
- Netlify deployment (for production)

---

## Netlify Environment Variable Setup

### Step 1: Access Netlify Dashboard
1. Go to https://app.netlify.com/
2. Select your site (TRAIDENISINTERFACE)
3. Navigate to **Site configuration** → **Environment variables**

### Step 2: Add the Anthropic API Key
1. Click **Add a variable** or **Add environment variable**
2. Enter the key name:
   ```
   VITE_ANTHROPIC_API_KEY
   ```
3. Enter your Anthropic API key value (starts with `sk-ant-api03-...`)
4. Select the appropriate scopes:
   - ✅ All deploys
   - ✅ Production branch
   - ✅ Deploy previews
5. Click **Create variable** or **Save**

### Step 3: Redeploy Your Site
After adding the environment variable, you need to trigger a new deployment:
1. Go to **Deploys** tab
2. Click **Trigger deploy** → **Deploy site**

Or push a new commit to trigger automatic deployment.

---

## Local Development Setup

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure .env File
Create or update your `.env` file in the project root:

```env
VITE_POSTGREST_URL=http://localhost:3000
VITE_POSTGREST_ANON_KEY=anon
VITE_VOICEFLOW_API_KEY=your_voiceflow_api_key
VITE_VOICEFLOW_PROJECT_ID=your_voiceflow_project_id

# Anthropic SDK
VITE_ANTHROPIC_API_KEY=sk-ant-api03-your-actual-key-here

# Nestandartiniai Gaminiai Webhooks
VITE_N8N_WEBHOOK_UPLOAD_NEW=your_n8n_webhook_upload_new_url
VITE_N8N_WEBHOOK_FIND_SIMILAR=your_n8n_webhook_find_similar_url
VITE_N8N_WEBHOOK_UPLOAD_SOLUTION=your_n8n_webhook_upload_solution_url
```

### Step 3: Run Development Server
```bash
npm run dev
```

---

## Database Table Setup

The SDK tab requires a table called `instruction_variables` in PostgreSQL:

### Table Schema
```sql
CREATE TABLE instruction_variables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  variable_name TEXT UNIQUE NOT NULL,
  variable_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Required Variables
Populate the table with these variable names (used in the system prompt):
- `darbo_eigos_apzvalga`
- `busenos_valdymas`
- `_faze_reikalavimu_rinkimas`
- `_faze_komponentu_pasirinkimas`
- `nestandartinio_nasumo_tvarkymas`
- `_faze_komplektaciju_isdestymas`
- `_faze_kainu_skaiciavimas`
- `privalomos_patikros`
- `klaidu_sprendimas`
- `pilnas_darbo_eigos_pavyzdys`
- `komponentu_pavadinimu_atvaizdavimas`

Each variable should contain the actual content for that section of the prompt.

---

## How to Access the SDK Tab

### Option 1: Toggle "Nauja" Button
1. Log in to the application
2. Look for the **"Nauja"** toggle button in the top right corner
3. Click it to disable "New Version" mode
4. The navigation tabs (Chat, Documents, Transcripts, EML Upload, **SDK**) will appear
5. Click the **SDK** tab

### Option 2: Set Default View Mode
The app defaults to "New Version" mode. To change this:
- Toggle off the "Nauja" button once
- The setting is saved in localStorage and will persist

---

## Features

### 1. Chat Interface
- **Initial view**: Centered greeting with user's name and centered input box
- **After first message**: Input moves to bottom, messages appear above
- **Dark theme**: Professional charcoal background (#2d2d2d)
- **Colors**: Accent color (#c7a88a) for send button and user messages

### 2. Prompt Preview
- Click **"Peržiūrėti prompt'ą"** button (only visible after starting a chat)
- View the complete system prompt with all variables injected
- Font size: 9px for readability of long prompts
- Modal with scrollable content

### 3. Prompt Caching
- System prompt is cached for 1 hour (ephemeral cache)
- Reduces API costs by ~90% for repeated conversations
- Cache hit counted in `usage.cache_read_input_tokens`

### 4. Reset Conversation
- Click **"Pradėti iš naujo"** to clear chat history
- Starts fresh conversation while keeping system prompt loaded

---

## Troubleshooting

### SDK Tab Not Visible
- **Cause**: "New Version" mode is enabled
- **Solution**: Click the "Nauja" toggle button in the top right to disable it

### "VITE_ANTHROPIC_API_KEY not found" Error
- **Cause**: Environment variable not set
- **Solution**:
  - For Netlify: Follow steps in "Netlify Environment Variable Setup" above
  - For local dev: Add key to `.env` file and restart dev server

### "Nepavyko užkrauti sistemos nurodymus"
- **Cause**: Missing or empty `instruction_variables` table
- **Solution**: Create table and populate with required variables (see Supabase Table Setup)

### No Response from API
- **Cause**: Invalid API key or network issues
- **Solution**:
  - Verify API key is correct
  - Check Anthropic API status
  - Review browser console for detailed error messages

---

## API Usage & Costs

### Model
- **Claude Sonnet 4** (`claude-sonnet-4-20250514`)
- Latest and most capable model for commercial tasks

### Token Limits
- Max tokens per response: 4,096
- System prompt: ~5-7k tokens (cached)

### Pricing (as of Jan 2025)
With prompt caching:
- First request: Standard pricing
- Subsequent requests (within 1 hour): ~90% cost reduction on cached portion
- Only new messages are charged at full rate

---

## Security Notes

⚠️ **IMPORTANT**:
- The SDK currently uses `dangerouslyAllowBrowser: true`
- This is acceptable for internal tools but NOT for public-facing applications
- For production public apps, API calls should go through a backend proxy
- Never commit `.env` file to version control

---

## Support

For issues or questions:
1. Check browser console for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure Supabase table has all required variables populated
4. Contact system administrator for API key or access issues
