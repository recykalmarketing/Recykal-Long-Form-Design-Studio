# Long Form Design Studio

**For Recykal, by Recykal.** An internal, brand-locked AI design workspace for the marketing team.

## Current functional scope

- **Presentation Studio** — generate/edit slide-based presentations and export editable `.pptx` or PDF.
- **Document Studio** — generate/edit continuous long-form documents with **no application-level page-count cap**. Add sections manually or use **Continue document** repeatedly.
- **Graphic Studio** — generate/edit a branded graphic and export high-resolution PNG or PDF.
- **Create with AI** — prompt-based generation through the OpenAI Responses API.
- **Upload & Design** — source-driven generation from PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX and CSV.
- **Legacy Office support** — `.doc`, `.ppt`, `.xls` are converted by LibreOffice in the included Docker image before parsing.
- **Source modes** — Preserve, Improve, Condense, Research + Expand.
- **Live research** — optional OpenAI web-search tool for fresh evidence.
- **AI editing** — rewrite, shorten, CXO tone, government tone, stronger headlines, page layout improvement and page variation.
- **AI visuals** — generate visuals for image blocks with the configured OpenAI image model.
- **Recykal brand lock** — supplied Recykal SVG, Poppins UI/design system, approved Recykal palette and logo usage safeguards.
- **Persistence** — Render Postgres when `DATABASE_URL` is configured; local JSON fallback for local development.
- **Internal access** — optional `APP_ACCESS_CODE` gate.
- **Design Intelligence Knowledge Base v1.0** — the uploaded Graphic Design + UI/UX + Long-form rules are encoded as runtime constraints, not decorative suggestions.
- **Automated QC gate** — every generated asset is scored against content fidelity (20), hierarchy (15), legibility (15), consistency (10), accessibility (15), UX/task clarity (10), visual craft (10) and export quality (5). Export threshold is 85/100 with blocking defects overriding the score.
- **Source extraction confidence** — file ingestion marks high/medium/low confidence and warns rather than hallucinating unreadable source content.
- **Data integrity** — charts are selected by analytical question; source tables can be preserved as structured text tables rather than being forced into charts.
- **Image accessibility** — generated meaningful images carry alternative text and QC blocks export when it is missing.

## Important accuracy design

The Studio does not claim that AI can guarantee factual accuracy. Instead it implements explicit guardrails:

- In **Preserve** mode, the source file is treated as authoritative and external research is disabled.
- In **Improve/Condense** modes, the system is instructed to preserve facts, dates, figures, names and caveats.
- In **Research + Expand**, new information is allowed only with traceable source records.
- Generated designs remain editable before export.
- File-based redesign validates source structure, sequence, tables, figures and factual meaning. Low-confidence extraction is explicitly flagged.
- The Studio runs design QC after generation and can automatically revise a failed generation before it reaches the editor.
- Manual edits mark QC as stale; export re-runs the quality gate and refuses delivery below 85/100 or with blocking defects.

## Local setup

Requirements: Node 20+ (Node 22 recommended). For legacy `.doc/.ppt/.xls` files, install LibreOffice or run the Docker image.

```bash
cp .env.example .env
# Add your OPENAI_API_KEY to .env, or export it in your shell.
npm install
npm run build
npm start
```

Open `http://localhost:10000`.

For development with Vite hot reload:

```bash
npm run dev
```

Frontend: `http://localhost:5173`  
API: `http://localhost:10000`

## Environment variables

| Variable | Required | Purpose |
|---|---:|---|
| `OPENAI_API_KEY` | For live AI | Server-side OpenAI API key. Never expose it in browser code. |
| `OPENAI_MODEL` | No | Defaults to `gpt-5.6`. |
| `OPENAI_IMAGE_MODEL` | No | Defaults to `gpt-image-2`. |
| `APP_ACCESS_CODE` | Recommended | Simple internal team gate. |
| `AUTO_QC` | No | Defaults to `true`; automatically quality-check and revise failed AI generations. |
| `QC_MAX_REVISIONS` | No | Defaults to `1`; maximum automatic revision passes after generation (0–2). |
| `MAX_SOURCE_CHARS` | No | Maximum extracted source text sent in the primary generation request; defaults in server code. |
| `DATABASE_URL` | Recommended on Render | Durable project storage via Postgres. |
| `PORT` | No | Defaults to `10000`. Render supplies this automatically. |

