import OpenAI from 'openai';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { BRAND, brandSystemPrompt } from './brand.mjs';
import { projectSchema, pageSchema, qcSchema, outlineSchema, variationsSchema } from './schemas.mjs';
import { assetSpecificRules, qcRubricPrompt, DESIGN_KNOWLEDGE, REFERENCE_LAYOUT_LEARNINGS } from './designKnowledge.mjs';
import { staticQualityCheck, mergeQualityChecks } from './qc.mjs';
import { getTheme, getDeckStyle, getArtStyle, getImageSource, normalizeProjectPalette } from './visuals.mjs';
import { persistBytes } from './assets.mjs';
import { searchStock, fetchStockImage } from './stock.mjs';
import { getBinaryAsset } from './store.mjs';

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6';
const MAX_SOURCE_CHARS = Number(process.env.MAX_SOURCE_CHARS || 800000);

function client() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function normalizeBlock(block={}) {
  return {
    id: block.id || uuid(),
    type: block.type || 'paragraph',
    text: block.text || '',
    items: Array.isArray(block.items) ? block.items : [],
    label: block.label || '',
    value: block.value || '',
    caption: block.caption || '',
    data: Array.isArray(block.data) ? block.data.map((d,i)=>({label:String(d?.label??''),value:Number(d?.value)||0,x:Number.isFinite(Number(d?.x))?Number(d.x):i})) : [],
    imagePrompt: block.imagePrompt || '',
    altText: block.altText || '',
    chartType: block.chartType || 'bar',
    tableHeaders: Array.isArray(block.tableHeaders) ? block.tableHeaders : [],
    tableRows: Array.isArray(block.tableRows) ? block.tableRows : [],
    imageUrl: block.imageUrl || '',
    imageFit: block.imageFit || 'cover',
    focalX: Number.isFinite(Number(block.focalX)) ? Number(block.focalX) : 50,
    focalY: Number.isFinite(Number(block.focalY)) ? Number(block.focalY) : 50,
    provenance: block.provenance || null,
    imageVariations: Array.isArray(block.imageVariations) ? block.imageVariations : []
  };
}

function normalizePage(page={}) {
  return {
    id: page.id || uuid(),
    title: page.title || 'Untitled',
    layout: page.layout || 'editorial',
    blocks: (page.blocks || []).map(normalizeBlock),
    speakerNotes: page.speakerNotes || '',
    locked: Boolean(page.locked)
  };
}

export function normalizeProject(raw, options={}) {
  const now = new Date().toISOString();
  return {
    id: options.id || uuid(),
    title: raw.title || options.title || 'Untitled project',
    type: options.type || 'document',
    summary: raw.summary || '',
    pages: (raw.pages || []).map(normalizePage),
    sources: raw.sources || [],
    sourceFile: options.sourceFile || null,
    inputMode: options.inputMode || 'prompt',
    contentMode: options.contentMode || 'generate',
    settings: { deckStyle:'auto', themeId:'recykal-core', projectPalette:[], imageSource:'mixed', artStyleId:'auto', customArtStyle:'', imageVariations:1, styleReferences:[], masterFields:{headerText:'',footerText:'',pageNumbers:true,logoMode:'cover-only'}, ...(options.settings||{}), masterFields:{headerText:'',footerText:'',pageNumbers:true,logoMode:'cover-only', ...((options.settings||{}).masterFields||{})} },
    brand: BRAND,
    qc: options.qc || raw.qc || null,
    workflow: options.workflow || raw.workflow || {status:'Draft',assignee:'',comments:[]},
    exportPreflight: options.exportPreflight || raw.exportPreflight || null,
    createdAt: options.createdAt || now,
    updatedAt: now
  };
}

function demoProject({ type='document', prompt='', parsedFile, contentMode='generate' }) {
  const topic = prompt || parsedFile?.filename || 'Circularity that works';
  const pages = type === 'graphic' ? [
    {title:topic,layout:'stat',blocks:[
      {type:'kicker',text:'RECYKAL INSIGHT'},
      {type:'heading',text:topic},
      {type:'subheading',text:'A brand-locked graphic generated inside Long Form Design Studio.'},
      {type:'stat',value:'100%',label:'Recykal brand system enforced'},
      {type:'paragraph',text:'Connect the Studio AI server credential on Render to enable live generation, research, rewriting and image generation.'}
    ],speakerNotes:''}
  ] : [
    {title:topic,layout:'cover',blocks:[
      {type:'kicker',text:type==='presentation'?'PRESENTATION':'LONG-FORM DOCUMENT'},
      {type:'heading',text:topic},
      {type:'subheading',text: parsedFile ? `Designed from ${parsedFile.filename}` : 'Created for the Recykal marketing team'},
      {type:'paragraph',text:'This is a local demo project. Connect the Studio AI server credential to generate production content.'}
    ],speakerNotes:''},
    {title:'How the studio works',layout:'editorial',blocks:[
      {type:'heading',text:'Source-aware design workflow'},
      {type:'bullets',items:['Create with AI or upload a source file','Preserve, improve, condense, or research & expand','Edit every generated block','Continue documents without an application page cap','Export presentations, documents and graphics']},
      {type:'paragraph',text:`Current content mode: ${contentMode}.`}
    ],speakerNotes:''}
  ];
  return {title:topic,summary:'Demo project',pages,sources:[]};
}


