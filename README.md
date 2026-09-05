# Long Form Design Studio

**Current release: v1.2.3 — Durable Resume, Source Integrity & Cost Control.** See `docs/v1.2.3-durable-resume-source-integrity.md`. - Recykal

Release candidate **v1.2.1** adds source-faithful Preserve-mode allocation, removes the false A4 page-budget stop, strengthens source coverage QC, and fixes the repeated/under-filled PDF layouts found in the Goa DRS test.

See `docs/v1.2.1-source-fidelity-layout-fix.md`.

# Long Form Design Studio

**Current release: v1.2.3 — Durable Resume, Source Integrity & Cost Control.** See `docs/v1.2.3-durable-resume-source-integrity.md`. — Recykal

## v1.1.8 — Optional exact final document length

- The initial brief now includes **Final designed document length** with **Auto** or **Exact pages**.
- Exact count includes the cover and closing pages and is stored with the project.
- Design-plan generation is reconciled to exactly the requested number of A4 page roles.
- Page-safe generation verifies that each exact-count page fits one physical A4 portrait sheet; it retries compactly rather than silently creating extra continuation pages.
- Readability and source fidelity remain hard gates: Preserve mode stops safely if the requested page budget cannot hold the source without dropping facts or using unreadably small type.
- QC blocks final export if the current page count no longer matches the saved target.

See `docs/exact-document-page-target.md`.

---


## v1.1.6 — Durable projects + fixed A4 layout + recovery

This release addresses a production data-loss incident and the layout/QC issues found in a real 20-page research booklet.

### Critical durability change
- **Postgres is now required before paid AI generation starts.** With `REQUIRE_DURABLE_STORAGE=true` (default in `render.yaml`), the Studio returns a clear 503 configuration error instead of spending OpenAI credits when `DATABASE_URL` is missing.
- `/api/health` and `/api/config` report the active storage backend and whether it is durable.
- **Browser Safety Vault (IndexedDB)** mirrors saved projects and each live generation checkpoint. If the server copy is missing, the Workspace can surface the browser recovery copy and restore it through `/api/projects/recover`.
- Project open, autosave, QC, and export all attempt browser-vault recovery on a server 404.
- Live page-by-page generation checkpoints every completed page to server storage and the browser vault.

> Existing manually-created Render services do not automatically inherit the database declared in `render.yaml`. In Render → your web service → Environment, verify a real `DATABASE_URL` exists. If it is absent, create/link a Render Postgres database and use its **Internal Database URL**. Do not start a paid generation until `/api/health` shows `storage.durable: true`.

### Fixed A4 document geometry
- Document pages are physically constrained to **A4 portrait (210 × 297 mm)**. A two-column decision changes the internal composition only; it can no longer increase page height.
- Content that does not fit is deterministically split onto a continuation page instead of extending the canvas or shrinking body text.
- Tables continue across pages with repeated headers; paragraph and bullet overflow is split safely.
- The editor/live preview use a fixed A4 aspect ratio and hide accidental overflow rather than silently creating a non-A4 page.
- QC treats A4 overflow as a blocking export defect. Export applies A4 enforcement again before rendering.

### Alignment, typography and tables
- Fixed a PDF exporter bug that routed normal editorial pages through a two-column renderer (`? 2 : 2`). Editorial pages now remain one column unless the layout explicitly requests two columns.
- Two-column PDF flow tracks each column independently and advances to a continuation page rather than overlapping unequal columns.
- Heading size now adapts to title length; body and two-column typography use bounded A4-specific scales.
- HTML/editor tables now calculate one shared column count and use the same grid definition for every row, preventing drifting/misaligned divisions.

### QC improvement
- Page-safe long-form generation no longer skips all automatic correction. If deterministic QC identifies bad pages, Studio AI can repair the worst affected pages **individually**, preserving facts/data/source content, rather than regenerating a whole 20–40 page project as one response.
- Review exports remain available below the 90/100 final-delivery threshold.

### Render verification
After deployment, open `/api/health`. A production-safe response must include:

```json
{
  "ok": true,
  "storage": { "durable": true, "backend": "postgres" }
}
```

If `durable` is false, fix `DATABASE_URL` first; v1.1.6 intentionally blocks paid generation in that state.

---


## v1.1.5 — Page-safe incremental generation

This release fixes long-document generation failures caused by one very large structured JSON response. The Studio now generates one page/slide at a time, validates each structured response independently, retries a failed page up to three times with progressively smaller response constraints, checkpoints every completed page to the project store, and exposes a saved partial draft if a later page cannot recover. Raw JSON parser errors are no longer shown to marketing users.

For long projects, whole-project AI rewrite during automatic QC is disabled; QC remains active, but the Studio will not risk regenerating a 30+ page project as one large JSON payload. Source content is selected page-by-page using relevant and sequential excerpts, so file-based Preserve mode remains source-aware without sending the entire source into every page request.
# Long Form Design Studio

