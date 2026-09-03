export const TEMPLATES = [
  {
    id:'editorial-report',
    name:'Editorial Report',
    type:'document',
    description:'Premium long-form report with strong reading rhythm, multi-column narrative, evidence pages and image-led pauses.',
    sequence:['cover','editorial','two-column','image-led','stat','chart','editorial','quote','table','closing'],
    guidance:'Use a 6-column A4 editorial grid. Prefer 2-column body copy for dense narrative, full-width headings, image-led pauses, restrained stat panels and generous but purposeful whitespace. Aim for 68–88% meaningful page occupancy except intentional divider/pause pages.'
  },
  {
    id:'esg-sustainability',
    name:'ESG / Sustainability Report',
    type:'document',
    description:'Visual sustainability publication with narrative, metrics, flows, timelines and evidence-rich data pages.',
    sequence:['cover','editorial','stat','process','image-led','timeline','chart','two-column','table','closing'],
    guidance:'Balance evidence with explanation. Use process flows, timelines, stat dashboards, maps/diagrams where relevant, image-led contextual pages and data tables. Avoid sustainability clichés and decorative greenwashing.'
  },
  {
    id:'policy-handbook',
    name:'Policy Handbook',
    type:'document',
    description:'Government-ready handbook with disciplined hierarchy, process diagrams, timelines, structured tables and citations.',
    sequence:['cover','editorial','two-column','process','timeline','comparison','table','chart','editorial','closing'],
    guidance:'Credibility first. Use restrained color, clear section hierarchy, compact tables, precise process/timeline visuals, side notes and citations. Keep paragraphs readable and never beautify away nuance.'
  },
  {
    id:'annual-report',
    name:'Annual Report',
    type:'document',
    description:'Business publication with company narrative, leadership, performance dashboards, market visuals, tables and closing pages.',
    sequence:['cover','quote','editorial','stat','chart','two-column','timeline','comparison','table','image-led','closing'],
    guidance:'Use varied but coherent page roles: opening statement, leadership message, company facts, stat dashboard, financial chart/table, timeline, team/market sections and closing. Use rules, columns and visual anchors to avoid poster-like repetition.'
  },
  {
    id:'research-paper',
    name:'Research / Thought Leadership',
    type:'document',
    description:'Evidence-led publication for research, insights and thought leadership.',
    sequence:['cover','editorial','two-column','chart','table','quote','comparison','editorial','closing'],
    guidance:'Use research structure and restrained visual hierarchy. Preserve methodology and citations. Charts and tables must answer specific analytical questions. Use callouts only to aid navigation and synthesis.'
  },
  {
    id:'case-study',
    name:'Case Study',
    type:'document',
    description:'Problem-to-outcome narrative with evidence, design/business decisions and measurable results.',
    sequence:['cover','editorial','comparison','process','image-led','stat','chart','quote','closing'],
    guidance:'Use the arc Problem → Context → Evidence → Insight → Decision → Validation → Outcome → Learning. Never invent impact. Visually distinguish evidence, decision and outcome.'
  },
  {
    id:'executive-deck',
    name:'Executive Presentation',
    type:'presentation',
    description:'CXO presentation with one dominant idea per slide, proof points, diagrams and strong visual pacing.',
    sequence:['cover','stat','image-led','comparison','process','chart','quote','closing'],
    guidance:'One dominant idea per slide. Use modular grid, high contrast, direct data labels, sparse text and purposeful visual variation.'
  },
  {
    id:'infographic',
    name:'Infographic Graphic',
    type:'graphic',
    description:'Single-canvas visual explanation with hierarchy, metrics and a compact process or comparison.',
    sequence:['stat'],
    guidance:'Establish a clear first/second/third attention order. Use one key stat, 3–5 supporting points with relevant vector icons, and one clear explanatory visual or image.'
  }
];

export function getTemplate(id){ return TEMPLATES.find(t=>t.id===id)||null; }
