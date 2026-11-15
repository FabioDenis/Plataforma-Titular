# Managed newsrooms (flat fee, single AI balance)

Objective: Titular is sold at a flat fee; the platform admin creates and prepares newsrooms, activates them, adds client accounts by invitation, and tracks AI consumption per newsroom. No per-newsroom credits.
Branch: `feat/managed-newsrooms` · Delivery: ask-on-risk · Runner: `npm run test` (node:test + Firestore emulator), `npm run lint`, `npm run build`.

## Specs

- S1. Single AI balance. User: "todas las request van a gemini, sea del perfil q sea , osea hay una unica fuente de creditos, no es que le habilito cierta cantidad a cada medio o cuenta, yo tengo q encargare de siempre tener saldo". Generation is never blocked by a per-newsroom credit limit; usage is still recorded. No credit counters, balances or purchase flows in the UI for anyone.
- S2. Newsroom lifecycle. User: "el panel sirva para dar de alta medios digitales, editar su identidad y luego dar de alta el medio, una vez hecho esto puedo agregar cuentas al medio". States: in preparation (draft), active, suspended. Only active newsrooms can generate; draft and suspended newsrooms get a clear message. Admin creates (draft), edits identity/templates, activates, suspends and reactivates.
- S3. Shared newsroom. User: "cada cuenta ingresa y ve la misma identidad, historial etc, siempre yu cuando esteen asociadas a la misma". (Already delivered; must keep working.)
- S4. Consumption per newsroom. User: "en este panel me gustaria poder ver el consumo de cada medio, asi tengo un registro de que medio gasta mas que el otro". Admin panel lists newsrooms with status, accounts, generations this month, tokens, estimated cost and last activity, sortable by consumption; each newsroom shows month-by-month history.
- S5 (agreed in chat: "me cierra si, hazlo"). Invitation-only access. Public sign-up is closed; the admin adds an email to a newsroom, the account is created server-side and the person receives an email link to set their password, then lands in that newsroom. Accounts without a newsroom cannot generate.
- S6 (agreed). Safety cap: a per-newsroom daily generation cap (default 200, configurable) protects the shared AI balance from runaway use without affecting normal use.
- S7 (agreed). Admin-panel organized by newsroom (not by user): list of newsrooms; per newsroom: Team, Identity & templates, Consumption, lifecycle actions.

## Tasks

- T1 [S1,S2,S6] Server: remove per-newsroom credit enforcement; lifecycle + no-organization guard on every AI operation; daily cap on posts; error mapping; tests. Route: inline. Status: done (4 RED->GREEN; flaky limit test replaced by deterministic daily-cap test).
- T2 [S2,S4,S7] Server: admin newsroom list with consumption, per-newsroom monthly usage, lifecycle endpoint; managed newsrooms start as draft; tests. Route: inline. Status: done (6 tests; list sorted by monthly consumption, statusEvents audit trail).
- T3 [S5] Server + client: invitation-only accounts (server creates the Auth user and attaches it; admin UI sends the set-password email; public sign-up removed from UI; bootstrap no longer creates trial newsrooms for unknown accounts); tests. Route: inline. Status: done (2 RED->GREEN; client: tsc + build). Needs IAM roles/firebaseauth.admin for createUser.
- T4 [S1,S4,S7] Client: newsroom-centric admin panel; remove every credit/billing UI. Route: inline. Status: done (tsc + build; no client test runner).
- T5 [S4] Gemini pricing table so estimated cost is filled (needs verified current prices). Route: inline. Status: done (official prices 2026-10-28, dated schedule incl. 2027 increase, GEMINI_PRICING_JSON override; 2 RED->GREEN).

## Log

- L1 (2026-10-29) User: "todas las request van a gemini, sea del perfil q sea , osea hay una unica fuente de creditos, no es que le habilito cierta cantidad a cada medio o cuenta, yo tengo q encargare de siempre tener saldo, lo que quiero es que el panel sirva para dar de alta medios digitales, editar su identidad y luego dar de alta el medio, una vez hecho esto puedo agregar cuentas al medio, que pasaria con esto, cada cuenta ingresa y ve la misma identidad, historial etc, siempre yu cuando esteen asociadas a la misma, en este panel me gustaria poder ver el consumo de cada medio, asi tengo un registro de que medio gasta mas que el otro, quiero q teniendo como base esto, me digas que opina asi ya formalizamos todo y queda un producto claro y bien hecho"
- L2 (2026-10-29) User approved the proposal (lifecycle, invitation-only, daily cap, newsroom-centric panel): "me cierra si, hazlo".
- L3 Evidence: per-newsroom limit enforced at `server/ai-generations.ts:122-126` (3 by default) would pause every newsroom after 3 posts; monthly usage already aggregated at `organizations/{orgId}/aiUsageMonthly/{YYYY-MM}`; `GEMINI_PRICING` is empty (`server/gemini.ts:63`), so cost is null.
- L4 Invitation-only needs the Cloud Run service account to create Auth users (`roles/firebaseauth.admin`; today `roles/firebaseauth.viewer`) — IAM change the user must run.
- L5 Engram MCP disconnected during this feature: Engram mirror pending (local document is the source of truth).
- L6 (2026-10-30) Independent verifier: no blockers (S5 partial pending console step B7.2). Native review (4 lenses) approved and acknowledged (lineage review-79208eb2402bb98f). Fixed advisories: distinct pricing versions per period, invalid GEMINI_PRICING_JSON ignored, account-creation failures (email-already-exists race, missing IAM) handled. Open decision: legacy self-signup newsrooms are active (status Activa) and now uncapped by credits.
