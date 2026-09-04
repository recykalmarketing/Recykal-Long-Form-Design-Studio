import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import sharp from 'sharp';
import OpenAI from 'openai';
const execFile=promisify(execFileCb);

const VISUAL_SCHEMA={type:'object',additionalProperties:false,required:['score','blockingDefects','issues','summary'],properties:{score:{type:'number'},blockingDefects:{type:'array',items:{type:'string'}},issues:{type:'array',items:{type:'object',additionalProperties:false,required:['page','severity','category','message'],properties:{page:{type:'integer'},severity:{type:'string',enum:['blocking','warning']},category:{type:'string'},message:{type:'string'}}}},summary:{type:'string'}}};

async function structuralPreflight(file,format,project,{profile='digital'}={}){
  const errors=[]; const warnings=[]; let details={profile};
  try{const st=await fs.stat(file);if(st.size<2500)errors.push('Export file is unexpectedly small and may be incomplete.');details.bytes=st.size;}catch{return {pass:false,errors:['Export file was not created.'],warnings,details};}
  try{
    if(format==='pdf'){
      const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
      const bytes=new Uint8Array(await fs.readFile(file));const pdf=await pdfjs.getDocument({data:bytes,disableWorker:true}).promise;details.pageCount=pdf.numPages;
      const expected=Math.max(1,project.pages?.length||1);if(pdf.numPages<expected)errors.push(`PDF has ${pdf.numPages} page(s), fewer than the ${expected} designed section(s)/page(s).`);
      let empty=0;for(let i=1;i<=Math.min(pdf.numPages,100);i++){const pg=await pdf.getPage(i);const tc=await pg.getTextContent();const chars=tc.items.map(x=>x.str||'').join('').replace(/\s/g,'').length;if(chars<3)empty++;}details.nearlyEmptyPages=empty;if(empty>0&&project.type!=='graphic')warnings.push(`${empty} rendered PDF page(s) contain almost no extractable text; verify intentional image/section-divider pages.`);
    }else if(format==='pptx'){
      const zip=await JSZip.loadAsync(await fs.readFile(file));const slides=Object.keys(zip.files).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n));details.slideCount=slides.length;const expected=project.pages?.length||0;if(slides.length!==expected)errors.push(`PPTX contains ${slides.length} slide(s), but the project contains ${expected}.`);details.mediaFiles=Object.keys(zip.files).filter(n=>n.startsWith('ppt/media/')).length;
    }else if(format==='png'){
      const meta=await sharp(file).metadata();details.width=meta.width;details.height=meta.height;if(!meta.width||!meta.height)errors.push('PNG dimensions could not be validated.');if(project.type==='graphic'&&(meta.width<1000||meta.height<1000))warnings.push('Graphic export is below the preferred high-resolution production size.');
    }
  }catch(e){errors.push(`Export preflight could not validate the ${format.toUpperCase()} structure: ${e.message}`)}
  return {pass:errors.length===0,errors,warnings,details};
}

async function printProductionPreflight(file,totalPages=1){
  const errors=[];const warnings=[];const details={};
  try{
    const {stdout=''}=await execFile('pdfinfo',[file],{timeout:30000,maxBuffer:2*1024*1024});
    const sizeLine=stdout.split(/\r?\n/).find(l=>/^Page size:/i.test(l));
    details.pageSize=sizeLine?sizeLine.replace(/^Page size:\s*/i,'').trim():null;
    details.pageCount=Number((stdout.match(/^Pages:\s+(\d+)/mi)||[])[1]||totalPages||1);
  }catch(e){warnings.push(`Print page-size validation unavailable: ${e.message}`)}
  try{
    const {stdout=''}=await execFile('pdffonts',[file],{timeout:30000,maxBuffer:2*1024*1024});
    const lines=stdout.split(/\r?\n/).slice(2).filter(Boolean);let unembedded=0;for(const line of lines){const cols=line.trim().split(/\s+/);if(cols.length>=7){const emb=cols[cols.length-5];if(String(emb).toLowerCase()==='no')unembedded++;}}
    details.fontCount=lines.length;details.unembeddedFonts=unembedded;if(unembedded>0)errors.push(`${unembedded} font(s) are not embedded in the print PDF.`);
  }catch(e){warnings.push(`Font-embedding validation unavailable: ${e.message}`)}
  try{
    const {stdout=''}=await execFile('pdfimages',['-list',file],{timeout:30000,maxBuffer:4*1024*1024});
    const rows=stdout.split(/\r?\n/).filter(l=>/^\s*\d+\s+\d+\s+/.test(l));let low=0,critical=0,rgb=0,minPpi=null;
    for(const line of rows){const c=line.trim().split(/\s+/);const color=String(c[5]||'').toLowerCase();const x=Number(c[12]),y=Number(c[13]);const ppi=Math.min(x||Infinity,y||Infinity);if(Number.isFinite(ppi)){minPpi=minPpi==null?ppi:Math.min(minPpi,ppi);if(ppi<180)critical++;else if(ppi<300)low++;}if(color.includes('rgb'))rgb++;}
    details.rasterImageCount=rows.length;details.minRasterPpi=minPpi;details.rgbRasterImages=rgb;
    if(critical>0)errors.push(`${critical} raster image(s) are below 180 ppi at output size and are too low-resolution for reliable print.`);
    if(low>0)warnings.push(`${low} raster image(s) are below the preferred 300 ppi print target.`);
    if(rgb>0)warnings.push(`${rgb} raster image(s) still report RGB after print conversion; confirm the printer's required CMYK/profile workflow.`);
  }catch(e){warnings.push(`Print image-resolution validation unavailable: ${e.message}`)}
  return {pass:errors.length===0,errors,warnings,details};
}

