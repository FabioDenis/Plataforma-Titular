# Newsroom seat limit and team manager

Objective: the platform admin gives each newsroom a seat limit and a manager account; the manager invites and removes the accounts of that newsroom up to the limit, while the platform admin keeps full control.
Branch: `fix/outbound-fetch-hardening` (pushed; new commits on top) · Delivery: ask-on-risk · Runner: `npm run test:unit`, `npm run test:emulator`, `npm run lint`, `npm run build:frontend`.

## Specs

- S1. Seat limit. User: "yo como admin del sistema puedo crear un medio y darle un numero de cuentas a asociar". The platform admin sets the limit when creating the newsroom and can change it at any time. Agreed defaults ("si"): the limit counts "el responsable, las cuentas activas y las invitaciones pendientes. Una invitación reserva un lugar hasta que la quites"; "Si bajás el cupo por debajo de lo que ya hay: no se echa a nadie, solo se bloquean altas nuevas hasta que quede lugar"; "Medios que ya existen: quedan sin cupo hasta que les pongas uno"; "Vos podés pasarte del cupo: el límite frena al responsable".
- S2. Manager. "Elegís quién es el responsable del medio." "En su app ve 'Equipo: 3 de 5 cuentas' y puede invitar y quitar cuentas de su medio hasta llenar el cupo." "No puede cambiar el cupo, ni el estado del medio, ni quitarse a sí mismo." "Medio suspendido: el responsable no puede gestionar el equipo."
- S3. Safety (from the agreed design: "solo de su medio", "límite de invitaciones por hora", "registro de quién invitó a quién"). The manager can only act on its own newsroom; it cannot pull an account that belongs to, or is invited to, another newsroom; invitations by a manager are rate limited per hour; invites record who sent them.
- S4. Platform admin keeps everything it has today (add/remove accounts, lifecycle, enter/exit) and is never blocked by the seat limit.

Assumption (not asked): the manager role is stored as `organizations/{id}.managerUid`, not in `users.role`, because `role: 'admin'` already means platform admin.

## Tasks

- [x] T1 · S1, S2, S3, S4 · inline · server: seat limit, manager, enforcement, admin and team endpoints · `545d563` (RED 24/24 failing, GREEN 24/24; emulator 97/97)
- [x] T2 · S1, S2 · inline · client: admin panel (limit, manager), team screen for the manager · `33b6a04` (RED helper module missing, GREEN 3/3; lint and build OK; browser check pending)
- [x] T3 · all · delegated verifier · independent verification (risk item 2: permissions) · no blockers; native review approved and acknowledged
- [x] T4 · S3 · inline · follow-ups from verifier and review: unused personal newsroom counts as free, platform admins cannot be added by a manager, older suspended spellings, only successful invites count toward the hourly limit (RED 4, GREEN; unit 62/62, emulator 103/103)

## Log

- L1 (2026-11-14) User: "me recomendas que al dar de alta un medio le dee la potestad a la cuenta del admin de ese medio a agregar y quitar los correos asociados al medio?" then "claro lo que pense es yo como admin del sistema puedo crear un medio y darle un numero de cuentas a asociar," then "si" to the defaults listed in S1-S2.
- L2 Map: managed newsrooms have `ownerUid: ''`; every user gets `role: 'owner'`; all membership routes are platform-admin only; Firestore rules already keep `members` and any new limit field server-only.
- L3 Route: inline, no writer trigger. High risk (item 2: permissions) → independent verifier at the end.
- L4 One emulator run showed `concurrent bootstrap calls converge on one account and one free trial allocation` failing; two reruns passed 97/97 and the test does not touch the changed code. Treated as flaky, not fixed here.
- L5 (2026-11-14) User: "si" to the follow-up commit (personal newsroom counted as free, suspended spellings, only successful invites count). Added: platform admin accounts are never added by a manager, because the personal-newsroom change would otherwise let a manager pull one.
