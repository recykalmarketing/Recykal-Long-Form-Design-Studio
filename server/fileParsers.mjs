import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';

const execFileAsync = promisify(execFile);
const xml = new XMLParser({ ignoreAttributes: false, preserveOrder: false });

function safeName(name='file') { return name.replace(/[^a-zA-Z0-9._-]+/g, '_'); }

async function legacyConvert(filePath, ext) {
  const outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'lfds-convert-'));
  const map = { '.doc': 'docx', '.ppt': 'pptx', '.xls': 'xlsx' };
  const target = map[ext];
  if (!target) return filePath;
  try {
    await execFileAsync('libreoffice', ['--headless', '--convert-to', target, '--outdir', outDir, filePath], { timeout: 90000 });
  } catch (e) {
    const err = new Error(`Legacy ${ext} parsing requires LibreOffice. The included Dockerfile installs it automatically on Render.`);
    err.cause = e;
    throw err;
  }
  const files = await fs.readdir(outDir);
  const converted = files.find(f => f.toLowerCase().endsWith('.'+target));
  if (!converted) throw new Error(`Could not convert ${ext} to ${target}.`);
  return path.join(outDir, converted);
}

function normalizePdfText(value=''){
  return String(value||'')
    .replace(/\uFB00/g,'ff').replace(/\uFB01/g,'fi').replace(/\uFB02/g,'fl').replace(/\uFB03/g,'ffi').replace(/\uFB04/g,'ffl')
    .replace(/\u00A0/g,' ').replace(/[ \t]+/g,' ').trim();
}
function repairPdfWordBreaks(text=''){
  return String(text||'')
    .replace(/\uFFFD/g,'')
    .replace(/\bfi\s+(rst|nal|nance|nancial|nancing|nancially|nd|nds|nding|eld|elds|gure|gures|ve|cation|cations|ed|er|ers|rm|rms|xed|t|ts)\b/gi,(_,tail)=>`fi${tail}`)
    .replace(/\bfl\s+(ow|ows|exible|exibility|oor|oors|y)\b/gi,(_,tail)=>`fl${tail}`)
    .replace(/\bidenti\s+fi\s+(ed|cation|cations|er|ers)\b/gi,(_,tail)=>`identifi${tail}`)
    .replace(/\bveri\s+fi\s+(ed|cation|cations|able)\b/gi,(_,tail)=>`verifi${tail}`)
    .replace(/\bde\s+fi\s+(ned|nition|nitions|ne|ning)\b/gi,(_,tail)=>`defi${tail}`)
    .replace(/\bnoti\s+fi\s+(ed|cation|cations)\b/gi,(_,tail)=>`notifi${tail}`)
    .replace(/\bspeci\s+fi\s+(ed|c|cation|cally)\b/gi,(_,tail)=>`specifi${tail}`)
    .replace(/\bsigni\s+fi\s+(cant|cantly|cance)\b/gi,(_,tail)=>`signifi${tail}`)
    .replace(/\bclari\s+fi\s+(cation|ed|es)\b/gi,(_,tail)=>`clarifi${tail}`)
    .replace(/\bcon\s+fi\s+(dence|dent|rmed|rm|guration)\b/gi,(_,tail)=>`confi${tail}`)
    .replace(/\bful\s+fi\s+(l|ll|lment|lled)\b/gi,(_,tail)=>`fulfi${tail}`)
    .replace(/\bre\s+fi\s+(ll|lled|lling)\b/gi,(_,tail)=>`refi${tail}`)
    .replace(/\bin\s+fl\s+(uence|uences|uenced|uencing)\b/gi,(_,tail)=>`influ${tail}`)
    .replace(/\bchie\s+fl\s+y\b/gi,'chiefly')
    .replace(/\bre\s+fl\s+(ect|ects|ected|ection)\b/gi,(_,tail)=>`refl${tail}`)
    .replace(/\bidenti\s+fier(s)?\b/gi,(_,s)=>`identifier${s||''}`)
    .replace(/\bveri\s+fied\b/gi,'verified')
    .replace(/\binfluuenc(e|es|ed|ing)\b/gi,(_,tail)=>`influenc${tail}`)
    .replace(/\bPART\s+([IVXLC\d]+)\s+4\s+/g,'PART $1 — ')
    .replace(/\s+4\s+continued\b/gi,' — continued')
    .replace(/^<(.{8,500})=$/gm,'“$1”')
    .replace(/\s+([,.;:!?])/g,'$1')
    .replace(/\n{3,}/g,'\n\n').trim();
}