function textWeight(page={}) {
  return (page.blocks||[]).reduce((n,b)=>n+(b.text||'').length+(b.items||[]).join(' ').length+(b.tableRows||[]).flat().join(' ').length,0);
}
function inferLayout(page={}, index=0, total=1) {
  const title=String(page.title||'').toLowerCase(); const blocks=page.blocks||[];
  if(index===0) return 'cover';
  if(index===total-1 && /thank|closing|conclusion|contact|next step/.test(title)) return 'closing';
  if(blocks.some(b=>b.type==='table')) return 'table';
  if(blocks.some(b=>b.type==='chart')) return 'chart';
  const stats=blocks.filter(b=>b.type==='stat').length;
  const bullets=blocks.find(b=>b.type==='bullets');
  if(/timeline|history|journey|evolution|milestone/.test(title)) return 'timeline';
  if(/process|how .*works|workflow|steps|pathway|roadmap|implementation/.test(title) || (bullets?.items?.length>=3 && bullets.items.length<=7 && /how|process|step|flow|journey/.test((page.blocks.find(b=>b.type==='heading')?.text||'').toLowerCase()))) return 'process';
  if(/compare|comparison|versus|vs\.|difference|options|goals|aspirations/.test(title)) return 'comparison';
  if(stats>=2) return 'stat';
  if(blocks.some(b=>b.type==='quote')) return 'quote';
  if(blocks.some(b=>b.type==='image')) return 'image-led';
  if(textWeight(page)>1300 || blocks.filter(b=>b.type==='paragraph').length>=3) return 'two-column';
  return page.layout && page.layout!=='editorial' ? page.layout : 'editorial';
}
function pageCapacity(layout='editorial'){
  return ({cover:620,editorial:760,'two-column':1380,stat:760,quote:700,timeline:760,comparison:760,process:760,table:760,chart:760,'image-led':700,closing:620})[layout]||760;
}
function blockUnits(block={},layout='editorial'){
  const two=layout==='two-column';
  const text=String(block.text||'');
  if(block.type==='kicker')return 28;
  if(block.type==='heading')return Math.max(64,Math.ceil(text.length/(two?46:58))*34);
  if(block.type==='subheading')return Math.max(42,Math.ceil(text.length/(two?60:76))*24);
  if(block.type==='paragraph')return 18+Math.ceil(text.length/(two?48:82))*18;
  if(block.type==='quote')return 70+Math.ceil(text.length/58)*22;
  if(block.type==='bullets')return 18+(block.items||[]).reduce((n,x)=>n+Math.max(28,Math.ceil(String(x).length/(two?38:68))*17+8),0);
  if(block.type==='stat')return 118;
  if(block.type==='image')return layout==='image-led'?390:260;
  if(block.type==='chart')return 280;
  if(block.type==='table')return 38+Math.max(1,(block.tableRows||[]).length)*31;
  return 40;
}
function splitWordsToLimit(text='',maxChars=1000){
  const words=String(text).trim().split(/\s+/).filter(Boolean);if(!words.length)return[];const out=[];let cur='';for(const w of words){const next=(cur+' '+w).trim();if(cur&&next.length>maxChars){out.push(cur);cur=w}else cur=next}if(cur)out.push(cur);return out;
}
function continuationHeading(page){return normalizeBlock({type:'heading',text:`${String(page.title||'Section').replace(/\s*[—-]\s*continued$/i,'')} — continued`});}
function splitPageToA4(page){
  const layout=page.layout||'editorial';
  if(['cover','closing'].includes(layout))return [page];
  const cap=pageCapacity(layout),firstStructural=[],body=[];
  for(const b of page.blocks||[]){if(['kicker','heading','subheading'].includes(b.type)&&body.length===0)firstStructural.push(b);else body.push(b)}
  const pages=[];let current={...page,blocks:[...firstStructural]};let used=current.blocks.reduce((n,b)=>n+blockUnits(b,layout),0);let hasBody=false;
  const flush=()=>{if(current.blocks.length){pages.push(current);current={...page,id:uuid(),title:`${String(page.title||'Section').replace(/\s*[—-]\s*continued$/i,'')} — continued`,blocks:[continuationHeading(page)],speakerNotes:''};used=blockUnits(current.blocks[0],layout);hasBody=false;}};
  const addBlock=(b)=>{current.blocks.push(b);used+=blockUnits(b,layout);hasBody=true;};
  for(const original of body){
    if(original.type==='table'){
      const rows=[...(original.tableRows||[])];let pos=0;while(pos<rows.length){const room=Math.max(2,Math.floor((cap-used-45)/31));if(room<2&&hasBody){flush();continue}const count=Math.max(2,room);const chunk=rows.slice(pos,pos+count);const b={...original,id:pos===0?original.id:uuid(),tableRows:chunk,caption:pos===0?original.caption:`${original.caption||page.title} — continued`};if(used+blockUnits(b,layout)>cap&&hasBody){flush();continue}addBlock(b);pos+=chunk.length;if(pos<rows.length)flush()}continue;
    }
    if(original.type==='bullets'&&(original.items||[]).length){
      let items=[...(original.items||[])];while(items.length){const fit=[];let probe={...original,items:[]};while(items.length){const candidate=[...fit,items[0]];probe={...original,items:candidate};if(fit.length&&used+blockUnits(probe,layout)>cap)break;fit.push(items.shift());if(used+blockUnits(probe,layout)>=cap)break}if(!fit.length&&hasBody){flush();continue}addBlock({...original,id:fit.length===(original.items||[]).length?original.id:uuid(),items:fit});if(items.length)flush()}continue;
    }
    const cost=blockUnits(original,layout);
    if(original.type==='paragraph'&&cost>cap-used){
      const maxChars=layout==='two-column'?1700:1050;const chunks=splitWordsToLimit(original.text,maxChars);for(let ci=0;ci<chunks.length;ci++){const b={...original,id:ci===0?original.id:uuid(),text:chunks[ci]};if(used+blockUnits(b,layout)>cap&&hasBody)flush();addBlock(b);if(ci<chunks.length-1)flush()}continue;
    }
    if(used+cost>cap&&hasBody)flush();
    addBlock(original);
  }
  if(current.blocks.length>1||!pages.length)pages.push(current);
  return pages.map((p,i)=>({...p,a4:{format:'A4',orientation:'portrait',fixed:true,continuation:i>0||/continued/i.test(p.title)}}));
}
export function enforceA4DocumentPages(project){
  if(project.type!=='document')return project;
  const out=[];for(const p of project.pages||[])out.push(...splitPageToA4(p));project.pages=out;project.settings={...(project.settings||{}),pageFormat:'A4',pageOrientation:'portrait',fixedPageSize:true};return project;
}
function applyLayoutIntelligence(project) {
  const allowed=new Set(['cover','editorial','two-column','stat','quote','timeline','comparison','process','table','chart','image-led','closing']);
  let prev=''; let run=0;
  project.pages=(project.pages||[]).map((p,i)=>{
    let layout=allowed.has(p.layout)?p.layout:inferLayout(p,i,project.pages.length);
    if(['editorial','two-column'].includes(layout)) layout=inferLayout({...p,layout},i,project.pages.length);
    if(layout===prev) run++; else {prev=layout;run=1;}
    if(project.type==='document' && run>=3 && ['editorial','two-column'].includes(layout)) { layout=layout==='editorial'?'two-column':'editorial'; prev=layout;run=1; }
    return {...p,layout};
  });
  return enforceA4DocumentPages(project);
}

function tokenSet(text=''){return new Set(String(text).toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>3))}
function assetScore(asset, page, block){const a=tokenSet(`${asset.name||''} ${asset.url||''}`),q=tokenSet(`${page.title||''} ${block.imagePrompt||''}`);let score=0;for(const t of q)if(a.has(t))score++;return score}
async function materializeAutoImages(project, onProgress=null) {
  const source=project.settings?.imageSource||'mixed';
  if(['none','placeholder'].includes(source)) return project;
  const ai=client();
  const style=project.settings?.deckStyle||'auto'; const defaults={visual:10,classic:6,consultant:3,minimal:2,auto:6};
  const configured=process.env.AUTO_IMAGE_LIMIT?Number(process.env.AUTO_IMAGE_LIMIT):defaults[style]||6;
  const max=Math.max(0,Math.min(14,configured));
  const candidates=[];
  for(const page of project.pages||[]) for(const block of page.blocks||[]) if(block.type==='image' && !block.imageUrl && String(block.imagePrompt||'').trim()) candidates.push({page,block});
  const approvedAssets=[...(project.sourceFile?.assets||[]),...(project.settings?.approvedAssets||[])].filter(a=>a?.url);
  const used=new Set();
  if(['brand-assets','mixed'].includes(source) && approvedAssets.length){
    for(const c of candidates){
      const ranked=approvedAssets.filter(a=>!used.has(a.url)).map(a=>[a,assetScore(a,c.page,c.block)]).sort((x,y)=>y[1]-x[1]);
      const pick=ranked[0]; if(!pick)continue;
      // For brand-assets, use the best available asset even with weak filename matching. In Mixed, require at least a small semantic match unless only one asset exists.
      if(source==='brand-assets' || pick[1]>0 || approvedAssets.length===1){c.block.imageUrl=pick[0].url;c.block.provenance={kind:'approved-asset',source:pick[0].name||pick[0].url};used.add(pick[0].url);if(onProgress)await onProgress({stage:'visual',pageId:c.page.id,blockId:c.block.id,page:c.page,kind:'approved-asset'})}
    }
  }
  if(source==='stock'){
    let stocked=0;for(const {page,block} of candidates){if(block.imageUrl||stocked>=max)continue;try{const results=await searchStock({q:`${page.title} ${block.imagePrompt}`.slice(0,220),licenseType:'commercial',pageSize:6});const pick=results[0];if(!pick)continue;const imported=await fetchStockImage(pick);const saved=await persistBytes(imported.bytes,{name:`stock-${pick.id}.jpg`,mimeType:imported.mimeType,metadata:{kind:'licensed-stock',stock:pick}});block.imageUrl=saved.url;block.provenance={kind:'licensed-stock',assetId:saved.id,source:pick.source,creator:pick.creator,license:pick.license,licenseUrl:pick.licenseUrl,attribution:pick.attribution,landingUrl:pick.foreignLandingUrl};block.sourceCredit=pick.attribution||[pick.creator,pick.license].filter(Boolean).join(' · ');if(!block.altText)block.altText=pick.title||block.imagePrompt;stocked++;if(onProgress)await onProgress({stage:'visual',pageId:page.id,blockId:block.id,page,kind:'licensed-stock'});}catch{}}return project;
  }
  if(!ai || String(process.env.AUTO_GENERATE_IMAGES??'true').toLowerCase()==='false' || source==='brand-assets') return project;
  const refs=[];for(const r of (project.settings?.styleReferences||[]).slice(0,4)){let candidate=r.path||'';try{if(candidate){await fs.access(candidate);refs.push(candidate);continue}}catch{}if(r.assetId){try{const a=await getBinaryAsset(r.assetId);if(a){const ext=a.mimeType==='image/jpeg'?'.jpg':a.mimeType==='image/webp'?'.webp':'.png';const dir=path.resolve('tmp/style-references');await fs.mkdir(dir,{recursive:true});candidate=path.join(dir,`${r.assetId}${ext}`);await fs.writeFile(candidate,a.bytes);refs.push(candidate)}}catch{}}}
  let generated=0;
  for(const {page,block} of candidates) {
    if(block.imageUrl || generated>=max)continue;
    try {
      const optionCount=Math.max(1,Math.min(3,Number(project.settings?.imageVariations)||1));
      const dir=path.resolve('data/uploads/generated'); await fs.mkdir(dir,{recursive:true}); const urls=[];let focalPath='';
      for(let vi=0;vi<optionCount;vi++){
        const bytes=await generateImage({prompt:`${page.title}. ${block.imagePrompt}`,aspect:project.type==='graphic'?'portrait':'landscape',artStyleId:project.settings?.artStyleId||'auto',customArtStyle:project.settings?.customArtStyle||'',referencePaths:refs,themeId:project.settings?.themeId||'recykal-core',projectPalette:project.settings?.projectPalette||[]});
        const saved=await persistBytes(bytes,{name:`generated-${uuid()}.png`,mimeType:'image/png',metadata:{kind:'ai-generated',projectId:project.id,pageId:page.id,blockId:block.id,artStyle:project.settings?.artStyleId||'auto'}});urls.push(saved.url);
        if(!focalPath){const filename=`${uuid()}.png`;focalPath=path.join(dir,filename);await fs.writeFile(focalPath,bytes)}
      }
      block.imageUrl=urls[0];block.imageVariations=urls;
      const focal=await analyzeImageFocalPoint(focalPath,block.altText||block.imagePrompt||page.title);block.focalX=focal.focalX;block.focalY=focal.focalY;
      block.provenance={kind:'ai-generated',engine:'Studio Image',generatedAt:new Date().toISOString(),artStyle:project.settings?.artStyleId||'auto',focalReason:focal.reason};
      if(!block.altText) block.altText=String(block.imagePrompt).slice(0,220); generated++;if(onProgress)await onProgress({stage:'visual',pageId:page.id,blockId:block.id,page,kind:'ai-generated'});
    } catch {}
  }
  return project;
}