**Current release: v1.2.3 — Durable Resume, Source Integrity & Cost Control.** See `docs/v1.2.3-durable-resume-source-integrity.md`. — Recykal

## v1.1.3 Render build hardening

This release makes the deployment gate immune to PDFKit/fontkit font-subsetting regressions. `npm run check` is now **deployment-safe** and only validates build artifacts/system dependencies. The full export/preflight diagnostic moved to `npm run check:full`. PDF export also prefers Poppins WOFF rather than WOFF2, and the full self-test explicitly uses PDF standard fonts so a third-party embedded-font bug cannot prevent deployment.

**Render log fingerprint for this release:** package version `1.1.3-rc1`; Docker step runs `npm run check`; that command executes `node server/buildcheck.mjs`. If Render shows `1.1.1-rc1` or `node server/selftest.mjs` during the Docker build, the service is still building an older Git commit.


## Render deployment note — v1.1.3

The Docker image now uses `npm install --include=dev` (the previous `--omit=dev=false` form is invalid in current npm) and runs a deployment-safe `npm run check:build` after the Vite build. The heavier PDF export/preflight self-test remains available as `npm run check`, but it is intentionally not a Docker build gate because environment-specific print/preflight checks must not prevent the web service from starting. Runtime health is still monitored through `/api/health`.

# Long Form Design Studio

**Current release: v1.2.3 — Durable Resume, Source Integrity & Cost Control.** See `docs/v1.2.3-durable-resume-source-integrity.md`. — Recykal

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
- 90/100 quality gate with content fidelity, hierarchy, legibility, consistency, accessibility, UX clarity, visual craft and export checks.
- Review exports remain available below threshold as clean artwork previews; review identity is kept in the filename, not stamped on the page.
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

## v1.1.3 print-profile simplification

Per current production scope, the Print PDF profile no longer generates bleed, TrimBox/BleedBox metadata or crop/printer marks. It remains distinct from Digital PDF through CMYK conversion, embedded-font validation, raster-resolution validation and rendered visual preflight.


## v1.1.5 — source basket + optional project palette

- **Multiple source files:** Upload & Design accepts up to 10 PDF, Word, PowerPoint, Excel or CSV files in one project. Files can be added in separate selection/drop actions; the source basket is re-aggregated safely.
- **Remove wrong attachment:** Every attached source file has a remove action before generation. Removing one file keeps the remaining files and rebuilds the authoritative source aggregate; removing the last file resets the source attachment state.
- **Optional project palette:** Users can paste/add up to 8 six-digit HEX colours. Leaving the palette empty uses the selected Recykal theme. A supplied project palette overrides project design accents/data/visual fields while the Recykal logo artwork, logo proportions and Poppins typography remain locked.
- **Editable after generation:** The Visual System inspector exposes the same project-palette controls, so colours can be added/removed after generation and the project can then be recomposed without changing factual content.

## v1.1.7 — Direct text editing and editorial tables

The editor now supports Google Docs/Slides-style direct authoring for text blocks: inline copy editing, point-size controls, semantic type presets, bold/italic/underline, alignment, line spacing, text/highlight colours, clear formatting, and AI Shorten/Expand. Common keyboard shortcuts are supported. Manual formatting survives AI layout/reflow/localisation operations.

The A4 renderer now uses an explicit long-form type scale and stronger table architecture: stable content-aware columns, structured row/cell editing, repeated headers, numeric alignment, first-column emphasis, multiple table styles/densities, and readable continuation groups for wide tables. See `docs/typography-and-table-system.md`.

## Staged continuation of long publications

Document projects can be extended later through **Add continuation batch**. Attach remaining source files, or reuse a selected page/slide range from the original source. New pages are appended page-by-page using the existing project as the Design DNA/style source, so typography, masters, palette, tables, visual language, A4 dimensions and numbering remain consistent. Existing pages are not regenerated. See `docs/continuation-batches.md`.

## v1.1.10 — Increase page target & resume
If an exact-page document stops because a planned page cannot fit the current readable A4 budget, the live-generation screen now offers **Increase final page target and resume**. Users can choose +10, +20, or enter a custom target (up to 500 pages). Completed pages remain untouched; the Studio replans only the unfinished remainder against the larger exact A4 target, checkpoints every resumed page to Postgres, and continues QC/export normally.

## v1.2.0 — Professional Editing & Resilient Publishing

This release adds automatic page-target expansion, review exports before QC, Recent Work Export/Delete actions, free-position/resize element frames, semantic non-repetitive page surfaces, export-aware positioned elements, and QC rules for manual frame overflow. See `docs/v1.2-product-spec.md` and `docs/v1.2-module-implementation.md` for the full product and engineering specification.
