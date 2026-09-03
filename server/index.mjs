import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import { parseUploadedFile } from './fileParsers.mjs';
import { generateProject, generateNextPage, editWithAI, generateImage, qualityControlProject } from './ai.mjs';
import { listProjects, getProject, saveProject, deleteProject } from './store.mjs';
import { exportProject } from './exporters.mjs';
import { BRAND } from './brand.mjs';
import { DESIGN_KNOWLEDGE_VERSION, DESIGN_KNOWLEDGE } from './designKnowledge.mjs';

const app=express();
const PORT=Number(process.env.PORT||10000);
const UPLOAD_ROOT=path.resolve('data/uploads');
const EXPORT_ROOT=path.resolve('data/exports');
const TMP_ROOT=path.resolve('tmp');
await fs.mkdir(UPLOAD_ROOT,{recursive:true});
await fs.mkdir(EXPORT_ROOT,{recursive:true});
await fs.mkdir(TMP_ROOT,{recursive:true});

app.use(cors());
app.use(express.json({limit:'8mb'}));
app.use('/uploads',express.static(UPLOAD_ROOT));
app.use('/exports',express.static(EXPORT_ROOT));

function authorized(req) {
  const expected=process.env.APP_ACCESS_CODE;
  if (!expected) return true;
  return req.get('x-access-code')===expected;
}
app.use('/api',(req,res,next)=>{
  if (req.path==='/health' || req.path==='/config') return next();
  if (!authorized(req)) return res.status(401).json({error:'Access code required.'});
  next();
});

const upload=multer({
  dest:TMP_ROOT,
  limits:{fileSize:60*1024*1024,files:10},
  fileFilter:(req,file,cb)=>{
    const ext=path.extname(file.originalname).toLowerCase();
    const allowed=['.pdf','.doc','.docx','.ppt','.pptx','.xls','.xlsx','.csv'];
    cb(allowed.includes(ext)?null:new Error(`Unsupported file: ${ext}`),allowed.includes(ext));
  }
});

app.get('/api/health',(req,res)=>res.json({ok:true,service:'Long Form Design Studio',ai:Boolean(process.env.OPENAI_API_KEY)}));
app.get('/api/config',(req,res)=>res.json({
  studioName:BRAND.studioName, brand:BRAND, aiEnabled:Boolean(process.env.OPENAI_API_KEY),
  accessCodeRequired:Boolean(process.env.APP_ACCESS_CODE), model:process.env.OPENAI_MODEL||'gpt-5.6',
  supportedInputs:['pdf','doc','docx','ppt','pptx','xls','xlsx','csv'],
  designKnowledgeVersion:DESIGN_KNOWLEDGE_VERSION, qcThreshold:DESIGN_KNOWLEDGE.deliveryThreshold
}));

app.post('/api/upload',upload.array('files',10),async(req,res,next)=>{
  try{
    if(!req.files?.length) return res.status(400).json({error:'Attach at least one file.'});
    const uploadId=uuid();
    const parsed=[];
    for(const f of req.files){ parsed.push(await parseUploadedFile(f,uploadId)); }
    const confidenceRank={low:0,medium:1,high:2};
    const aggregateConfidence=parsed.reduce((worst,p)=>confidenceRank[p.extractionConfidence] < confidenceRank[worst] ? p.extractionConfidence : worst,'high');
    const aggregate={
      filename:parsed.map(p=>p.filename).join(' + '), kind:parsed.length===1?parsed[0].kind:'multi-file',
      metadata:{files:parsed.map(p=>({filename:p.filename,kind:p.kind,metadata:p.metadata,extractionConfidence:p.extractionConfidence})),extractionConfidence:aggregateConfidence},
      extractionConfidence:aggregateConfidence,
      text:parsed.map(p=>`===== SOURCE FILE: ${p.filename} =====\n${p.text}`).join('\n\n'),
      assets:parsed.flatMap(p=>p.assets||[]),
      originalFiles:parsed.map(p=>({filename:p.filename,path:p.originalPath,url:p.originalUrl,extension:p.originalExtension}))
    };
    const dir=path.join(UPLOAD_ROOT,uploadId); await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(path.join(dir,'parsed.json'),JSON.stringify({files:parsed,aggregate},null,2));
    res.json({uploadId,extractionConfidence:aggregateConfidence,files:parsed.map(p=>({filename:p.filename,kind:p.kind,metadata:p.metadata,extractionConfidence:p.extractionConfidence,assets:p.assets})),preview:aggregate.text.slice(0,14000),assets:aggregate.assets});
  }catch(e){next(e)}
});

async function loadAggregate(uploadId){
  if(!uploadId) return null;
  const file=path.join(UPLOAD_ROOT,uploadId,'parsed.json');
  const data=JSON.parse(await fs.readFile(file,'utf8'));
  return data.aggregate;
}

app.post('/api/generate',async(req,res,next)=>{
  try{
    const {type,prompt,uploadId,contentMode='generate',audience,tone,language,visualStyle,research=false}=req.body||{};
    if(!['presentation','document','graphic'].includes(type)) return res.status(400).json({error:'Choose Presentation, Document, or Graphic.'});
    const parsedFile=await loadAggregate(uploadId);
    if(parsedFile) parsedFile.uploadId=uploadId;
    if(!prompt?.trim() && !parsedFile) return res.status(400).json({error:'Enter a brief or upload a source file.'});
    const project=await generateProject({type,prompt,parsedFile,contentMode,audience,tone,language,visualStyle,research});
    await saveProject(project);
    res.json(project);
  }catch(e){next(e)}
});