function generationInstruction({ type, prompt, parsedFile, contentMode, audience, tone, language, research, visualStyle, deckStyle='auto', themeId='recykal-core', projectPalette=[], imageSource='mixed', artStyleId='auto', customArtStyle='', imageVariations=1, styleReferences=[], template, knowledge=[], approvedOutline=null }) {
  const modeMap = {
    preserve: 'PRESERVE: Keep all factual content from the source. You may reorganize it for design, but do not rewrite facts or add unsupported information.',
    improve: 'IMPROVE: Improve clarity and editorial quality while preserving factual meaning. Do not introduce new claims unless clearly supported by the source.',
    condense: 'CONDENSE: Reduce repetition and length while retaining key facts, names, figures, dates, caveats, and conclusions.',
    research_expand: 'RESEARCH_EXPAND: Use the source as the foundation, add current credible research where useful, and populate the sources array with traceable sources.',
    generate: 'GENERATE: Create original content from the user brief. Do not invent statistics or citations. If research is enabled, use credible web sources and include them.'
  };
  const sourceText = parsedFile?.text ? parsedFile.text.slice(0, MAX_SOURCE_CHARS) : '';
  const sourceAssets = parsedFile?.assets?.length ? parsedFile.assets.map(a=>a.url).join('\n') : 'None';
  const systemRules = assetSpecificRules(type,{hasSource:Boolean(parsedFile),research:Boolean(research)});
  const cleanPalette=normalizeProjectPalette(projectPalette); const theme=getTheme(themeId,cleanPalette); const deck=getDeckStyle(deckStyle); const imageSourceRule=getImageSource(imageSource); const art=getArtStyle(artStyleId);
  const artDirection=artStyleId==='custom' ? String(customArtStyle||'').trim() : art.prompt;
  const templateRules = template ? `\nSELECTED DESIGN SYSTEM: ${template.name}\nLAYOUT RHYTHM: ${template.sequence.join(' -> ')}\nTEMPLATE GUIDANCE: ${template.guidance}` : '';
  const knowledgeText = (knowledge||[]).map((k,i)=>`===== KNOWLEDGE ${i+1}: ${k.filename} =====\n${String(k.text||'').slice(0,120000)}`).join('\n\n');
  return `
OUTPUT TYPE: ${type.toUpperCase()}
USER BRIEF: ${prompt || 'Design the supplied content.'}
CONTENT MODE: ${modeMap[contentMode] || modeMap.generate}
AUDIENCE: ${audience || 'Recykal marketing stakeholders'}
TONE: ${tone || 'Professional, confident, precise'}
LANGUAGE: ${language || 'English (India)'}
VISUAL DIRECTION: ${visualStyle || 'Premium editorial, clean, contemporary, sustainability-forward without visual clichés'}
DECK / DOCUMENT STYLE: ${deck.name}
STYLE BEHAVIOR: ${deck.rules}
THEME: ${theme.name} — ${theme.description}
PROJECT PALETTE: ${cleanPalette.length?cleanPalette.join(', '):'Not supplied — use the selected Recykal theme palette.'}
PALETTE RULE: If a project palette is supplied, use it deliberately for project accents/data/visual fields while preserving legible neutral text/backgrounds, Poppins typography and the original Recykal logo artwork. Do not invent extra accent colours.
IMAGE SOURCE: ${imageSourceRule.name} — ${imageSourceRule.description}
AI ART STYLE: ${art.name}${artDirection?` — ${artDirection}`:''}
IMAGE VARIATIONS PER GENERATED IMAGE: ${Math.max(1,Math.min(3,Number(imageVariations)||1))}
STYLE REFERENCES SUPPLIED: ${(styleReferences||[]).length}

DESIGN DECISION RULES:
${systemRules}${templateRules}
${REFERENCE_LAYOUT_LEARNINGS}

STRUCTURE RULES:
- Return a complete structured project with title, summary, pages, and sources.
- For DOCUMENT: do NOT target a fixed page count. Create the amount of content required by the brief/source. Long Form Design Studio has no application-level document page cap. Organize the output as continuous designable sections/pages. Do not write "Page 1" labels into content.
- For PRESENTATION: use one clear idea per slide, strong visual hierarchy, and varied layout types. Include speaker notes only when useful.
- For GRAPHIC: return exactly one page. Keep copy concise, visual-first and production suitable.
- Every block must use one of the supported block types. Use stat/chart/table only when the content supports it. For chart blocks choose chartType by the analytical question: bar/dot for category comparison, line for time, scatter for relationship. For scatter, use data.x as the independent numeric variable and data.value as the dependent variable; for other charts data.x may simply be the sequence index. Use a TABLE block with tableHeaders/tableRows for exact lookup or when preserving source tables, including text values. Never convert a source table into a chart unless that transformation improves the analytical task without losing values/context.
- Every meaningful image block must include concise altText. imagePrompt describes what to generate; altText describes the information conveyed to a reader who cannot see it.
- When you want an image, add an image block with a highly specific imagePrompt; do not put fake image URLs.
- Do not include brand color codes in body copy.
- Analyze content before selecting layout. Build semantic hierarchy first, then visual styling.
- Reject same-template repetition, card inflation, tiny copy, decorative charts, random gradients and visual elements without a communication role.
- Apply accessibility, data-integrity, image-quality and production gates from the Design Intelligence Knowledge Base.
- For file-based design, validate completeness against source and flag low extraction confidence rather than guessing.
- PAGE FILL / DENSITY: Avoid accidental dead space. For ordinary narrative/evidence pages, target roughly 68–88% meaningful visual occupancy. Sparse pages are allowed only when they are intentional opening, divider, quote, pause or closing pages. If content is dense, recompose into 2 columns, tables, stat grids or evidence panels instead of shrinking type.
- A4 IS A HARD PHYSICAL CONSTRAINT: every document page must remain exactly A4 portrait (210 × 297 mm). Never increase page height to fit content. If content does not fit, create a continuation page.
- COLUMNS: On A4 documents, use the 6-column editorial grid to create 1-column, 2-column or 3-module compositions according to content. Use 2 text columns for dense body narrative; use 3 columns only for short cards/facts, never for long paragraphs. A two-column decision changes composition only, never physical page dimensions.
- TABLES: Preserve every source cell. Use clear headers, row grouping, alignment and adequate row height. Never truncate or ellipsize critical table values. If a table is too large, continue it on a new page and repeat the header.
- INFOGRAPHICS: Whenever content expresses sequence, chronology, comparison, system architecture or grouped facts, prefer a process/timeline/comparison/stat layout rather than plain paragraphs. Use native vector lines, nodes, arrows and relevant icons.
- ICONS / VECTORS: Use relevant vector iconography for short semantic items (policy, people, finance, circularity, location, technology, target, governance, logistics, data). Do not use icons as decoration; every icon must reinforce meaning.
- IMAGES: Use purposeful images for evidence, context or emotional pacing. Long documents should normally include an image-led/contextual visual every few pages when the subject supports it. Add specific image blocks so the renderer can create or accept a replacement image. Never invent a factual photograph.
- VISUAL RHYTHM: Alternate narrative, evidence, pause and synthesis pages. Avoid more than 2 consecutive pages with the same composition unless the source structure requires it.
- STEERABLE CONTENT / DESIGN STYLES:
  * Auto: infer the right density and visual balance from purpose, audience, evidence and format.
  * Minimal: one dominant message at a time, restrained imagery, deliberate whitespace; use more pages instead of shrinking text or dropping content.
  * Visual: image-forward and illustrative; prioritize diagrams, visual comparisons and large data moments while keeping copy concise.
  * Classic: balanced editorial narrative, visuals, statistics and evidence with controlled variation.
  * Consultant: dense, structured and analytical; use columns, frameworks, tables, direct-labelled charts, annotations and explicit recommendations.
- The selected style changes layout and writing behavior, but correctness, comprehension, hierarchy and accessibility always outrank decoration.
- THEME RULE: Theme controls surface/background roles, typography scale, shape treatment and how the approved Recykal colors are distributed. Never introduce unapproved brand colors.
- IMAGE SOURCE RULE: Respect the selected image source. 'No images' means do not create image blocks; 'Image placeholders' means create purposeful image blocks but do not expect media generation; 'Recykal / source assets' means prefer supplied/Knowledge Hub media; 'Licensed stock' means use rights-aware stock with license/attribution provenance; 'Mixed' means use approved/source media first and AI only for genuine gaps.
- ART STYLE RULE: Apply one coherent project-level image language. Individual pages may vary subject/composition, not randomly switch mediums. Custom art-direction text is a constraint, not optional decoration.
- STYLE REFERENCES: When reference images are supplied, treat them as a moodboard for composition, texture, lighting and visual language. Do not copy protected logos/text or reproduce a reference verbatim.

${approvedOutline?.length ? `APPROVED DESIGN PLAN / OUTLINE (follow this structure unless fidelity requires a safe adjustment):\n${approvedOutline.map((x,i)=>`${i+1}. ${x.title} | role=${x.role||''} | layout=${x.layout||''} | visual=${x.visualTreatment||''}`).join('\n')}\n\n` : ''}${parsedFile ? `SOURCE FILE: ${parsedFile.filename}\nSOURCE KIND: ${parsedFile.kind}\nSOURCE METADATA: ${JSON.stringify(parsedFile.metadata)}
SOURCE EXTRACTION CONFIDENCE: ${parsedFile.extractionConfidence || parsedFile.metadata?.extractionConfidence || 'not supplied'}\nEXTRACTED ASSETS:\n${sourceAssets}\n\nSOURCE CONTENT START\n${sourceText}\nSOURCE CONTENT END` : 'NO SOURCE FILE PROVIDED.'}${knowledgeText ? `\n\nSUPPLEMENTAL RECYKAL KNOWLEDGE HUB CONTEXT (use only when relevant; do not override an attached source of truth):\n${knowledgeText}` : ''}
`;
}

