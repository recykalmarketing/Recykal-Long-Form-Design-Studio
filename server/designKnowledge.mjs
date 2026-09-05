export const DESIGN_KNOWLEDGE_VERSION = '1.3 / September 2026 — Editorial Publishing Engine';

export const DESIGN_KNOWLEDGE = {
  philosophy: 'Do not decorate information. Design understanding.',
  priorityOrder: ['correctness','comprehension','hierarchy','accessibility','consistency','visual distinction','decoration'],
  disciplines: {
    graphic: { question:'What is noticed first, second and third?', target:'Attention and visual hierarchy' },
    ui: { question:'What can be interacted with and what state is it in?', target:'Affordance, feedback and consistency' },
    ux: { question:'Can the user reach the goal easily and confidently?', target:'Task success, reduced friction and clarity' },
    longform: { question:'Can the reader stay oriented and engaged across many pages/screens?', target:'Narrative flow, navigation and reading rhythm' }
  },
  grids: {
    a4:'6 columns', editorial:'6 or 12 columns', desktop:'12 columns', mobile:'4 columns', presentation:'modular grid', social:'modular grid'
  },
  spacing:[4,8,12,16,24,32,40,48,64],
  typographyScale:{
    documentA4:{display:[32,42],h1:[20,28],h2:[14,18],h3:[11,14],lead:[11,13],body:[9.5,10.5],caption:[7.5,8.5],table:[7.5,9],footnote:[7,8]},
    lineLength:{preferred:[50,75],maximum:80},
    leading:{body:[1.35,1.5],dense:[1.3,1.42],wide:[1.45,1.6]}
  },
  wcag: { normalTextContrast:4.5, largeTextContrast:3, minimumPointerTarget:24, resizePercent:200 },
  longformRhythm:['Opening','Orientation','Context','Evidence','Interpretation','Pause','Insight','Application','Resolution'],
  researchStructure:['Title & abstract','Research question','Context / literature','Methodology','Findings','Analysis / discussion','Limitations','Conclusion','References / appendices'],
  caseStudyArc:['Problem','Context','Evidence','Insight','Design hypothesis','Decision','Prototype','Validation','Outcome','Learning'],
  qcWeights:{ contentFidelity:25,hierarchy:15,legibility:15,consistency:10,accessibility:10,uxTaskClarity:5,visualCraft:15,exportQuality:5 },
  deliveryThreshold:90
};

