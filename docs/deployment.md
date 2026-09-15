# TITULAR — Deployment Guide

Target architecture (one repository, one Firebase project, one visible domain):

```text
titular.com.ar
      │
      ▼
Firebase Hosting ──── serves dist/ (React + Vite build)
      │
      ├── /api/**  ──rewrite──▶  Cloud Run service "titular-api"
      │                                 │
      │                           Express (dist/server.cjs)
      │                                 │
      │            ┌───────────────────┼──────────────────┐
      │            ▼                   ▼                  ▼
      │        Firestore            Gemini       Meta / Mercado Pago
      │
      └── /**  ──SPA fallback──▶  /index.html
```

Status legend: ✅ prepared in repo · ⏳ manual step required before first deploy · 📋 planned (later phase).

---

## 0. First-time manual prerequisites (do not run until deployment is approved)

1. Install Google Cloud CLI on Windows: https://cloud.google.com/sdk/docs/install
2. Authenticate and select the existing Firebase/GCP project:

   ```bash
   gcloud auth login
   gcloud config set project titular-53a66
   firebase login
   ```

3. Enable a billing account on project `titular-53a66` (Cloud Run requires it, even
   when usage stays within free-tier allowances).
4. Docker is **not** required locally: `gcloud run deploy --source .` uses Cloud Build.
5. Never paste secret values into chat or commit them. Use Cloud Shell / gcloud prompts
   or Google Cloud Console Secret Manager.

No Google Cloud resource, IAM binding, secret, webhook, DNS record, or deployment has
been created by this repository preparation.

---

## 1. Local development

Unchanged by this migration. One process serves frontend + API:

```bash
npm run dev          # Express + Vite middleware (listens on $PORT, default 8080)
```

Firebase Admin credentials: `.env.local` (e.g. `FIREBASE_SERVICE_ACCOUNT_JSON`) via the
existing initialization chain in `server/firebase-admin.ts`. Nothing to change.

## 2. Builds

```bash
npm run build:frontend   # vite build            → dist/          (for Firebase Hosting)
npm run build:server     # esbuild server bundle → dist/server.cjs (for Cloud Run image)
npm run build            # both, in that order
```

## 3. Cloud Run service ("titular-api")

Built from `Dockerfile` (multi-stage, Node 22, runtime user `node`, API-only —
`SERVE_STATIC` is not set in the container). Cloud Build compiles it in the cloud;
no local Docker required:

```bash
PROJECT_ID=titular-53a66
REGION=southamerica-east1

gcloud run deploy titular-api \
  --project "$PROJECT_ID" \
  --source . \
  --region "$REGION" \
  --service-account "titular-api@$PROJECT_ID.iam.gserviceaccount.com" \
  --allow-unauthenticated \
  --max-instances 1 \
  --set-env-vars "NODE_ENV=production,APP_URL=https://titular.com.ar,FIRESTORE_DATABASE_ID=(default),MERCADOPAGO_REQUIRE_SIGNATURE=true" \
  --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest,MERCADOPAGO_ACCESS_TOKEN=MERCADOPAGO_ACCESS_TOKEN:latest,MERCADOPAGO_WEBHOOK_SECRET=MERCADOPAGO_WEBHOOK_SECRET:latest,META_APP_SECRET=META_APP_SECRET:latest,META_TOKEN_ENCRYPTION_KEY=META_TOKEN_ENCRYPTION_KEY:latest"
```

Boot note: `server/config/env.ts` validates startup secrets and exits(1) if
`GEMINI_API_KEY` (and other required vars) are missing — secrets must exist
**before** the first deploy.

### 3.1 Region (Phase 7) — RESOLVED ✅

**`southamerica-east1` (São Paulo)** — same location as the existing Firestore
`(default)` database (confirmed in Firebase Console). Keep Cloud Run and Firestore
co-located; do not migrate the database.

Reference for future projects: Cloud Run and Firestore should share a region for latency (requests between
regions cross the public internet and are slower/billable). Check a Firestore location with:

- **Firebase Console (no tools needed):**
  https://console.firebase.google.com → project `titular-53a66` → **Firestore Database**.
  The location (e.g. `southamerica-east1` / `us-central`) is shown next to the
  database name.

- **gcloud CLI (once installed):**

  ```bash
  gcloud firestore databases describe --database="(default)" --format="value(locationId)"
  ```

