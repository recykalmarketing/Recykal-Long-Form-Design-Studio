import { DESIGN_KNOWLEDGE } from './designKnowledge.mjs';

const W = DESIGN_KNOWLEDGE.qcWeights;
const MAX = Object.values(W).reduce((a,b)=>a+b,0);

function textOf(project){
  return (project.pages||[]).flatMap(p=>(p.blocks||[]).flatMap(b=>[b.text||'',...(b.items||[]),b.label||'',b.value||'',b.caption||''])).join('\n');
}

function issue(category, severity, message, pageIndex=null){ return {category,severity,message,pageIndex}; }
function a4Units(block={},layout='editorial'){const two=layout==='two-column',text=String(block.text||'');const defaultSize=block.type==='heading'?(text.length>90?20:text.length>58?23:26):block.type==='subheading'?12.5:block.type==='paragraph'?(two?9.5:10):block.type==='quote'?15:block.type==='kicker'?8.5:10;const override=Number(block.style?.fontSize),scale=Number.isFinite(override)?Math.max(.65,Math.min(2.2,override/defaultSize)):1;if(block.type==='kicker')return 28*scale;if(block.type==='heading')return Math.max(64,Math.ceil(text.length/(two?46:58))*34)*scale;if(block.type==='subheading')return Math.max(42,Math.ceil(text.length/(two?60:76))*24)*scale;if(block.type==='paragraph')return (18+Math.ceil(text.length/(two?48:82))*18)*scale;if(block.type==='bullets')return 18+(block.items||[]).reduce((n,x)=>n+Math.max(28,Math.ceil(String(x).length/(two?38:68))*17+8),0);if(block.type==='table')return 38+Math.max(1,(block.tableRows||[]).length)*(block.tableStyle?.density==='compact'?25:31);if(block.type==='image')return ['image-led','message','case-study'].includes(layout)?360:240;if(block.type==='chart')return 280;if(block.type==='stat')return 118;if(block.type==='quote')return (70+Math.ceil(text.length/58)*22)*scale;return 40}

function a4Capacity(layout='editorial'){return ({cover:620,'section-opener':720,message:1080,toc:1120,glossary:1450,editorial:820,'editorial-sidebar':940,'two-column':1500,stat:820,quote:700,timeline:820,comparison:820,process:850,table:980,chart:820,'data-story':960,'case-study':900,summary:820,profile:1150,'image-led':760,closing:620})[layout]||820}