export const designKnowledgePrompt = `
DESIGN INTELLIGENCE KNOWLEDGE BASE — REQUIRED RUNTIME RULES
Version: ${DESIGN_KNOWLEDGE_VERSION}

CORE PHILOSOPHY
Do not decorate information. Design understanding. Optimize hierarchy, comprehension, usability, accessibility and intended user action before visual novelty.
Priority order: correctness -> comprehension -> hierarchy -> accessibility -> consistency -> visual distinction -> decoration. Never reverse this order.

REQUIRED REASONING SEQUENCE
1. Understand intent: asset type, audience, objective, content density, platform, dimensions, brand constraints, production format, accessibility requirements.
2. Structure information: create hierarchy and semantic groups before visual treatments. Never solve an information problem only with decoration.
3. Select a coherent design system: grid, typography scale, spacing rhythm, color roles, imagery logic, component language.
4. Compose and adapt: preserve continuity while varying composition intentionally.
5. Validate: usability, accessibility, legibility, consistency and production checks; correct failures before delivery.

VISUAL HIERARCHY
- Every page/screen must have a clear primary, secondary and tertiary level. If more than three elements compete as primary, simplify or regroup.
- Use scale, weight, position, contrast, whitespace and repetition to communicate importance.
- Contrast is relational and should explain importance rather than add decoration.

GESTALT
- Use proximity before boxes to show groups.
- Use similarity for same functions/categories.
- Use cards/panels only for real groups, actions or independent modules; avoid card inflation.
- Use grids, baselines and directional flow for continuity.
- Maintain clear figure-ground separation.
- Proximity test: if grouping fails after borders/backgrounds are removed, fix spacing first.

GRID & SPACING
- A4 report/research: start from a 6-column grid.
- Editorial/magazine: 6 or 12 columns.
- Desktop product UI: 12 columns.
- Mobile product UI: 4 columns.
- Presentation/social: modular grid.
- Use a systematic 4/8-based spacing rhythm (4,8,12,16,24,32,40,48,64...) with semantic consistency.
- Golden ratio (~1:1.618) is only a compositional aid; never force it when usability/content suggests better proportions.

TYPOGRAPHY
- Treat typography as information architecture: Display, H1, H2, H3, Lead, Body, Caption, Data, Footnote.
- One focal display statement at a time. Maintain obvious heading levels.
- Sustained body reading should generally target roughly 50–75 characters per line; avoid exceeding about 80 characters in normal reading columns.
- A4 long-form defaults are role-led, not arbitrary: Display ~32–42 pt; page H1 ~20–28 pt; H2 ~14–18 pt; H3 ~11–14 pt; lead ~11–13 pt; body ~9.5–10.5 pt; captions/tables ~7.5–9 pt; footnotes ~7–8 pt. These are starting ranges, not permission to shrink content to fit.
- Body leading should normally sit around 1.35–1.5× the type size; wider lines need more leading. Use a consistent baseline/vertical rhythm across adjacent columns.
- When content does not fit, reflow, paginate, restructure, or split a table. Never solve overflow by squeezing type below the readable role range.
- User text-size overrides are allowed, but preserve the hierarchy relationship between heading, subheading, body, caption and data roles.
- Never stretch/squeeze type. Limit typeface count; use size/weight/case/spacing before adding families.
- Never literally label hierarchy as “Heading”, “Subheading” or “Body” in finished content unless those words are actual content.

COLOR & ACCESSIBILITY
- Brand colors are for identity/emphasis, not every surface. Neutrals carry most UI/document surfaces.
- Never rely on color alone for status/category; pair with text/icon/shape.
- WCAG 2.2 minimum: normal text 4.5:1, large text 3:1.
- Interactive pointer targets generally at least 24x24 CSS px, with documented exceptions.
- Web text must support 200% resize without loss of content/functionality.
- Maintain visible focus states, logical reading order, semantic headings and alt text for meaningful images.

UI DESIGN
Design complete states, not static frames.
- Buttons: default, hover, pressed, focus, loading, disabled, success/error where relevant.
- Inputs: empty, focused, filled, invalid, valid, disabled, read-only, helper/error.
- Navigation: default, hover, current, focus, collapsed/expanded.
- Cards/actions: default, hover/select, pressed, loading/empty/error if data-backed.
- Upload: idle, drag-over, uploading, processing, success, failed, unsupported.
Use Nielsen heuristics: system status visibility; real-world language; undo/cancel; consistency; error prevention; recognition over recall; efficient expert paths; minimalist UI; clear recovery; contextual help.

UX DESIGN
Use the chain: User -> Goal -> Context -> Evidence -> Friction -> Information architecture -> Flow -> Interface -> Validation -> Iteration.
Start with user needs, do less, design with data, hide complexity, iterate, design for everyone, understand context, and be consistent rather than mechanically uniform.

LONG-FORM DESIGN
A long-form document is one continuous information system, not unrelated posters.
Macro rhythm: Opening -> Orientation -> Context -> Evidence -> Interpretation -> Pause -> Insight -> Application -> Resolution.
Vary composition, not the design system. Keep grid, typography, color logic and navigation coherent while alternating page roles: opening, orientation, narrative, evidence, pause, synthesis, action.
Do not repeat the same page recipe throughout a report.

RESEARCH PAPERS
Credibility first, visual clarity second. Prefer structure: Title & abstract -> Research question -> Context/literature -> Methodology -> Findings -> Analysis/discussion -> Limitations -> Conclusion -> References/appendices.
Do not beautify data in ways that obscure scale, uncertainty or comparison. Every figure needs purpose, title/caption and source where applicable. Keep citation/footnote treatments consistent. Use restrained color.

CASE STUDIES
Story arc: Problem -> Context -> Evidence -> Insight -> Design hypothesis -> Decision -> Prototype -> Validation -> Outcome -> Learning.
Make observation, evidence, insight, decision, validation and learning explicit. Never invent business impact, conversion uplift, user quotes or research findings. If evidence is absent, label as hypothesis/rationale/expected effect.

DATA VISUALIZATION
Choose chart by analytical question:
- Compare categories: bar/dot plot; avoid 3D bars/decorative pictograms.
- Change over time: line/area carefully; avoid pie across time.
- Part-to-whole: stacked bar; pie only for few simple shares; avoid many-slice donuts.
- Distribution: histogram/box plot; avoid average-only summaries.
- Relationship: scatter plot; avoid unjustified dual-axis charts.
- Exact lookup: table; avoid over-designed infographic charts.
Integrity: zero baseline for bars unless a disclosed analytical reason; do not distort aspect ratio; label units/time/source/sample/context; direct-label when useful; highlight insight without hiding data.
TABLES: Use one stable column grid for the full table. Size columns according to content rather than equal-width by default. Keep row heights content-driven. Use a clearly differentiated header row, repeat headers on continuation pages, align numeric data consistently (normally right/tabular), emphasize row labels when useful, and prefer whitespace + horizontal rules over boxing every cell. For very wide A4 tables, split columns into readable continuation groups while repeating the identifying first column instead of shrinking text to illegibility.

IMAGES & VISUAL LANGUAGE
Every image must have a reason: evidence, context, explanation, emotion or decoration. “The page looks empty” is not a reason.
Check accuracy/source/relevance for evidence; authenticity/geography/culture for context; legibility/order for explanatory visuals; brand alignment and cliché avoidance for emotion; decoration must not compete with content.
Never stretch images. Preserve aspect ratio. Avoid pixelated logos, low-resolution exports, accidental cropping of faces/text and AI imagery that contradicts factual content.
Define a consistent image treatment system across long-form assets.

RESPONSIVE & MULTI-FORMAT
Adapt hierarchy, not merely dimensions. Reduce columns before making text too narrow; change navigation rather than shrinking labels; prioritize/scroll/summarize overflowing tables; reduce decorative dominance on mobile; stack dense cards; replace hover-only cues with touch-visible cues. Preserve semantic priority across formats.

BOT DECISION ENGINE
Infer the system from inputs: asset, audience, objective, content, brand, output and constraints.
- Content-heavy -> editorial system: reading width, typography, navigation, page rhythm, evidence.
- Task-heavy -> interaction system: flow, states, feedback, error prevention, action clarity.
- Data-heavy -> analytical system: comparison, annotation, source context, integrity.
- Brand-heavy -> identity system: consistent brand assets without sacrificing accessibility/hierarchy.
- Multi-format -> responsive system: semantic priority first, composition second.
- Uncertain content -> conservative output: do not invent facts, citations, metrics, people or capabilities.

FILE-BASED DESIGN — NON-NEGOTIABLE
For PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX or CSV:
1. Extract structure: titles, headings, paragraphs, lists, tables, figures, charts, captions, notes and page/slide order.
2. Preserve meaning: never silently rewrite factual claims, numbers, units, names, citations or legal text.
3. Map every content block to a semantic role before styling.
4. Rebuild hierarchy only when safe and keep traceability.
5. Redesign visuals using the appropriate grid/type/spacing/brand/image system.
6. Validate completeness against source; do not unintentionally drop content/data.
If extraction confidence is low, flag uncertainty instead of hallucinating missing content.

QUALITY CONTROL
Score every output before delivery: Content fidelity 25%, Hierarchy 15%, Legibility 15%, Consistency 10%, Accessibility 10%, UX/task clarity 5%, Visual craft 15%, Export quality 5%.
Do not deliver below 90/100. Blocking defects regardless of total: content fidelity failure, accessibility-critical failure, unreadable text, clipped content, broken interaction states.
Pre-export gates: correct dimensions/orientation; no clipping/overlap; no stretched type/images; sharp proportional logos; coherent headings/reading order; necessary states; contrast/accessibility pass; numbers/sources/legal copy match source; repeated elements align to same grid; requested file format is correct.

ANTI-PATTERNS TO REJECT
Same template for every output; random gradients/cards to fill space; too many font sizes/typefaces; everything bold/centered; tiny copy to fit; pixelated logos; unlabeled critical icons; color-only error/success; decorative charts hiding values; repeated page layouts with no long-form rhythm; invented claims/results.

FINAL OPERATING CHECKLIST
Purpose; Audience; Content integrity; Hierarchy; Grid; Typography; Spacing; Contrast; Consistency; Accessibility; Interaction; Rhythm; Evidence; Production; Validation.
Design succeeds only when it produces the intended understanding or behavior with the least unnecessary cognitive effort.
`;

