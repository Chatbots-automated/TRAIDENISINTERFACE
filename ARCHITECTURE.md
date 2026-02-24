# TRAIDENIS INTERFACE — Architecture

## API Provider: DIRECTUS

**This application uses [Directus](https://directus.io) as its database/API layer.**

> **NOT Supabase. NOT PostgREST. NOT Firebase. NOT PocketBase. DIRECTUS ONLY.**

If you are an AI agent or developer working on this codebase, read this section
carefully before making any changes to database-related code.

### Directus Instance

| Key               | Value                            |
|-------------------|----------------------------------|
| URL               | `https://sql.traidenis.org`      |
| Auth method       | Static Bearer token              |
| Env var (URL)     | `VITE_DIRECTUS_URL`              |
| Env var (token)   | `VITE_DIRECTUS_TOKEN`            |
| API docs          | https://docs.directus.io/reference/introduction.html |

### How Database Access Works

```
React Components
    ↓
Service Layer  (src/lib/*Service.ts)
    ↓
database.ts    (exports `db` and `dbAdmin` — both Directus clients)
    ↓
directus.ts    (custom Directus REST API client with query-builder interface)
    ↓
Directus REST API  (https://sql.traidenis.org/items/<collection>)
```

All database operations use the fluent query-builder from `src/lib/directus.ts`:

```typescript
// Example — this calls the DIRECTUS API, not Supabase
const { data, error } = await db
  .from('sdk_conversations')   // Directus collection name
  .select('*')
  .eq('project_id', projectId)
  .order('last_message_at', { ascending: false });
```

The query-builder syntax intentionally resembles Supabase/PostgREST, but every
request is translated to Directus REST API endpoints:

- `GET /items/<collection>?filter[field][_eq]=value`
- `POST /items/<collection>`
- `PATCH /items/<collection>/<id>`
- `DELETE /items/<collection>/<id>`

### Key Files

| File                       | Purpose                                      |
|----------------------------|----------------------------------------------|
| `src/lib/directus.ts`      | Core Directus REST API client (all DB calls)  |
| `src/lib/database.ts`      | Creates and exports `db` / `dbAdmin` clients  |
| `.env.example`             | Environment configuration                     |

### Directus Collections (Tables)

| Collection               | Purpose                                     |
|--------------------------|---------------------------------------------|
| `app_users`              | Application users (email/password auth)     |
| `vadybininkai`           | Managers directory                          |
| `sdk_conversations`      | AI chat conversations                       |
| `shared_conversations`   | Conversation sharing records                |
| `chat_items`             | Chat threads and message history            |
| `instruction_variables`  | System instructions for AI                  |
| `instruction_versions`   | Instruction version history                 |
| `documents`              | Document storage                            |
| `n8n_vector_store`       | Non-standard projects (Nestandartiniai)     |
| `standartiniai_projektai`| Standard projects                           |
| `webhooks`               | Webhook configuration                       |
| `application_logs`       | Audit log                                   |

---

## AI Provider: Anthropic (Claude)

The AI chat features use the **Anthropic SDK** (`@anthropic-ai/sdk`), not
OpenAI, Gemini, or any other provider.

| Key               | Value                            |
|-------------------|----------------------------------|
| Package           | `@anthropic-ai/sdk`              |
| Env var           | `VITE_ANTHROPIC_API_KEY`         |

---

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Routing:** React Router DOM v7
- **Styling:** Tailwind CSS
- **Icons:** Lucide React
- **Database API:** Directus (self-hosted at sql.traidenis.org)
- **AI:** Anthropic Claude SDK
- **Deployment:** Netlify (static SPA)

---

## Common Mistakes to Avoid

1. **Do NOT install or import `@supabase/supabase-js`** — this is a Directus project
2. **Do NOT use `supabase.from()`** — use `db.from()` which calls Directus
3. **Do NOT reference PostgREST endpoints** — the app communicates via Directus REST API
4. **Do NOT create Supabase RLS policies** — access control is managed in Directus
5. **Do NOT use `supabase.auth`** — authentication is custom (see `database.ts`)