export function staticQualityCheck(project){
  const issues=[]; const pages=project.pages||[];
  if(!pages.length) issues.push(issue('contentFidelity','blocking','No designed pages/sections were generated.'));
  if(project.type==='document'&&Number.isInteger(Number(project.settings?.targetPageCount))&&Number(project.settings.targetPageCount)>0&&pages.length!==Number(project.settings.targetPageCount))issues.push(issue('exportQuality','blocking',`Exact document length is ${project.settings.targetPageCount} A4 pages, but the current project contains ${pages.length}. Recompose to the requested page target before final export.`));

  pages.forEach((p,idx)=>{
    const blocks=p.blocks||[];
    if(project.type==='document'){const units=blocks.reduce((n,b)=>n+a4Units(b,p.layout),0),cap=a4Capacity(p.layout);const exact=Number.isInteger(Number(project.settings?.targetPageCount))&&Number(project.settings.targetPageCount)>0;if(units>cap*1.06&&(exact||!['cover','closing'].includes(p.layout)))issues.push(issue('exportQuality','blocking',exact?'This page exceeds the readable fixed A4 content budget while an exact final page target is active. Recompose within this A4 page or increase the requested page target; never increase physical page height or shrink body text below readability limits.':'This page exceeds the fixed A4 portrait content area. Split/reflow it onto a continuation page; never increase physical page height.',idx));else if(units>cap*.94&&!['cover','closing'].includes(p.layout))issues.push(issue('legibility','warning','This A4 page is close to its safe content limit; verify line wrapping, table row height and footer clearance.',idx));}
    const headings=blocks.filter(b=>b.type==='heading');
    const primaryLike=blocks.filter(b=>['heading','stat','quote'].includes(b.type));
    if(!headings.length) issues.push(issue('hierarchy','warning','Page/section has no clear H1-level heading.',idx));
    if(primaryLike.length>3) issues.push(issue('hierarchy','warning','More than three elements compete for primary attention; simplify or regroup.',idx));
    const textChars=blocks.reduce((n,b)=>n+(b.text||'').length+(b.items||[]).join(' ').length+(b.tableRows||[]).flat().join(' ').length,0);
    const pageText=blocks.flatMap(b=>[b.text||'',...(b.items||[]),...(b.tableHeaders||[]),...(b.tableRows||[]).flat()]).join(' ');
    const visualBlocks=blocks.filter(b=>['image','chart','table','stat'].includes(b.type)).length + ((['process','timeline','comparison','data-story','case-study','summary'].includes(p.layout)&&blocks.some(b=>b.type==='bullets'||b.type==='chart'||b.type==='stat'))?1:0);
    const intentionalPause=['cover','section-opener','quote','closing'].includes(p.layout);
    if(/[�]/.test(pageText))issues.push(issue('contentFidelity','blocking','Unresolved replacement glyph detected. The source parser/export must repair the character before delivery.',idx));
    if(/<[^>\n]{8,500}=/.test(pageText))issues.push(issue('contentFidelity','blocking','Malformed source quote markers were exposed in the designed page.',idx));
    if(/\b(?:identi|veri|noti|speci|signi|clari|con)\s+fi\s+\w+|\binfluuenc\w*/i.test(pageText))issues.push(issue('contentFidelity','blocking','Broken PDF ligature/word extraction is visible in final copy.',idx));
    if(/\bCOLUMN\s+1\b/i.test(pageText)&&/\bCOLUMN\s+2\b/i.test(pageText))issues.push(issue('hierarchy','blocking','Generic COLUMN 1 / COLUMN 2 headers are not an acceptable semantic table or glossary structure.',idx));
    if(blocks.some(b=>b.type==='heading'&&/\b(?:a|an|the|of|and|or|to|with|for|in|on|by|from|through|between)[:;,.-]?$/i.test(String(b.text||'').trim())&&String(b.text||'').trim().split(/\s+/).length>3))issues.push(issue('hierarchy','blocking','A page heading appears to be a truncated sentence fragment rather than a valid structural heading.',idx));
    if(/table of contents|^contents\b/i.test(String(p.title||''))&&blocks.some(b=>['paragraph','heading','subheading'].includes(b.type)&&/\.{4,}\s*\d+/.test(b.text||'')))issues.push(issue('contentFidelity','blocking','Raw dot-leader TOC text is duplicated outside the structured contents grid.',idx));
    if(/^glossary\b/i.test(String(p.title||''))&&p.layout!=='glossary')issues.push(issue('hierarchy','blocking','Glossary content must use the glossary reference-page archetype, not a generic page layout.',idx));
    if(/table of contents|^contents\b/i.test(String(p.title||''))&&p.layout!=='toc')issues.push(issue('hierarchy','blocking','Contents content must use the TOC navigation archetype, not a generic page layout.',idx));
    const occupancy=Math.min(1.25,blocks.reduce((n,b)=>{if(b.type==='heading')return n+.11;if(b.type==='subheading'||b.type==='kicker')return n+.05;if(b.type==='paragraph')return n+Math.min(.25,.04+(String(b.text||'').length/1100)*.24);if(b.type==='bullets')return n+Math.min(.30,.05+(b.items||[]).length*.045);if(b.type==='image')return n+.34;if(b.type==='chart')return n+.30;if(b.type==='table')return n+Math.min(.46,.12+(b.tableRows||[]).length*.035);if(b.type==='stat')return n+.13;if(b.type==='quote')return n+.22;return n+.04;},0));
    if(project.type==='document'&&!intentionalPause&&occupancy<.34)issues.push(issue('visualCraft','blocking',`Estimated page occupancy is only ${Math.round(occupancy*100)}%; this is accidental dead space, not an intentional publication pause. Reflow or redesign the page.`,idx));else if(project.type==='document'&&!intentionalPause&&occupancy<.56)issues.push(issue('visualCraft','warning',`Estimated page occupancy is only ${Math.round(occupancy*100)}%; rebalance the editorial grid, evidence, callouts or columns.`,idx));
    if(project.type==='document'&&occupancy>1.08&&!['table','two-column'].includes(p.layout))issues.push(issue('legibility','warning','Estimated page density is too high for this composition; add a page or switch to a denser editorial grid instead of shrinking type.',idx));
    if(project.type==='document' && !intentionalPause && textChars<320 && visualBlocks===0) issues.push(issue('visualCraft','warning','Ordinary information page is likely under-filled; recompose with columns, a relevant visual, stat, process or evidence block instead of leaving accidental dead space.',idx));
    const style=project.settings?.deckStyle||'auto';
    if(project.type==='document' && style==='visual' && !['cover','section-opener','quote','closing','table','toc','glossary'].includes(p.layout) && textChars>420 && visualBlocks===0) issues.push(issue('visualCraft','warning','Visual style expects meaningful visual storytelling on this page; add an image, vector infographic, chart, stat or diagram rather than a text-only composition.',idx));
    if(project.type==='document' && style==='consultant' && textChars>900 && !['two-column','table','chart','comparison'].includes(p.layout)) issues.push(issue('legibility','warning','Consultant style should use the editorial grid, evidence modules or analytical layouts more aggressively for dense information.',idx));
    if(project.type==='document' && style==='minimal' && primaryLike.length>2) issues.push(issue('hierarchy','warning','Minimal style should reduce competing focal elements and preserve one dominant idea at a time.',idx));
    if(project.type==='document' && textChars>1500 && !['two-column','table','glossary','toc','profile','data-story'].includes(p.layout)) issues.push(issue('legibility','warning','Dense page should use an editorial multi-column/evidence layout rather than shrinking body copy.',idx));
    if(['process','timeline','comparison'].includes(p.layout) && !blocks.some(b=>b.type==='bullets')) issues.push(issue('hierarchy','warning',`${p.layout} layout needs structured items to form the intended infographic.`,idx));
    for(const b of blocks){
      if(b.frame?.freeform){const f={x:6,y:12,w:88,h:18,autoHeight:true,...b.frame};const x=Number(f.x),y=Number(f.y),w=Number(f.w),h=Number(f.h);if(![x,y,w,h].every(Number.isFinite)||x<0||y<0||w<4||h<4||x+w>100.5||y+h>100.5)issues.push(issue('exportQuality','blocking','A manually positioned element extends outside the safe page content area. Move or resize it before final export.',idx));const txt=(b.text||'')+(b.items||[]).join(' ')+(b.tableRows||[]).flat().join(' ');if(w<18&&txt.length>160)issues.push(issue('legibility','warning','A manually resized text/content frame is very narrow; widen it or verify the reflow in Review PDF.',idx));if(f.autoHeight===false&&txt.length){const area=Math.max(1,w*h),density=txt.length/area;if(density>1.65)issues.push(issue('exportQuality','blocking','A fixed-height element is likely to clip or overflow. Increase its height/width, shorten the content, or enable Auto height.',idx));}}
      if(b.type==='paragraph' && (b.text||'').length>1100) issues.push(issue('legibility','warning','Very long paragraph may create poor sustained-reading rhythm; split into semantic paragraphs.',idx));
      if(project.type==='document' && ['heading','subheading','paragraph','quote','kicker'].includes(b.type) && b.style?.fontSize!=null){const fs=Number(b.style.fontSize);if(b.type==='paragraph'&&fs<8.5)issues.push(issue('legibility','blocking','Body text override is below 8.5 pt; reflow or paginate instead of shrinking sustained-reading copy.',idx));else if(b.type==='paragraph'&&(fs<9.5||fs>12.5))issues.push(issue('legibility','warning','Body text override is outside the preferred 9.5–10.5 pt A4 reading range; verify line length and audience needs.',idx));if(b.type==='heading'&&fs<16)issues.push(issue('hierarchy','warning','Page heading override is too close to body scale; restore stronger hierarchy.',idx));if(b.type==='subheading'&&fs<10)issues.push(issue('hierarchy','warning','Subheading override is too small to remain a clear structural level.',idx));}
      if(project.type==='document' && ['heading','subheading','paragraph','quote','kicker'].includes(b.type) && b.style?.lineHeight!=null){const lh=Number(b.style.lineHeight);if(lh<1.15)issues.push(issue('legibility','blocking','Line spacing is too tight for reliable reading; increase leading.',idx));else if(b.type==='paragraph'&&(lh<1.3||lh>1.75))issues.push(issue('legibility','warning','Body leading is outside the preferred long-form rhythm; target roughly 1.35–1.5× unless the layout clearly requires otherwise.',idx));}
      if(b.type==='chart'){
        if(!(b.data||[]).length) issues.push(issue('contentFidelity','blocking','Chart block has no data.',idx));
        if(!String(b.caption||'').trim()) issues.push(issue('contentFidelity','warning','Chart needs a clear caption/source/context where applicable.',idx));
        if(!['bar','dot','line','scatter','table'].includes(b.chartType||'bar')) issues.push(issue('contentFidelity','warning','Chart type is not supported by the analytical chart-choice rules.',idx));
      }
      if(b.type==='table' && !(b.tableRows||[]).length) issues.push(issue('contentFidelity','blocking','Table block has no rows; source table content may have been dropped.',idx));
      if(b.type==='table' && !(b.tableHeaders||[]).length) issues.push(issue('hierarchy','warning','Table has no header row; add column labels unless the source explicitly has none.',idx));
      if(b.type==='table' && (b.tableHeaders||[]).some(h=>/^COLUMN\s+\d+$/i.test(String(h)))) issues.push(issue('hierarchy','blocking','Generic table headers indicate failed source-structure interpretation. Infer the real semantic headers before export.',idx));
      if(p.layout==='glossary'&&b.type==='table'&&!(String(b.tableHeaders?.[0]||'').match(/^TERM$/i)&&String(b.tableHeaders?.[1]||'').match(/^DEFINITION|MEANING$/i)))issues.push(issue('contentFidelity','blocking','Glossary table must preserve TERM / DEFINITION semantics.',idx));
      if(p.layout==='toc'&&b.type==='table'&&!(String(b.tableHeaders?.[0]||'').match(/^SECTION$/i)&&String(b.tableHeaders?.[1]||'').match(/^PAGE$/i)))issues.push(issue('contentFidelity','blocking','Contents table must preserve SECTION / PAGE semantics.',idx));
      if(b.type==='table'){const cols=Math.max((b.tableHeaders||[]).length,...(b.tableRows||[]).map(r=>r.length),0);if(cols>6)issues.push(issue('legibility','warning',`This table has ${cols} columns; the A4 renderer will split it into readable continuation groups and repeat the identifying first column. Verify the grouping in Review PDF.`,idx));if((b.tableRows||[]).length>24)issues.push(issue('uxTaskClarity','warning','Long table will continue across pages with repeated headers; verify row grouping and caption context.',idx));}
      if(b.type==='table' && (b.tableRows||[]).some(r=>(b.tableHeaders||[]).length && r.length!==(b.tableHeaders||[]).length)) issues.push(issue('contentFidelity','warning','Table rows have inconsistent column counts; verify source-cell alignment before export.',idx));
      if(b.type==='image' && !b.imageUrl && !String(b.imagePrompt||'').trim()) issues.push(issue('visualCraft','warning','Image block has neither an image nor a purposeful image prompt.',idx));
      if(b.type==='image' && b.imageUrl && !String(b.altText||'').trim()) issues.push(issue('accessibility','blocking','Meaningful image is missing alternative text.',idx));
      if(['heading','subheading','paragraph','quote','kicker'].includes(b.type) && /\b(Heading|Subheading|Body)\b\s*:/i.test(b.text||'')) issues.push(issue('hierarchy','warning','Literal hierarchy labels appear in final content; hierarchy should be expressed typographically.',idx));
    }
  });

  if(project.type==='document' && pages.length>=4){
    let run=1,textOnlyRun=0; for(let i=0;i<pages.length;i++){
      if(i>0){if(pages[i].layout===pages[i-1].layout){run++;if(run>=4)issues.push(issue('consistency','warning','Four or more consecutive sections use the same layout; long-form rhythm needs controlled variation.',i));} else run=1;}
      const bp=pages[i].blocks||[],hasVisual=bp.some(b=>['image','chart','table','stat'].includes(b.type))||['process','timeline','comparison','data-story','case-study','toc','glossary','section-opener'].includes(pages[i].layout);
      const chars=bp.reduce((n,b)=>n+String(b.text||'').length+(b.items||[]).join(' ').length,0);
      if(chars>420&&!hasVisual&&!['message'].includes(pages[i].layout))textOnlyRun++;else textOnlyRun=0;
      if(textOnlyRun>=4)issues.push(issue('visualCraft','warning','Four consecutive information pages are text-only. Introduce a source-relevant evidence, process, summary or visual-pause role without inventing content.',i));
    }
  }
  if(project.type==='graphic' && pages.length!==1) issues.push(issue('uxTaskClarity','warning','Graphic projects should normally resolve to one production canvas.'));

  // Brand/production invariants are enforced by the renderer; deductions model structural risk.
  const categories={...W};
  const categoryKey={contentFidelity:'contentFidelity',hierarchy:'hierarchy',legibility:'legibility',consistency:'consistency',accessibility:'accessibility',uxTaskClarity:'uxTaskClarity',visualCraft:'visualCraft',exportQuality:'exportQuality'};
  for(const i of issues){
    const k=categoryKey[i.category]; if(!k)continue;
    const d=i.severity==='blocking'?Math.min(8,categories[k]):i.severity==='warning'?Math.min(2,categories[k]):0;
    categories[k]=Math.max(0,categories[k]-d);
  }
  const score=Object.values(categories).reduce((a,b)=>a+b,0);
  const blockingDefects=issues.filter(i=>i.severity==='blocking').map(i=>i.message);
  return {
    totalScore:score,
    pass:score>=DESIGN_KNOWLEDGE.deliveryThreshold && !blockingDefects.length,
    threshold:DESIGN_KNOWLEDGE.deliveryThreshold,
    blockingDefects,
    issues,
    ...categories,
    categories,
    source:'static',
    checkedAt:new Date().toISOString()
  };
}

