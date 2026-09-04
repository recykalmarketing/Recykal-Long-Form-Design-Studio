import express from 'express';
import http from 'node:http';
import crypto from 'node:crypto';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import cors from 'cors';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { v4 as uuid } from 'uuid';
import sharp from 'sharp';
import { parseUploadedFile } from './fileParsers.mjs';
import { generateProject, generateProjectStream, generateNextPage, editWithAI, generateImage, qualityControlProject, reflowProject, generateOutline, generatePageVariations, repurposeProject, analyzeImageFocalPoint, localizeProject, enforceA4DocumentPages } from './ai.mjs';
import { listProjects, getProject, saveProject, deleteProject, listKnowledge, getKnowledge, saveKnowledge, deleteKnowledge, saveVersion, listVersions, getVersion, listComments, saveComment, patchComment, deleteComment, listUsers, upsertUser, patchUser, deactivateUser, createShareLink, getShareByHash, listShareLinks, revokeShareLink, recordShareEvent, projectAnalytics, createApiKey, listApiKeys, revokeApiKey, saveWebhook, listWebhooks, deleteWebhook, getBinaryAsset, saveSourceAggregate, getSourceAggregate, storageStatus } from './store.mjs';
import { exportProject } from './exporters.mjs';
import { preflightExport } from './preflight.mjs';
import { BRAND } from './brand.mjs';
import { DESIGN_KNOWLEDGE_VERSION, DESIGN_KNOWLEDGE } from './designKnowledge.mjs';
import { TEMPLATES, getTemplate } from './templates.mjs';
import { THEMES, DECK_STYLES, IMAGE_SOURCES, ART_STYLES } from './visuals.mjs';
import { persistBytes, persistFile, persistParsedMedia, sendAsset, assetList } from './assets.mjs';
import { searchStock, fetchStockImage } from './stock.mjs';
import { localizationProfiles, localizationQA } from './localization.mjs';
import { dispatchWebhook, newWebhookSecret, assertSafeWebhookUrl } from './automation.mjs';
import { diffProjects } from './diff.mjs';
import { authCapabilities, beginOidc, finishOidc, logout, requestIdentity, requireRole, hasRole, scimAuthorized, newApiKey, hashKey } from './auth.mjs';
import { listScim, createScim, getScim, replaceScim, patchScim, deleteScim } from './scim.mjs';
import { attachCollaboration, broadcast } from './collaboration.mjs';

const app=express();
const PORT=Number(process.env.PORT||10000);
const UPLOAD_ROOT=path.resolve('data/uploads');
const EXPORT_ROOT=path.resolve('data/exports');
const TMP_ROOT=path.resolve('tmp');
await fs.mkdir(UPLOAD_ROOT,{recursive:true});
await fs.mkdir(EXPORT_ROOT,{recursive:true});
await fs.mkdir(TMP_ROOT,{recursive:true});

const allowedOrigins=String(process.env.CORS_ALLOWED_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean);
app.use(helmet({crossOriginResourcePolicy:{policy:'cross-origin'},contentSecurityPolicy:false}));
app.use(cors({origin:(origin,cb)=>{if(!origin||!allowedOrigins.length||allowedOrigins.includes(origin))return cb(null,true);cb(new Error('Origin not allowed.'))},credentials:true}));
app.use(express.json({limit:'10mb'}));
app.use(express.urlencoded({extended:false,limit:'1mb'}));
app.use(rateLimit({windowMs:60_000,limit:Number(process.env.API_RATE_LIMIT_PER_MINUTE||240),standardHeaders:'draft-7',legacyHeaders:false,skip:req=>req.path==='/api/health'}));
app.use('/uploads',express.static(UPLOAD_ROOT,{maxAge:'1h'}));
app.use('/exports',express.static(EXPORT_ROOT,{maxAge:'5m'}));

// Authentication. Access-code mode remains as a fallback; Google/Microsoft SSO can be enabled through env vars.
app.get('/auth/login/:provider',(req,res,next)=>beginOidc(req,res,req.params.provider).catch(next));
app.get('/auth/callback/:provider',(req,res,next)=>finishOidc(req,res,req.params.provider).catch(next));
app.post('/auth/logout',(req,res)=>{logout(res);res.json({ok:true})});
app.get('/api/assets/:id',async(req,res,next)=>{try{const identity=await requestIdentity(req);if(identity)return sendAsset(req,res);const shareToken=String(req.query.share||'');if(!shareToken)return res.status(401).json({error:'Asset authentication required.'});const tokenHash=crypto.createHash('sha256').update(shareToken).digest('hex');const link=await getShareByHash(tokenHash);if(!link||link.revokedAt||(link.expiresAt&&new Date(link.expiresAt)<new Date()))return res.status(403).json({error:'Share access expired or invalid.'});const p=await getProject(link.projectId);if(!p||!JSON.stringify(p).includes(`/api/assets/${req.params.id}`))return res.status(403).json({error:'This asset is not part of the shared project.'});return sendAsset(req,res)}catch(e){next(e)}});

const publicApiPaths=new Set(['/health','/config','/me']);
app.use('/api',async(req,res,next)=>{
  if(publicApiPaths.has(req.path)||req.path.startsWith('/assets/'))return next();
  const identity=await requestIdentity(req);if(!identity)return res.status(401).json({error:'Sign in or access code required.'});if(identity.kind==='api-key'&&!req.path.startsWith('/v1/'))return res.status(403).json({error:'API keys may only use the stable /api/v1 endpoints.'});req.identity=identity;next();
});
function requireScope(scope){return (req,res,next)=>{if(req.identity?.kind!=='api-key')return next();if((req.identity.scopes||[]).includes('*')||(req.identity.scopes||[]).includes(scope))return next();return res.status(403).json({error:`API key requires ${scope} scope.`})}}
const approvalRequired=String(process.env.REQUIRE_APPROVER_FOR_FINAL_EXPORT||'false').toLowerCase()==='true';
const durableStorageRequired=String(process.env.REQUIRE_DURABLE_STORAGE||'true').toLowerCase()!=='false';
function finalApprovalOk(project){return !approvalRequired || project?.workflow?.status==='Approved';}
async function ensureDurableGenerationStorage(){const st=await storageStatus();if(durableStorageRequired&&!st.durable){const e=new Error('Persistent project storage is not connected. Configure Render Postgres DATABASE_URL before starting paid AI generation so completed work cannot disappear after a restart or deploy.');e.status=503;throw e;}return st;}