app.get('/api/projects',async(req,res,next)=>{try{res.json(await listProjects())}catch(e){next(e)}});
app.get('/api/projects/:id',async(req,res,next)=>{try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});res.json(p)}catch(e){next(e)}});
app.put('/api/projects/:id',async(req,res,next)=>{try{const p={...req.body,id:req.params.id};if(p.qc)p.qc={...p.qc,stale:true};res.json(await saveProject(p))}catch(e){next(e)}});
app.delete('/api/projects/:id',async(req,res,next)=>{try{await deleteProject(req.params.id);res.json({ok:true})}catch(e){next(e)}});

app.post('/api/projects/:id/continue',async(req,res,next)=>{
  try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});if(p.type!=='document')return res.status(400).json({error:'Continue is for documents.'});const page=await generateNextPage(p,req.body?.instruction);p.pages.push(page);p.qc={...(p.qc||{}),stale:true};await saveProject(p);res.json({page,project:p})}catch(e){next(e)}
});

app.post('/api/projects/:id/ai-edit',async(req,res,next)=>{
  try{
    const p=await getProject(req.params.id); if(!p)return res.status(404).json({error:'Project not found.'});
    const result=await editWithAI({project:p,...req.body});
    if(result.kind==='page'){
      const i=p.pages.findIndex(x=>x.id===req.body.pageId); if(i>=0){ result.value.id=p.pages[i].id; p.pages[i]=result.value; }
    } else if(result.kind==='block'){
      const page=p.pages.find(x=>x.id===req.body.pageId); const i=page?.blocks.findIndex(x=>x.id===req.body.blockId); if(i>=0){result.value.id=page.blocks[i].id;page.blocks[i]=result.value;}
    }
    p.qc={...(p.qc||{}),stale:true}; await saveProject(p); res.json({result,project:p});
  }catch(e){next(e)}
});

app.post('/api/projects/:id/generate-image',async(req,res,next)=>{
  try{
    const p=await getProject(req.params.id); if(!p)return res.status(404).json({error:'Project not found.'});
    const {pageId,blockId,prompt,aspect}=req.body||{};
    const page=p.pages.find(x=>x.id===pageId); const block=page?.blocks.find(x=>x.id===blockId);
    if(!block)return res.status(404).json({error:'Image block not found.'});
    const bytes=await generateImage({prompt:prompt||block.imagePrompt||page.title,aspect:aspect||(p.type==='graphic'?'portrait':'landscape')});
    const dir=path.join(UPLOAD_ROOT,'generated');await fs.mkdir(dir,{recursive:true});const filename=`${uuid()}.png`;await fs.writeFile(path.join(dir,filename),bytes);
    block.imageUrl=`/uploads/generated/${filename}`; if(!block.altText)block.altText=String(prompt||block.imagePrompt||page.title).slice(0,220); p.qc={...(p.qc||{}),stale:true}; await saveProject(p);res.json({url:block.imageUrl,project:p});
  }catch(e){next(e)}
});

app.post('/api/projects/:id/qc',async(req,res,next)=>{
  try{
    const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});
    let parsedFile=null;
    if(p.sourceFile?.uploadId){try{parsedFile=await loadAggregate(p.sourceFile.uploadId);if(parsedFile)parsedFile.uploadId=p.sourceFile.uploadId}catch{}}
    p.qc=await qualityControlProject(p,{parsedFile});
    await saveProject(p);
    res.json({qc:p.qc,project:p});
  }catch(e){next(e)}
});

app.post('/api/projects/:id/export',async(req,res,next)=>{
  try{
    const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});
    let parsedFile=null;if(p.sourceFile?.uploadId){try{parsedFile=await loadAggregate(p.sourceFile.uploadId)}catch{}}
    if(!p.qc || p.qc.stale){p.qc=await qualityControlProject(p,{parsedFile});await saveProject(p);}
    if(!p.qc.pass) return res.status(422).json({error:`Quality gate failed (${Math.round(p.qc.totalScore||0)}/100). Resolve blocking defects or recommendations before export.`,qc:p.qc});
    const format=String(req.body?.format||'pdf').toLowerCase();const file=await exportProject(p,format);res.json({url:`/exports/${encodeURIComponent(path.basename(file))}`,filename:path.basename(file),qc:p.qc});
  }catch(e){next(e)}
});

app.use((err,req,res,next)=>{
  console.error(err);
  const status=err?.status||500;
  res.status(status).json({error:err.message||'Something went wrong.',detail:process.env.NODE_ENV==='development'?err.stack:undefined});
});

const dist=path.resolve('dist');
try{await fs.access(dist);app.use(express.static(dist));app.get('*',(req,res)=>res.sendFile(path.join(dist,'index.html')))}catch{}

app.listen(PORT,'0.0.0.0',()=>console.log(`Long Form Design Studio running on http://0.0.0.0:${PORT}`));
