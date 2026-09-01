# catalog-api

Small Node.js HTTP service that replaces the live n8n MySQL webhooks for product catalog lookups (`get_products`, `get_prices`, `get_multiplier`). It reads from the same local MySQL database (`hnv`) used by n8n on the Traidenis VM.

This is the first slice of the n8n-to-code rewrite. **Do not change Directus `webhooks` rows until cutover** — production still points at `https://n8n.traidenis.org/webhook/...`.

## Endpoints

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/health` | — | `{"ok":true,"service":"catalog-api"}` |
| `POST` | `/webhook/91307d0b-16c6-4de5-b349-ea274dd9259d` | `{"product_code":"..."}` | Product by `productcode` |
| `POST` | `/webhook/60d19a37-65b1-492f-ad35-3bbb474f3cd9` | `{"id":1}` | Price row by **price row id** (not `productid`) |
| `POST` | `/webhook/77887f94-dfa2-48fe-8b13-8798b693a55a` | `{}` optional | Latest `pricemulti` row |

Webhook UUID paths match live n8n so Directus URLs can switch host only at cutover.

Missing rows return HTTP 500 with `{"code":0,"message":"No item to return was found"}` (same as n8n).

## Requirements

- Node.js 20+
- Access to the Traidenis VM MySQL instance (`hnv` database, user `eiternus`, host `127.0.0.1`)

## Setup (Ubuntu / Traidenis VM)

```bash
cd services/catalog-api
cp .env.example .env
# Edit .env with real MYSQL_PASSWORD (never commit .env)
npm install
npm test
npm start
```

Default listen port is **3100** (`0.0.0.0`). Health check:

```bash
curl -s http://127.0.0.1:3100/health
```

## Run with pm2

```bash
cd /path/to/repo/services/catalog-api
npm install --omit=dev
pm2 start src/server.js --name catalog-api
pm2 save
```

The service shares the live MySQL database with n8n. It performs **SELECT only** — no writes to MySQL or Supabase.

## Netlify preview testing

Set `CATALOG_API_BASE` on a Netlify preview (e.g. `http://<vm-public-ip>:3100`) so `webhook-proxy` rewrites `n8n.traidenis.org` catalog webhook origins to this service. When unset, production behavior is unchanged.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MYSQL_HOST` | `127.0.0.1` | MySQL host |
| `MYSQL_PORT` | `3306` | MySQL port |
| `MYSQL_USER` | — | MySQL user |
| `MYSQL_PASSWORD` | — | MySQL password |
| `MYSQL_DATABASE` | `hnv` | Database name |
| `PORT` | `3100` | HTTP listen port |
