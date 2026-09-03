import OpenAI from 'openai';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { BRAND, brandSystemPrompt } from './brand.mjs';
import { projectSchema, pageSchema, qcSchema } from './schemas.mjs';
import { assetSpecificRules, qcRubricPrompt, DESIGN_KNOWLEDGE } from './designKnowledge.mjs';
import { staticQualityCheck, mergeQualityChecks } from './qc.mjs';

const MODEL = process.env.OPENAI_MODEL || 'gpt-5.6';
const MAX_SOURCE_CHARS = Number(process.env.MAX_SOURCE_CHARS || 800000);

function client() {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function normalizeBlock(block={}) {
  return {
    id: uuid(),
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
    imageUrl: block.imageUrl || ''
  };
}

function normalizePage(page={}) {
  return {
    id: uuid(),
    title: page.title || 'Untitled',
    layout: page.layout || 'editorial',
    blocks: (page.blocks || []).map(normalizeBlock),
    speakerNotes: page.speakerNotes || ''
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
    settings: options.settings || {},
    brand: BRAND,
    qc: options.qc || raw.qc || null,
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

function generationInstruction({ type, prompt, parsedFile, contentMode, audience, tone, language, research, visualStyle }) {
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
  return `
OUTPUT TYPE: ${type.toUpperCase()}
USER BRIEF: ${prompt || 'Design the supplied content.'}
CONTENT MODE: ${modeMap[contentMode] || modeMap.generate}
AUDIENCE: ${audience || 'Recykal marketing stakeholders'}
TONE: ${tone || 'Professional, confident, precise'}
LANGUAGE: ${language || 'English (India)'}
VISUAL DIRECTION: ${visualStyle || 'Premium editorial, clean, contemporary, sustainability-forward without visual clichés'}

DESIGN DECISION RULES:
${systemRules}

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

${parsedFile ? `SOURCE FILE: ${parsedFile.filename}\nSOURCE KIND: ${parsedFile.kind}\nSOURCE METADATA: ${JSON.stringify(parsedFile.metadata)}
SOURCE EXTRACTION CONFIDENCE: ${parsedFile.extractionConfidence || parsedFile.metadata?.extractionConfidence || 'not supplied'}\nEXTRACTED ASSETS:\n${sourceAssets}\n\nSOURCE CONTENT START\n${sourceText}\nSOURCE CONTENT END` : 'NO SOURCE FILE PROVIDED.'}
`;
}

async function structuredResponse({ input, schema, name, research=false }) {
  const ai = client();
  if (!ai) return null;
  const request = {
    model: MODEL,
    store: false,
    reasoning: { effort: 'medium' },
    instructions: brandSystemPrompt,
    input,
    text: { format: { type:'json_schema', name, schema, strict:true } }
  };
  if (research) request.tools = [{ type:'web_search' }];
  const response = await ai.responses.create(request);
  const text = response.output_text;
  if (!text) throw new Error('OpenAI returned no structured output.');
  return JSON.parse(text);
}

export async function generateProject(options) {
  const instruction = generationInstruction(options);
  let input = instruction;
  const uploadedIds = [];
  const ai = client();
  if (ai && options.parsedFile) {
    const content = [{ type:'input_text', text:instruction }];
    // PDFs are passed directly as file input so the model can inspect page visuals, diagrams and charts in addition to extracted text.
    for (const src of (options.parsedFile.originalFiles || []).filter(f => f.extension === '.pdf').slice(0,4)) {
      try {
        const uploaded = await ai.files.create({
          file:createReadStream(src.path),
          purpose:'user_data',
          expires_after:{anchor:'created_at',seconds:3600}
        });
        uploadedIds.push(uploaded.id);
        content.push({ type:'input_file', file_id:uploaded.id });
      } catch {}
    }
    // Embedded images from DOCX/PPTX are supplied as image inputs when practical.
    for (const asset of (options.parsedFile.assets || []).slice(0,10)) {
      const ext = path.extname(asset.name || asset.path || '').toLowerCase();
      const mime = ext==='.png'?'image/png':(['.jpg','.jpeg'].includes(ext)?'image/jpeg':ext==='.webp'?'image/webp':null);
      if (!mime || !asset.path) continue;
      try {
        const bytes = await fs.readFile(asset.path);
        if (bytes.length > 8*1024*1024) continue;
        content.push({ type:'input_image', image_url:`data:${mime};base64,${bytes.toString('base64')}`, detail:'high' });
      } catch {}
    }
    input = [{ role:'user', content }];
  }
  let raw;
  try {
    raw = await structuredResponse({
      name:'recykal_design_project',
      schema: projectSchema,
      research: options.contentMode === 'preserve' ? false : (options.research || options.contentMode === 'research_expand'),
      input
    });
  } finally {
    if (ai) for (const id of uploadedIds) ai.files.delete(id).catch(()=>{});
  }
  const data = raw || demoProject(options);
  let project = normalizeProject(data, {
    type:options.type,
    sourceFile: options.parsedFile ? { filename:options.parsedFile.filename, kind:options.parsedFile.kind, metadata:options.parsedFile.metadata, assets:options.parsedFile.assets||[], uploadId:options.parsedFile.uploadId||null, extractionConfidence:options.parsedFile.extractionConfidence||options.parsedFile.metadata?.extractionConfidence||null } : null,
    inputMode: options.parsedFile ? 'file' : 'prompt',
    contentMode: options.contentMode,
    settings:{ audience:options.audience, tone:options.tone, language:options.language, visualStyle:options.visualStyle, research:options.contentMode==='preserve'?false:Boolean(options.research) }
  });

  project.qc = await qualityControlProject(project,{parsedFile:options.parsedFile});
  const autoQc = String(process.env.AUTO_QC ?? 'true').toLowerCase() !== 'false';
  const maxRevisions = Math.max(0,Math.min(2,Number(process.env.QC_MAX_REVISIONS||1)));
  if (ai && autoQc && maxRevisions>0 && !project.qc.pass) {
    for (let attempt=0; attempt<maxRevisions && !project.qc.pass; attempt++) {
      const source = options.parsedFile?.text ? options.parsedFile.text.slice(0,180000) : '';
      const revised = await structuredResponse({
        name:'recykal_design_project_revision', schema:projectSchema, research:false,
        input:`Revise this project to resolve every blocking defect and materially improve the failed QC categories. Preserve factual meaning and source fidelity. Do not add unsupported facts.\n\nQC REVIEW:\n${JSON.stringify(project.qc)}\n\nCURRENT PROJECT:\n${JSON.stringify(project)}${source?`\n\nSOURCE EXCERPT (authoritative where content mode requires preservation):\n${source}`:''}`
      });
      if (!revised) break;
      project = normalizeProject(revised,{...project,id:project.id,type:project.type,sourceFile:project.sourceFile,inputMode:project.inputMode,contentMode:project.contentMode,settings:project.settings,createdAt:project.createdAt});
      project.qc = await qualityControlProject(project,{parsedFile:options.parsedFile});
    }
  }
  return project;
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
      input:`You are the final quality gate for Recykal Long Form Design Studio. ${qcRubricPrompt}\nProject type: ${project.type}\nContent mode: ${project.contentMode}\nSource supplied: ${Boolean(sourceText)}\n\nPROJECT JSON:\n${JSON.stringify(project)}${sourceText?`\n\nSOURCE EXCERPT FOR FIDELITY CHECK:\n${sourceText}`:''}\n\nJudge comprehension, hierarchy, long-form rhythm, evidence integrity, chart choice/data clarity, image purpose, accessibility, production risk and source fidelity. If a claim cannot be verified from supplied source, do not call it source-supported. Return the exact QC schema.`
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
    input:`Project title: ${project.title}\nProject type: ${project.type}\nRecent pages: ${JSON.stringify(context)}\nInstruction: ${instruction}\nCreate exactly one useful next page/section. Do not repeat prior content. Preserve the document's narrative architecture and page rhythm. Use semantic hierarchy before styling, avoid same-layout repetition, and obey the full Design Intelligence Knowledge Base.`
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
      input:`Project type: ${project.type}\nPage JSON: ${JSON.stringify(page)}\nAction: ${action}\nUser instruction: ${instruction||''}\nReturn an improved replacement page. Preserve all factual claims unless the user explicitly requests content changes. Apply the Design Intelligence Knowledge Base: fix hierarchy, proximity, spacing, long-form rhythm, chart/image purpose, accessibility and production risks; do not merely decorate.`
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

export async function generateImage({ prompt, aspect='landscape' }) {
  const ai = client();
  if (!ai) throw new Error('Studio AI is not connected on the server.');
  const size = aspect==='portrait' ? '1024x1536' : aspect==='square' ? '1024x1024' : '1536x1024';
  const result = await ai.images.generate({
    model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2',
    prompt:`Create a premium corporate visual for Recykal marketing. ${prompt}. No text, no logos, no watermarks. Clean, authentic, editorial quality, suitable for professional sustainability communication.`,
    size,
    quality:'high'
  });
  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new Error('Image generation returned no image.');
  return Buffer.from(b64,'base64');
}