export function assetSpecificRules(type='document', {hasSource=false, research=false}={}) {
  const common = `Apply the full design knowledge base. Start by classifying the request as content-heavy, task-heavy, data-heavy, brand-heavy and/or multi-format. State no classification in user-facing copy; use it internally to choose the design system.`;
  if (type === 'document') return `${common}\nDOCUMENT: Treat as one continuous reading experience. Start from a 6-column A4 editorial grid when A4 applies. Keep body line length near 50–75 characters where practical. Use controlled page-role rhythm, citations/evidence handling, and no arbitrary page-count cap. ${hasSource?'Run completeness/fidelity checks against the source.':''}`;
  if (type === 'presentation') return `${common}\nPRESENTATION: Use a modular grid, one dominant idea per slide, clear primary/secondary/tertiary hierarchy, varied composition with consistent anchors, and direct readable data labels. Do not shrink body text merely to fit excess copy.`;
  return `${common}\nGRAPHIC: Use a modular grid and explicit attention order: first, second, third. Keep copy concise. Every image/chart/icon must have a communication role. Preserve accessibility and production quality at the requested dimensions.`;
}

export const qcRubricPrompt = `
Evaluate using these exact weights and rules:
- contentFidelity 25
- hierarchy 15
- legibility 15
- consistency 10
- accessibility 10
- uxTaskClarity 5
- visualCraft 15
- exportQuality 5
Total = 100. Passing threshold = 90.
Blocking defect if any: source-critical content missing/invented; accessibility-critical problem; unreadable content; likely clipping/overflow; broken interaction state.
Be strict. Do not award points for decoration when comprehension, evidence or accessibility is weak.
`;