async function popplerLayoutPages(filePath){
  try{
    const out=await execFileAsync('pdftotext',['-layout','-enc','UTF-8',filePath,'-'],{timeout:90000,maxBuffer:64*1024*1024});
    return String(out.stdout||'').split('\f');
  }catch{return []}
}
function reflowPopplerPage(raw='',mode='single'){
  const source=String(raw||'').replace(/\r/g,'');
  const lines=source.split('\n');
  if(mode==='editorial'){
    const pairs=[];
    for(const line of lines){const m=line.match(/^(.*?\S) {7,}(\S.*)$/);if(m)pairs.push({line,left:m[1].trim(),right:m[2].trim(),rightStart:line.indexOf(m[2])});}
    if(pairs.length>=3){
      const starts=pairs.map(x=>x.rightStart).sort((a,b)=>a-b),rightStart=starts[Math.floor(starts.length/2)]||50,left=[],right=[];
      for(const line of lines){if(!line.trim())continue;const m=line.match(/^(.*?\S) {7,}(\S.*)$/);if(m){left.push(m[1].trim());right.push(m[2].trim());continue;}const first=line.search(/\S/);if(first>=Math.max(0,rightStart-3))right.push(line.trim());else left.push(line.trim());}
      return repairPdfWordBreaks([...left,...right].join('\n'));
    }
  }
  if(mode==='tabular'){
    return repairPdfWordBreaks(lines.map(line=>line.trim()?line.trim().replace(/ {3,}/g,'\t'):'').join('\n').replace(/\n{3,}/g,'\n\n'));
  }
  return repairPdfWordBreaks(lines.map(line=>line.trim()).join('\n').replace(/\n{3,}/g,'\n\n'));
}