// Public read-only share viewer APIs. The raw token is never stored; only its SHA-256 hash is persisted.
app.get('/public/share/:token',async(req,res,next)=>{try{const tokenHash=crypto.createHash('sha256').update(String(req.params.token||'')).digest('hex');const link=await getShareByHash(tokenHash);if(!link)return res.status(404).json({error:'Share link not found or revoked.'});if(link.expiresAt&&new Date(link.expiresAt)<new Date())return res.status(410).json({error:'Share link has expired.'});const p=await getProject(link.projectId);if(!p)return res.status(404).json({error:'Project not found.'});let safe=structuredClone(p);delete safe.sourceFile;if(safe.settings)delete safe.settings.approvedAssets;safe=JSON.parse(JSON.stringify(safe).replace(/\/api\/assets\/([a-zA-Z0-9_-]+)/g,(_,id)=>`/api/assets/${id}?share=${encodeURIComponent(req.params.token)}`));res.json({project:safe,share:{id:link.id,label:link.label,allowDownload:link.allowDownload,expiresAt:link.expiresAt}})}catch(e){next(e)}});
app.post('/public/share/:token/event',async(req,res,next)=>{try{const tokenHash=crypto.createHash('sha256').update(String(req.params.token||'')).digest('hex');const link=await getShareByHash(tokenHash);if(!link)return res.status(404).json({error:'Share link not found.'});await recordShareEvent({shareId:link.id,projectId:link.projectId,sessionId:String(req.body?.sessionId||''),eventType:String(req.body?.eventType||'event').slice(0,40),pageIndex:Number.isInteger(req.body?.pageIndex)?req.body.pageIndex:null,dwellMs:Number(req.body?.dwellMs||0),meta:{referrer:String(req.body?.referrer||'').slice(0,500),viewport:req.body?.viewport||null}});res.json({ok:true})}catch(e){next(e)}});
app.get('/public/share/:token/download',async(req,res,next)=>{try{const tokenHash=crypto.createHash('sha256').update(String(req.params.token||'')).digest('hex');const link=await getShareByHash(tokenHash);if(!link||!link.allowDownload)return res.status(403).send('Download is not enabled for this share link.');if(link.expiresAt&&new Date(link.expiresAt)<new Date())return res.status(410).send('Share link expired.');const p=await getProject(link.projectId);if(!p)return res.status(404).send('Project not found.');const format=String(req.query.format||'pdf').toLowerCase();if(!p.qc?.pass||p.qc?.stale)return res.status(409).send('Final download is unavailable until QC passes.');if(!finalApprovalOk(p))return res.status(409).send('Final download is unavailable until an Approver marks this project Approved.');const profile=format==='pdf'&&String(req.query.profile||'digital').toLowerCase()==='print'?'print':'digital';const file=await exportProject(p,format,{review:false,profile});const preflight=await preflightExport(file,format,p,{profile});if(!preflight.pass)return res.status(409).send('Final download failed production preflight.');res.download(file,path.basename(file))}catch(e){next(e)}});

const sourceUpload=multer({
  dest:TMP_ROOT,
  limits:{fileSize:60*1024*1024,files:10},
  fileFilter:(req,file,cb)=>{
    const ext=path.extname(file.originalname).toLowerCase();
    const allowed=['.pdf','.doc','.docx','.ppt','.pptx','.xls','.xlsx','.csv'];
    cb(allowed.includes(ext)?null:new Error(`Unsupported file: ${ext}`),allowed.includes(ext));
  }
});
const imageUpload=multer({
  dest:TMP_ROOT,
  limits:{fileSize:20*1024*1024,files:1},
  fileFilter:(req,file,cb)=>{
    const ext=path.extname(file.originalname).toLowerCase();
    const allowed=['.png','.jpg','.jpeg','.webp','.svg'];
    cb(allowed.includes(ext)?null:new Error(`Unsupported image: ${ext}`),allowed.includes(ext));
  }
});
const referenceUpload=multer({
  dest:TMP_ROOT,
  limits:{fileSize:10*1024*1024,files:4},
  fileFilter:(req,file,cb)=>{const ext=path.extname(file.originalname).toLowerCase();const allowed=['.png','.jpg','.jpeg','.webp'];cb(allowed.includes(ext)?null:new Error(`Unsupported reference image: ${ext}`),allowed.includes(ext));}
});
const replacementUpload=multer({
  dest:TMP_ROOT,
  limits:{fileSize:60*1024*1024,files:1},
  fileFilter:(req,file,cb)=>{
    const ext=path.extname(file.originalname).toLowerCase();
    const allowed=['.png','.jpg','.jpeg','.webp','.svg','.pdf','.doc','.docx','.ppt','.pptx','.xls','.xlsx','.csv'];
    cb(allowed.includes(ext)?null:new Error(`Unsupported replacement file: ${ext}`),allowed.includes(ext));
  }
});

app.get('/api/health',async(req,res)=>{const storage=await storageStatus();res.json({ok:true,service:'Long Form Design Studio',ai:Boolean(process.env.OPENAI_API_KEY),storage})});
app.get('/api/config',async(req,res)=>{const storage=await storageStatus();res.json({
  studioName:BRAND.studioName, brand:BRAND, aiEnabled:Boolean(process.env.OPENAI_API_KEY),
  accessCodeRequired:Boolean(process.env.APP_ACCESS_CODE), model:process.env.OPENAI_MODEL||'gpt-5.6',
  supportedInputs:['pdf','doc','docx','ppt','pptx','xls','xlsx','csv'],
  designKnowledgeVersion:DESIGN_KNOWLEDGE_VERSION, qcThreshold:DESIGN_KNOWLEDGE.deliveryThreshold,
  autoImages:String(process.env.AUTO_GENERATE_IMAGES??'true').toLowerCase()!=='false',
  auth:authCapabilities(), localization:localizationProfiles(), collaboration:true, persistentAssets:storage.durable, persistentProjects:storage.durable, storage,
  stockProvider:'Openverse', publicApi:true, webhooks:true, shareAnalytics:true,approvalRequired
})});
app.get('/api/me',async(req,res)=>{const identity=await requestIdentity(req);res.json({authenticated:Boolean(identity),identity,auth:authCapabilities()})});
app.get('/api/templates',(req,res)=>res.json(TEMPLATES));
app.get('/api/visual-options',(req,res)=>res.json({themes:THEMES,deckStyles:DECK_STYLES,imageSources:IMAGE_SOURCES,artStyles:ART_STYLES}));

