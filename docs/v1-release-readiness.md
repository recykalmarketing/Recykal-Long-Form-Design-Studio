# v1 Release Readiness

## Previously incomplete roadmap — implementation status

| Capability | RC1 status |
|---|---|
| Constraint-based smart layout | Implemented: semantic page roles, 6-column editorial logic, occupancy/QC, content-aware tables, controlled reflow |
| Master pages/components | Implemented: cover-only logo, global header/footer/page numbers, global replace, locked pages |
| Page design variations | Implemented: three content-preserving composition variations |
| Visual art director | Implemented: source/style/theme/reference controls, semantic vector/icon/chart/diagram selection |
| Asset intelligence | Implemented: source media + Knowledge Hub + persistent DAM + Openverse + AI fallback |
| Smart crop/focal point | Implemented: AI focal analysis, Fit/Fill, focal controls, frame-preserving replacement |
| Outline approval | Implemented: design-plan-first flow before full generation |
| Version history | Implemented: automatic/manual checkpoints, restore, semantic diff |
| Professional collaboration | Implemented: presence, live project broadcasts, optimistic concurrency, threaded comments, review roles, page locks |
| Design provenance | Implemented: source/AI/stock provenance, stock license/creator metadata, sources panel |
| Multi-format recomposition | Implemented: Document/Presentation/Graphic semantic repurposing |
| Accessibility engine | Implemented: WCAG-oriented runtime QC, alt text, semantic hierarchy, locale/script QA |
| Pixel-level export validation | Implemented: PDF/PPTX rendered preflight when enabled |
| Enterprise identity | Implemented: Google OIDC, Microsoft Entra OIDC, RBAC, SCIM 2.0 |
| Persistent media | Implemented: Postgres binary asset store + durable source aggregates; no dependency on Render ephemeral storage for project media |
| Licensed/rights-aware media | Implemented: Openverse commercial-license filtering, provenance and export attribution treatment |
| Localization QA | Implemented: 9 locale profiles, text-expansion/script/font checks and Noto export font support |
| Share analytics | Implemented: expiring/revocable read-only links, session/page/dwell events and heatmap |
| Public API/workflow hooks | Implemented: scoped `/api/v1` API keys and signed HMAC webhooks |

## External configuration still required if these optional integrations are enabled
Implementation is complete, but no application can create third-party tenant credentials itself. Google SSO requires a Google OAuth client. Microsoft SSO requires an Entra application registration. SCIM requires a bearer token chosen by Recykal. OpenAI requires the existing Recykal OpenAI API key.

The app remains fully usable with Recykal access-code authentication until SSO is enabled.

## Publish gate
Do not publish broadly until all of these pass on Render:
1. Docker build and Vite build.
2. `/api/health` returns `ok:true`.
3. Prompt-only generation for all three asset types.
4. File-based Preserve generation for PDF, DOCX, PPTX and XLSX.
5. Image generation plus upload/drag-drop replacement.
6. Source/stock image persistence after a service restart.
7. Review PDF below QC threshold.
8. Final PDF after QC pass; if approval gate is enabled, Approver workflow must also pass.
9. PPTX opens/editable and PDF has no clipping/table overflow.
10. Share link and analytics event collection.
11. At least two-browser collaboration/conflict test.
12. One localization export test for Latin and one non-Latin language.