function friendlyStructuredError(err, name='structured output') {
  const msg=String(err?.message||err||'').trim();
  if(/unterminated string|unexpected end of json|json/i.test(msg)) return new Error(`Studio AI returned an incomplete ${name}. Retrying this page safely.`);
  if(/maximum context|max_output|length|incomplete/i.test(msg)) return new Error(`Studio AI reached an output limit while creating ${name}. The Studio will retry with a smaller response.`);
  return err instanceof Error ? err : new Error(msg||`Could not create ${name}.`);
}

async function structuredResponse({ input, schema, name, research=false, maxOutputTokens=16000, attempts=3 }) {
  const ai = client();
  if (!ai) return null;
  let lastError=null;
  for(let attempt=1;attempt<=Math.max(1,attempts);attempt++){
    try{
      const request = {
        model: MODEL,
        store: false,
        reasoning: { effort: attempt===1?'medium':'low' },
        instructions: brandSystemPrompt,
        input,
        max_output_tokens: Math.max(2500,Math.min(32000,Number(maxOutputTokens)||16000)),
        text: { format: { type:'json_schema', name, schema, strict:true } }
      };
      if (research) request.tools = [{ type:'web_search' }];
      const response = await ai.responses.create(request);
      if(response?.status==='incomplete') throw new Error(`Structured response incomplete: ${response?.incomplete_details?.reason||'output limit'}`);
      const text = response.output_text;
      if (!text) throw new Error('OpenAI returned no structured output.');
      try{return JSON.parse(text)}catch(parseError){throw friendlyStructuredError(parseError,name)}
    }catch(err){
      lastError=friendlyStructuredError(err,name);
      if(attempt<attempts) await new Promise(r=>setTimeout(r,350*attempt));
    }
  }
  throw lastError||new Error(`Could not create ${name}.`);
}


