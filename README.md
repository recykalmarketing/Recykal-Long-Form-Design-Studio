# Long Form Design Studio — Recykal

Native internal AI design platform for the Recykal Marketing Team. Gamma is a product/UX benchmark only; this application has no Gamma API dependency.

## Release
`1.1.0-rc1` — pre-publish release candidate with progressive generation and dual PDF production profiles.

## Core studios
- **Document** — unlimited-length continuous documents, reports, ebooks, research papers, policy handbooks and annual reports.
- **Presentation** — editable slide-based decks, proposals, pitches and executive presentations.
- **Graphic** — editable branded infographics and campaign/static graphics.

## Inputs
Generate from a prompt or **Upload & Design** from PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX and CSV. Source-aware modes: Preserve, Improve, Condense, Research + Expand.

## Visual intelligence
- Recykal-only theme system and Poppins-based brand system.
- Layout directions: Auto, Minimal, Visual, Classic, Consultant.
- Image sources: AI, approved/Recykal source assets, rights-aware Openverse stock, mixed, placeholder, none.
- Art-direction library plus custom style instructions and up to four reference/moodboard images.
- 1–3 image alternatives, smart focal point, Fit/Fill, upload/drag-drop in-place replacement.
- Semantic vector icons, charts, tables, timelines, processes, comparisons, stat dashboards and image-led pages.
- Cover-only logo by default; project master header/footer/page numbers update globally.

## Editorial intelligence
The runtime design rules are derived from the supplied Design Bot Knowledge Base and Recykal brand guideline. The engine prioritizes correctness, comprehension, hierarchy, accessibility, consistency and production accuracy before decoration. It uses content roles and page rhythm rather than repeating one template.

## Progressive generation
- The create workflow streams generation progress instead of keeping the user on a waiting screen.
- Completed document pages or presentation slides appear immediately in a live thumbnail rail and full preview canvas.
- Users can inspect earlier pages/slides while later ones are still being composed.
- Layout balancing, visual materialization, QC and auto-correction are surfaced as explicit stages.
- The preview is working-state content; bounded QC/visual corrections may still occur before final save.

## Quality and publishing
- 85/100 quality gate with content fidelity, hierarchy, legibility, consistency, accessibility, UX clarity, visual craft and export checks.
- Review exports remain available below threshold and are marked DRAFT/QC REVIEW.
- Final export also passes rendered-file preflight for clipping, overflow and visual defects.
- **Digital PDF**: standard-size RGB export, screen/email/web optimized, no production marks.
- **Print PDF**: CMYK prepress conversion, embedded-font checks, raster effective-resolution checks and rendered visual preflight. No bleed, TrimBox/BleedBox, or crop marks are added in the current release.
- Print raster rules: below 180 ppi blocks a final print export; 180–299 ppi warns; 300 ppi+ is preferred.
- A printer-specific CMYK ICC profile can be provided with `PRINT_ICC_PROFILE`. If omitted, the container uses Ghostscript's generic CMYK profile when available. This build does not claim certified PDF/X without a printer-specific workflow/validation.
- Optional Approver sign-off can be required for final delivery using `REQUIRE_APPROVER_FOR_FINAL_EXPORT=true`.

## Collaboration and enterprise integrations
Implemented in this release candidate:
- WebSocket presence, selected-page/block presence and live project-update broadcasts.
- Optimistic concurrency; stale saves return/restore the latest server revision instead of silently overwriting a teammate.
- Persistent threaded comments with resolve/reopen.
- Workflow roles: Viewer, Creator, Reviewer, Approver, Admin; page locking and approval metadata.
- Google OIDC SSO and Microsoft Entra OIDC SSO (enabled only when credentials are configured).
- SCIM 2.0 user provisioning endpoints.
- Durable Postgres-backed asset/media store; uploaded originals, extracted source aggregates, generated images, approved media and style references survive Render restarts. Immutable cache headers make the media endpoints CDN/proxy friendly.
- Rights-aware Openverse image search/import with creator/license/provenance metadata and automatic attribution treatment in exported visual frames when needed.
- Localization/translation + QA for English, German, French, Spanish, Polish, Hindi, Telugu and Arabic; Docker includes Noto script fonts for non-Latin exports.
- Secure read-only share links, expiration/revocation, optional approved-download permission, page-view/dwell analytics and engagement heatmap.
- Semantic version comparison/checkpoints/restore.
- Stable `/api/v1` automation API with scoped API keys.
- Signed HMAC outgoing webhooks with private-network SSRF protection.

