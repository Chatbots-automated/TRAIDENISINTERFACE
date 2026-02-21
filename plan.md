# Derva RAG Feature - Implementation Plan

## Architecture Overview

Two PostgreSQL tables + one new page + one new webhook + pgvector tool config for n8n.

---

## 1. Database: Migration `005_derva_rag.sql`

### Table `derva_files` — tracks uploaded files (for UI listing)

```sql
CREATE TABLE IF NOT EXISTS public.derva_files (
  id SERIAL PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  source_type TEXT DEFAULT 'unknown',
  uploaded_by TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'vectorized', 'error')),
  chunk_count INTEGER DEFAULT 0,
  error_message TEXT
);
```

### Table `derva` — stores vectorized chunks (n8n PGVector Store compatible)

```sql
CREATE TABLE IF NOT EXISTS public.derva (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  embedding vector(3072),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS derva_embedding_idx
  ON public.derva USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS derva_file_name_idx
  ON public.derva ((metadata->>'file_name'));
```

**Why two tables?**
- `derva_files`: clean UI listing of uploads + status tracking (1 row per file)
- `derva`: chunks for RAG (many rows per file, n8n PGVector Store node expects this shape)

---

## 2. Backend Service: `src/lib/dervaService.ts`

Functions:
- `fetchDervaFiles()` — list all files from `derva_files`, ordered by `uploaded_at DESC`
- `insertDervaFile(fileName, fileSize, uploadedBy)` — insert pending file record, return ID
- `deleteDervaFile(id)` — delete file record + its chunks from `derva` where metadata->>'file_id' matches
- `getDervaFileStatus(id)` — check single file status

---

## 3. Frontend: `src/components/DervaInterface.tsx`

New page under Valdymas (admin-only). Structure:

### Header
- Title: "Derva RAG"
- Subtitle: "Vektorizuotų dokumentų valdymas dervos rekomendacijoms"

### Upload Section
- Drag & drop file input (accepts `.pdf`, `.md`, `.txt`, `.doc`, `.docx`)
- "Vektorizuoti" button — triggers webhook with binary file via FormData
- Loader shown while waiting for 200 response
- On success: refresh file list, show notification

### File List (table)
| # | Failo pavadinimas | Dydis | Įkėlė | Data | Būsena | Veiksmai |
|---|---|---|---|---|---|---|
| 1 | resin_guide.pdf | 12.4 MB | admin@... | 2026-02-20 | Vektorizuota (45 chunks) | Delete |

- Status badges: `pending` (yellow), `processing` (blue spinner), `vectorized` (green), `error` (red)
- Shows chunk_count when vectorized
- Delete button removes file record + all associated chunks
- Auto-polls status every 5s while any file is in `pending`/`processing` state

---

## 4. Routing & Sidebar Changes

### `src/App.tsx`
- Add `'derva'` to `ViewMode` type
- Add route: `<Route path="/derva" element={<DervaInterface user={user} />} />`
- Add to `routeToViewMode`: `'/derva': 'derva'`

### `src/components/Layout.tsx`
- Add `'derva'` to the viewMode type union
- Add new sidebar button under Valdymas section (after Naudotojai):
  - Uses `FlaskConical` icon (already imported in Layout.tsx line 15 but currently unused)
  - Label: "Derva RAG"

---

## 5. Webhook Integration

### New webhook key: `n8n_derva_vectorize`

- Register in `webhooks` DB table (via WebhooksModal UI after deployment)
- Add to `WEBHOOK_GROUPS` in `WebhooksModal.tsx` as a new "Derva" category

### Upload flow:
1. User picks file + clicks "Vektorizuoti"
2. Frontend inserts record into `derva_files` (status: 'pending')
3. Frontend sends `POST` to webhook with `FormData`:
   - `file`: binary file
   - `file_id`: the derva_files record ID
   - `file_name`: original file name
   - `uploaded_by`: user email