## Deploy on Render from Git

The repository includes `render.yaml` and a Dockerfile. The Docker image is used so legacy Office files are supported.

1. Push this folder to your Git repository.
2. In Render choose **New → Blueprint** and connect the repo.
3. Render reads `render.yaml` and creates the web service plus Postgres database.
4. During Blueprint setup, enter `OPENAI_API_KEY` and `APP_ACCESS_CODE` when Render prompts for the `sync: false` variables.
5. Deploy.

The server binds to `0.0.0.0:$PORT`, as required by Render.

## File parsing details

- PDF: per-page text extraction.
- DOCX: heading/list-aware extraction plus embedded media extraction.
- PPTX: per-slide text extraction plus embedded media extraction.
- XLSX: all sheets preserved as structured CSV-like data.
- DOC/PPT/XLS: converted to modern Office formats using LibreOffice, then parsed.
- CSV: direct ingestion.

Source files can be combined in one generation request (up to 10 files per upload in this build).

## Storage note

Project JSON is durable in Postgres. Uploaded source media and AI-generated image files currently live on the web-service filesystem. On Render's ephemeral filesystem they can disappear after a rebuild/restart. For production durability, attach a persistent disk or replace the filesystem adapter with S3/R2/Cloudinary. The project content itself remains in Postgres.

## API endpoints

- `GET /api/health`
- `GET /api/config`
- `POST /api/upload`
- `POST /api/generate`
- `GET /api/projects`
- `GET /api/projects/:id`
- `PUT /api/projects/:id`
- `DELETE /api/projects/:id`
- `POST /api/projects/:id/continue`
- `POST /api/projects/:id/ai-edit`
- `POST /api/projects/:id/generate-image`
- `POST /api/projects/:id/qc`
- `POST /api/projects/:id/export`

## Product boundary for this build

This is a native Recykal application. **There is no Gamma dependency and no Gamma API key.** Gamma was used only as a UX benchmark in the product brief.


## Design Intelligence implementation

The source document is retained at `docs/Design_Bot_Knowledge_Base_Graphic_UI_UX_Longform.pdf`. Its operating rules are encoded in `server/designKnowledge.mjs` and injected into every generation/editing instruction through `server/brand.mjs`.

The runtime follows this priority order:

`correctness → comprehension → hierarchy → accessibility → consistency → visual distinction → decoration`

Key encoded rules include semantic hierarchy before styling; Gestalt proximity before containers; A4 6-column/editorial and responsive grid guidance; 4/8 spacing rhythm; Poppins-based semantic typography; 50–75 character long-form line-length guidance; WCAG 2.2 contrast/target/resize gates; Nielsen interaction heuristics; long-form narrative and page rhythm; research-paper and case-study structures; analytical chart selection and data integrity; purposeful image roles; responsive recomposition; file-source preservation; and the 85/100 pre-export quality gate.

The operating principle is: **do not decorate information; design understanding.**

## Render startup fix (v0.3.1)

This version is compatible with Express 5 route matching. The SPA fallback uses `/{*splat}` instead of the Express 4-style `*` wildcard. If a previous Render deploy crashed on startup with `PathError`, `Missing parameter name`, or a `path-to-regexp` stack trace, redeploy this version.

After deployment, verify these endpoints in order:

1. `/api/health` → should return JSON with `"ok": true`.
2. `/api/config` → should return the Studio configuration.
3. `/` → should load the Long Form Design Studio UI.

If `/api/health` is unavailable, open Render → Service → Logs and search for the first `error` line in the latest deploy.
