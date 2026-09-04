# Page-safe generation architecture — v1.1.4

Long Form Design Studio no longer generates a full long-form project as one JSON response.

Flow:
1. Build or accept the design plan.
2. Create and checkpoint a project shell.
3. Generate exactly one page/slide per structured AI request.
4. Validate and normalize the page.
5. Retry that page up to three times if the structured response is incomplete.
6. Save each completed page immediately.
7. Run layout intelligence, visual materialization and QC after the complete page set exists.

If a page fails after retries, the already completed pages remain saved and can be opened as a draft.

This specifically prevents `Unterminated string in JSON` failures from invalidating the entire document.