app.post('/api/style-references',referenceUpload.array('images',4),async(req,res,next)=>{
  try{if(!req.files?.length)return res.status(400).json({error:'Add at least one reference image.'});const dir=path.join(UPLOAD_ROOT,'style-references',uuid());await fs.mkdir(dir,{recursive:true});const refs=[];for(const f of req.files.slice(0,4)){const ext=path.extname(f.originalname).toLowerCase()||'.png';const filename=`${uuid()}${ext}`;const dest=path.join(dir,filename);await fs.copyFile(f.path,dest);const saved=await persistFile(dest,{name:f.originalname,metadata:{kind:'style-reference'}});refs.push({name:f.originalname,path:dest,url:saved.url,assetId:saved.id});}res.json({references:refs});}catch(e){next(e)}
});

app.post('/api/upload',sourceUpload.array('files',10),async(req,res,next)=>{
  try{
    if(!req.files?.length) return res.status(400).json({error:'Attach at least one file.'});
    const uploadId=uuid();
    const parsed=[];
    for(const f of req.files){ const item=await parseUploadedFile(f,uploadId);await persistParsedMedia(item,{source:'source-file'});parsed.push(item); }
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
    await saveSourceAggregate(uploadId,aggregate);
    res.json({uploadId,extractionConfidence:aggregateConfidence,files:parsed.map(p=>({filename:p.filename,kind:p.kind,metadata:p.metadata,extractionConfidence:p.extractionConfidence,assets:p.assets})),preview:aggregate.text.slice(0,14000),assets:aggregate.assets});
  }catch(e){next(e)}
});

async function loadAggregate(uploadId){
  if(!uploadId) return null;
  const durable=await getSourceAggregate(uploadId);if(durable)return durable;
  const file=path.join(UPLOAD_ROOT,uploadId,'parsed.json');
  try{const data=JSON.parse(await fs.readFile(file,'utf8'));await saveSourceAggregate(uploadId,data.aggregate);return data.aggregate;}catch{return null;}
}

// Knowledge Hub: persistent extracted source material for the marketing team.
app.get('/api/knowledge',async(req,res,next)=>{try{const items=await listKnowledge();res.json(items.map(({text,...rest})=>({...rest,preview:String(text||'').slice(0,700)})))}catch(e){next(e)}});
app.post('/api/knowledge',sourceUpload.array('files',10),async(req,res,next)=>{
  try{
    if(!req.files?.length)return res.status(400).json({error:'Attach at least one file.'});
    const added=[];
    for(const f of req.files){
      const uploadId=`knowledge-${uuid()}`;
      const parsed=await parseUploadedFile(f,uploadId);await persistParsedMedia(parsed,{source:'knowledge-hub'});
      const item={id:uuid(),filename:parsed.filename,kind:parsed.kind,metadata:parsed.metadata,extractionConfidence:parsed.extractionConfidence,text:parsed.text,assets:parsed.assets||[],createdAt:new Date().toISOString()};
      await saveKnowledge(item); added.push({...item,text:undefined,preview:item.text.slice(0,700)});
    }
    res.json(added);
  }catch(e){next(e)}
});
app.delete('/api/knowledge/:id',async(req,res,next)=>{try{await deleteKnowledge(req.params.id);res.json({ok:true})}catch(e){next(e)}});

// Durable asset library / DAM. Stored in Postgres when DATABASE_URL is configured.
app.get('/api/assets',async(req,res,next)=>{try{res.json(await assetList(String(req.query.q||'')))}catch(e){next(e)}});

// Rights-aware stock search via Openverse. License metadata is retained on import.
app.get('/api/stock/search',async(req,res,next)=>{try{res.json({results:await searchStock({q:req.query.q,licenseType:req.query.licenseType||'commercial',pageSize:Number(req.query.limit||18)})})}catch(e){next(e)}});
app.post('/api/projects/:id/stock-image',async(req,res,next)=>{try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});const page=p.pages.find(x=>x.id===req.body?.pageId),block=page?.blocks.find(x=>x.id===req.body?.blockId);if(!block||block.type!=='image')return res.status(404).json({error:'Select an image block first.'});const stock=req.body?.stock;if(!stock?.url)return res.status(400).json({error:'Choose a stock image.'});const imported=await fetchStockImage(stock);const saved=await persistBytes(imported.bytes,{name:`stock-${stock.id||Date.now()}.jpg`,mimeType:imported.mimeType,metadata:{kind:'licensed-stock',stock:{title:stock.title,creator:stock.creator,source:stock.source,license:stock.license,licenseUrl:stock.licenseUrl,foreignLandingUrl:stock.foreignLandingUrl,attribution:stock.attribution}}});await saveVersion(p,'Before stock image replacement');block.imageUrl=saved.url;block.provenance={kind:'licensed-stock',assetId:saved.id,source:stock.source||'Openverse',creator:stock.creator||'',license:stock.license||'',licenseUrl:stock.licenseUrl||'',attribution:stock.attribution||'',landingUrl:stock.foreignLandingUrl||''};block.sourceCredit=stock.attribution||[stock.creator,stock.license].filter(Boolean).join(' · ');block.altText=req.body.altText||block.altText||stock.title||'Licensed stock image';p.qc={...(p.qc||{}),stale:true};await saveProject(p);broadcast(p.id,{type:'project-updated',project:p,reason:'stock-image'});dispatchWebhook('project.updated',{projectId:p.id,reason:'stock-image'});res.json({project:p})}catch(e){next(e)}});

// Threaded collaboration comments.
app.get('/api/projects/:id/comments',async(req,res,next)=>{try{res.json(await listComments(req.params.id))}catch(e){next(e)}});
app.post('/api/projects/:id/comments',async(req,res,next)=>{try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});const c=await saveComment({projectId:p.id,pageId:req.body?.pageId,blockId:req.body?.blockId,parentId:req.body?.parentId,authorId:req.identity?.id,authorName:req.identity?.name||'Marketing Team',text:req.body?.text});broadcast(p.id,{type:'comment-created',comment:c});dispatchWebhook('comment.created',{projectId:p.id,comment:c});res.status(201).json(c)}catch(e){next(e)}});
app.patch('/api/projects/:projectId/comments/:commentId',async(req,res,next)=>{try{const c=await patchComment(req.params.commentId,{text:req.body?.text,resolved:req.body?.resolved});if(!c)return res.status(404).json({error:'Comment not found.'});broadcast(req.params.projectId,{type:'comment-updated',comment:c});res.json(c)}catch(e){next(e)}});
app.delete('/api/projects/:projectId/comments/:commentId',requireRole('reviewer'),async(req,res,next)=>{try{await deleteComment(req.params.commentId);broadcast(req.params.projectId,{type:'comment-deleted',commentId:req.params.commentId});res.json({ok:true})}catch(e){next(e)}});

