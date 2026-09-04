# Continuation batches — v1.1.9

Long Form Design Studio can extend an existing document later without regenerating the approved pages.

## Why this exists

Long publications are often approved in stages. A 150-page source may have only the first 50 pages approved for design today, with later chapters approved weeks later. A continuation must therefore behave like another chapter in the same publication, not a new document.

The implementation borrows the useful long-document pattern behind Adobe InDesign Books: one document acts as the style source, later content continues numbering, and shared styles/masters remain synchronized. Long Form Design Studio applies the same concept at project level through a captured **Design DNA**.

## Design DNA captured from the current project

Before a continuation starts, the Studio snapshots:

- Recykal theme and optional project palette
- Poppins-based text hierarchy and any explicit text-style overrides
- table style and density
- document style / composition mode
- recent page-layout rhythm
- master header, footer and page-number settings
- image source and art direction
- template identity where used
- tone, language and audience

The existing project is the style source. The continuation prompt explicitly forbids a new cover, new brand identity, arbitrary type scale, or unrelated visual language.

## Continuation workflow

1. Open an existing **Document** project.
2. Choose **Add continuation batch**.
3. Supply the next content in one of three ways:
   - attach one or more new files;
   - reuse the original source and select a later page/slide range;
   - instruction only.
4. Choose **Auto** or an **Exact number of new pages**.
5. Choose Preserve / Improve / Condense / Research + Expand.
6. Optionally review the continuation design plan.
7. Generate page-by-page.

Each new page is checkpointed to Postgres as it completes. A version checkpoint is created before the append operation.

## Physical and editorial behaviour

- Existing approved pages are not regenerated.
- A closing page, if present, is temporarily held and returned to the final page after the new batch.
- Page numbering continues automatically.
- Every document page remains fixed A4 portrait, 210 × 297 mm.
- New pages may use different content-led layouts, but they inherit the same Design DNA.
- New source assets are added to the project's approved asset pool.
- QC becomes stale after a continuation and must be rerun across the combined document.
- If an exact number of new pages is requested, the project total target is updated accordingly.

## Source ranges

For a single PDF or PPTX source, the creation screen exposes an optional **Source scope**. Example:

- Source: 150-page PDF
- First approved batch: pages 1–50
- Later continuation: reuse original source, pages 51–150

This prevents the first batch from consuming chapters that have not yet been approved.

## Recovery

If a continuation fails after several pages, completed continuation pages remain checkpointed in Postgres. The existing project and the previously approved pages are not discarded.
