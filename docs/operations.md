# TITULAR — Operations Guide (Production Runbook)

> Snapshot date: 2026-09-16. This document describes the **live production system**.
> For the deployment walkthrough, see `docs/deployment.md`.

## 1. System status — what is live

| Capability | Status |
|---|---|
| User registration / login (Firebase Auth) + free trial (10 publications) | ✅ live |
| News extraction from URL (scraping) | ✅ live — verified against real news sites |
| AI content generation (Gemini) with usage tracking + credits | ✅ live |
| Editorial identities + generation history | ✅ live |
| Admin panel (`ADMIN_EMAILS` account) | ✅ live |
| Facebook / Instagram publishing | ⏸️ disabled — Meta credentials not configured yet |
| Mercado Pago subscriptions / credits checkout | ⏸️ disabled — MP credentials not configured yet |

Verification performed on the live system: `GET /health` → 200; `POST /api/extract`
returned a real scraped article (title + subtitle + full content); Hosting rewrite
`/api/*` → Cloud Run confirmed; SPA fallback confirmed.

## 2. Architecture

```text
titular-53a66.web.app  (custom domain titular.com.ar pending DNS)
      │
      ▼
Firebase Hosting (CDN)
      │
      ├── static React app (Vite build → dist/)
      │
      └── /api{,/**}  ──rewrite──▶  Cloud Run service "titular-api"
                                          │
                                    Express (dist/server.cjs, Node 22)
                                          │
                    ┌─────────────────────┼──────────────────────┐
                    ▼                     ▼                      ▼
                Firestore              Gemini            Meta / Mercado Pago
              (default),              (API key via            (disabled until
         southamerica-east1           Secret Manager)        credentials are set)
```

## 3. Component inventory

| Component | Where | Identifier / URL |
|---|---|---|
| Frontend | Firebase Hosting | https://titular-53a66.web.app |
| Backend API | Cloud Run, region `southamerica-east1` | https://titular-api-1066302344862.southamerica-east1.run.app |
| Current backend revision | Cloud Run | `titular-api-00003-zgj` (100% traffic) |
| Database | Firestore `(default)`, `southamerica-east1` | project `titular-53a66` (number 1066302344862) |
| Gemini API key | Secret Manager secret `GEMINI_API_KEY` | accessor: only `titular-api` SA |
| Runtime identity | Service account | `titular-api@titular-53a66.iam.gserviceaccount.com` — `roles/datastore.user` + per-secret `secretmanager.secretAccessor` |
| Billing | GCP billing account `0127FF-F9FA36-CB1FC9` | linked to the project |
| Source code | GitHub | `FabioDenis/Plataforma-Titular`, branch `main` |
| Admin account | `ADMIN_EMAILS=titular.mis@gmail.com` | register/log in with that email → Admin button |

## 4. Day-to-day operations

### 4.1 Publish a frontend change

```bash
cd C:/Users/USER/Desktop/Titular
npm run build:frontend
npx firebase deploy --only hosting --project titular-53a66
```
Takes ~30 seconds. Rollback: `npx firebase hosting:rollback`.

### 4.2 Publish a backend change

```bash
gcloud run deploy titular-api \
  --project titular-53a66 --source . --region southamerica-east1 \
  --service-account titular-api@titular-53a66.iam.gserviceaccount.com \
  --allow-unauthenticated --max-instances 1 --quiet
```
Each deploy creates a new revision with automatic traffic switch.

### 4.3 Rollback

```bash
# Backend: list revisions, then send traffic back
gcloud run revisions list --service titular-api --project titular-53a66 --region southamerica-east1
gcloud run services update-traffic titular-api \
  --project titular-53a66 --region southamerica-east1 \
  --to-revisions <PREVIOUS_REVISION>=100

# Frontend
npx firebase hosting:rollback
```

### 4.4 Logs and monitoring

- Live logs: https://console.cloud.google.com/logs → filter `resource.labels.service_name=titular-api`
- Request-level 4xx/5xx appear as ERROR entries (normal noise from bots/tests).
- Crash-pattern to watch for: repeated ERROR + revision restarts → check startup
  secrets (`validateServerStartupEnv` exits the container if required secrets are
  missing).

### 4.5 Users and admin

- New users self-register from the app; first login bootstraps user + organization
  (trial: 10 publications, server-side, idempotent).
- Promote an admin: panel Admin → toggle admin (sets `users/{uid}.role` in Firestore),
  or add the email to the `ADMIN_EMAILS` Cloud Run env var:
  ```bash
  gcloud run services update titular-api --project titular-53a66 \
    --region southamerica-east1 --update-env-vars "ADMIN_EMAILS=<email>"
  ```
- Adjust trial/plan limits: `TRIAL_PUBLICATIONS` and `PLAN_*` env vars (see
  `docs/deployment.md` §5.2), then redeploy the revision.

### 4.6 Cost expectations