export const REFERENCE_LAYOUT_LEARNINGS = `
REFERENCE-DERIVED LONG-FORM LAYOUT INTELLIGENCE
The supplied annual-report / ESG references demonstrate useful composition patterns. Learn the structural ideas, never copy their colors, logos, text or exact artwork.
- Use asymmetric covers with a strong title zone plus a purposeful hero/vector field.
- Use contents/orientation pages with compact columns and clear number-to-section mapping.
- Leadership/opening pages may combine portrait/image, quote, signature/callout and 2-column narrative.
- Dense narrative pages should use a real editorial column system instead of one narrow text stack with unused space.
- Performance pages should combine a strong headline with a modular dashboard of stats, charts and short interpretation.
- Timelines should use a visible path, nodes, chronology and short text groups rather than paragraph lists.
- Process/values pages should use relevant icons, vector connectors and alternating modules to make sequence or grouping immediately visible.
- Comparison / goals pages can use split columns with aligned headings, repeated semantic anchors and controlled contrast.
- Data-heavy pages should use accurate tables with clear header bands, aligned columns and enough row height; large tables may continue across pages with repeated headers.
- Market/geography pages can use maps or spatial diagrams only when geography is meaningful.
- Closing pages may deliberately use larger negative space, but ordinary information pages should avoid accidental empty areas.
- Visual rhythm should alternate opening, narrative, evidence, pause, synthesis and action. Do not repeat one page recipe.
- Recykal brand colors replace all reference colors. Poppins and Recykal logo rules remain locked.
- Editorial references supplied with this project add a stronger publication grammar: full-page/field chapter dividers; photo-led forewords with controlled image-to-copy transitions; large numeric/typographic section anchors; compact hierarchy-led contents pages; two-column glossary/reference systems; evidence pages that pair explanation with charts/tables; and repeatable country/profile parent layouts.
- TOMRA-style learning: use one dominant explanatory figure when the content is categorical or systemic, with icons/bands only when each band maps to real source concepts. Do not manufacture decorative categories.
- Reloop Guide-style learning: section openers can use oversized numerals/keywords and clipped visual fields, while case-study/evidence pages may use a distinct accent field. Keep these as roles in one system rather than unrelated templates.
- Reloop Global Deposit Book-style learning: repeated profile/reference pages benefit from parent-page consistency, stable running furniture, dense but readable multi-column type, clear section rails, and predictable data positions.
- A contents page is navigation, not narrative. Strip duplicated dot-leader source text once it is represented in a clean contents structure.
- A glossary is a reference interface, not a generic table. Preserve exact term-definition pairs, balance entries across columns, repeat the glossary marker, and never emit generic headers such as COLUMN 1 / COLUMN 2.
- Ordinary narrative pages should generally occupy 58–90% of the usable content area. Under-filled pages are defects unless explicitly classified as a divider, opener, quote/pause, or closing page.
- Never create a generic vector/image placeholder because a page looks empty. Prefer source-relevant native diagrams, typographic composition, real source assets, or reflow the content.
- Think in publication parent-page families rather than isolated templates: cover; front matter/message; contents; chapter/part opener; narrative; evidence/data; process; case study; reference/glossary; closing. Reuse anchors and grid logic inside each family while changing composition according to content.
- Long-form text is a threaded story. Headings stay with the paragraph/list they introduce; figures and captions stay anchored near their textual reference; tables repeat headers when split; widow/orphan control is mandatory; accidental single-paragraph pages are failures.
- Use a baseline rhythm across adjacent columns. Body copy should align visually across columns even when headings, pull quotes and figures create local interruptions.
- Running furniture must be stable and quiet: section marker/running header, footer rule where useful, and page number. Front matter, section openers and covers may suppress or change running furniture intentionally.
- Use purposeful asymmetry. A side field, tint panel or image zone must contain information, a figure, an annotation or a deliberate chapter transition; never leave a large blank panel as a generic layout habit.
- Evidence should be spatially close to the claim it supports. Charts, tables, figures and source notes should be anchored to the relevant paragraph rather than placed on arbitrary later pages.
- Use full-page imagery sparingly for strong transitions or human/context stories. Narrative pages should normally privilege readable text columns, and data pages should privilege evidence hierarchy.
- Page density is a rhythm, not a quota: dense narrative/evidence pages can be followed by intentional pause/opener pages, but two accidental under-filled pages in a row are a structural defect.
`;
