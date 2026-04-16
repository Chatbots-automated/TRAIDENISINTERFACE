# In-Depth Project Review (Multi-Subagent Pass)

Date: 2026-04-16  
Scope: `/workspace/TRAIDENISINTERFACE`

## Method

I ran this as a coordinated "multi-subagent" review:

1. **Subagent A – Build & Type Safety:** `npm run build`, `npx tsc --noEmit`
2. **Subagent B – Lint & Code Health:** `npm run lint`
3. **Subagent C – Security/Surface Scan:** searched for risky rendering and auth/storage patterns
4. **Subagent D – Architecture & Maintainability:** file-size and structure pass

---

## Executive Summary

The project is feature-rich and builds successfully for production, but it has **major code-health and security debt** that will slow delivery and increase incident risk.

### Top priorities

1. **Fix authentication model**: current login checks plaintext passwords in the DB and stores full user objects in `localStorage`. This should be replaced by server-side auth/session/JWT with hashed passwords.
2. **Reduce lint debt**: ESLint reports **534 issues (501 errors, 33 warnings)**, concentrated around `any` usage and hook dependency risks.
3. **Break up mega-components**: key UI files exceed 1k–4k LOC, making regression risk high and testing hard.
4. **Harden markdown/HTML rendering**: user/LLM content is converted to HTML and injected via `dangerouslySetInnerHTML`; add strict sanitization allowlists.
5. **Address bundle size**: production JS bundle is ~1.8 MB minified; introduce route/module chunking strategy.

---

## Subagent Findings

### A) Build & Type Safety

- `npm run build` succeeded.
- Vite warns about large chunks (`dist/assets/index-*.js` ~1.8 MB minified, ~528 KB gzip).
- Vite also warns that `database.ts` is both statically and dynamically imported, preventing intended chunk splitting.
- `npx tsc --noEmit` completed without TypeScript compile errors in this environment.

**Interpretation:** runtime build path is stable, but performance and architecture are under pressure.

---

### B) Lint & Code Health

- `npm run lint` reports **534 total issues** (501 errors, 33 warnings).
- Primary category is `@typescript-eslint/no-explicit-any`.
- Secondary categories include:
  - `@typescript-eslint/no-unused-vars`
  - `react-hooks/exhaustive-deps`
  - occasional `prefer-const`, `no-empty`, `no-constant-binary-expression`

**Interpretation:** engineering throughput is likely reduced by weak type safety and inconsistent React hook discipline.

---

### C) Security & Data Handling

#### 1) Authentication and credential storage risk (critical)

- `signIn` performs DB query with `.eq('email', email).eq('password', password)`.
- `signUp` and admin user creation write `password` directly to `app_users` records.
- session identity is persisted with `localStorage.setItem('currentUser', JSON.stringify(userData))`.

**Risk:** plaintext password handling and client-side session spoofability; compromised browser context yields full account impersonation.

#### 2) Content injection/XSS risk (high)

- Markdown is transformed to HTML via regex and rendered with `dangerouslySetInnerHTML`.
- Several places assign/restore `doc.body.innerHTML` for persistence/preview flows.

**Risk:** if untrusted content reaches these paths, XSS exposure is possible without robust sanitization policy.

#### 3) Static API token pattern (high)

- app uses `VITE_DIRECTUS_TOKEN` in frontend context.
- comments indicate static bearer token auth model.

**Risk:** token visibility in client bundle/runtime can broaden blast radius if leaked.

---

### D) Architecture & Maintainability

#### 1) Very large components/services

Largest files include:
- `src/components/SDKInterfaceNew.tsx` (~4.7k LOC)
- `src/components/PaklausimoKortele.tsx` (~4.7k LOC)
- `src/components/KainosInterface.tsx` (~1.9k LOC)
- `src/components/DocumentsInterface.tsx` (~1.6k LOC)

**Impact:** low cohesion and high coupling make onboarding, testability, and safe refactoring difficult.

#### 2) Broad routing shell and shared state concentration

- `App.tsx` handles auth gates, route wiring, persistent UX modes, and SDK sidebar state in one unit.

**Impact:** cross-feature changes have higher chance to cause unrelated regressions.

---

## Suggested 30/60/90 Day Remediation Plan

### 0–30 days (stabilize risk)

- Replace plaintext auth with hashed passwords + server-validated sessions.
- Remove direct password fields from client-managed records.
- Introduce HTML sanitizer (allowlist-based) before any `dangerouslySetInnerHTML`/`innerHTML` assignments.
- Create lint baseline and fix the top 100 highest-risk issues (hooks + unsafe anys in auth/data paths).

### 31–60 days (improve maintainability)

- Split `SDKInterfaceNew`, `PaklausimoKortele`, `KainosInterface`, `DocumentsInterface` into feature modules + hooks.
- Create typed API boundary layer for Directus responses (remove `any` at edges first).
- Add architecture tests/checks (route smoke tests, critical service integration tests).

### 61–90 days (performance and robustness)

- Implement explicit route-level/code-level chunking strategy.
- Optimize heavy UI modules and deferred imports.
- Introduce runtime monitoring for auth failures, render errors, and expensive interactions.

---

## Practical Next Step Backlog (ordered)

1. Auth redesign RFC (security sign-off required)
2. Sanitization utility + centralized safe-render wrapper
3. Lint campaign phase 1 (high-risk files only)
4. Break `SDKInterfaceNew` into composable modules
5. Bundle/chunk optimization pass

---

## Command Log (executed)

- `npm run lint`
- `npm run build`
- `npx tsc --noEmit`
- `rg -n "\bany\b" src | wc -l`
- `find src -name '*.ts' -o -name '*.tsx' | xargs wc -l | sort -nr | head -n 15`
- `rg -n "TODO|FIXME|HACK|XXX" src`
- `rg -n "dangerouslySetInnerHTML|innerHTML|eval\(" src`