Cloud Run scales to zero (no traffic → no charge). At current usage the monthly
cost is expected to be negligible; the main variable cost is Gemini usage driven
by real generations.

## 5. Enabling the disabled integrations (when ready)

Current state was deployed with Meta/Mercado Pago **unconfigured** (the server
treats missing integration env vars as "integration disabled" and boots fine).

To enable:

1. Obtain credentials:
   - Mercado Pago: `MERCADOPAGO_ACCESS_TOKEN` + `MERCADOPAGO_WEBHOOK_SECRET`
     (developers panel → your app → credentials / webhook secret).
   - Meta: `META_APP_ID` + `META_APP_SECRET` (developers.facebook.com → app →
     Settings → Basic). `META_TOKEN_ENCRYPTION_KEY` is self-generated (random
     secret) and used to encrypt stored page tokens.
2. Create each secret (values entered interactively, never in chat/Git):
   ```bash
   for s in MERCADOPAGO_ACCESS_TOKEN MERCADOPAGO_WEBHOOK_SECRET META_APP_SECRET META_TOKEN_ENCRYPTION_KEY META_APP_ID; do
     printf "Value for %s: " "$s" && read -s V && printf '%s' "$V" | \
       gcloud secrets create "$s" --project titular-53a66 --data-file=- \
       --replication-policy=automatic && unset V
   done
   ```
3. Grant access and redeploy with the new bindings:
   ```bash
   SA="serviceAccount:titular-api@titular-53a66.iam.gserviceaccount.com"
   for s in MERCADOPAGO_ACCESS_TOKEN MERCADOPAGO_WEBHOOK_SECRET META_APP_SECRET META_TOKEN_ENCRYPTION_KEY META_APP_ID; do
     gcloud secrets add-iam-policy-binding "$s" --project titular-53a66 \
       --member "$SA" --role roles/secretmanager.secretAccessor
   done
   gcloud run deploy titular-api --project titular-53a66 --region southamerica-east1 \
     --service-account "$SA" --allow-unauthenticated --max-instances 1 --quiet \
     --set-env-vars "NODE_ENV=production,APP_URL=https://titular.com.ar,FIRESTORE_DATABASE_ID=(default),MERCADOPAGO_REQUIRE_SIGNATURE=true" \
     --set-secrets "GEMINI_API_KEY=GEMINI_API_KEY:latest,MERCADOPAGO_ACCESS_TOKEN=MERCADOPAGO_ACCESS_TOKEN:latest,MERCADOPAGO_WEBHOOK_SECRET=MERCADOPAGO_WEBHOOK_SECRET:latest,META_APP_SECRET=META_APP_SECRET:latest,META_TOKEN_ENCRYPTION_KEY=META_TOKEN_ENCRYPTION_KEY:latest"
   ```
4. After the custom domain is live, configure webhook/redirect URLs in the
   Mercado Pago and Meta dashboards (see `docs/deployment.md` §9).

## 6. Custom domain (pending)

1. Firebase Console → Hosting → Add custom domain → `titular.com.ar`.
2. Add the DNS records shown by Firebase at the domain registrar.
3. Wait for the TLS certificate to be issued (minutes to hours).
4. `APP_URL` is already `https://titular.com.ar` in Cloud Run — nothing else to
   change in the backend.

## 7. Known issues / pending work

| Item | Notes |
|---|---|
| Pre-existing concurrency bug in AI reservation dedup | Under concurrent same-key requests the reservation ledger does not dedupe (10 provider calls instead of 1). Fails identically on the initial commit — not introduced by deployment work. Fix pending in `server/ai-generations.ts`. |
| `firestore.rules` hardcoded admin email | Rules reference `delgado122016@gmail.com`; production admin is now `titular.mis@gmail.com`. Only affects direct client-side writes — the admin panel works through the server (Admin SDK). Rules update is a separate approved change. |
| Rate limiting | `/api/extract` (and other public endpoints) have no rate limiting. |
| Frontend bundle size | Main JS chunk ~1.13 MB (>500 kB Vite warning). Code-splitting candidate. |
| Billing error messages | Some billing errors return generic text after the security sanitization; restoring specific user-facing messages requires backfilling `userMessage` on `server/mercadopago.ts` throw sites. |
| First `docker build` | Never run locally (no Docker). Cloud Build performed it successfully during deploy. |

## 8. Security posture (summary)

- No secrets in Git, in the container image, or in the frontend bundle.
- Backend uses Application Default Credentials (the Cloud Run service account) —
  no service account JSON exists in production.
- Private endpoints verify Firebase ID tokens; admin endpoints enforce the admin
  check (ADMIN_EMAILS / user role).
- Endpoint hardening applied: SSRF guard on `proxy-image`, HTML escaping on the
  OAuth callback, organization authorization on publish/retry, client-safe error
  messages, timing-safe HMAC comparisons.
- `firebase.json` + `.firebaserc` pin deploys to project `titular-53a66`.
