# Shared organizations (team accounts)

Objective: per-organization workspace in Firestore (no cross-account leaks) and admin-managed members sharing one medio.
Branch: `feat/shared-organizations` · Delivery: ask-on-risk · Runner: `npm run test` (node:test + Firestore emulator), `npm run lint`.

## Specs

- S1. Tenant isolation of workspace data. User: "al ingresar una cuenta de titular tengo q acceder a los datos solo de esa cuenta, osea identidad, historial etc, recien ingrese a una cuenta y me salio la identidad de otra, verifica bien esto, no tiene q suceder son tenants distintos osea cuentas con info diferentes una de otra que no deben cruzarse". Identity, branding, active identity and history live in Firestore under `organizations/{orgId}` and are never read from shared browser storage.
- S2. Shared medio. User: "se puede hacer que varios usuarios compartan una misma identidad, es decir que con distintos correos puedan abrir la plataforma teniendo la plantilla e identidad guardada, para casos de clientes que tengan un noticiero con varios usuarios y que necesiten usar la plataforma al mismo tiempo". All members of an organization see the same identity, templates, history and credits, live.
- S3. Admin-managed membership. User: "crendo un medio y yo como admin puedo agregar cuentas asociadas a ese medio, lo quele permitiria a cada cuenta tener la misma identidad, plantillas del medio vinculado". Platform admin adds accounts by email and removes them from the admin panel. Removed accounts lose access immediately.
- S4. "si yo quiero trabajar con 5 personas a la vez, con 5 correos distintos, pero todos en un solo medio, lo prodria hacer sin problema?" — concurrent members are supported; credits are consumed from the shared organization balance by the existing transactional reservation.
- S5 (assumption, agreed in chat). Membership only applies to accounts with a verified email; unverified or not-yet-registered emails stay as a pending invite accepted on first verified sign-in.
- S7. Credits hidden from clients. User: "en cuanto a los creditos, nostros nos vamos a encargar de eso, osea que los clientes no tendrian q ver cuantas generaciones le quedan o algo asi, nosotros nos vamos a encargar de que siempre existan creditos disponibles, ya que van a pagarnos un precio estandar sin tener en cuenta generaciones a realizar". Assumption: the server keeps counting and enforcing the organization balance (admin tops it up); non-admin UI shows no counters or purchase flow, and an exhausted balance shows a contact-support message.
- S6 (assumption). Legacy global browser keys (`newsflow_ai_*`) are not migrated to any account (their owner is unknown) and are removed from the browser.

## Tasks

- T1 [S2,S3,S5] Server: membership (add/remove/list, invites, bootstrap for members, verified email) + admin endpoints + tests. Route: inline. Status: done, 225c6a7 (9 membership + 2 rules tests green).
- T2 [S1,S2,S5,S6] Rules + client workspace (identities/history subcollections, org branding/activeIdentityId, templates on identity, legacy keys cleared) + sign-in sync and email verification. Route: inline. Status: done (2 rules tests RED->GREEN; client has no test runner: tsc + build).
- T4 [S7] Hide credit counters and purchase entry points for non-admin users. Route: inline. Status: pending.
- T3 [S3] Admin panel UI: members section per organization. Route: inline. Status: pending.

## Log

- L1 (2026-10-28) User request: "verifica lo siguiente, al ingresar una cuenta de titular tengo q acceder a los datos solo de esa cuenta, osea identidad, historial etc, recien ingrese a una cuenta y me salio la identidad de otra, verifica bien esto, no tiene q suceder son tenants distintos osea cuentas con info diferentes una de otra que no deben cruzarse"
- L2 Root cause verified: `src/App.tsx` stores identities/branding/history/active identity in global `localStorage` keys; no per-user scoping, no cleanup on logout.
- L3 User chose Firestore per organization + admin-managed members ("si hacelo").
- L4 Security baseline committed: ff8af75.
- L5 (2026-10-28) User: "en cuanto a los creditos, nostros nos vamos a encargar de eso, osea que los clientes no tendrian q ver cuantas generaciones le quedan o algo asi, nosotros nos vamos a encargar de que siempre existan creditos disponibles, ya que van a pagarnos un precio estandar sin tener en cuenta generaciones a realizar" -> added S7/T4.