// Team RBAC administration.
app.get('/api/admin/users',requireRole('admin'),async(req,res,next)=>{try{res.json(await listUsers())}catch(e){next(e)}});
app.post('/api/admin/users',requireRole('admin'),async(req,res,next)=>{try{res.status(201).json(await upsertUser({email:req.body?.email,name:req.body?.name,role:req.body?.role||'creator',provider:'admin',active:req.body?.active!==false}))}catch(e){next(e)}});
app.patch('/api/admin/users/:id',requireRole('admin'),async(req,res,next)=>{try{const u=await patchUser(req.params.id,req.body||{});if(!u)return res.status(404).json({error:'User not found.'});res.json(u)}catch(e){next(e)}});
app.delete('/api/admin/users/:id',requireRole('admin'),async(req,res,next)=>{try{await deactivateUser(req.params.id);res.json({ok:true})}catch(e){next(e)}});

// SCIM 2.0 endpoints for enterprise provisioning.
app.use('/scim/v2',(req,res,next)=>{if(!scimAuthorized(req))return res.status(401).json({detail:'Invalid SCIM bearer token.'});next()});
app.get('/scim/v2/Users',listScim);app.post('/scim/v2/Users',createScim);app.get('/scim/v2/Users/:id',getScim);app.put('/scim/v2/Users/:id',replaceScim);app.patch('/scim/v2/Users/:id',patchScim);app.delete('/scim/v2/Users/:id',deleteScim);

// Share links and engagement analytics.
app.get('/api/projects/:id/shares',async(req,res,next)=>{try{res.json(await listShareLinks(req.params.id))}catch(e){next(e)}});
app.post('/api/projects/:id/shares',async(req,res,next)=>{try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});const token=crypto.randomBytes(32).toString('base64url'),tokenHash=crypto.createHash('sha256').update(token).digest('hex');const id=uuid(),expiresAt=req.body?.expiresInDays?new Date(Date.now()+Math.max(1,Number(req.body.expiresInDays))*86400000).toISOString():null;await createShareLink({id,projectId:p.id,tokenHash,label:req.body?.label||'Review link',expiresAt,allowDownload:Boolean(req.body?.allowDownload),createdBy:req.identity?.id});res.status(201).json({id,url:`${process.env.PUBLIC_BASE_URL||`${req.protocol}://${req.get('host')}`}/share/${token}`,expiresAt,allowDownload:Boolean(req.body?.allowDownload)})}catch(e){next(e)}});
app.delete('/api/projects/:projectId/shares/:shareId',async(req,res,next)=>{try{await revokeShareLink(req.params.shareId);res.json({ok:true})}catch(e){next(e)}});
app.get('/api/projects/:id/analytics',async(req,res,next)=>{try{res.json(await projectAnalytics(req.params.id))}catch(e){next(e)}});

// Localization: translation plus layout-risk QA.
app.post('/api/projects/:id/localize',async(req,res,next)=>{try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});const locale=String(req.body?.locale||'en-IN');const profile=localizationProfiles().find(x=>x.locale===locale);if(!profile)return res.status(400).json({error:'Unsupported locale.'});await saveVersion(p,`Before localization: ${profile.label}`);const nextProject=await localizeProject(p,{locale,language:profile.label});const qa=localizationQA(nextProject,locale);nextProject.localization={locale,language:profile.label,qa};nextProject.qc={...(nextProject.qc||{}),stale:true};await saveProject(nextProject);broadcast(p.id,{type:'project-updated',project:nextProject,reason:'localization'});dispatchWebhook('project.localized',{projectId:p.id,locale,qa});res.json({project:nextProject,qa})}catch(e){next(e)}});

// API keys and outbound webhooks.
app.get('/api/admin/api-keys',requireRole('admin'),async(req,res,next)=>{try{res.json(await listApiKeys())}catch(e){next(e)}});
app.post('/api/admin/api-keys',requireRole('admin'),async(req,res,next)=>{try{const raw=newApiKey(),id=uuid(),prefix=raw.slice(0,12);await createApiKey({id,name:req.body?.name||'Automation key',keyHash:hashKey(raw),prefix,scopes:Array.isArray(req.body?.scopes)?req.body.scopes:['read','write'],createdBy:req.identity?.id});res.status(201).json({id,key:raw,prefix,warning:'Copy this key now; it will not be shown again.'})}catch(e){next(e)}});
app.delete('/api/admin/api-keys/:id',requireRole('admin'),async(req,res,next)=>{try{await revokeApiKey(req.params.id);res.json({ok:true})}catch(e){next(e)}});
app.get('/api/webhooks',requireRole('admin'),async(req,res,next)=>{try{const hooks=await listWebhooks();res.json(hooks.map(({secret,...h})=>({...h,secretConfigured:Boolean(secret)})))}catch(e){next(e)}});
app.post('/api/webhooks',requireRole('admin'),async(req,res,next)=>{try{const safeUrl=await assertSafeWebhookUrl(req.body?.url);const hook={id:uuid(),name:req.body?.name||'Workflow webhook',url:safeUrl,secret:newWebhookSecret(),events:Array.isArray(req.body?.events)&&req.body.events.length?req.body.events:['project.updated'],active:true,createdBy:req.identity?.id};await saveWebhook(hook);res.status(201).json({...hook,secret:hook.secret})}catch(e){next(e)}});
app.delete('/api/webhooks/:id',requireRole('admin'),async(req,res,next)=>{try{await deleteWebhook(req.params.id);res.json({ok:true})}catch(e){next(e)}});

app.post('/api/outline',async(req,res,next)=>{
  try{
    await ensureDurableGenerationStorage();
    const {type,prompt,uploadId,contentMode='generate',audience,tone,language,visualStyle,deckStyle='auto',themeId='recykal-core',projectPalette=[],imageSource='mixed',artStyleId='auto',customArtStyle='',imageVariations=1,styleReferences=[],research=false,templateId,knowledgeIds=[]}=req.body||{};
    if(!['presentation','document','graphic'].includes(type))return res.status(400).json({error:'Choose Presentation, Document, or Graphic.'});
    const parsedFile=await loadAggregate(uploadId);if(parsedFile)parsedFile.uploadId=uploadId;if(!prompt?.trim()&&!parsedFile)return res.status(400).json({error:'Enter a brief or upload a source file.'});
    const knowledge=await getKnowledge(Array.isArray(knowledgeIds)?knowledgeIds.slice(0,12):[]);const template=getTemplate(templateId);
    res.json(await generateOutline({type,prompt,parsedFile,contentMode,audience,tone,language,visualStyle,deckStyle,themeId,projectPalette,imageSource,artStyleId,customArtStyle,imageVariations,styleReferences,research,template,knowledge}));
  }catch(e){next(e)}
});

