# Source files and optional project palette

## Source basket
- Accepts PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX and CSV.
- Up to 10 files per project.
- Multiple selection and repeated add/drop actions are supported.
- Duplicate browser File objects are de-duplicated by name + size + last-modified time.
- Each file can be removed before generation. The remaining browser File objects are re-uploaded into a new authoritative aggregate so Preserve mode never uses a removed file.
- Removing the final file clears the upload ID and extracted preview.

## Project palette
- Optional; blank means use the selected Recykal theme.
- Accepts 6-digit HEX values (with or without #), maximum 8 unique colours.
- The first three colours map to primary / secondary / accent roles; a fourth can influence the dark role. Neutral text/background roles remain theme-controlled for readability.
- The palette is passed to Studio AI, image-generation art direction, live editor preview, shared view, PDF, PPTX and graphic export.
- Project palette is an asset-level colour exception only. Recykal logo artwork/proportions and Poppins typography remain locked.