Then set `REGION` in the commands above (and in `firebase.json` hosting rewrites,
Phase 9) to the **same location**. If Firestore is multi-region (e.g. `nam5`,
`eur3`), pick the closest Cloud Run region to your users and document the tradeoff.
Do **not** migrate or recreate the database.

## 4. Firebase Hosting (Phase 9 — done)

`firebase.json` now serves `dist/` with:
1. `/api{,/**}` → Cloud Run `titular-api` in `southamerica-east1` (declared **before** the SPA fallback — order is mandatory),
2. `/**` → `/index.html` SPA fallback,
3. `Cache-Control: immutable` for hashed `/assets/**`, `no-cache` for `/index.html`.

Deploy frontend: `npm run build:frontend && npx firebase deploy --only hosting`
(requires `firebase login`).

## 5. Environment variables — classification (Phase 8)

### 5.1 Public frontend variables (safe to expose — they ship in the Vite bundle)

| Variable | Notes |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase web API key (public identifier) |
| `VITE_FIREBASE_AUTH_DOMAIN` | |
| `VITE_FIREBASE_PROJECT_ID` | `titular-53a66` |
| `VITE_FIREBASE_STORAGE_BUCKET` | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | |
| `VITE_FIREBASE_APP_ID` | |
| `VITE_FIREBASE_MEASUREMENT_ID` | optional |
| `VITE_FIRESTORE_DATABASE_ID` | optional; `(default)` if unset |

These are baked at `npm run build:frontend` time. They are **not** secrets:
Firebase web keys are designed to be public; security comes from Firestore rules
and Firebase Auth.

### 5.2 Backend configuration (non-sensitive, set via `--set-env-vars`)

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` (also set in Dockerfile) |
| `APP_URL` | `https://titular.com.ar` — drives Meta redirect URI + MP `notification_url` |
| `FIRESTORE_DATABASE_ID` | `(default)` |
| `TRIAL_PUBLICATIONS`, `MAX_ARTICLE_INPUT_CHARS` | limits |
| `PLAN_*_PUBLICATIONS`, `PLAN_*_PRICE_ARS`, `PACK_*_PRICE_ARS` | billing catalog |
| `GEMINI_PRIMARY_MODEL`, `GEMINI_FALLBACK_MODELS`, `GEMINI_*_TIMEOUT_MS`, `GEMINI_RETRY_*` | tuning; sane defaults exist |
| `META_GRAPH_VERSION` | default `v22.0` |
| `ADMIN_EMAILS` | superadmin emails |
| `MERCADOPAGO_REQUIRE_SIGNATURE` | webhook signature enforcement |
| `AI_GENERATION_RESERVATION_TTL_MS` | reservation tuning |
| `PORT` | injected by Cloud Run — do not set |

### 5.3 Backend secrets (Secret Manager — never in Git, never in Vite)

| Secret | Purpose |
|---|---|
| `GEMINI_API_KEY` | AI generation (boot-required) |
| `MERCADOPAGO_ACCESS_TOKEN` | billing |
| `MERCADOPAGO_WEBHOOK_SECRET` | webhook signature validation |
| `META_APP_SECRET` | Meta OAuth / token exchange |
| `META_TOKEN_ENCRYPTION_KEY` | encryption of stored page tokens |

Never set on Cloud Run: `FIREBASE_SERVICE_ACCOUNT_JSON` (ADC uses the attached
service account identity instead), `SERVE_STATIC` (must stay unset), `PORT`.

### 5.4 Creating the secrets (⏳ run when deploying — values entered by you)

```bash
# One-time per secret. Enter the real value at the prompt (not in chat, not in Git).
for s in GEMINI_API_KEY MERCADOPAGO_ACCESS_TOKEN MERCADOPAGO_WEBHOOK_SECRET META_APP_SECRET META_TOKEN_ENCRYPTION_KEY; do
  echo -n "Value for $s: " && read -s VALUE && printf '%s' "$VALUE" | gcloud secrets create "$s" --data-file=- --replication-policy="automatic" && unset VALUE
done
```

Then bind them at deploy time:

```bash
gcloud run deploy titular-api \
  --region <REGION> \
  --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest,MERCADOPAGO_ACCESS_TOKEN=MERCADOPAGO_ACCESS_TOKEN:latest,MERCADOPAGO_WEBHOOK_SECRET=MERCADOPAGO_WEBHOOK_SECRET:latest,META_APP_SECRET=META_APP_SECRET:latest,META_TOKEN_ENCRYPTION_KEY=META_TOKEN_ENCRYPTION_KEY:latest"
```

