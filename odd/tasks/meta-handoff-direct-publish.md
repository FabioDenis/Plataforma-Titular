# Feature: Meta Handoff & Direct Publish from Generator Results

Goal: after processing a news item, the user can (a) publish directly to Facebook/Instagram
feed or story via the existing Meta Graph API pipeline, and (b) hand off manually
(download PNG in the active format + copy caption + open the platform's upload flow).

Chosen approach: BOTH flows (Option C). Direct API when accounts are connected;
manual handoff always available as fallback.

## Context (explored)

- `src/components/PublishSection.tsx` — full approval -> publish UI (feed/story, FB/IG
  targets, captions, retry, history). Currently ORPHANED: no component mounts it.
  Props: posts, article, branding, activeFormat('feed'|'story'), renderedCardDataUrl,
  onOpenSocialSettings. Uses `useMetaAccounts` internally; server pipeline at
  `/api/meta/publish` (executeMultiPlatformPublish) is complete.
- `src/components/VisualCardPreview.tsx` — renders the processed news card in
  HERMES_CARD_FORMATS (instagram-feed 1080x1350, instagram-story 1080x1920,
  facebook-feed, square). Owns `selectedFormat` state + `cardRef` +
  `handleDownloadPNG` (exportCardToExactPng). Needs to expose export + format change.
- `src/components/CaptionsTabs.tsx` — IG/FB captions (local state only).
- `src/App.tsx` — 'generator' view results area: ExtractedArticleCard,
  VisualCardPreview, CaptionsTabs, HashtagsAndMetadata. Views: generator/identity/social.

## Tasks

- [x] T1. VisualCardPreview: refactor PNG export into reusable `exportCurrentCard()`
      (same logic as handleDownloadPNG, returns dataUrl). Register it upward via new
      optional prop `onRegisterCardExporter(fn | null)`. Emit format changes via new
      optional prop `onActiveFormatChange(format: HermesCardFormat)`.
- [x] T2. PublishSection: accept optional `resolveCardImage?: () => Promise<string|null|undefined>`;
      in handlePublishNow use it before fallbacks. Keep renderedCardDataUrl prop intact.
- [x] T3. New `src/components/SocialHandoffSection.tsx`: buttons "Llevar a Instagram" /
      "Llevar a Facebook": exports current card PNG (auto-download), copies active
      caption to clipboard, opens platform (IG mobile deep link instagram://story-camera
      when story format + mobile UA; else web), shows step toast.
- [x] T4. App.tsx: hold exporter ref + active format state; mount SocialHandoffSection
      and PublishSection in the generator results area; onOpenSocialSettings -> social view.
- [x] T5. Verify: `npm run lint` (tsc --noEmit) passes; `npm run build:frontend` succeeds.

## Checks

- lint (tsc --noEmit) after each task; build at the end.
- No changes to server pipeline (already complete).

## Non-goals (v1)

- Live caption sync between CaptionsTabs edits and handoff copy (handoff copies the
  generated caption; noted in UI).
- Scheduled publishing UI, FB story mobile deep link (flaky; use web).

## Iteration 2 (user feedback, same feature)

User rejected the standalone panels below the processed news. New UX (desktop-first,
direct API kept):

- [x] T6. Handoff buttons (Instagram/Facebook) inside the editor toolbar next to
      "Descargar PNG". Desktop: export -> auto-download -> caption to clipboard ->
      open platform. Mobile: Web Share API with the file pre-attached when available
      (navigator.share/canShare), fallback to download flow. Inline status/warning
      messages, no separate section.
- [x] T7. Direct publish moved into a modal opened from a "Publicar directo" button
      in the editor toolbar (PublishSection rendered inside, activeFormat mapped
      feed|story, onOpenSocialSettings wired to social view).
- [x] T8. Removed SocialHandoffSection.tsx and all App.tsx glue (exporter ref,
      format state). Verified: lint + build pass.

## Iteration 3 (UX polish: single entry point)

User feedback: no toolbar clutter, keep the platform aesthetic, make publishing
intuitive. Result:

- [x] T9. Consolidated all publish paths behind ONE primary "Publicar" button
      (chevron menu): Instagram row, Facebook row (handoff with hints), divider,
      "Publicación directa" row (opens the PublishSection modal). Menu shows the
      active format badge (e.g. Story 9:16). Click-away layer closes it.
- [x] T10. "Descargar PNG" demoted to an icon-only secondary button with tooltip.
- [x] Verified: lint + build pass.
