# Long Form Design Studio — Typography & Table System v1.1.7

This release introduces a direct-authoring layer for generated documents and presentations. It is designed to feel familiar to Google Docs/Slides users while preserving the Recykal design system and A4 editorial constraints.

## Direct text editing

Select a kicker, heading, subheading, paragraph, or quote and edit the copy directly on the canvas. The selected block exposes a persistent formatting bar with:

- semantic type-scale presets (Display, H1, H2, H3, Lead, Body, Caption)
- direct point-size input plus ±1 pt controls
- bold, italic, underline
- left, centre, right, justified alignment
- line-spacing presets
- text and highlight colours
- Clear formatting / reset to the document design system
- Studio AI Shorten and Expand actions; Expand is instructed not to invent unsupported facts

Keyboard parity for common Google authoring patterns includes Ctrl/Cmd+B, I, U, Ctrl/Cmd+Shift+./, for font sizing, Ctrl/Cmd+Shift+L/E/R/J for alignment, and Ctrl/Cmd+\\ to clear direct formatting. Native browser copy/paste and selection behaviour remains available inside editable text.

Manual text formatting is project data. It is deliberately not part of the AI Structured Output schema; layout/reflow/localisation/QC-repair operations inherit the user’s direct formatting by matching stable block IDs and semantic block order.

## A4 long-form type system

Poppins remains the Recykal Latin brand family. The design engine uses the following ranges as editorial starting points, not arbitrary decoration:

| Role | A4 default / range | Usage |
| --- | --- | --- |
| Display | 32–42 pt | rare opening statement / cover |
| H1 / page title | 20–28 pt | strongest page-level hierarchy |
| H2 | 14–18 pt | major section |
| H3 | 11–14 pt | subsection |
| Lead | 11–13 pt | opening/context paragraph |
| Body | 9.5–10.5 pt | sustained reading |
| Caption | 7.5–8.5 pt | figure/image explanation |
| Table text | 7.5–9 pt | compact data, never used to force an overfull table |
| Footnote/source | 7–8 pt | traceability; never illegibly small |

Body leading defaults around 1.35–1.5× and line length targets about 50–75 characters. If content does not fit A4, the engine should paginate/reflow or change the composition; it must not solve overflow by making body copy tiny or increasing physical page height.

Long headings automatically step down within the allowed H1 range to preserve hierarchy without overset. Two-column pages use a slightly smaller body default (about 9.5 pt) with a controlled gutter and fixed A4 page height.

## Table architecture

Tables use one stable grid for the entire table. Rows may grow vertically with cell content, but they may not independently redefine the column structure.

Core rules:

1. Preserve source cells, values, units, signs, dates and labels.
2. Use a clear header row whenever the source has column labels; repeat headers on continuation pages.
3. Calculate column widths from content, with optional user overrides.
4. Emphasise the identifying first column by default.
5. Right-align numeric cells by default and use tabular figures in rendered formats where available.
6. Prefer restrained horizontal rules and spacing to excessive box grids; vertical rules are optional.
7. Provide Clean, Striped, Ledger and Minimal styles plus Comfortable/Compact density.
8. If an A4 table has more than six columns, split it into readable continuation groups that repeat the identifying first column instead of shrinking type to illegibility.
9. Long tables paginate and repeat the header rather than stretching the A4 page.
10. QC flags missing headers, inconsistent row column counts, very wide tables and excessive row counts for review.

## Quality gates

Direct formatting is checked against the long-form system. Body text below 8.5 pt is a blocking defect. The QC engine warns when body scale, heading hierarchy or leading moves outside preferred reading ranges, and A4 occupancy checks include user font-size overrides and table density.

The renderer and editor use the same style metadata so Review/Final PDF and PPTX exports reflect direct text formatting rather than reverting to generation defaults.
