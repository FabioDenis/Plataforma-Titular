# Pre-launch code fixes

Objective: fix the five code defects found by the branch reviews that should not reach launch.
Branch: `fix/outbound-fetch-hardening` · Delivery: ask-on-risk · Runner: `npm run test:unit`, `npm run test:emulator`, `npm run lint`, `npm run build:frontend`.

## Specs

- S1. Invitations. Plan accepted with "si": "si falla el alta, borro la cuenta recién creada (nadie la usó todavía) y devuelvo un error propio, `MEMBERSHIP_UNAVAILABLE`, para que el admin pueda reintentar limpio. Si el borrado también falla, lo logueo con el uid para limpiarlo a mano." A MembershipError raised while linking (for example the newsroom disappeared) keeps its own code, and the created account is removed too.
- S2. Admin panel. "un error al cargar el consumo" shows "No se pudo cargar el consumo" with a **Reintentar** button instead of the empty-history message; the header total shows the sum marked as partial ("US$ 12,40 · 2 medios sin precio") when some newsrooms have no price; a slow response for a previous month never replaces the list of the selected month.
- S3. Image proxy. "cuando el tipo falta o es genérico, miro los primeros bytes de la respuesta para reconocer el formato (JPEG, PNG, GIF, WebP o AVIF) y la sirvo con el tipo correcto. Cualquier otra cosa sigue dando 415". Add `Content-Security-Policy: sandbox` to proxy responses.
- S4. Redirects. The default redirect limit goes from 3 to 5; every hop is still validated.
- S5. Decompression. Tests for gzip, brotli and deflate round trips, raw deflate, an empty gzip body and a decompression bomb cut at `maxBytes`; raw deflate is decoded with `inflateRaw` and an empty encoded body is not decoded.

## Tasks

- [ ] T1 · S1 · inline · invitations rollback
- [ ] T2 · S2 · inline · admin panel numbers
- [ ] T3 · S3 · inline · proxy image sniffing
- [ ] T4 · S4, S5 · inline · safe-fetch redirects and decoding

## Log

- L1 (2026-11-14) User: "si, que cambios harias y como funcionaria?" then "si" to the five-fix plan (invitations, admin panel, image proxy, redirects, decompression), one commit per fix on this branch, no push.
- L2 Route: inline for all tasks (no writer trigger: units are small and sequential). T1 touches account creation (risk item 2) and gets an independent verifier.