async function renderForVision(file,format,maxPages){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lfds-preflight-'));let source=file;
  if(format==='pptx'){
    await execFile('libreoffice',['--headless','--convert-to','pdf','--outdir',dir,file],{timeout:120000});
    const expected=path.join(dir,path.basename(file,path.extname(file))+'.pdf');source=expected;
  }
  if(format==='png')return {dir,images:[file],source};
  const prefix=path.join(dir,'page');
  await execFile('pdftoppm',['-jpeg','-r','105','-f','1','-l',String(maxPages),source,prefix],{timeout:180000});
  const names=(await fs.readdir(dir)).filter(n=>/^page-\d+\.jpg$/.test(n)).sort((a,b)=>Number(a.match(/\d+/)[0])-Number(b.match(/\d+/)[0]));
  return {dir,images:names.map(n=>path.join(dir,n)),source};
}

async function visualPreflight(file,format,project,totalPages,{profile='digital'}={}){
  if(!process.env.OPENAI_API_KEY||String(process.env.VISUAL_PREFLIGHT||'true').toLowerCase()==='false')return null;
  const maxPages=Math.max(1,Math.min(Number(process.env.VISUAL_PREFLIGHT_MAX_PAGES||12),totalPages||12));let rendered;
  try{rendered=await renderForVision(file,format,maxPages);}catch(e){return {score:null,blockingDefects:[],issues:[],summary:`Visual render preflight unavailable: ${e.message}`,sampledPages:0,warning:true};}
  try{
    const ai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});const all=[];
    for(let offset=0;offset<rendered.images.length;offset+=6){
      const batch=rendered.images.slice(offset,offset+6);const content=[{type:'input_text',text:`You are the final production design QA for Recykal Long Form Design Studio. Inspect these rendered export pages ${offset+1}-${offset+batch.length}. Judge only visible production defects: clipped/overlapping text, broken table geometry, stretched/pixelated imagery, accidental empty areas on ordinary information pages, unreadable typography, inconsistent header/footer, distorted logo, logo appearing on non-cover pages, poor contrast, or obviously broken hierarchy. Do not penalize intentional whitespace on covers/dividers/quote pages. Be conservative: mark blocking only when the export should not be delivered. Project type=${project.type}; theme=${project.settings?.themeId||'recykal-core'}; style=${project.settings?.deckStyle||'auto'}; export profile=${profile}. ${profile==='print'?'For print, also treat obvious raster softness, unreadably fine detail, or color-conversion artefacts as defects.':'For digital, prioritize clean screen reading and normal page boundaries.'}` }];
      for(const [j,img] of batch.entries()){const bytes=await fs.readFile(img);const mime=path.extname(img).toLowerCase()==='.png'?'image/png':'image/jpeg';content.push({type:'input_text',text:`Rendered page ${offset+j+1}:`});content.push({type:'input_image',image_url:`data:${mime};base64,${bytes.toString('base64')}`,detail:'high'});}
      const r=await ai.responses.create({model:process.env.OPENAI_MODEL||'gpt-5.6',store:false,reasoning:{effort:'low'},input:[{role:'user',content}],text:{format:{type:'json_schema',name:'visual_export_qc',schema:VISUAL_SCHEMA,strict:true}}});
      if(r.output_text)all.push(JSON.parse(r.output_text));
    }
    const issues=all.flatMap(x=>x.issues||[]);const blocking=[...new Set(all.flatMap(x=>x.blockingDefects||[]))];const scores=all.map(x=>Number(x.score)).filter(Number.isFinite);const score=scores.length?Math.round(scores.reduce((a,b)=>a+b,0)/scores.length):null;
    return {score,blockingDefects:blocking,issues,summary:all.map(x=>x.summary).filter(Boolean).join(' '),sampledPages:rendered.images.length,totalPages:totalPages||rendered.images.length};
  }catch(e){return {score:null,blockingDefects:[],issues:[],summary:`Visual QA could not complete: ${e.message}`,sampledPages:rendered.images?.length||0,warning:true};}
  finally{if(rendered?.dir)await fs.rm(rendered.dir,{recursive:true,force:true}).catch(()=>{})}
}

export async function preflightExport(file,format,project,{profile='digital'}={}){
  const pdfProfile=format==='pdf'&&profile==='print'?'print':'digital';
  const structural=await structuralPreflight(file,format,project,{profile:pdfProfile});
  const total=structural.details.pageCount||structural.details.slideCount||1;
  let production=null;if(format==='pdf'&&pdfProfile==='print'&&structural.pass)production=await printProductionPreflight(file,total);
  const structuralPass=structural.pass&&(!production||production.pass);
  const visual=structuralPass?await visualPreflight(file,format,project,total,{profile:pdfProfile}):null;
  const visualBlocking=visual?.blockingDefects||[];const visualScore=Number(visual?.score);const visualGate=Number.isFinite(visualScore)&&visualScore<90?[`Rendered visual QC is ${Math.round(visualScore)}/100; final delivery requires 90/100 or higher.`]:[];const errors=[...structural.errors,...(production?.errors||[]),...visualBlocking,...visualGate];const warnings=[...structural.warnings,...(production?.warnings||[]),...((visual?.issues||[]).filter(x=>x.severity==='warning').map(x=>`Page ${x.page}: ${x.message}`))];
  return {pass:errors.length===0,profile:pdfProfile,errors,warnings,details:{...structural.details,production:production?.details||null},production,visual,checkedAt:new Date().toISOString(),filename:path.basename(file)};
}