The Cloud Run service account (`titular-api`, see section 7) needs
`roles/secretmanager.secretAccessor` on these secrets.

## 6. Firebase Admin credentials (Phase 5 — resolved, no code needed)

- **Local:** `.env.local` / `GOOGLE_APPLICATION_CREDENTIALS` keep working.
- **Cloud Run:** no credential files. `server/firebase-admin.ts` falls through to
  Application Default Credentials = the attached Cloud Run service account.
  `projectId` auto-resolves; `FIRESTORE_DATABASE_ID=(default)` selects the default DB.

## 7. Service account (Phase 13) — ⏳ manual, least privilege

```bash
PROJECT_ID=titular-53a66
SA="titular-api@$PROJECT_ID.iam.gserviceaccount.com"

gcloud iam service-accounts create titular-api \
  --project "$PROJECT_ID" \
  --display-name="TITULAR API (Cloud Run)"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" \
  --role="roles/datastore.user"

# Grant Secret Manager access only to the five deployment secrets.
for s in GEMINI_API_KEY MERCADOPAGO_ACCESS_TOKEN MERCADOPAGO_WEBHOOK_SECRET META_APP_SECRET META_TOKEN_ENCRYPTION_KEY; do
  gcloud secrets add-iam-policy-binding "$s" \
    --member="serviceAccount:$SA" \
    --role="roles/secretmanager.secretAccessor"
done
```

Required roles (grant only after explicit confirmation — no Owner/Editor).
Validated against actual code usage (security audit, Phase 14):

| Role | Why |
|---|---|
| `roles/datastore.user` | Firestore reads/writes across `users`, `organizations` (+ subcollections), `billingUsers`, `billingEvents`, `aiUsageMonthly` |
| `roles/secretmanager.secretAccessor` | only because secrets are injected as Secret Manager-backed env vars at deploy time (app code itself never calls the Secret Manager API) |

**Not required** (audit refuted the initial guess): `roles/firebaseauth.admin` —
the backend only calls `verifyIdToken()`, which requires no Auth admin role.
No Cloud Storage access. No Auth admin operations (`createUser`, custom claims)
exist in server code.

## 8. Healthcheck (Phase 3 — done)

`GET /health` → `200 {"status":"ok"}` — no auth, no external calls. Use as Cloud Run
startup/liveness probe if configuring custom probes.

## 8.1 Frontend API URLs (Phases 10-11 — verified, no changes needed)

All frontend calls already use relative paths (`fetch('/api/...')`, `authFetch`);
no `VITE_API_URL` exists. Development resolves `/api` through the same Express
process (Vite middleware, single origin) — a Vite dev proxy is therefore
**not required**. Production resolves `/api` through the Hosting rewrite above.

## 9. Public endpoints & webhooks (Phase 12)

URLs to configure **after** the domain is live (do not change now):
`APP_URL=https://titular.com.ar` drives both. Update in: Mercado Pago app
(notification_url) and Meta app dashboard (Valid OAuth Redirect URIs).

| Public endpoint | Protection | Post-deploy action |
|---|---|---|
| `POST /api/webhooks/mercadopago` | HMAC signature when `MERCADOPAGO_REQUIRE_SIGNATURE=true` | Set MP `notification_url` = `https://titular.com.ar/api/webhooks/mercadopago`; keep signature flag `true` in production |
| `GET /api/meta/oauth/callback` | HMAC-signed OAuth `state` (20 min TTL, `META_APP_SECRET`) | Add `https://titular.com.ar/api/meta/oauth/callback` to Meta Valid OAuth Redirect URIs (`META_REDIRECT_URI`) |
| `GET /api/media/render/:id` | unguessable 128-bit IDs | none (by design, for Meta crawlers) |
| `GET /api/proxy-image` | `isUrlSafe()` SSRF guard + protocol check + 12s timeout | none |
| `POST /api/extract` | `isUrlSafe()` SSRF guard on scraped URLs | none |

## 9.1 Security review (Phases 14-15)

Checks that **pass** (no action needed):
- No server secret carries a `VITE_` prefix; `src/` contains only public Firebase web config.
- `.env*`/keys/service-account JSON excluded by both `.gitignore` and `.dockerignore`; `.env.example` has placeholders only.
- Private endpoints verify Firebase ID tokens (`verifyIdToken`); all four `/api/admin/*` routes enforce the admin check (ADMIN_EMAILS / `users/{uid}.role` / `isAdmin`).
- `POST /api/auth/bootstrap` (Phase 15): verified token, server-derived organizationId, transactional merge-only writes → idempotent, preserves `plan`/`publicationLimit`/`publicationUsed`/`credits`/`benefits`, returns `{ user, organization }`. **Untouched.**
- Service account JSON never enters the Docker image; Admin uses ADC on Cloud Run.

