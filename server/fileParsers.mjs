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

async function parsePdf(filePath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(await fs.readFile(filePath));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const pages = [];
  for (let n=1; n<=doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items = content.items || [];
    // Preserve visual reading order approximately by y (descending), then x.
    const rows = new Map();
    for (const item of items) {
      const y = Math.round(item.transform?.[5] || 0);
      const x = item.transform?.[4] || 0;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({x, text: item.str});
    }
    const text = [...rows.entries()]
      .sort((a,b)=>b[0]-a[0])
      .map(([,r])=>r.sort((a,b)=>a.x-b.x).map(i=>i.text).join(' '))
      .join('\n').replace(/\n{3,}/g,'\n\n').trim();
    pages.push({ index:n, title:`Page ${n}`, text });
  }
  const readable=pages.filter(p=>(p.text||'').trim().length>=20).length;
  const ratio=doc.numPages?readable/doc.numPages:0;
  const extractionConfidence=ratio>=0.95?'high':ratio>=0.7?'medium':'low';
  return { kind:'pdf', pages, text: pages.map(p=>`--- PAGE ${p.index} ---\n${p.text}`).join('\n\n'), metadata:{ pageCount:doc.numPages, readablePages:readable, extractionConfidence }, extractionConfidence, assets:[] };
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
  if (ext === '.pdf') result = await parsePdf(filePath);
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
