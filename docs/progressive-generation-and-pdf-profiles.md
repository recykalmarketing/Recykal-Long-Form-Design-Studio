# Progressive generation + Digital / Print PDF profiles

## Progressive generation

Long Form Design Studio uses a streamed Responses API generation path (`POST /api/generate-stream`). The browser receives newline-delimited progress events and renders completed structured pages/slides immediately instead of waiting for the whole project.

Runtime stages:
1. accepted / brief analysis
2. page — each completed page or slide becomes visible and selectable in the live rail
3. layout — the full provisional project is rebalanced through the layout engine
4. visual — approved/source/stock/AI visuals are materialized; the affected page is refreshed in the preview
5. qc / revision — quality scoring and any automated correction
6. saved — the editable project opens in the editor

The progressive preview is explicitly a working preview: later layout/QC/visual passes may make bounded corrections before final save.

## PDF profiles

### Digital PDF
- trim-size pages only
- RGB output
- screen/email/web optimized Ghostscript pass
- no bleed or crop marks
- normal rendered-export visual preflight

### Print PDF
- standard page dimensions only in the current release
- no bleed, crop marks, TrimBox or BleedBox are added
- Ghostscript `/prepress` processing with CMYK conversion
- printer-specific `PRINT_ICC_PROFILE` is supported; otherwise Ghostscript's generic CMYK profile is used if present
- embedded-font inspection with `pdffonts`
- raster effective-resolution inspection with `pdfimages`
  - below 180 ppi = blocking for final print export
  - 180–299 ppi = warning
  - 300 ppi+ = preferred
- page-box inspection with `pdfinfo -box`
- rendered visual preflight still runs after production conversion

This is deliberately described as a **Print PDF / prepress profile**, not certified PDF/X. A specific printer/press can supply its destination ICC profile and any PDF/X requirement separately.