Pre-existing findings found by the Phase 14 audit — **5 of 6 fixed** in a
dedicated hardening change (all verified: lint, build, 15/15 unit tests):

| Severity | Finding | Status |
|---|---|---|
| High | `GET /api/proxy-image` lacked `isUrlSafe()` → SSRF | ✅ Fixed: guard applied before fetch, 400 on reject |
| High | Unescaped dynamic values in OAuth callback HTML → XSS | ✅ Fixed: `escapeHtml` for text, `toSafeScriptJson` (escapes `<` as `\u003c`) for inline `<script>` JSON |
| Medium | `meta/publish` + `/publish/retry` trusted client `orgId` | ✅ Fixed: `checkUserAdminPermission` before any side effect, same 403 shape as sibling routes |
| Medium | Raw `err.message` returned to clients | ✅ Fixed: `getClientSafeErrorMessage()` — curated `userMessage` only for categorized `MetaServiceError`s, generic Spanish messages otherwise; `technicalDetails` removed from responses; server-side logging preserved |
| Medium | HMAC compares not timing-safe; MP signature optional | ✅ Fixed: length-guarded `crypto.timingSafeEqual` in MP + Meta state; production boot warns (log-only) when `MERCADOPAGO_REQUIRE_SIGNATURE !== 'true'` |
| Low | `/api/extract` open, no rate limit | ⏳ Pending product decision (rate limiting is new functionality, out of scope) |

Note: billing errors that previously surfaced plain `Error` messages from
`server/mercadopago.ts` (e.g. "Ya tenés una suscripción activa...") now return
generic messages; restoring them requires backfilling `userMessage` on those
throw sites (optional UX follow-up).

## 10. First deployment order (⏳ manual, explicit approval required)

1. Install/login/billing from section 0.
2. Create `titular-api` service account and grant only section 7 roles.
3. Create the five Secret Manager secrets (section 5.4).
4. Deploy Cloud Run using section 3. Verify `https://<cloud-run-url>/health` returns `{"status":"ok"}`.
5. Build and deploy Hosting:

   ```bash
   npm run build:frontend
   npx firebase deploy --only hosting
   ```

6. Connect/verify `titular.com.ar` in Firebase Hosting and update its DNS records at
   the domain registrar.
7. Only after the domain works, set `APP_URL`, configure the Mercado Pago webhook,
   and add the Meta OAuth redirect from section 9.

## 11. Rollback (Phase 17)

Cloud Run keeps each deployment as a revision:

```bash
REGION=southamerica-east1
gcloud run revisions list --service titular-api --region "$REGION"
gcloud run services update-traffic titular-api \
  --region "$REGION" \
  --to-revisions <PREVIOUS_REVISION>=100
```

Firebase Hosting keeps release history. Select a prior release interactively:

```bash
npx firebase hosting:rollback
```

## 12. Verification (Phase 18)

Run before requesting a deploy:

```bash
npm run lint
npm run test:unit
npm run test:emulator          # requires Firebase CLI + Firestore emulator
npm run build:frontend
npm run build:server
npm run build
```

Expected checks: frontend Vite build, server esbuild bundle, unit + emulator tests,
production API-only `/health` smoke test, and JSON validation of Hosting rewrites.

Current local evidence: lint ✅ · unit tests 15/15 ✅ · frontend build ✅ · server build ✅ ·
combined build ✅ · API-only smoke (`/health` 200, `/` 404) ✅ · legacy static smoke
(`SERVE_STATIC=true`, `/` serves Vite assets) ✅ · dev smoke ✅ · Hosting JSON/docs sanity ✅.

Emulator verification: **18/18 tests passed** using Java 21 against local
`demo-titular` Firestore. Older terminals may still need JAVA_HOME/PATH refreshed.
The former concurrency failure counted successful HTTP responses, not provider
calls: completed replays legitimately return 200. Deterministic tests now cover
in-flight conflicts and completed replays separately, asserting one provider call,
one consumed publication, and no remaining active reservation. No production
idempotency logic was changed.

First real `docker build` remains pending because Docker is not installed locally;
Cloud Build performs it during the first approved Cloud Run deploy.