export function mergeQualityChecks(staticQc, aiQc){
  if(!aiQc) return staticQc;
  const blocking=[...new Set([...(staticQc.blockingDefects||[]),...(aiQc.blockingDefects||[])])];
  const total=Math.min(Number(staticQc.totalScore||0),Number(aiQc.totalScore||0));
  return {
    ...aiQc,
    totalScore:total,
    threshold:DESIGN_KNOWLEDGE.deliveryThreshold,
    pass:total>=DESIGN_KNOWLEDGE.deliveryThreshold && blocking.length===0,
    blockingDefects:blocking,
    staticIssues:staticQc.issues||[],
    source:'ai+static',
    checkedAt:new Date().toISOString()
  };
}

export function sourceTokenSnapshot(sourceText=''){
  const numbers=[...new Set((sourceText.match(/\b\d[\d,.%₹$€£-]*\b/g)||[]).slice(0,250))];
  return {numbers};
}

export function quickSourceFidelity(project,sourceText=''){
  if(!sourceText.trim()) return {missingNumbers:[],checked:0};
  const output=textOf(project);
  const snap=sourceTokenSnapshot(sourceText);
  const missing=snap.numbers.filter(n=>!output.includes(n)).slice(0,40);
  return {missingNumbers:missing,checked:snap.numbers.length};
}