async function extractPdfImages(filePath, assetDir) {
  if (String(process.env.EXTRACT_PDF_IMAGES ?? 'true').toLowerCase() === 'false') return [];
  const maxAssets = Math.max(0, Math.min(80, Number(process.env.PDF_IMAGE_EXTRACT_LIMIT || 36)));
  if (!maxAssets) return [];
  let listing='';
  try {
    const out = await execFileAsync('pdfimages', ['-list', filePath], { timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
    listing = String(out.stdout || '');
  } catch { return []; }
  const candidates=[];
  for (const line of listing.split(/\r?\n/)) {
    const m=line.match(/^\s*(\d+)\s+(\d+)\s+(image)\s+(\d+)\s+(\d+)\s+/i);
    if(!m)continue;
    const pageNumber=Number(m[1]), imageNumber=Number(m[2]), width=Number(m[4]), height=Number(m[5]);
    const area=width*height;
    if(width<260||height<150||area<90000)continue;
    candidates.push({pageNumber,imageNumber,width,height,area});
  }
  if(!candidates.length)return [];
  await fs.mkdir(assetDir,{recursive:true});
  const prefix=path.join(assetDir,`pdfimg-${Date.now()}`);
  try {
    await execFileAsync('pdfimages',['-all',filePath,prefix],{timeout:Number(process.env.PDF_IMAGE_EXTRACT_TIMEOUT_MS||120000),maxBuffer:16*1024*1024});
  } catch { return []; }
  let names=[];try{names=await fs.readdir(assetDir)}catch{return []}
  const byNum=new Map();
  for(const name of names){
    if(!name.startsWith(path.basename(prefix)+'-'))continue;
    const m=name.match(/-(\d+)\.([a-z0-9]+)$/i);if(!m)continue;
    const num=Number(m[1]), ext=m[2].toLowerCase();
    if(!['jpg','jpeg','png','webp'].includes(ext))continue;
    const full=path.join(assetDir,name);let stat;try{stat=await fs.stat(full)}catch{continue}
    if(stat.size<5000)continue;
    const arr=byNum.get(num)||[];arr.push({name,full,size:stat.size,ext});byNum.set(num,arr);
  }
  // Prefer useful, sizeable source visuals while retaining page context for semantic placement.
  const selected=candidates
    .map(meta=>{const files=(byNum.get(meta.imageNumber)||[]).sort((a,b)=>b.size-a.size);return files[0]?{...meta,...files[0]}:null})
    .filter(Boolean)
    .sort((a,b)=>b.area-a.area||b.size-a.size)
    .slice(0,maxAssets);
  const keep=new Set(selected.map(x=>x.full));
  for(const name of names){
    if(!name.startsWith(path.basename(prefix)+'-'))continue;
    const full=path.join(assetDir,name);if(!keep.has(full))try{await fs.unlink(full)}catch{}
  }
  return selected.map((x,i)=>({
    name:`source-p${String(x.pageNumber).padStart(3,'0')}-${String(i+1).padStart(2,'0')}.${x.ext}`,
    originalPath:`PDF page ${x.pageNumber}, image ${x.imageNumber}`,
    path:x.full,
    pageNumber:x.pageNumber,
    width:x.width,
    height:x.height,
    sourceKind:'embedded-pdf-image'
  }));
}

async function parsePdf(filePath, assetDir) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const popplerPages=await popplerLayoutPages(filePath);
  const data = new Uint8Array(await fs.readFile(filePath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let n=1; n<=doc.numPages; n++) {
    const page = await doc.getPage(n);
    const viewport=page.getViewport({scale:1});
    const content = await page.getTextContent();
    const raw=(content.items||[]).map(item=>({text:normalizePdfText(item.str),x:Number(item.transform?.[4]||0),y:Number(item.transform?.[5]||0),w:Number(item.width||0),h:Math.abs(Number(item.height||item.transform?.[3]||10))})).filter(x=>x.text);
    raw.sort((a,b)=>b.y-a.y||a.x-b.x);
    const rows=[];const yTolerance=2.8;
    for(const item of raw){let row=rows.find(r=>Math.abs(r.y-item.y)<=Math.max(yTolerance,Math.min(5,item.h*.28)));if(!row){row={y:item.y,items:[]};rows.push(row)}row.items.push(item);}
    rows.sort((a,b)=>b.y-a.y);
    const joinItems=(items=[])=>{let out='',prev=null;for(const item of [...items].sort((a,b)=>a.x-b.x)){if(!prev){out=item.text;prev=item;continue}const gap=item.x-(prev.x+Math.max(prev.w,0));const natural=Math.max(3,Math.min(12,(prev.h+item.h)*.26));out+=gap>natural?' ':' ';out+=item.text;prev=item;}return out.trim();};
    const rowData=rows.map(row=>{const items=[...row.items].sort((a,b)=>a.x-b.x),left=items.filter(i=>i.x+i.w*.5<viewport.width*.50),right=items.filter(i=>i.x+i.w*.5>=viewport.width*.50),leftText=joinItems(left),rightText=joinItems(right),whole=joinItems(items),gap=left.length&&right.length?right[0].x-(left.at(-1).x+Math.max(left.at(-1).w,0)):0;return {y:row.y,items,leftText,rightText,whole,hasBoth:Boolean(leftText&&rightText&&gap>12),minX:items[0]?.x||0,maxX:items.length?items.at(-1).x+items.at(-1).w:0};});
    const paired=rowData.filter(r=>r.hasBoth),avg=(arr)=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0,leftAvg=avg(paired.map(r=>r.leftText.length)),rightAvg=avg(paired.map(r=>r.rightText.length)),rightNumeric=paired.length?paired.filter(r=>/^\s*[0-9ivxlcdm.%-]+\s*$/i.test(r.rightText)).length/paired.length:0,early=rowData.slice(0,12).map(r=>r.whole).join(' '),allRows=rowData.map(r=>r.whole).join('\n');
    const tocContinuation=(allRows.match(/\.{4,}/g)||[]).length>=3||(((allRows.match(/\bchapter\s+\d+\b/gi)||[]).length+(allRows.match(/\bpart\s+[ivxlcdm\d]+\b/gi)||[]).length)>=4&&(allRows.match(/\b\d{1,4}\b/g)||[]).length>=6);
    const tableLike=/\b(term|definition|meaning|section\s+page|table of contents|contents|glossary)\b/i.test(early)||tocContinuation||rightNumeric>.48||(paired.length>=4&&leftAvg<38&&rightAvg>leftAvg*1.35);
    const editorialColumns=paired.length>=4&&paired.length/Math.max(1,rowData.length)>.14&&!tableLike;
    let lines=[];
    if(editorialColumns){const left=[],right=[];for(const r of rowData){if(r.hasBoth){left.push(r.leftText);right.push(r.rightText);}else if(r.whole){const center=(r.minX+r.maxX)/2;if(center>=viewport.width*.54)right.push(r.whole);else left.push(r.whole);}}lines=[...left.filter(Boolean),...right.filter(Boolean)];}
    else lines=rowData.map(r=>r.hasBoth?`${r.leftText}\t${r.rightText}`:r.whole).filter(Boolean);
    const structuredRows=rowData.map(row=>({y:row.y,cells:row.items.map(i=>({text:i.text,x:i.x,w:i.w,h:i.h}))}));
    const geometryText=repairPdfWordBreaks(lines.join('\n'));
    const popplerRaw=popplerPages[n-1]||'';
    const popplerText=popplerRaw.trim()?reflowPopplerPage(popplerRaw,editorialColumns?'editorial':tableLike?'tabular':'single'):'';
    // Poppler usually preserves embedded-font glyph mappings (currency, en-dashes, ligatures) more faithfully;
    // PDF.js geometry still supplies column/table detection and coordinates.
    const text=popplerText.length>=Math.max(20,geometryText.length*.55)?popplerText:geometryText;
    const tabRows=lines.filter(x=>x.includes('\t')).length;
    pages.push({ index:n, title:`Page ${n}`, text, structure:{tabularRows:tabRows,width:viewport.width,height:viewport.height,rows:structuredRows.slice(0,240),columnar:editorialColumns,columnMode:editorialColumns?'editorial':tableLike?'tabular':'single'} });
  }
  const readable=pages.filter(p=>(p.text||'').trim().length>=20).length;
  const ratio=doc.numPages?readable/doc.numPages:0;
  const extractionConfidence=ratio>=0.95?'high':ratio>=0.7?'medium':'low';
  const assets=await extractPdfImages(filePath,assetDir);
  return { kind:'pdf', pages, text: pages.map(p=>`--- PAGE ${p.index} ---\n${p.text}`).join('\n\n'), metadata:{ pageCount:doc.numPages, readablePages:readable, extractionConfidence, geometryAware:true, canonicalTextLayer:popplerPages.length?'poppler-layout+pdfjs-geometry':'pdfjs-geometry', extractedImages:assets.length }, extractionConfidence, assets };
}


function htmlToStructuredText(html) {
  return html
    .replace(/<h1[^>]*>/gi,'\n# ').replace(/<\/h1>/gi,'\n')
    .replace(/<h2[^>]*>/gi,'\n## ').replace(/<\/h2>/gi,'\n')
    .replace(/<h3[^>]*>/gi,'\n### ').replace(/<\/h3>/gi,'\n')
    .replace(/<li[^>]*>/gi,'\n- ').replace(/<\/li>/gi,'')
    .replace(/<tr[^>]*>/gi,'\n').replace(/<\/tr>/gi,'')
    .replace(/<t[dh][^>]*>/gi,' | ').replace(/<\/t[dh]>/gi,'')
    .replace(/<p[^>]*>/gi,'\n').replace(/<\/p>/gi,'\n')
    .replace(/<br\s*\/?>/gi,'\n')
    .replace(/<[^>]+>/g,'')
    .replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/\n{3,}/g,'\n\n').trim();
}

async function extractZipMedia(buffer, prefix, assetDir) {
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter(n => n.startsWith(prefix) && !zip.files[n].dir);
  const assets = [];
  await fs.mkdir(assetDir, { recursive:true });
  for (const name of names.slice(0, 100)) {
    const data = await zip.file(name).async('nodebuffer');
    const filename = safeName(path.basename(name));
    const out = path.join(assetDir, filename);
    await fs.writeFile(out, data);
    assets.push({ name:filename, originalPath:name, path:out });
  }
  return assets;
}

async function parseDocx(filePath, assetDir) {
  const buffer = await fs.readFile(filePath);
  const html = await mammoth.convertToHtml({ buffer });
  const raw = await mammoth.extractRawText({ buffer });
  const text = htmlToStructuredText(html.value) || raw.value;
  const assets = await extractZipMedia(buffer, 'word/media/', assetDir);
  const extractionConfidence=text.trim().length? (html.messages.length?'medium':'high') : 'low';
  return { kind:'docx', pages:[{index:1,title:'Document',text}], text, metadata:{ warnings:html.messages.map(m=>m.message), extractionConfidence }, extractionConfidence, assets };
}

function collectTextNodes(obj, out=[]) {
  if (obj == null) return out;
  if (typeof obj === 'string') return out;
  if (Array.isArray(obj)) { obj.forEach(x=>collectTextNodes(x,out)); return out; }
  for (const [k,v] of Object.entries(obj)) {
    if (k === 'a:t') {
      if (Array.isArray(v)) v.forEach(x => out.push(typeof x==='string'?x:String(x?.['#text']||'')));
      else out.push(typeof v==='string'?v:String(v?.['#text']||''));
    } else collectTextNodes(v,out);
  }
  return out;
}

async function parsePptx(filePath, assetDir) {
  const buffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(buffer);
  const slideNames = Object.keys(zip.files)
    .filter(n=>/^ppt\/slides\/slide\d+\.xml$/i.test(n))
    .sort((a,b)=>Number(a.match(/slide(\d+)/i)[1])-Number(b.match(/slide(\d+)/i)[1]));
  const pages=[];
  for (let i=0;i<slideNames.length;i++) {
    const xmlText = await zip.file(slideNames[i]).async('text');
    const parsed = xml.parse(xmlText);
    const text = collectTextNodes(parsed,[]).filter(Boolean).join('\n').trim();
    const lines = text.split('\n').filter(Boolean);
    pages.push({ index:i+1, title:lines[0] || `Slide ${i+1}`, text });
  }
  const assets = await extractZipMedia(buffer, 'ppt/media/', assetDir);
  const chartNotes=[];
  const chartNames=Object.keys(zip.files).filter(n=>/^ppt\/charts\/chart\d+\.xml$/i.test(n));
  for (const name of chartNames) {
    try {
      const parsed=xml.parse(await zip.file(name).async('text'));
      const values=[];
      const walk=(o)=>{if(o==null)return;if(Array.isArray(o)){o.forEach(walk);return;}if(typeof o!=='object')return;for(const [k,v] of Object.entries(o)){if(k==='c:v'){if(Array.isArray(v))v.forEach(x=>values.push(String(x?.['#text']??x)));else values.push(String(v?.['#text']??v));}else walk(v)}};
      walk(parsed); if(values.length)chartNotes.push(`${name}: ${values.join(' | ')}`);
    } catch {}
  }
  const embeddedNotes=[];
  const embedded=Object.keys(zip.files).filter(n=>/^ppt\/embeddings\/.*\.xlsx$/i.test(n));
  for(const name of embedded.slice(0,20)){
    try{const wb=XLSX.read(await zip.file(name).async('nodebuffer'),{type:'buffer',cellFormula:true});for(const sn of wb.SheetNames){embeddedNotes.push(`${name} / ${sn}\n${XLSX.utils.sheet_to_csv(wb.Sheets[sn],{blankrows:false})}`)}}catch{}
  }
  const baseText=pages.map(p=>`--- SLIDE ${p.index}: ${p.title} ---\n${p.text}`).join('\n\n');
  const extra=[chartNotes.length?`--- NATIVE CHART VALUES ---\n${chartNotes.join('\n')}`:'',embeddedNotes.length?`--- EMBEDDED CHART/DATA WORKBOOKS ---\n${embeddedNotes.join('\n\n')}`:''].filter(Boolean).join('\n\n');
  const readable=pages.filter(p=>(p.text||'').trim().length).length;
  const extractionConfidence=pages.length && readable/pages.length>=0.9?'high':readable?'medium':'low';
  return { kind:'pptx', pages, text:baseText+(extra?`\n\n${extra}`:''), metadata:{ slideCount:pages.length, readableSlides:readable, nativeCharts:chartNames.length, embeddedWorkbooks:embedded.length, extractionConfidence }, extractionConfidence, assets };
}

async function parseXlsx(filePath) {
  const workbook = XLSX.readFile(filePath, { cellFormula:true, cellStyles:false, cellDates:true });
  const pages=[];
  for (let i=0;i<workbook.SheetNames.length;i++) {
    const name = workbook.SheetNames[i];
    const sheet = workbook.Sheets[name];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows:false });
    pages.push({ index:i+1, title:name, text:csv });
  }
  const extractionConfidence=pages.some(p=>(p.text||'').trim().length)?'high':'low';
  return { kind:'xlsx', pages, text:pages.map(p=>`--- SHEET: ${p.title} ---\n${p.text}`).join('\n\n'), metadata:{ sheets:workbook.SheetNames, extractionConfidence }, extractionConfidence, assets:[] };
}

