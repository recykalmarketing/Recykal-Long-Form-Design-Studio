# Exact final document page target — v1.1.8

Long Form Design Studio supports two document-length modes at brief time:

- **Auto** — Studio AI determines the appropriate number of A4 pages from the brief/source. There is no artificial padding requirement.
- **Exact pages** — the user sets a final A4 page target (1–500 pages per single generation request). The count includes the cover and any closing page.

## Production rules

An exact target is a hard design constraint, not permission to distort the document.

1. Every page remains fixed **A4 portrait, 210 × 297 mm**.
2. The design-plan stage is reconciled to exactly the requested number of page roles.
3. Page-safe generation produces one physical page per planned role.
4. If a generated page would require deterministic continuation, that page is retried with a more compact composition rather than silently increasing the final page count.
5. Body typography must remain within the long-form readability rules; the engine must not shrink sustained-reading copy below safe limits simply to hit the count.
6. In Preserve mode, source fidelity outranks the requested count. If the authoritative source cannot fit the requested page budget legibly after safe retries, generation stops with completed pages preserved and asks the user to increase the target or use Condense mode.
7. QC blocks final export when the current document page count differs from the saved exact target.

The page target is stored in `project.settings.targetPageCount` so it survives progressive generation, browser recovery, Postgres persistence, QC and export.