app.post('/api/generate',async(req,res,next)=>{
  try{
    await ensureDurableGenerationStorage();
    const {type,prompt,uploadId,contentMode='generate',audience,tone,language,visualStyle,deckStyle='auto',themeId='recykal-core',projectPalette=[],imageSource='mixed',artStyleId='auto',customArtStyle='',imageVariations=1,styleReferences=[],approvedOutline=null,research=false,templateId,knowledgeIds=[]}=req.body||{};
    if(!['presentation','document','graphic'].includes(type)) return res.status(400).json({error:'Choose Presentation, Document, or Graphic.'});
    const parsedFile=await loadAggregate(uploadId);
    if(parsedFile) parsedFile.uploadId=uploadId;
    if(!prompt?.trim() && !parsedFile) return res.status(400).json({error:'Enter a brief or upload a source file.'});
    const knowledge=await getKnowledge(Array.isArray(knowledgeIds)?knowledgeIds.slice(0,12):[]);
    const template=getTemplate(templateId);
    const project=await generateProject({type,prompt,parsedFile,contentMode,audience,tone,language,visualStyle,deckStyle,themeId,projectPalette,imageSource,artStyleId,customArtStyle,imageVariations,styleReferences,approvedOutline,research,template,knowledge});
    await saveProject(project);await saveVersion(project,'Initial generation');broadcast(project.id,{type:'project-updated',project,reason:'initial-generation'});dispatchWebhook('project.created',{projectId:project.id,title:project.title,type:project.type});
    res.json(project);
  }catch(e){next(e)}
});

app.post('/api/generate-stream',async(req,res,next)=>{
  res.setHeader('Content-Type','application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('X-Accel-Buffering','no');
  res.flushHeaders?.();
  const send=(event)=>{if(!res.writableEnded&&!res.destroyed)res.write(JSON.stringify({...event,at:new Date().toISOString()})+'\n')};
  const heartbeat=setInterval(()=>send({stage:'heartbeat'}),12000);heartbeat.unref?.();
  const generationController=new AbortController();res.on('close',()=>{clearInterval(heartbeat);if(!res.writableEnded)generationController.abort()});
  try{
    const {type,prompt,uploadId,contentMode='generate',audience,tone,language,visualStyle,deckStyle='auto',themeId='recykal-core',projectPalette=[],imageSource='mixed',artStyleId='auto',customArtStyle='',imageVariations=1,styleReferences=[],approvedOutline=null,research=false,templateId,knowledgeIds=[]}=req.body||{};
    if(!['presentation','document','graphic'].includes(type)){send({stage:'error',error:'Choose a valid type.'});return res.end()}
    let parsedFile=null;if(uploadId){parsedFile=await loadAggregate(uploadId);if(!parsedFile){send({stage:'error',error:'Uploaded source is no longer available. Upload it again.'});return res.end()}parsedFile.uploadId=uploadId;}
    const knowledge=await getKnowledge(Array.isArray(knowledgeIds)?knowledgeIds.slice(0,12):[]);const template=getTemplate(templateId);
    send({stage:'accepted',type,totalEstimate:Array.isArray(approvedOutline)?approvedOutline.length:null,message:'Generation started.'});
    const checkpoint=async(partial,meta={})=>{
      await saveProject(partial);
      if(meta.stage==='page')broadcast(partial.id,{type:'project-updated',project:partial,reason:'generation-checkpoint'});
    };
    const project=await generateProjectStream({type,prompt,parsedFile,contentMode,audience,tone,language,visualStyle,deckStyle,themeId,projectPalette,imageSource,artStyleId,customArtStyle,imageVariations,styleReferences,approvedOutline,research,template,knowledge,signal:generationController.signal,checkpoint},async event=>send(event));
    await saveProject(project);await saveVersion(project,'Initial progressive generation');dispatchWebhook('project.created',{projectId:project.id,title:project.title,type:project.type,source:'studio-progressive'});broadcast(project.id,{type:'project-created',project});
    send({stage:'saved',project});clearInterval(heartbeat);res.end();
  }catch(e){console.error(e);clearInterval(heartbeat);const raw=String(e?.message||'Generation failed.');const safe=/unterminated|string in json|unexpected end of json/i.test(raw)?'One page returned incomplete structured data. Studio AI could not recover it after safe retries. Completed pages were preserved.':raw;send({stage:'error',error:safe,projectId:e.projectId||null,completedPages:Number(e.completedPages||0),totalPages:Number(e.totalPages||0)});res.end();}
});


// Stable automation API. API keys can use Authorization: Bearer lfs_... with granular scopes.
app.get('/api/v1/projects',requireScope('read'),async(req,res,next)=>{try{res.json({data:await listProjects()})}catch(e){next(e)}});
app.get('/api/v1/projects/:id',requireScope('read'),async(req,res,next)=>{try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});res.json({data:p})}catch(e){next(e)}});
app.post('/api/v1/generate',requireScope('write'),async(req,res,next)=>{try{await ensureDurableGenerationStorage();const {type,prompt,contentMode='generate',audience,tone,language,visualStyle,deckStyle='auto',themeId='recykal-core',projectPalette=[],imageSource='mixed',artStyleId='auto',customArtStyle='',imageVariations=1,research=false,templateId,knowledgeIds=[]}=req.body||{};if(!['presentation','document','graphic'].includes(type))return res.status(400).json({error:'Choose a valid type.'});if(!String(prompt||'').trim())return res.status(400).json({error:'prompt is required for the public API.'});const knowledge=await getKnowledge(Array.isArray(knowledgeIds)?knowledgeIds.slice(0,12):[]);const template=getTemplate(templateId);const project=await generateProject({type,prompt,contentMode,audience,tone,language,visualStyle,deckStyle,themeId,projectPalette,imageSource,artStyleId,customArtStyle,imageVariations,research,template,knowledge});await saveProject(project);await saveVersion(project,'API generation');dispatchWebhook('project.created',{projectId:project.id,title:project.title,type:project.type,source:'public-api'});res.status(201).json({data:project})}catch(e){next(e)}});
app.post('/api/v1/projects/:id/export',requireScope('export'),async(req,res,next)=>{try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});const review=Boolean(req.body?.review);if(!review&&(!p.qc?.pass||p.qc?.stale))return res.status(422).json({error:'Final export requires passed/current QC.'});if(!review&&!finalApprovalOk(p))return res.status(422).json({error:'Final export requires workflow status Approved by an Approver.'});const format=String(req.body?.format||'pdf').toLowerCase();const profile=format==='pdf'&&String(req.body?.profile||'digital').toLowerCase()==='print'?'print':'digital';const file=await exportProject(p,format,{review,profile});const preflight=await preflightExport(file,format,p,{profile});if(!review&&!preflight.pass)return res.status(422).json({error:'Rendered export preflight failed.',preflight});res.json({data:{url:`/exports/${encodeURIComponent(path.basename(file))}`,filename:path.basename(file),profile,preflight}})}catch(e){next(e)}});