async function buildGenerationInput(options) {
  const instruction = generationInstruction(options);
  let input = instruction;
  const uploadedIds = [];
  const ai = client();
  if (ai && (options.parsedFile || options.styleReferences?.length)) {
    const content = [{ type:'input_text', text:instruction }];
    for (const src of (options.parsedFile?.originalFiles || []).filter(f => f.extension === '.pdf').slice(0,4)) {
      try {
        const uploaded = await ai.files.create({file:createReadStream(src.path),purpose:'user_data',expires_after:{anchor:'created_at',seconds:3600}});
        uploadedIds.push(uploaded.id); content.push({ type:'input_file', file_id:uploaded.id });
      } catch {}
    }
    for (const asset of (options.parsedFile?.assets || []).slice(0,10)) {
      const ext = path.extname(asset.name || asset.path || '').toLowerCase();
      const mime = ext==='.png'?'image/png':(['.jpg','.jpeg'].includes(ext)?'image/jpeg':ext==='.webp'?'image/webp':null);
      if (!mime || !asset.path) continue;
      try { const bytes=await fs.readFile(asset.path); if(bytes.length<=8*1024*1024)content.push({type:'input_image',image_url:`data:${mime};base64,${bytes.toString('base64')}`,detail:'high'}); } catch {}
    }
    for(const ref of (options.styleReferences||[]).slice(0,4)){
      try{const ext=path.extname(ref.path||'').toLowerCase();const mime=ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg';const bytes=await fs.readFile(ref.path);if(bytes.length<=10*1024*1024)content.push({type:'input_image',image_url:`data:${mime};base64,${bytes.toString('base64')}`,detail:'high'});}catch{}
    }
    input=[{role:'user',content}];
  }
  return {instruction,input,uploadedIds,ai};
}


const generatedPageResultSchema = {
  type:'object',
  additionalProperties:false,
  required:['page','sources'],
  properties:{
    page: pageSchema,
    sources: projectSchema.properties.sources
  }
};

function projectOptionsFromGeneration(options={}){
  return {
    type:options.type,
    sourceFile: options.parsedFile ? { filename:options.parsedFile.filename, kind:options.parsedFile.kind, metadata:options.parsedFile.metadata, assets:options.parsedFile.assets||[], uploadId:options.parsedFile.uploadId||null, extractionConfidence:options.parsedFile.extractionConfidence||options.parsedFile.metadata?.extractionConfidence||null } : null,
    inputMode: options.parsedFile ? 'file' : 'prompt',
    contentMode: options.contentMode,
    settings:{ audience:options.audience, tone:options.tone, language:options.language, visualStyle:options.visualStyle, deckStyle:options.deckStyle||'auto', themeId:options.themeId||'recykal-core', projectPalette:normalizeProjectPalette(options.projectPalette), imageSource:options.imageSource||'mixed', artStyleId:options.artStyleId||'auto', customArtStyle:options.customArtStyle||'', imageVariations:Math.max(1,Math.min(3,Number(options.imageVariations)||1)), styleReferences:options.styleReferences||[], masterFields:{headerText:'',footerText:'',pageNumbers:true,logoMode:'cover-only'}, research:options.contentMode==='preserve'?false:Boolean(options.research), templateId:options.template?.id||null, templateName:options.template?.name||null, knowledgeIds:(options.knowledge||[]).map(k=>k.id), approvedAssets:(options.knowledge||[]).flatMap(k=>k.assets||[]).slice(0,60) }
  };
}

function terms(text=''){
  return String(text).toLowerCase().replace(/[^a-z0-9%₹$€£]+/g,' ').split(/\s+/).filter(x=>x.length>3).slice(0,40);
}
function sourceChunks(text='',size=16000,overlap=1800){
  const clean=String(text||'');if(!clean)return[];const out=[];let pos=0;while(pos<clean.length){out.push({start:pos,text:clean.slice(pos,pos+size)});if(pos+size>=clean.length)break;pos+=Math.max(2000,size-overlap)}return out;
}
function relevantSourceContext(options,item,index,total,maxChars=32000){
  const text=String(options.parsedFile?.text||'');if(!text)return'';
  const chunks=sourceChunks(text,14000,1800);if(!chunks.length)return text.slice(0,maxChars);
  const q=terms(`${item?.title||''} ${item?.purpose||''} ${item?.role||''}`);const scored=chunks.map(c=>{const low=c.text.toLowerCase();let score=0;for(const t of q)if(low.includes(t))score++;return {c,score}}).sort((a,b)=>b.score-a.score||a.c.start-b.c.start);
  const proportional=chunks[Math.min(chunks.length-1,Math.floor((Math.max(0,index)/Math.max(1,total))*chunks.length))];
  const chosen=[];const seen=new Set();for(const c of [proportional,...scored.slice(0,3).map(x=>x.c)]){if(!c||seen.has(c.start))continue;seen.add(c.start);chosen.push(c);if(chosen.reduce((n,x)=>n+x.text.length,0)>=maxChars)break}
  return chosen.map((c,i)=>`SOURCE EXCERPT ${i+1} (around character ${c.start}):\n${c.text}`).join('\n\n').slice(0,maxChars);
}
function relevantKnowledgeContext(options,item,maxChars=12000){
  const q=terms(`${item?.title||''} ${item?.purpose||''}`);const ranked=(options.knowledge||[]).map(k=>{const text=String(k.text||'');const low=text.toLowerCase();let score=0;for(const t of q)if(low.includes(t))score++;return {k,text,score}}).sort((a,b)=>b.score-a.score);
  return ranked.slice(0,2).map(({k,text})=>`KNOWLEDGE: ${k.filename}\n${text.slice(0,6000)}`).join('\n\n').slice(0,maxChars);
}
function compactPageContext(pages=[]){
  return pages.slice(-3).map((p,i)=>({title:p.title,layout:p.layout,blocks:(p.blocks||[]).map(b=>({type:b.type,text:String(b.text||'').slice(0,600),items:(b.items||[]).slice(0,8),label:b.label,value:b.value,caption:String(b.caption||'').slice(0,240),tableHeaders:(b.tableHeaders||[]).slice(0,12),tableRows:(b.tableRows||[]).slice(0,8)}))}));
}
function mergeSources(existing=[],incoming=[]){
  const out=[...(existing||[])];const keys=new Set(out.map(s=>String(s.url||s.title||'').trim().toLowerCase()).filter(Boolean));for(const src of incoming||[]){const key=String(src?.url||src?.title||'').trim().toLowerCase();if(!key||keys.has(key))continue;keys.add(key);out.push(src)}return out.slice(0,120);
}

async function generatePlannedPage(options,project,item,index,total,onProgress){
  const ruleSource=options.parsedFile?{...options.parsedFile,text:'',assets:[]}:null;
  const globalRules=generationInstruction({...options,parsedFile:ruleSource,knowledge:[],approvedOutline:null});
  const prior=compactPageContext(project.pages);
  const allowResearch=options.contentMode!=='preserve' && Boolean(options.research||options.contentMode==='research_expand') && /evidence|research|market|context|finding|trend|benchmark|comparison|policy|data|impact/i.test(`${item?.role||''} ${item?.title||''} ${item?.purpose||''}`);
  let lastError=null;
  for(let attempt=1;attempt<=3;attempt++){
    const sourceMax=attempt===1?32000:attempt===2?20000:12000;
    const source=relevantSourceContext(options,item,index,total,sourceMax);
    const knowledge=relevantKnowledgeContext(options,item,attempt===1?12000:7000);
    const conservative=attempt>1?`\nRECOVERY PASS ${attempt}: Keep the page response compact. Prefer fewer, complete blocks over long prose. Never truncate a string, table cell, list item or JSON field. Preserve all critical source facts assigned to this page.`:'';
    const input=`Generate exactly ONE ${options.type==='presentation'?'slide':options.type==='graphic'?'graphic canvas':'designed document page/section'} as item ${index+1} of ${total}. This request is deliberately page-scoped: never return the full project.\n\nPLANNED PAGE:\nTitle: ${item?.title||`Page ${index+1}`}\nRole: ${item?.role||'narrative'}\nRequired layout: ${item?.layout||'editorial'}\nVisual treatment: ${item?.visualTreatment||'Use the design intelligence rules'}\nPurpose: ${item?.purpose||''}\n\nPROJECT TITLE: ${project.title}\nPROJECT SUMMARY/STRATEGY: ${project.summary}\nRECENT COMPLETED PAGES (avoid repetition and maintain continuity):\n${JSON.stringify(prior)}\n\n${globalRules}\n\n${source?`AUTHORITATIVE SOURCE EXCERPTS FOR THIS PAGE:\n${source}\n`:''}${knowledge?`\nRELEVANT RECYKAL KNOWLEDGE CONTEXT:\n${knowledge}\n`:''}${conservative}\n\nPAGE-SCOPED RULES:\n- Return one page and its sources only.\n- Follow the planned role/layout unless source fidelity makes a small safe adjustment necessary.\n- Do not duplicate prior-page content.\n- If this page contains a source table, preserve its cells and units; use a table block.\n- If content is sequential/chronological/comparative, use process/timeline/comparison structure rather than plain paragraphs.\n- For image needs, create image blocks with specific imagePrompt and altText, not fake URLs.\n- Never invent metrics, citations, quotations, people, dates or product claims.\n- Keep body copy readable; use columns or additional pages rather than tiny type. A document page must fit an A4 portrait sheet with no vertical growth or overflow; continue onto another page when needed.\n- Do not put the Recykal logo into page content; the master renderer handles the logo on the cover only.`;
    try{
      const raw=await structuredResponse({name:'recykal_incremental_page',schema:generatedPageResultSchema,research:allowResearch,input,maxOutputTokens:attempt===1?12000:8000,attempts:1});
      if(!raw?.page)throw new Error('Studio AI returned no page.');
      const page=normalizePage({...raw.page,title:raw.page.title||item?.title||`Page ${index+1}`,layout:raw.page.layout||item?.layout||'editorial'});
      return {page,sources:raw.sources||[]};
    }catch(err){
      lastError=err; if(attempt<3)await onProgress({stage:'retry',index,total,attempt:attempt+1,message:`Page ${index+1} needed a safe retry. Completed pages are preserved.`});
    }
  }
  const error=new Error(`Page ${index+1} could not be completed after 3 safe retries. Completed pages have been preserved so you can resume instead of starting over.`);error.cause=lastError;error.projectId=project.id;throw error;
}

function streamedPagesFromJson(text='') {
  const key=text.indexOf('"pages"'); if(key<0)return [];
  const start=text.indexOf('[',key); if(start<0)return [];
  const out=[]; let inString=false,escape=false,depth=0,objStart=-1;
  for(let i=start+1;i<text.length;i++){
    const ch=text[i];
    if(inString){if(escape){escape=false;continue}if(ch==='\\'){escape=true;continue}if(ch==='"')inString=false;continue}
    if(ch==='"'){inString=true;continue}
    if(ch==='{'){if(depth===0)objStart=i;depth++;continue}
    if(ch==='}'){depth--;if(depth===0&&objStart>=0){const raw=text.slice(objStart,i+1);try{out.push(JSON.parse(raw))}catch{}objStart=-1;}continue}
    if(ch===']'&&depth===0)break;
  }
  return out;
}

async function finalizeGeneratedProject(data, options, {onProgress=null}={}) {
  let project = normalizeProject(data, {
    type:options.type,
    sourceFile: options.parsedFile ? { filename:options.parsedFile.filename, kind:options.parsedFile.kind, metadata:options.parsedFile.metadata, assets:options.parsedFile.assets||[], uploadId:options.parsedFile.uploadId||null, extractionConfidence:options.parsedFile.extractionConfidence||options.parsedFile.metadata?.extractionConfidence||null } : null,
    inputMode: options.parsedFile ? 'file' : 'prompt', contentMode: options.contentMode,
    settings:{ audience:options.audience, tone:options.tone, language:options.language, visualStyle:options.visualStyle, deckStyle:options.deckStyle||'auto', themeId:options.themeId||'recykal-core', projectPalette:normalizeProjectPalette(options.projectPalette), imageSource:options.imageSource||'mixed', artStyleId:options.artStyleId||'auto', customArtStyle:options.customArtStyle||'', imageVariations:Math.max(1,Math.min(3,Number(options.imageVariations)||1)), styleReferences:options.styleReferences||[], masterFields:{headerText:'',footerText:'',pageNumbers:true,logoMode:'cover-only'}, research:options.contentMode==='preserve'?false:Boolean(options.research), templateId:options.template?.id||null, templateName:options.template?.name||null, knowledgeIds:(options.knowledge||[]).map(k=>k.id), approvedAssets:(options.knowledge||[]).flatMap(k=>k.assets||[]).slice(0,60) }
  });
  project=applyLayoutIntelligence(project); if(onProgress)await onProgress({stage:'layout',project});
  project.qc=await qualityControlProject(project,{parsedFile:options.parsedFile}); if(onProgress)await onProgress({stage:'qc',qc:project.qc,project});
  const ai=client(); const autoQc=String(process.env.AUTO_QC ?? 'true').toLowerCase() !== 'false'; const maxRevisions=Math.max(0,Math.min(2,Number(process.env.QC_MAX_REVISIONS||1)));
  if(ai&&autoQc&&maxRevisions>0&&!project.qc.pass&&options.incremental){
    const candidates=[...new Set((project.qc.staticIssues||project.qc.issues||[]).filter(x=>Number.isInteger(x.pageIndex)).sort((a,b)=>(a.severity==='blocking'?-1:1)-(b.severity==='blocking'?-1:1)).map(x=>x.pageIndex))].slice(0,6);
    for(const pageIndex of candidates){
      const original=project.pages[pageIndex];if(!original)continue;
      const pageIssues=(project.qc.staticIssues||project.qc.issues||[]).filter(x=>x.pageIndex===pageIndex).map(x=>`${x.severity}: ${x.message}`);
      if(!pageIssues.length)continue;
      if(onProgress)await onProgress({stage:'revision',attempt:1,pageIndex,message:`Improving page ${pageIndex+1} against A4/layout QC…`});
      try{
        const src=relevantSourceContext(options,{title:original.title,purpose:'QC repair'},pageIndex,project.pages.length,16000);
        const revised=await structuredResponse({name:'recykal_page_qc_repair',schema:pageSchema,research:false,maxOutputTokens:9000,attempts:2,input:`Repair exactly ONE existing ${project.type==='presentation'?'slide':'A4 document page'} to resolve the listed QC defects. Preserve every factual claim, number, date, name, table cell, chart datum, citation and source. Do not add unsupported facts. Keep the Recykal design system. For documents, physical size is exactly A4 portrait (210 x 297 mm); never increase page height. If content is too dense, simplify phrasing without dropping facts or use a denser semantic layout; the deterministic paginator can create a continuation page if still necessary.

QC DEFECTS:
${pageIssues.join('\n')}

CURRENT PAGE:
${JSON.stringify(original)}${src?`

AUTHORITATIVE SOURCE EXCERPT:
${src}`:''}`});
        if(revised){const repaired=normalizePage({...revised,id:original.id,title:revised.title||original.title});const pos=project.pages.findIndex(p=>p.id===original.id);if(pos>=0)project.pages[pos]=repaired;project=applyLayoutIntelligence(project);if(onProgress)await onProgress({stage:'revision',attempt:1,pageIndex,project,applied:true});}
      }catch{}
    }
    project.qc=await qualityControlProject(project,{parsedFile:options.parsedFile});if(onProgress)await onProgress({stage:'qc',qc:project.qc,project});
  }
  if(ai&&autoQc&&maxRevisions>0&&!project.qc.pass&&!options.incremental&&project.pages.length<=8){
    for(let attempt=0;attempt<maxRevisions&&!project.qc.pass;attempt++){
      if(onProgress)await onProgress({stage:'revision',attempt:attempt+1,qc:project.qc});
      const source=options.parsedFile?.text?options.parsedFile.text.slice(0,180000):'';
      const revised=await structuredResponse({name:'recykal_design_project_revision',schema:projectSchema,research:false,input:`Revise this project to resolve every blocking defect and materially improve the failed QC categories. Preserve factual meaning and source fidelity. Do not add unsupported facts.\n\nQC REVIEW:\n${JSON.stringify(project.qc)}\n\nCURRENT PROJECT:\n${JSON.stringify(project)}${source?`\n\nSOURCE EXCERPT (authoritative where content mode requires preservation):\n${source}`:''}`});
      if(!revised)break;
      project=normalizeProject(revised,{...project,id:project.id,type:project.type,sourceFile:project.sourceFile,inputMode:project.inputMode,contentMode:project.contentMode,settings:project.settings,createdAt:project.createdAt});
      project=applyLayoutIntelligence(project);project.qc=await qualityControlProject(project,{parsedFile:options.parsedFile});if(onProgress)await onProgress({stage:'revision',attempt:attempt+1,qc:project.qc,project,applied:true});
    }
  }
  project=await materializeAutoImages(project,onProgress); project=applyLayoutIntelligence(project); project.qc=await qualityControlProject(project,{parsedFile:options.parsedFile});
  if(onProgress)await onProgress({stage:'final-qc',qc:project.qc,project});
  return project;
}

export async function generateProjectStream(options, onProgress=async()=>{}) {
  const ai=client();
  if(!ai){const project=await finalizeGeneratedProject(demoProject(options),options,{onProgress});for(let i=0;i<project.pages.length;i++)await onProgress({stage:'page',index:i,total:project.pages.length,page:project.pages[i]});await onProgress({stage:'complete',project});return project;}

  // Long-form generation is intentionally incremental. We never ask the model to emit
  // one giant project JSON object because a truncated response would invalidate every page.
  let planItems=Array.isArray(options.approvedOutline)&&options.approvedOutline.length?options.approvedOutline:null;
  let planTitle='';let planStrategy='';
  if(!planItems){
    await onProgress({stage:'starting',message:'Planning the narrative architecture…'});
    const outline=await generateOutline(options);
    planItems=outline?.items||[];planTitle=outline?.title||'';planStrategy=outline?.strategy||'';
  }else{
    planTitle=options.prompt||options.parsedFile?.filename||'Long Form Design Studio project';
    planStrategy='Approved design plan';
  }
  if(options.type==='graphic')planItems=planItems.slice(0,1);
  if(!planItems.length)throw new Error('Studio AI could not create a usable design plan. Please adjust the brief and try again.');

  const base=projectOptionsFromGeneration(options);
  let project=normalizeProject({title:planTitle||options.prompt||options.parsedFile?.filename||'Untitled project',summary:planStrategy,pages:[],sources:[]},base);
  project.generation={status:'running',completed:0,total:planItems.length,startedAt:new Date().toISOString(),lastError:'',plan:planItems};
  await onProgress({stage:'accepted',projectId:project.id,total:planItems.length,message:'Page-safe generation started.'});
  if(typeof options.checkpoint==='function')await options.checkpoint(project,{stage:'accepted'});

  try{
    for(let i=0;i<planItems.length;i++){
      await onProgress({stage:'page-start',index:i,total:planItems.length,message:`Building ${options.type==='presentation'?'slide':'page'} ${i+1} of ${planItems.length}…`});
      const result=await generatePlannedPage(options,project,planItems[i],i,planItems.length,onProgress);
      project.pages.push(result.page);project.sources=mergeSources(project.sources,result.sources);project=applyLayoutIntelligence(project);
      project.generation={...project.generation,status:'running',completed:i+1,total:planItems.length,lastError:''};
      if(typeof options.checkpoint==='function')await options.checkpoint(project,{stage:'page',index:i});
      await onProgress({stage:'page',index:i,total:planItems.length,page:project.pages[i],projectId:project.id});
    }

    // Finalization can inspect the complete project, but it is not allowed to regenerate
    // the whole project as a single huge JSON response. QC and visual materialization are separate passes.
    const finalized=await finalizeGeneratedProject(project,{...options,incremental:true},{onProgress});
    finalized.generation={...project.generation,status:'complete',completed:finalized.pages.length,total:planItems.length,finishedAt:new Date().toISOString(),lastError:''};
    if(typeof options.checkpoint==='function')await options.checkpoint(finalized,{stage:'complete'});
    await onProgress({stage:'complete',project:finalized});return finalized;
  }catch(err){
    project.generation={...project.generation,status:'failed',completed:project.pages.length,total:planItems.length,lastError:err.message||'Generation failed',failedAt:new Date().toISOString()};
    if(typeof options.checkpoint==='function')await options.checkpoint(project,{stage:'failed',error:err.message});
    err.projectId=err.projectId||project.id;err.completedPages=project.pages.length;err.totalPages=planItems.length;throw err;
  }
}

export async function generateProject(options) {
  // Non-streaming callers use the same page-scoped engine. This keeps API/automation
  // generation safe for long documents instead of reverting to one giant JSON response.
  return generateProjectStream(options,async()=>{});
}


function compactProjectForQc(project){
  return {
    id:project.id,title:project.title,type:project.type,summary:project.summary,contentMode:project.contentMode,settings:project.settings,
    pages:(project.pages||[]).map((p,i)=>({index:i,title:p.title,layout:p.layout,blocks:(p.blocks||[]).map(b=>({type:b.type,text:String(b.text||'').slice(0,1400),items:(b.items||[]).slice(0,12).map(x=>String(x).slice(0,500)),label:b.label,value:b.value,caption:String(b.caption||'').slice(0,500),data:(b.data||[]).slice(0,40),tableHeaders:(b.tableHeaders||[]).slice(0,20),tableRows:(b.tableRows||[]).slice(0,40).map(r=>r.slice(0,20)),altText:b.altText,hasImage:Boolean(b.imageUrl),provenance:b.provenance||null}))})),
    sources:(project.sources||[]).slice(0,80)
  };
}

export async function qualityControlProject(project,{parsedFile=null}={}) {
  const staticQc=staticQualityCheck(project);
  const ai=client();
  if(!ai) return staticQc;
  const sourceText=parsedFile?.text ? parsedFile.text.slice(0,180000) : '';
  let review;
  try {
    review=await structuredResponse({
      name:'design_quality_review',schema:qcSchema,research:false,
      input:`You are the final quality gate for Recykal Long Form Design Studio. ${qcRubricPrompt}\nProject type: ${project.type}\nContent mode: ${project.contentMode}\nSource supplied: ${Boolean(sourceText)}\n\nPROJECT QC REPRESENTATION:\n${JSON.stringify(compactProjectForQc(project))}${sourceText?`\n\nSOURCE EXCERPT FOR FIDELITY CHECK:\n${sourceText}`:''}\n\nJudge comprehension, hierarchy, long-form rhythm, evidence integrity, chart choice/data clarity, image purpose, accessibility, production risk and source fidelity. If a claim cannot be verified from supplied source, do not call it source-supported. Return the exact QC schema.`
    });
  } catch { return staticQc; }
  if(!review) return staticQc;
  const caps=DESIGN_KNOWLEDGE.qcWeights;
  for(const k of Object.keys(caps)) review[k]=Math.max(0,Math.min(caps[k],Number(review[k]||0)));
  review.totalScore=Object.keys(caps).reduce((sum,k)=>sum+review[k],0);
  review.pass=review.totalScore>=DESIGN_KNOWLEDGE.deliveryThreshold && !(review.blockingDefects||[]).length;
  return mergeQualityChecks(staticQc,review);
}

export async function generateNextPage(project, instruction='Continue naturally with the next section.') {
  const context = project.pages.slice(-4).map(p=>({title:p.title,blocks:p.blocks.map(b=>({type:b.type,text:b.text,items:b.items,label:b.label,value:b.value}))}));
  const raw = await structuredResponse({
    name:'recykal_design_page', schema:pageSchema, research:false,
    input:`Project title: ${project.title}\nProject type: ${project.type}\nStyle: ${project.settings?.deckStyle||'auto'}; theme=${project.settings?.themeId||'recykal-core'}; project palette=${(project.settings?.projectPalette||[]).join(', ')||'default Recykal theme'}; image source=${project.settings?.imageSource||'mixed'}; art style=${project.settings?.artStyleId||'auto'}\nRecent pages: ${JSON.stringify(context)}\nInstruction: ${instruction}\nCreate exactly one useful next page/section. Do not repeat prior content. Preserve the document's narrative architecture and page rhythm. Use semantic hierarchy before styling, avoid same-layout repetition, and obey the full Design Intelligence Knowledge Base.`
  });
  if (!raw) return normalizePage({title:'New section',layout:'editorial',blocks:[{type:'heading',text:'New section'},{type:'paragraph',text:'Connect OPENAI_API_KEY to generate this section with AI.'}],speakerNotes:''});
  return normalizePage(raw);
}

export async function editWithAI({ project, pageId, blockId, action, instruction }) {
  const page = project.pages.find(p=>p.id===pageId) || project.pages[0];
  const block = page?.blocks.find(b=>b.id===blockId);
  if (!page) throw new Error('Page not found.');
  if (['improve-layout','page-variation'].includes(action)) {
    const raw = await structuredResponse({
      name:'recykal_design_page', schema:pageSchema, research:false,
      input:`Project type: ${project.type}\nStyle: ${project.settings?.deckStyle||'auto'}; theme=${project.settings?.themeId||'recykal-core'}; project palette=${(project.settings?.projectPalette||[]).join(', ')||'default Recykal theme'}; image source=${project.settings?.imageSource||'mixed'}; art style=${project.settings?.artStyleId||'auto'}\nPage JSON: ${JSON.stringify(page)}\nAction: ${action}\nUser instruction: ${instruction||''}\nReturn an improved replacement page. Preserve all factual claims unless the user explicitly requests content changes. Apply the Design Intelligence Knowledge Base: fix hierarchy, proximity, spacing, long-form rhythm, chart/image purpose, accessibility and production risks; do not merely decorate.`
    });
    return { kind:'page', value: raw ? normalizePage(raw) : page };
  }
  if (!block) throw new Error('Select a text block first.');
  const ai = client();
  if (!ai) {
    return { kind:'block', value:{...block,text:block.text || block.items.join(' ')} };
  }
  const actionPrompt = {
    rewrite:'Rewrite for clarity and polish without changing meaning.',
    shorten:'Shorten substantially while retaining the important information.',
    expand:'Expand with clearer explanation, but do not add unsupported facts.',
    cxo:'Rewrite for a CXO audience: concise, strategic and outcome-oriented.',
    government:'Rewrite in formal government/policy communication style.',
    headline:'Create a stronger, sharper headline while preserving the claim.'
  }[action] || instruction || 'Improve this text.';
  const response = await ai.responses.create({
    model:MODEL, store:false,
    instructions:brandSystemPrompt,
    input:`${actionPrompt}\n\nBlock type: ${block.type}\nText: ${block.text || block.items.join('\n')}\nAdditional instruction: ${instruction||''}\nReturn only the revised text, no quotation marks.`
  });
  return { kind:'block', value:{...block,text:response.output_text?.trim() || block.text} };
}


export async function reflowProject(project, deckStyle='auto', themeId=null) {
  const style=String(deckStyle||'auto');
  const ai=client();
  project.settings={...(project.settings||{}),deckStyle:style,themeId:themeId||project.settings?.themeId||'recykal-core',masterFields:{headerText:'',footerText:'',pageNumbers:true,logoMode:'cover-only',...((project.settings||{}).masterFields||{})}};
  if(!ai){ project.qc={...(project.qc||{}),stale:true}; return project; }
  const deck=getDeckStyle(style); const theme=getTheme(project.settings.themeId,project.settings?.projectPalette||[]);
  const revised=await structuredResponse({
    name:'recykal_design_project_reflow',schema:projectSchema,research:false,
    input:`Recompose this existing ${project.type} project using STYLE: ${deck.name}. ${deck.rules}\nTHEME: ${theme.name}. ${theme.description}\nPROJECT PALETTE: ${(project.settings?.projectPalette||[]).join(', ')||'Use selected Recykal theme palette.'}\n\nNON-NEGOTIABLE: preserve every factual claim, number, date, name, table cell, chart datum, citation and source. Do not invent content. Keep the same overall narrative meaning. Improve layout choice, column use, page rhythm and visual hierarchy. Logo belongs on the first/cover page only unless a project master explicitly asks otherwise. Return the complete replacement project JSON.\n\nPROJECT:\n${JSON.stringify(project)}`
  });
  if(!revised) return project;
  const next=normalizeProject(revised,{...project,id:project.id,type:project.type,sourceFile:project.sourceFile,inputMode:project.inputMode,contentMode:project.contentMode,settings:{...project.settings,deckStyle:style},createdAt:project.createdAt});
  next.qc={...(project.qc||{}),stale:true};
  return applyLayoutIntelligence(next);
}

export async function generateOutline(options){
  const instruction=generationInstruction({...options,approvedOutline:null});
  const raw=await structuredResponse({name:'recykal_design_outline',schema:outlineSchema,research:options.contentMode!=='preserve'&&Boolean(options.research),input:`Create a DESIGN PLAN only, not the final asset.\n${instruction}\n\nPlan the narrative architecture and page/slide roles. For documents there is no fixed page count: create as many outline items as needed, but avoid artificial padding. Each item needs a purpose, layout and visual treatment. Preserve source sequence where it is semantically important.`});
  return raw||{title:options.prompt||options.parsedFile?.filename||'Design plan',strategy:'Local demo plan',items:[{title:'Opening',role:'opening',layout:'cover',visualTreatment:'Strong title + visual field',purpose:'Orient the reader'},{title:'Core narrative',role:'narrative',layout:'editorial',visualTreatment:'Editorial grid',purpose:'Carry the main argument'},{title:'Evidence',role:'evidence',layout:'chart',visualTreatment:'Direct-labelled data',purpose:'Support the argument'}]};
}

export async function generatePageVariations(project,pageId){
  const page=project.pages.find(p=>p.id===pageId); if(!page)throw new Error('Page not found.');
  const raw=await structuredResponse({name:'recykal_page_variations',schema:variationsSchema,research:false,input:`Create exactly THREE distinct design variations for this page. Preserve every factual claim, number, table cell, chart datum and source. Each variation must use the same content meaning but explore a genuinely different composition. Respect project style=${project.settings?.deckStyle||'auto'}, theme=${project.settings?.themeId||'recykal-core'}, projectPalette=${(project.settings?.projectPalette||[]).join(', ')||'default Recykal theme'}, imageSource=${project.settings?.imageSource||'mixed'}, artStyle=${project.settings?.artStyleId||'auto'}.\nVariation 1: editorial/clear. Variation 2: more visual/synthesis-led. Variation 3: more analytical/structured. Do not simply reorder identical blocks.\n\nPAGE:\n${JSON.stringify(page)}`});
  return (raw?.variations||[]).map(normalizePage);
}

export async function repurposeProject(project,targetType){
  if(!['document','presentation','graphic'].includes(targetType))throw new Error('Unsupported target type.');
  const raw=await structuredResponse({name:'recykal_repurposed_project',schema:projectSchema,research:false,input:`Recompose this existing Recykal project into TARGET TYPE: ${targetType}. Preserve factual meaning, data, source attribution and claim provenance. Do not merely resize. Re-prioritize semantic hierarchy for the target format. For a presentation, one idea per slide; for document, continuous editorial reading; for graphic, select only the single most important message and supporting evidence.\n\nSOURCE PROJECT:\n${JSON.stringify(project)}`});
  if(!raw)return normalizeProject(demoProject({type:targetType,prompt:project.title}),{type:targetType});
  return applyLayoutIntelligence(normalizeProject(raw,{type:targetType,contentMode:project.contentMode,inputMode:'repurpose',settings:{...project.settings},sourceFile:project.sourceFile}));
}

export async function generateImage({ prompt, aspect='landscape', artStyleId='auto', customArtStyle='', referencePaths=[], themeId='recykal-core', projectPalette=[] }) {
  const ai = client();
  if (!ai) throw new Error('Studio AI is not connected on the server.');
  const size = aspect==='portrait' ? '1024x1536' : aspect==='square' ? '1024x1024' : '1536x1024';
  const art=getArtStyle(artStyleId); const cleanPalette=normalizeProjectPalette(projectPalette); const theme=getTheme(themeId,cleanPalette); const styleText=artStyleId==='custom'?String(customArtStyle||'').trim():art.prompt;
  const basePrompt=`Create a premium professional visual for Recykal marketing. SUBJECT: ${prompt}. ART DIRECTION: ${styleText||'choose an appropriate editorial visual medium'}. THEME CONTEXT: ${theme.name}; ${cleanPalette.length?`project palette ${cleanPalette.join(', ')} is the preferred accent palette`:'use the approved Recykal palette subtly'}, not as a literal color wash. No text, no logos, no watermarks. Avoid generic sustainability clichés unless directly relevant. Preserve factual plausibility and professional production quality.`;
  // When style references are supplied, use the Responses image-generation tool so the model can inspect the moodboard images.
  if(referencePaths?.length){
    try{
      const content=[{type:'input_text',text:`Use the attached images as STYLE REFERENCES only. Match visual language, composition logic, texture and lighting without reproducing text/logos or copying any one reference. ${basePrompt}`}];
      for(const rp of referencePaths.slice(0,4)){
        const ext=path.extname(rp).toLowerCase();const mime=ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg';
        const bytes=await fs.readFile(rp); if(bytes.length>10*1024*1024)continue; content.push({type:'input_image',image_url:`data:${mime};base64,${bytes.toString('base64')}`,detail:'high'});
      }
      const response=await ai.responses.create({model:MODEL,store:false,input:[{role:'user',content}],tools:[{type:'image_generation',size,quality:'high',input_fidelity:'high'}]});
      const call=response.output?.find(x=>x.type==='image_generation_call'&&x.result); if(call?.result)return Buffer.from(call.result,'base64');
    }catch{}
  }
  const result = await ai.images.generate({model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',prompt:basePrompt,size,quality:'high'});
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image generation returned no image.');
  return Buffer.from(b64,'base64');
}


export async function analyzeImageFocalPoint(imagePath,context=''){
  const ai=client();if(!ai)return {focalX:50,focalY:50,reason:'AI focal analysis unavailable'};
  try{
    const ext=path.extname(imagePath).toLowerCase();const mime=ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg';const bytes=await fs.readFile(imagePath);
    const schema={type:'object',additionalProperties:false,required:['focalX','focalY','reason'],properties:{focalX:{type:'number',minimum:0,maximum:100},focalY:{type:'number',minimum:0,maximum:100},reason:{type:'string'}}};
    const r=await ai.responses.create({model:MODEL,store:false,reasoning:{effort:'low'},input:[{role:'user',content:[{type:'input_text',text:`Choose the best focal point for cropping this image inside an editorial design frame. Preserve the most important subject, face, product, label or meaningful action. Return focal coordinates as percentages from the top-left. Context: ${context||'professional Recykal marketing visual'}.`},{type:'input_image',image_url:`data:${mime};base64,${bytes.toString('base64')}`,detail:'high'}]}],text:{format:{type:'json_schema',name:'image_focal_point',schema,strict:true}}});
    const out=JSON.parse(r.output_text||'{}');return {focalX:Math.max(0,Math.min(100,Number(out.focalX)||50)),focalY:Math.max(0,Math.min(100,Number(out.focalY)||50)),reason:out.reason||''};
  }catch{return {focalX:50,focalY:50,reason:'Automatic focal analysis could not complete'}}
}

export async function localizeProject(project,{language='English (India)',locale='en-IN',preserveNames=true}={}){
  const ai=client();
  const localizationInstruction=`Translate and localize this Recykal design project into ${language} (${locale}). Preserve all factual claims, names${preserveNames?' (do not transliterate proper names unless language convention clearly requires it)':''}, numbers, currencies, dates, units, URLs, citations, chart values and table values exactly unless locale formatting is explicitly safe. Preserve page IDs/block IDs when possible, layout roles, image prompts and source provenance. Translate human-readable copy, labels, speaker notes, alt text and table headers. Do not invent information. If translated copy expands, prefer concise natural wording rather than shrinking type.`;
  if(!ai){const next=structuredClone(project);next.settings={...(next.settings||{}),language,locale};next.qc={...(next.qc||{}),stale:true};return next}
  const raw=await structuredResponse({name:'recykal_localized_project',schema:projectSchema,research:false,input:`${localizationInstruction}\n\nPROJECT:\n${JSON.stringify(project)}`});
  if(!raw)return project;
  const next=normalizeProject(raw,{...project,id:project.id,type:project.type,sourceFile:project.sourceFile,inputMode:project.inputMode,contentMode:project.contentMode,settings:{...project.settings,language,locale},createdAt:project.createdAt});
  // restore stable ids by page/block position when the model cannot preserve them in strict schema
  next.pages.forEach((p,i)=>{if(project.pages?.[i]){p.id=project.pages[i].id;p.blocks.forEach((b,j)=>{if(project.pages[i].blocks?.[j])b.id=project.pages[i].blocks[j].id})}});
  next.qc={...(project.qc||{}),stale:true};return applyLayoutIntelligence(next);
}
