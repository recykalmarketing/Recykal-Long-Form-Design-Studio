import { DESIGN_KNOWLEDGE } from './designKnowledge.mjs';

const W = DESIGN_KNOWLEDGE.qcWeights;
const MAX = Object.values(W).reduce((a,b)=>a+b,0);

function textOf(project){
  return (project.pages||[]).flatMap(p=>(p.blocks||[]).flatMap(b=>[b.text||'',...(b.items||[]),b.label||'',b.value||'',b.caption||''])).join('\n');
}

function issue(category, severity, message, pageIndex=null){ return {category,severity,message,pageIndex}; }

export function staticQualityCheck(project){
  const issues=[]; const pages=project.pages||[];
  if(!pages.length) issues.push(issue('contentFidelity','blocking','No designed pages/sections were generated.'));

  pages.forEach((p,idx)=>{
    const blocks=p.blocks||[];
    const headings=blocks.filter(b=>b.type==='heading');
    const primaryLike=blocks.filter(b=>['heading','stat','quote'].includes(b.type));
    if(!headings.length) issues.push(issue('hierarchy','warning','Page/section has no clear H1-level heading.',idx));
    if(primaryLike.length>3) issues.push(issue('hierarchy','warning','More than three elements compete for primary attention; simplify or regroup.',idx));
    for(const b of blocks){
      if(b.type==='paragraph' && (b.text||'').length>1100) issues.push(issue('legibility','warning','Very long paragraph may create poor sustained-reading rhythm; split into semantic paragraphs.',idx));
      if(b.type==='chart'){
        if(!(b.data||[]).length) issues.push(issue('contentFidelity','blocking','Chart block has no data.',idx));
        if(!String(b.caption||'').trim()) issues.push(issue('contentFidelity','warning','Chart needs a clear caption/source/context where applicable.',idx));
        if(!['bar','dot','line','scatter','table'].includes(b.chartType||'bar')) issues.push(issue('contentFidelity','warning','Chart type is not supported by the analytical chart-choice rules.',idx));
      }
      if(b.type==='table' && !(b.tableRows||[]).length) issues.push(issue('contentFidelity','blocking','Table block has no rows; source table content may have been dropped.',idx));
      if(b.type==='image' && !b.imageUrl && !String(b.imagePrompt||'').trim()) issues.push(issue('visualCraft','warning','Image block has neither an image nor a purposeful image prompt.',idx));
      if(b.type==='image' && b.imageUrl && !String(b.altText||'').trim()) issues.push(issue('accessibility','blocking','Meaningful image is missing alternative text.',idx));
      if(['heading','subheading','paragraph','quote','kicker'].includes(b.type) && /\b(Heading|Subheading|Body)\b\s*:/i.test(b.text||'')) issues.push(issue('hierarchy','warning','Literal hierarchy labels appear in final content; hierarchy should be expressed typographically.',idx));
    }
  });

  if(project.type==='document' && pages.length>=4){
    let run=1; for(let i=1;i<pages.length;i++){ if(pages[i].layout===pages[i-1].layout){run++;if(run>=4)issues.push(issue('consistency','warning','Four or more consecutive sections use the same layout; long-form rhythm needs controlled variation.',i));} else run=1; }
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