async function parseCsv(filePath) {
  const text = await fs.readFile(filePath,'utf8');
  const extractionConfidence=text.trim().length?'high':'low';
  return { kind:'csv', pages:[{index:1,title:path.basename(filePath),text}], text, metadata:{extractionConfidence}, extractionConfidence, assets:[] };
}

export async function parseUploadedFile(file, uploadId) {
  const sourceDir = path.resolve('data/uploads', uploadId, 'source');
  await fs.mkdir(sourceDir, { recursive:true });
  const originalCopy = path.join(sourceDir, safeName(file.originalname));
  await fs.copyFile(file.path, originalCopy);
  let filePath = file.path;
  let ext = path.extname(file.originalname).toLowerCase();
  if (['.doc','.ppt','.xls'].includes(ext)) {
    filePath = await legacyConvert(filePath, ext);
    ext = path.extname(filePath).toLowerCase();
  }
  const assetDir = path.resolve('data/uploads', uploadId, 'media');
  let result;
  if (ext === '.pdf') result = await parsePdf(filePath, assetDir);
  else if (ext === '.docx') result = await parseDocx(filePath, assetDir);
  else if (ext === '.pptx') result = await parsePptx(filePath, assetDir);
  else if (ext === '.xlsx') result = await parseXlsx(filePath);
  else if (ext === '.csv') result = await parseCsv(filePath);
  else throw new Error(`Unsupported file type: ${ext}. Supported: PDF, DOC/DOCX, PPT/PPTX, XLS/XLSX, CSV.`);

  result.filename = file.originalname;
  result.originalPath = originalCopy;
  result.originalUrl = `/uploads/${uploadId}/source/${encodeURIComponent(path.basename(originalCopy))}`;
  result.originalExtension = path.extname(file.originalname).toLowerCase();
  result.assets = (result.assets||[]).map(a=>({ ...a, url:`/uploads/${uploadId}/media/${encodeURIComponent(a.name)}` }));
  result.text = result.text.replace(/\u0000/g,'').trim();
  return result;
}