app.post('/api/projects/recover',async(req,res,next)=>{try{
  const incoming=req.body?.project||req.body;
  if(!incoming||!incoming.id||!incoming.title||!['document','presentation','graphic'].includes(incoming.type)||!Array.isArray(incoming.pages))return res.status(400).json({error:'Recovery payload is not a valid Long Form Design Studio project.'});
  const existing=await getProject(incoming.id);
  if(existing)return res.json({project:existing,recovered:false,reason:'server-copy-exists'});
  const recovered={...incoming,recovery:{...(incoming.recovery||{}),restoredAt:new Date().toISOString(),source:'browser-vault'}};
  const saved=await saveProject(recovered);
  await saveVersion(saved,'Recovered from browser safety vault');
  res.status(201).json({project:saved,recovered:true});
}catch(e){next(e)}});

app.get('/api/projects',async(req,res,next)=>{try{res.json(await listProjects())}catch(e){next(e)}});
app.get('/api/projects/:id',async(req,res,next)=>{try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});res.json(p)}catch(e){next(e)}});
app.get('/api/projects/:id/versions',async(req,res,next)=>{try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});res.json(await listVersions(req.params.id))}catch(e){next(e)}});
app.post('/api/projects/:id/versions',async(req,res,next)=>{try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});res.json(await saveVersion(p,String(req.body?.label||'Manual checkpoint')))}catch(e){next(e)}});
app.post('/api/projects/:id/versions/:versionId/restore',async(req,res,next)=>{try{const current=await getProject(req.params.id);if(!current)return res.status(404).json({error:'Project not found.'});const prior=await getVersion(req.params.id,req.params.versionId);if(!prior)return res.status(404).json({error:'Version not found.'});await saveVersion(current,'Before version restore');prior.id=req.params.id;prior.qc={...(prior.qc||{}),stale:true};const saved=await saveProject(prior);res.json({project:saved})}catch(e){next(e)}});
app.get('/api/projects/:id/versions/:versionId/diff',async(req,res,next)=>{try{const current=await getProject(req.params.id);if(!current)return res.status(404).json({error:'Project not found.'});const prior=await getVersion(req.params.id,req.params.versionId);if(!prior)return res.status(404).json({error:'Version not found.'});res.json(diffProjects(prior,current))}catch(e){next(e)}});

app.put('/api/projects/:id',async(req,res,next)=>{try{const current=await getProject(req.params.id);if(!current)return res.status(404).json({error:'Project not found.'});const baseRevision=Number(req.body?.baseRevision??req.get('if-match')??current.revision);if(Number.isFinite(baseRevision)&&Number(current.revision||0)!==baseRevision)return res.status(409).json({error:'This project changed in another session. Refresh or merge before saving.',currentRevision:current.revision,project:current});const oldStatus=current.workflow?.status||'Draft',newStatus=req.body?.workflow?.status||oldStatus;if((oldStatus==='Approved'||newStatus==='Approved')&&!hasRole(req.identity,'approver'))return res.status(403).json({error:'Only an Approver or Admin can approve or reopen an approved project.'});const p={...req.body,id:req.params.id};delete p.baseRevision;if(newStatus==='Approved'&&oldStatus!=='Approved')p.workflow={...(p.workflow||{}),status:'Approved',approvedAt:new Date().toISOString(),approvedBy:req.identity?.name||req.identity?.email||'Approver'};const designSig=x=>JSON.stringify({title:x?.title,type:x?.type,pages:x?.pages,settings:x?.settings,contentMode:x?.contentMode,sources:x?.sources,sourceFile:x?.sourceFile});if(current.qc){p.qc=designSig(current)===designSig(p)?current.qc:{...current.qc,stale:true};}const saved=await saveProject(p);broadcast(saved.id,{type:'project-updated',project:saved,reason:'manual-save',editor:req.identity?.name});dispatchWebhook('project.updated',{projectId:saved.id,reason:'manual-save',revision:saved.revision});res.json(saved)}catch(e){next(e)}});
app.delete('/api/projects/:id',async(req,res,next)=>{try{await deleteProject(req.params.id);res.json({ok:true})}catch(e){next(e)}});

app.post('/api/projects/:id/continue',async(req,res,next)=>{
  try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});if(p.type!=='document')return res.status(400).json({error:'Continue is for documents.'});await saveVersion(p,'Before AI continue');const page=await generateNextPage(p,req.body?.instruction);p.pages.push(page);p.qc={...(p.qc||{}),stale:true};await saveProject(p);res.json({page,project:p})}catch(e){next(e)}
});

app.post('/api/projects/:id/ai-edit',async(req,res,next)=>{
  try{
    const p=await getProject(req.params.id); if(!p)return res.status(404).json({error:'Project not found.'});
    await saveVersion(p,`Before AI edit: ${req.body?.action||'edit'}`);const result=await editWithAI({project:p,...req.body});
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
    await saveVersion(p,'Before image generation');const count=Math.max(1,Math.min(3,Number(p.settings?.imageVariations)||1));const refs=[];for(const r of (p.settings?.styleReferences||[]).slice(0,4)){if(r.path){refs.push(r.path);continue}if(r.assetId){const a=await getBinaryAsset(r.assetId);if(a){const temp=path.join(TMP_ROOT,`ref-${r.assetId}-${Date.now()}`);await fs.writeFile(temp,a.bytes);refs.push(temp)}}}const urls=[];const dir=path.join(UPLOAD_ROOT,'generated');await fs.mkdir(dir,{recursive:true});let focalPath='';
    for(let i=0;i<count;i++){const bytes=await generateImage({prompt:prompt||block.imagePrompt||page.title,aspect:aspect||(p.type==='graphic'?'portrait':'landscape'),artStyleId:p.settings?.artStyleId||'auto',customArtStyle:p.settings?.customArtStyle||'',referencePaths:refs,themeId:p.settings?.themeId||'recykal-core',projectPalette:p.settings?.projectPalette||[]});const saved=await persistBytes(bytes,{name:`generated-${uuid()}.png`,mimeType:'image/png',metadata:{kind:'ai-generated',projectId:p.id,pageId,blockId,artStyle:p.settings?.artStyleId||'auto'}});urls.push(saved.url);if(!focalPath){focalPath=path.join(dir,`${uuid()}.png`);await fs.writeFile(focalPath,bytes)}}
    block.imageUrl=urls[0];block.imageVariations=urls;const focal=await analyzeImageFocalPoint(focalPath,block.altText||prompt||block.imagePrompt||page.title);block.focalX=focal.focalX;block.focalY=focal.focalY;block.provenance={kind:'ai-generated',engine:'Studio Image',generatedAt:new Date().toISOString(),artStyle:p.settings?.artStyleId||'auto',focalReason:focal.reason};if(!block.altText)block.altText=String(prompt||block.imagePrompt||page.title).slice(0,220);p.qc={...(p.qc||{}),stale:true};await saveProject(p);broadcast(p.id,{type:'project-updated',project:p,reason:'image-generated'});dispatchWebhook('project.updated',{projectId:p.id,reason:'image-generated'});res.json({url:block.imageUrl,variations:urls,project:p});
  }catch(e){next(e)}
});