4. n8n workflow: parse → chunk → embed → insert into `derva` table → update `derva_files` status
5. Frontend polls/refreshes to show updated status

---

## 6. Webhook URL Issue (localhost vs n8n.traidenis.org)

Your webhook URLs live in the **`webhooks` database table**, not `.env`. The URL you pasted (`http://localhost:5678/webhook-test/...`) has two problems:
1. **`localhost`** — only works when browser runs on same machine as n8n
2. **`webhook-test`** — n8n test mode URL, only active while workflow is open in n8n editor

**Fix:** In the Webhooks modal, update URLs to `https://n8n.traidenis.org/webhook/...` (production path, no `-test`). Activate the workflow in n8n first so the production webhook becomes live.

No code change needed — pure configuration fix in your webhooks table.

---

## 7. PGVector Store Tool Description for n8n Anthropic Node

```
Dervos žinių bazė – vektorizuotų dokumentų paieška.

Šioje duomenų bazėje saugomi trys tipų dokumentai:
1. DERVOS PARINKIMO VADOVAS – išsamus ~60 puslapių dokumentas apie dervų
   (epoksidinių, poliesterinių, vinilesterinių ir kt.) parinkimą pagal aplinkos
   sąlygas, cheminį atsparumą, temperatūrą ir mechaninius reikalavimus.
2. GAMINTOJŲ KOMPONENTŲ LAPAI – ~30 vieno puslapio techninių duomenų lapų iš
   gamintojų (pvz. Ashland, AOC, Scott Bader ir kt.) apie konkrečias chemines
   medžiagas, jų savybes ir pritaikymą.
3. KOMPONENTŲ PARINKIMO LENTELĖ – bendroji lentelė su cheminių komponentų
   palyginimais ir rekomendacijomis pagal terpę.

NAUDOJIMO INSTRUKCIJOS:
- Ieškok pagal konkrečius terminus: cheminės medžiagos pavadinimą, terpės tipą
  (rūgštys, šarmai, tirpikliai), temperatūros diapazoną, arba gamintojo pavadinimą.
- VISADA atlik kelias paieškas skirtingais terminais, jei pirma paieška neduoda
  pakankamai rezultatų.
- Grąžink VISUS susijusius radinius – nefiltruok ir neapsiribok vienu rezultatu.
- Nurodyk iš kurio dokumento (file_name metadata lauke) informacija gauta.
- Jei randi prieštaringą informaciją tarp šaltinių, pateik abu variantus ir
  paaiškink skirtumą.
```

### n8n PGVector Store node config:
- **Table**: `derva`
- **Embedding column**: `embedding`
- **Content column**: `content`
- **Metadata column**: `metadata`
- **Top K**: `6` (ensures big guide + manufacturer sheets + table all get a chance)
- **Embedding model**: must match vectorization workflow (e.g. `text-embedding-3-large` = 3072 dims)

### On citing sources:
Each chunk's `metadata` includes `file_name`. The tool description tells the AI to mention which document info came from. Practical source attribution without complex citation infra.

### On not limiting to 1 record:
Top K = 6 ensures multiple chunks retrieved. Tool description says "grąžink VISUS susijusius radinius". The AI synthesizes across all returned chunks.

---

## 8. Files to Create/Modify

| Action | File |
|--------|------|
| CREATE | `migrations/005_derva_rag.sql` |
| CREATE | `src/lib/dervaService.ts` |
| CREATE | `src/components/DervaInterface.tsx` |
| MODIFY | `src/App.tsx` — add route + ViewMode |
| MODIFY | `src/components/Layout.tsx` — add sidebar button |
| MODIFY | `src/components/WebhooksModal.tsx` — add derva webhook group |

## 9. Implementation Order

1. Migration SQL
2. `dervaService.ts`
3. `DervaInterface.tsx`
4. `App.tsx` + `Layout.tsx` (routing + sidebar)
5. `WebhooksModal.tsx` (webhook group)