## Security defaults
- OpenAI keys remain server-side.
- API keys are limited to `/api/v1` and do not inherit Admin privileges.
- Corporate email domains can be restricted with `ALLOWED_EMAIL_DOMAINS`.
- OAuth flow uses state, nonce and PKCE.
- Session cookies are HttpOnly, SameSite=Lax and Secure in production.
- Helmet, CORS allow-list support and rate limiting are enabled.
- Webhook targets cannot resolve to private/internal addresses unless explicitly enabled.

## Required Render configuration
At minimum:
- `OPENAI_API_KEY`
- `APP_ACCESS_CODE` while SSO is not configured
- `DATABASE_URL` (created by the supplied `render.yaml` Blueprint)

`render.yaml` also generates an `AUTH_SECRET` automatically.

### Optional Google SSO
Set:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `PUBLIC_BASE_URL=https://recykal-long-form-design-studio.onrender.com`

Authorized callback:
`https://recykal-long-form-design-studio.onrender.com/auth/callback/google`

### Optional Microsoft Entra SSO
Set:
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `MICROSOFT_TENANT_ID`
- `PUBLIC_BASE_URL=https://recykal-long-form-design-studio.onrender.com`

Authorized callback:
`https://recykal-long-form-design-studio.onrender.com/auth/callback/microsoft`

### PDF production
Optional overrides:
- `PRINT_ICC_PROFILE=/path/to/printer-profile.icc`

`PRINT_ICC_PROFILE` should point to a CMYK destination profile available inside the deployed container.

### Optional SCIM
Set a strong random `SCIM_BEARER_TOKEN`. Base endpoint:
`/scim/v2/Users`

### Role bootstrap
Comma-separated env lists can assign initial SSO roles:
- `ADMIN_EMAILS`
- `APPROVER_EMAILS`
- `REVIEWER_EMAILS`

Admins can subsequently manage users from **Operations**.

## Public API
Create an API key under **Operations → API keys**. Use:
`Authorization: Bearer lfs_...`

Available RC endpoints:
- `GET /api/v1/projects`
- `GET /api/v1/projects/:id`
- `POST /api/v1/generate`
- `POST /api/v1/projects/:id/export` — for PDF, send `profile: "digital" | "print"`.

Scopes: `read`, `write`, `export` or `*`.

## Webhooks
Create from **Operations → Webhooks**. Events include project creation/update/QC/export and comments. Payloads are signed:
- `x-lfds-event`
- `x-lfds-signature: sha256=<HMAC>`

## Local development
```bash
npm install
cp .env.example .env
npm run dev
```

Production:
```bash
npm run build
npm start
```

## Validation performed in the build workspace
- Every `server/*.mjs` file passes Node syntax checking.
- `src/main.jsx` passes the TypeScript JavaScript/JSX parser with `--noEmit`.
- `render.yaml`, Dockerfile and environment documentation are included.

The build workspace could not reach the public npm registry, so `npm install`/the final Vite bundle must be executed by Render during the RC deployment. Do not call this release production-final until the Render build and the generated-output acceptance test pass.

## v1.1.1 print-profile simplification

Per current production scope, the Print PDF profile no longer generates bleed, TrimBox/BleedBox metadata or crop/printer marks. It remains distinct from Digital PDF through CMYK conversion, embedded-font validation, raster-resolution validation and rendered visual preflight.
