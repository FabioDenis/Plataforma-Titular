# Launch Checklist — Titular Studio a Producción

Estado al 2026-09-16, basado en verificación real (Cloud Run `titular-api`,
Firebase Hosting `titular-53a66`, reglas de Firestore desplegadas, bundle en vivo).

## 🔴 Bloqueantes (sin esto, algo central está roto)

- [ ] **B1. Deploy del frontend a Hosting.** Producción sirve el bundle
      `index-B9uew5I7.js` (sin el editor nuevo, sin handoff IG/FB, sin publicar
      directo). Local ya compilado: `index-D2aua7uG.js`.
      Fix: `firebase deploy --only hosting`.
- [ ] **B2. Credenciales MercadoPago en Cloud Run.** Faltan
      `MERCADOPAGO_ACCESS_TOKEN` y `MERCADOPAGO_WEBHOOK_SECRET` (único secret
      existente: `GEMINI_API_KEY`). Sin esto no hay checkout ni webhooks firmados.
      Fix: `gcloud secrets create` + deploy del servicio.
- [x] ~~**B3. Credenciales Meta en Cloud Run.**~~ Ya no bloquea (2026-10-28):
      la publicación directa se quitó de la UI y el flujo es manual. Pasa a
      post-lanzamiento si se reactiva la publicación directa.
      Detalle original: faltan `META_APP_ID`,
      `META_APP_SECRET`, `META_TOKEN_ENCRYPTION_KEY` y `META_REDIRECT_URI`
      (o APP_URL válida). Sin esto no se pueden conectar cuentas → ni
      publicación directa ni handoff con cuentas reales. Además la app de Meta
      necesita modo producción con permisos aprobados
      (`pages_manage_posts`, `pages_read_engagement`, `instagram_content_publish`)
      e Instagram Business/Creator vinculado a la página.
- [x] **B4. Admin inconsistente.** Corregido en código (2026-10-28): las reglas
      ya no hardcodean emails; un admin es `users/{uid}.isAdmin == true` o
      `role in ['admin','superadmin']`, campos que solo escribe el servidor.
      Toda acción de admin pasa por `/api/admin/*` (Admin SDK + `ADMIN_EMAILS`).
- [ ] **B6. Desplegar reglas de Firestore y auditar admins existentes.**
      Hasta 2026-10-28 cualquier usuario podía autoasignarse admin, crear
      organizaciones con créditos arbitrarios, bajar su `publicationUsed` y
      apuntar su perfil a otra organización. Fix en `firestore.rules` y
      `resolveAuthorizedOrganizationId`. Pasos:
      `firebase deploy --only firestore:rules` + deploy de `titular-api`, y
      revisar en Firestore que ningún `users` tenga `isAdmin`/`role: admin`
      ni organizaciones con `publicationLimit` anómalo que no correspondan.
- [ ] **B5. Dominio canónico roto.** `titular.com.ar` (la APP_URL configurada en
      Cloud Run) redirige 301 a `titulares.ar`, que sirve **otro sitio legacy**,
      no la SPA. La app real vive en `titular-53a66.web.app`.
      Decidir dominio final → adjuntar custom domain a Hosting → actualizar
      APP_URL, dominios autorizados de Firebase Auth, redirect URIs de Meta y
      MercadoPago.

## 🟡 Importantes antes de abrir al público

- [x] **S1. Aislamiento multi-tenant en reglas.** Corregido en código
      (2026-10-28): organizaciones y subcolecciones solo legibles por
      `ownerUid`/`members` o admin; el cliente solo edita `name`, `logoUrl` y
      `activeOfficialTemplate*`. Cubierto por
      `server/firestore-rules.emulator.test.ts`. Requiere B6 (deploy).
      Los endpoints `/api/meta/*` ahora exigen `canAccessOrganization`
      (dueño, miembro o admin de plataforma); antes el rol `owner`, que todos
      reciben, daba acceso a cualquier organización.
- [ ] **S2. Suite de tests completa en limpio** (`npm run test` con emuladores:
      unit + emulator para ai-generations y auth-bootstrap).
- [ ] **S3. E2E en producción:** registro → bootstrap → identidad → procesar
      noticia → editor → publicar/handoff → consumo de publicaciones.
- [ ] **S4. Pagos end-to-end:** con tarjetas de prueba de MercadoPago (alta de
      plan, compra de pack, baja, webhook firmado rechazando payload inválido).
- [ ] **S5. Monitoreo:** alertas Cloud Monitoring (5xx, latencia p95) sobre
      `titular-api` + Error Reporting activo.
- [ ] **S6. Presupuestos y cuotas GCP:** billing alert + cuota de Gemini
      revisada (ya hubo RESOURCE_EXHAUSTED por créditos agotados).
- [ ] **S7. Backups Firestore:** scheduled backups habilitados.

- [ ] **S8. Quitar un admin en dos pasos.** Las reglas reconocen admins por
      `users/{uid}.isAdmin`, que el servidor sincroniza desde `ADMIN_EMAILS` pero
      nunca borra solo. Para revocar: sacar el email de `ADMIN_EMAILS` **y** usar
      "Quitar rol Admin" en el panel.

## 🟢 Post-lanzamiento (nice to have)

- [ ] CI en GitHub Actions: lint + tests por PR (hoy no hay `.github`).
- [ ] Code splitting del bundle (1.15 MB, warning de Vite).
- [ ] Sync del caption editado en `CaptionsTabs` hacia handoff y publish.
- [ ] Firebase App Check (abuse protection sobre API abiertas a autenticados).
- [ ] `/api/config`: nadie lo consume; completar sus env o eliminarlo.
- [ ] Revisar envs opcionales en Cloud Run (MAX_ARTICLE_INPUT_CHARS, PLAN_*,
      PACK_*, MERCADOPAGO_REQUIRE_SIGNATURE) — hoy usan defaults del código.

## Evidencia

- Env de Cloud Run (completo): NODE_ENV, APP_URL, FIRESTORE_DATABASE_ID,
  ADMIN_EMAILS, TRIAL_PUBLICATIONS, GEMINI_API_KEY (secret). Nada más.
- Bundle en producción: `index-B9uew5I7.js`; build local actual:
  `index-D2aua7uG.js`.
- `requireServerEnv` obligatorias en código: APP_URL, GEMINI_API_KEY,
  MERCADOPAGO_ACCESS_TOKEN, MERCADOPAGO_WEBHOOK_SECRET, META_APP_ID,
  META_APP_SECRET (+META_TOKEN_ENCRYPTION_KEY/META_REDIRECT_URI si Meta está
  configurada, según `server/config/env.ts`).
- DNS: titular.com.ar →301→ titulares.ar (HTML legacy con comentarios IE, no es
  la SPA; `/api/config` vacío ahí).
- `/api/config` del backend no tiene consumidores en `src/`.
- Queries server-side: sin índices compuestos requeridos (subcolección +
  orderBy single-field).