// Manual image replacement: upload or drag/drop an image into any image block.
app.post('/api/projects/:id/upload-image',imageUpload.single('image'),async(req,res,next)=>{
  try{
    if(!req.file)return res.status(400).json({error:'Choose an image.'});
    const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});
    const {pageId,blockId}=req.body||{}; const page=p.pages.find(x=>x.id===pageId); const block=page?.blocks.find(x=>x.id===blockId);
    if(!block||block.type!=='image')return res.status(404).json({error:'Select an image block first.'});
    const ext=path.extname(req.file.originalname).toLowerCase()||'.png';let bytes,mime;if(ext==='.svg'){bytes=await sharp(req.file.path).png().toBuffer();mime='image/png'}else{bytes=await fs.readFile(req.file.path);mime=req.file.mimetype||undefined}const saved=await persistBytes(bytes,{name:req.file.originalname,mimeType:mime,metadata:{kind:'user-upload',projectId:p.id,pageId,blockId}});const dir=path.join(UPLOAD_ROOT,'user-images');await fs.mkdir(dir,{recursive:true});const focalPath=path.join(dir,`${uuid()}.png`);await sharp(bytes).png().toFile(focalPath);
    block.imageUrl=saved.url;const focal=await analyzeImageFocalPoint(focalPath,block.altText||page.title);block.focalX=focal.focalX;block.focalY=focal.focalY;block.provenance={kind:'user-upload',assetId:saved.id,source:req.file.originalname,uploadedAt:new Date().toISOString(),focalReason:focal.reason};block.altText=req.body.altText||block.altText||path.basename(req.file.originalname,path.extname(req.file.originalname));
    p.qc={...(p.qc||{}),stale:true}; await saveProject(p);broadcast(p.id,{type:'project-updated',project:p,reason:'image-upload'}); res.json({url:block.imageUrl,project:p});
  }catch(e){next(e)}
});


// Replace a selected element from a file while preserving its block identity and page layout.
// Image/vector files replace image blocks; CSV/Excel replace chart/table data; source documents can replace textual content.
app.post('/api/projects/:id/replace-block-file',replacementUpload.single('file'),async(req,res,next)=>{
  try{
    if(!req.file)return res.status(400).json({error:'Choose a replacement file.'});
    const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});
    const {pageId,blockId}=req.body||{};const page=p.pages.find(x=>x.id===pageId);const block=page?.blocks.find(x=>x.id===blockId);
    if(!block)return res.status(404).json({error:'Select an element first.'});
    const ext=path.extname(req.file.originalname).toLowerCase();
    const imageExts=['.png','.jpg','.jpeg','.webp','.svg'];
    if(imageExts.includes(ext)){
      if(block.type!=='image')return res.status(400).json({error:'Image/vector files can replace image blocks. Select an image block first.'});
      let bytes,mime;if(ext==='.svg'){bytes=await sharp(req.file.path).png().toBuffer();mime='image/png'}else{bytes=await fs.readFile(req.file.path);mime=req.file.mimetype||undefined}const saved=await persistBytes(bytes,{name:req.file.originalname,mimeType:mime,metadata:{kind:'user-upload',projectId:p.id,pageId,blockId}});const dir=path.join(UPLOAD_ROOT,'user-images');await fs.mkdir(dir,{recursive:true});const focalPath=path.join(dir,`${uuid()}.png`);await sharp(bytes).png().toFile(focalPath);
      block.imageUrl=saved.url;const focal=await analyzeImageFocalPoint(focalPath,block.altText||page.title);block.focalX=focal.focalX;block.focalY=focal.focalY;block.provenance={kind:'user-upload',assetId:saved.id,source:req.file.originalname,uploadedAt:new Date().toISOString(),focalReason:focal.reason};block.altText=block.altText||path.basename(req.file.originalname,path.extname(req.file.originalname));
    }else{
      const replaceId=`replace-${uuid()}`;const parsed=await parseUploadedFile(req.file,replaceId);const text=String(parsed.text||'').trim();
      const rows=(parsed.pages?.[0]?.text||text).split(/\r?\n/).map(r=>r.trim()).filter(Boolean).map(r=>r.split(',').map(c=>c.trim()));
      if(block.type==='table'){
        if(!rows.length)return res.status(400).json({error:'No table-like data could be extracted from this file.'});
        block.tableHeaders=rows[0]||[];block.tableRows=rows.slice(1);
      }else if(block.type==='chart'){
        if(!rows.length)return res.status(400).json({error:'No chart-like data could be extracted from this file.'});
        const body=rows.length>1?rows.slice(1):rows;
        block.data=body.slice(0,200).map((r,i)=>({label:String(r[0]??`Item ${i+1}`),value:Number(String(r[1]??0).replace(/[^0-9.+-]/g,''))||0,x:i}));
        block.caption=block.caption||path.basename(req.file.originalname);
      }else if(block.type==='bullets'){
        block.items=text.split(/\r?\n/).map(x=>x.replace(/^[-•\d.)\s]+/,'').trim()).filter(Boolean).slice(0,40);
      }else if(['heading','subheading','kicker','quote'].includes(block.type)){
        block.text=text.split(/\r?\n/).map(x=>x.trim()).find(Boolean)||block.text;
      }else if(block.type==='paragraph'){
        block.text=text||block.text;
      }else if(block.type==='stat'){
        const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const m=(lines[0]||'').match(/[₹$€£]?\s*[\d,.]+%?/);if(m)block.value=m[0];if(lines[1])block.label=lines[1];
      }else return res.status(400).json({error:'This block type does not support file replacement yet.'});
    }
    p.qc={...(p.qc||{}),stale:true};await saveProject(p);res.json({project:p});
  }catch(e){next(e)}
});

app.post('/api/projects/:id/reflow',async(req,res,next)=>{
  try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});const style=String(req.body?.deckStyle||p.settings?.deckStyle||'auto');if(!DECK_STYLES.some(x=>x.id===style))return res.status(400).json({error:'Choose a valid style.'});await saveVersion(p,`Before recompose: ${style}`);const next=await reflowProject(p,style,req.body?.themeId||p.settings?.themeId);await saveProject(next);res.json({project:next});}catch(e){next(e)}
});

app.post('/api/projects/:id/variations',async(req,res,next)=>{
  try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});const variations=await generatePageVariations(p,req.body?.pageId);res.json({variations})}catch(e){next(e)}
});
app.post('/api/projects/:id/apply-variation',async(req,res,next)=>{
  try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});const i=p.pages.findIndex(x=>x.id===req.body?.pageId);if(i<0)return res.status(404).json({error:'Page not found.'});await saveVersion(p,'Before applying design variation');const v=req.body?.variation;if(!v?.blocks)return res.status(400).json({error:'Variation missing.'});v.id=p.pages[i].id;v.blocks=(v.blocks||[]).map(b=>({...b,id:b.id||uuid()}));p.pages[i]=v;p.qc={...(p.qc||{}),stale:true};await saveProject(p);res.json({project:p})}catch(e){next(e)}
});
app.post('/api/projects/:id/repurpose',async(req,res,next)=>{
  try{const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});const targetType=String(req.body?.targetType||'');const next=await repurposeProject(p,targetType);await saveProject(next);await saveVersion(next,`Repurposed from ${p.type}`);res.json({project:next})}catch(e){next(e)}
});

app.post('/api/projects/:id/global-replace',async(req,res,next)=>{
  try{
    const p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});
    const find=String(req.body?.find||'');const replacement=String(req.body?.replacement??'');if(!find)return res.status(400).json({error:'Enter text to find.'});
    await saveVersion(p,`Before global replace: ${find.slice(0,40)}`);
    const esc=find.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const re=new RegExp(esc,req.body?.matchCase?'g':'gi');let count=0;
    const rep=v=>{if(typeof v!=='string')return v;return v.replace(re,m=>{count++;return replacement})};
    p.title=rep(p.title);p.summary=rep(p.summary);
    for(const pg of p.pages||[]){pg.title=rep(pg.title);pg.speakerNotes=rep(pg.speakerNotes);for(const b of pg.blocks||[]){b.text=rep(b.text);b.label=rep(b.label);b.value=rep(b.value);b.caption=rep(b.caption);b.altText=rep(b.altText);b.items=(b.items||[]).map(rep);b.tableHeaders=(b.tableHeaders||[]).map(rep);b.tableRows=(b.tableRows||[]).map(r=>r.map(rep));}}
    p.qc={...(p.qc||{}),stale:true};await saveProject(p);res.json({project:p,count});
  }catch(e){next(e)}
});

app.post('/api/projects/:id/qc',async(req,res,next)=>{
  try{
    let p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});
    p=enforceA4DocumentPages(p);
    let parsedFile=null;
    if(p.sourceFile?.uploadId){try{parsedFile=await loadAggregate(p.sourceFile.uploadId);if(parsedFile)parsedFile.uploadId=p.sourceFile.uploadId}catch{}}
    p.qc=await qualityControlProject(p,{parsedFile});
    await saveProject(p);broadcast(p.id,{type:'qc-updated',qc:p.qc});dispatchWebhook('project.qc',{projectId:p.id,score:p.qc.totalScore,pass:p.qc.pass});
    res.json({qc:p.qc,project:p});
  }catch(e){next(e)}
});

app.post('/api/projects/:id/export',async(req,res,next)=>{
  try{
    let p=await getProject(req.params.id);if(!p)return res.status(404).json({error:'Project not found.'});
    const beforeCount=p.pages?.length||0;p=enforceA4DocumentPages(p);if((p.pages?.length||0)!==beforeCount)p.qc={...(p.qc||{}),stale:true};
    let parsedFile=null;if(p.sourceFile?.uploadId){try{parsedFile=await loadAggregate(p.sourceFile.uploadId)}catch{}}
    if(!p.qc || p.qc.stale){p.qc=await qualityControlProject(p,{parsedFile});await saveProject(p);}
    const review=Boolean(req.body?.review);
    if(!review && !p.qc.pass) return res.status(422).json({error:`Final export is locked because QC is ${Math.round(p.qc.totalScore||0)}/100. Use Review download to inspect/share a draft, or resolve the QC issues before final export.`,qc:p.qc,reviewAvailable:true});
    if(!review && !finalApprovalOk(p)) return res.status(422).json({error:'Final export is locked until an Approver marks the workflow Approved.',qc:p.qc,reviewAvailable:true,approvalRequired:true});
    const format=String(req.body?.format||'pdf').toLowerCase();
    const profile=format==='pdf'&&String(req.body?.profile||'digital').toLowerCase()==='print'?'print':'digital';
    const file=await exportProject(p,format,{review,profile});
    const preflight=await preflightExport(file,format,p,{profile});
    p.exportPreflight={...preflight,format,review,profile}; await saveProject(p);
    if(!review&&!preflight.pass) return res.status(500).json({error:'Export preflight found a blocking production defect. Use Review export if needed and correct the issue before final delivery.',preflight,qc:p.qc,reviewAvailable:true});
    dispatchWebhook('project.exported',{projectId:p.id,format,review,profile,filename:path.basename(file),preflightPass:preflight.pass});res.json({url:`/exports/${encodeURIComponent(path.basename(file))}`,filename:path.basename(file),qc:p.qc,review,profile,preflight});
  }catch(e){next(e)}
});

app.use((err,req,res,next)=>{
  console.error(err);
  const status=err?.status||500;
  res.status(status).json({error:err.message||'Something went wrong.',detail:process.env.NODE_ENV==='development'?err.stack:undefined});
});

const dist=path.resolve('dist');
try{
  await fs.access(dist);
  app.use(express.static(dist));
  app.get('/{*splat}',(req,res)=>res.sendFile(path.join(dist,'index.html')));
}catch(e){
  console.error('Frontend build directory not available:', e?.message || e);
}

const server=http.createServer(app);attachCollaboration(server,{identify:raw=>requestIdentity({headers:raw.headers,get:name=>raw.headers[String(name).toLowerCase()]})});
server.listen(PORT,'0.0.0.0',()=>console.log(`Long Form Design Studio running on http://0.0.0.0:${PORT}`));
