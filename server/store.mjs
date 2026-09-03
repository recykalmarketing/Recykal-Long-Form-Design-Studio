import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const JSON_PATH = path.resolve('data/projects.json');
const KNOWLEDGE_JSON_PATH = path.resolve('data/knowledge.json');
const VERSIONS_JSON_PATH = path.resolve('data/versions.json');
const USERS_JSON_PATH = path.resolve('data/users.json');
const COMMENTS_JSON_PATH = path.resolve('data/comments.json');
const ASSETS_META_JSON_PATH = path.resolve('data/assets.json');
const SHARES_JSON_PATH = path.resolve('data/shares.json');
const SHARE_EVENTS_JSON_PATH = path.resolve('data/share-events.json');
const API_KEYS_JSON_PATH = path.resolve('data/api-keys.json');
const WEBHOOKS_JSON_PATH = path.resolve('data/webhooks.json');
const SOURCE_AGGREGATES_JSON_PATH = path.resolve('data/source-aggregates.json');
let pool = null;
let initialized = false;

async function init() {
  if (initialized) return;
  initialized = true;
  if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });
    await pool.query(`CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      data JSONB NOT NULL
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS knowledge_items (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      data JSONB NOT NULL
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS project_versions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      label TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      data JSONB NOT NULL
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_project_versions_project_created ON project_versions(project_id, created_at DESC)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT 'creator',
      provider TEXT NOT NULL DEFAULT 'local',
      external_id TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS project_comments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      page_id TEXT,
      block_id TEXT,
      parent_id TEXT,
      author_id TEXT,
      author_name TEXT NOT NULL DEFAULT 'Marketing Team',
      text TEXT NOT NULL,
      resolved BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_comments_project_created ON project_comments(project_id, created_at ASC)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes BIGINT NOT NULL,
      sha256 TEXT NOT NULL,
      bytes BYTEA NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    )`);
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_assets_sha256 ON assets(sha256)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS share_links (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      expires_at TIMESTAMPTZ,
      allow_download BOOLEAN NOT NULL DEFAULT FALSE,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS share_events (
      id BIGSERIAL PRIMARY KEY,
      share_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      session_id TEXT,
      event_type TEXT NOT NULL,
      page_index INTEGER,
      dwell_ms INTEGER,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_share_events_project_created ON share_events(project_id, created_at DESC)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      key_hash TEXT UNIQUE NOT NULL,
      prefix TEXT NOT NULL,
      scopes TEXT[] NOT NULL DEFAULT ARRAY['read']::text[],
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_used_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT[] NOT NULL DEFAULT ARRAY['project.updated']::text[],
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS source_aggregates (
      upload_id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      data JSONB NOT NULL
    )`);
  } else {
    await fs.mkdir(path.dirname(JSON_PATH), { recursive: true });
    try { await fs.access(JSON_PATH); } catch { await fs.writeFile(JSON_PATH, '[]'); }
    try { await fs.access(KNOWLEDGE_JSON_PATH); } catch { await fs.writeFile(KNOWLEDGE_JSON_PATH, '[]'); }
    try { await fs.access(VERSIONS_JSON_PATH); } catch { await fs.writeFile(VERSIONS_JSON_PATH, '[]'); }
    for (const file of [USERS_JSON_PATH,COMMENTS_JSON_PATH,ASSETS_META_JSON_PATH,SHARES_JSON_PATH,SHARE_EVENTS_JSON_PATH,API_KEYS_JSON_PATH,WEBHOOKS_JSON_PATH,SOURCE_AGGREGATES_JSON_PATH]) { try { await fs.access(file); } catch { await fs.writeFile(file, '[]'); } }
    await fs.mkdir(path.resolve('data/assets-bin'),{recursive:true});
  }
}

async function readJson(file=JSON_PATH) {
  await init();
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
async function writeJson(data,file=JSON_PATH) { await fs.writeFile(file, JSON.stringify(data, null, 2)); }

export async function listProjects() {
  await init();
  if (pool) {
    const { rows } = await pool.query('SELECT data FROM projects ORDER BY updated_at DESC LIMIT 100');
    return rows.map(r => r.data);
  }
  const rows = await readJson();
  return rows.sort((a,b) => new Date(b.updatedAt)-new Date(a.updatedAt));
}

export async function getProject(id) {
  await init();
  if (pool) {
    const { rows } = await pool.query('SELECT data FROM projects WHERE id=$1', [id]);
    return rows[0]?.data || null;
  }
  return (await readJson()).find(p => p.id === id) || null;
}

export async function saveProject(project) {
  await init();
  project.updatedAt = new Date().toISOString();
  project.createdAt ||= project.updatedAt;
  project.revision = Number(project.revision||0)+1;
  if (pool) {
    await pool.query(`INSERT INTO projects(id,title,type,created_at,updated_at,data)
      VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,type=EXCLUDED.type,updated_at=EXCLUDED.updated_at,data=EXCLUDED.data`,
      [project.id, project.title, project.type, project.createdAt, project.updatedAt, project]);
  } else {
    const all = await readJson();
    const idx = all.findIndex(p => p.id === project.id);
    if (idx >= 0) all[idx] = project; else all.unshift(project);
    await writeJson(all.slice(0, 200));
  }
  return project;
}

export async function deleteProject(id) {
  await init();
  if (pool) await pool.query('DELETE FROM projects WHERE id=$1', [id]);
  else {
    const all = await readJson();
    await writeJson(all.filter(p => p.id !== id));
  }
}

export async function listKnowledge() {
  await init();
  if (pool) {
    const { rows } = await pool.query('SELECT data FROM knowledge_items ORDER BY created_at DESC LIMIT 200');
    return rows.map(r=>r.data);
  }
  const rows=await readJson(KNOWLEDGE_JSON_PATH);
  return rows.sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
}

export async function getKnowledge(ids=[]) {
  await init();
  if (!Array.isArray(ids) || !ids.length) return [];
  if (pool) {
    const { rows }=await pool.query('SELECT data FROM knowledge_items WHERE id = ANY($1::text[])',[ids]);
    const map=new Map(rows.map(r=>[r.data.id,r.data]));
    return ids.map(id=>map.get(id)).filter(Boolean);
  }
  const all=await readJson(KNOWLEDGE_JSON_PATH); const map=new Map(all.map(x=>[x.id,x]));
  return ids.map(id=>map.get(id)).filter(Boolean);
}

export async function saveKnowledge(item) {
  await init();
  item.createdAt ||= new Date().toISOString();
  if (pool) {
    await pool.query(`INSERT INTO knowledge_items(id,filename,kind,created_at,data)
      VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(id) DO UPDATE SET filename=EXCLUDED.filename,kind=EXCLUDED.kind,data=EXCLUDED.data`,
      [item.id,item.filename,item.kind,item.createdAt,item]);
  } else {
    const all=await readJson(KNOWLEDGE_JSON_PATH); const idx=all.findIndex(x=>x.id===item.id);
    if(idx>=0)all[idx]=item;else all.unshift(item); await writeJson(all.slice(0,200),KNOWLEDGE_JSON_PATH);
  }
  return item;
}

export async function deleteKnowledge(id) {
  await init();
  if(pool) await pool.query('DELETE FROM knowledge_items WHERE id=$1',[id]);
  else { const all=await readJson(KNOWLEDGE_JSON_PATH); await writeJson(all.filter(x=>x.id!==id),KNOWLEDGE_JSON_PATH); }
}


export async function saveVersion(project,label='Saved version'){
  await init(); const item={id:`ver_${Date.now()}_${Math.random().toString(36).slice(2,9)}`,projectId:project.id,label,createdAt:new Date().toISOString(),data:structuredClone(project)};
  if(pool){
    await pool.query('INSERT INTO project_versions(id,project_id,label,created_at,data) VALUES($1,$2,$3,$4,$5)',[item.id,item.projectId,item.label,item.createdAt,item.data]);
    await pool.query(`DELETE FROM project_versions WHERE id IN (SELECT id FROM project_versions WHERE project_id=$1 ORDER BY created_at DESC OFFSET 40)`,[project.id]);
  }else{
    const all=await readJson(VERSIONS_JSON_PATH); all.unshift(item); const kept=[]; const counts={}; for(const v of all){counts[v.projectId]=(counts[v.projectId]||0)+1;if(counts[v.projectId]<=40)kept.push(v)} await writeJson(kept.slice(0,2000),VERSIONS_JSON_PATH);
  }
  return {id:item.id,projectId:item.projectId,label:item.label,createdAt:item.createdAt};
}
export async function listVersions(projectId){
  await init(); if(pool){const {rows}=await pool.query('SELECT id,project_id,label,created_at FROM project_versions WHERE project_id=$1 ORDER BY created_at DESC LIMIT 40',[projectId]);return rows.map(r=>({id:r.id,projectId:r.project_id,label:r.label,createdAt:r.created_at}));}
  return (await readJson(VERSIONS_JSON_PATH)).filter(v=>v.projectId===projectId).slice(0,40).map(({data,...rest})=>rest);
}
export async function getVersion(projectId,id){
  await init(); if(pool){const {rows}=await pool.query('SELECT data FROM project_versions WHERE project_id=$1 AND id=$2',[projectId,id]);return rows[0]?.data||null;} return (await readJson(VERSIONS_JSON_PATH)).find(v=>v.projectId===projectId&&v.id===id)?.data||null;
}


export async function saveSourceAggregate(uploadId,data){
  await init();if(!uploadId)throw new Error('uploadId is required.');
  if(pool){await pool.query(`INSERT INTO source_aggregates(upload_id,data) VALUES($1,$2) ON CONFLICT(upload_id) DO UPDATE SET data=EXCLUDED.data`,[uploadId,data]);return data;}
  const all=await readJson(SOURCE_AGGREGATES_JSON_PATH);const i=all.findIndex(x=>x.uploadId===uploadId);const item={uploadId,createdAt:new Date().toISOString(),data};if(i>=0)all[i]=item;else all.unshift(item);await writeJson(all.slice(0,200),SOURCE_AGGREGATES_JSON_PATH);return data;
}
export async function getSourceAggregate(uploadId){
  await init();if(!uploadId)return null;if(pool){const {rows}=await pool.query('SELECT data FROM source_aggregates WHERE upload_id=$1',[uploadId]);return rows[0]?.data||null;}return (await readJson(SOURCE_AGGREGATES_JSON_PATH)).find(x=>x.uploadId===uploadId)?.data||null;
}

// ---- Enterprise collaboration, identity, durable media, sharing and automation ----
export async function upsertUser(user={}) {
  await init();
  const now=new Date().toISOString();
  const validRoles=new Set(['viewer','creator','reviewer','approver','admin']);const safeRole=validRoles.has(String(user.role||'creator'))?String(user.role||'creator'):'creator';
  const item={id:user.id||`usr_${Math.random().toString(36).slice(2)}${Date.now()}`,email:String(user.email||'').toLowerCase(),name:user.name||user.email||'User',role:safeRole,provider:user.provider||'local',externalId:user.externalId||null,active:user.active!==false,createdAt:user.createdAt||now,updatedAt:now,data:user.data||{}};
  if(!item.email) throw new Error('User email is required.');
  if(pool){
    const {rows}=await pool.query(`INSERT INTO users(id,email,name,role,provider,external_id,active,created_at,updated_at,data)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,role=EXCLUDED.role,provider=EXCLUDED.provider,external_id=EXCLUDED.external_id,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at,data=EXCLUDED.data
      RETURNING *`,[item.id,item.email,item.name,item.role,item.provider,item.externalId,item.active,item.createdAt,item.updatedAt,item.data]);
    const r=rows[0];return {id:r.id,email:r.email,name:r.name,role:r.role,provider:r.provider,externalId:r.external_id,active:r.active,createdAt:r.created_at,updatedAt:r.updated_at,data:r.data};
  }
  const all=await readJson(USERS_JSON_PATH);const i=all.findIndex(x=>String(x.email).toLowerCase()===item.email);if(i>=0){item.id=all[i].id;item.createdAt=all[i].createdAt;all[i]=item}else all.push(item);await writeJson(all,USERS_JSON_PATH);return item;
}
export async function listUsers(){await init();if(pool){const {rows}=await pool.query('SELECT id,email,name,role,provider,external_id,active,created_at,updated_at,data FROM users ORDER BY name,email');return rows.map(r=>({id:r.id,email:r.email,name:r.name,role:r.role,provider:r.provider,externalId:r.external_id,active:r.active,createdAt:r.created_at,updatedAt:r.updated_at,data:r.data}))}return readJson(USERS_JSON_PATH)}
export async function getUserByEmail(email){await init();email=String(email||'').toLowerCase();if(pool){const {rows}=await pool.query('SELECT * FROM users WHERE email=$1',[email]);const r=rows[0];return r?{id:r.id,email:r.email,name:r.name,role:r.role,provider:r.provider,externalId:r.external_id,active:r.active,createdAt:r.created_at,updatedAt:r.updated_at,data:r.data}:null}return (await readJson(USERS_JSON_PATH)).find(x=>String(x.email).toLowerCase()===email)||null}
export async function patchUser(id,patch={}){const users=await listUsers();const current=users.find(x=>x.id===id);if(!current)return null;return upsertUser({...current,...patch,id:current.id,email:current.email})}
export async function deactivateUser(id){return patchUser(id,{active:false})}

export async function listComments(projectId){await init();if(pool){const {rows}=await pool.query('SELECT * FROM project_comments WHERE project_id=$1 ORDER BY created_at ASC',[projectId]);return rows.map(r=>({id:r.id,projectId:r.project_id,pageId:r.page_id,blockId:r.block_id,parentId:r.parent_id,authorId:r.author_id,authorName:r.author_name,text:r.text,resolved:r.resolved,createdAt:r.created_at,updatedAt:r.updated_at}))}return (await readJson(COMMENTS_JSON_PATH)).filter(x=>x.projectId===projectId)}
export async function saveComment(comment){await init();const now=new Date().toISOString();const item={id:comment.id||`cmt_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,projectId:comment.projectId,pageId:comment.pageId||null,blockId:comment.blockId||null,parentId:comment.parentId||null,authorId:comment.authorId||null,authorName:comment.authorName||'Marketing Team',text:String(comment.text||'').trim(),resolved:Boolean(comment.resolved),createdAt:comment.createdAt||now,updatedAt:now};if(!item.text)throw new Error('Comment cannot be empty.');if(pool){await pool.query(`INSERT INTO project_comments(id,project_id,page_id,block_id,parent_id,author_id,author_name,text,resolved,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(id) DO UPDATE SET text=EXCLUDED.text,resolved=EXCLUDED.resolved,updated_at=EXCLUDED.updated_at`,[item.id,item.projectId,item.pageId,item.blockId,item.parentId,item.authorId,item.authorName,item.text,item.resolved,item.createdAt,item.updatedAt]);return item}const all=await readJson(COMMENTS_JSON_PATH);const i=all.findIndex(x=>x.id===item.id);if(i>=0)all[i]=item;else all.push(item);await writeJson(all,COMMENTS_JSON_PATH);return item}
export async function patchComment(id,patch={}){await init();if(pool){const {rows}=await pool.query('SELECT * FROM project_comments WHERE id=$1',[id]);if(!rows[0])return null;const r=rows[0];return saveComment({id:r.id,projectId:r.project_id,pageId:r.page_id,blockId:r.block_id,parentId:r.parent_id,authorId:r.author_id,authorName:r.author_name,text:patch.text??r.text,resolved:patch.resolved??r.resolved,createdAt:r.created_at})}const all=await readJson(COMMENTS_JSON_PATH);const x=all.find(v=>v.id===id);if(!x)return null;Object.assign(x,patch,{updatedAt:new Date().toISOString()});await writeJson(all,COMMENTS_JSON_PATH);return x}
export async function deleteComment(id){await init();if(pool)await pool.query('DELETE FROM project_comments WHERE id=$1 OR parent_id=$1',[id]);else{const all=await readJson(COMMENTS_JSON_PATH);await writeJson(all.filter(x=>x.id!==id&&x.parentId!==id),COMMENTS_JSON_PATH)}}

export async function saveBinaryAsset({id,name,mimeType,bytes,sha256,metadata={}}){await init();id=id||`ast_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;if(pool){const {rows}=await pool.query('SELECT id FROM assets WHERE sha256=$1 LIMIT 1',[sha256]);if(rows[0])return rows[0].id;await pool.query('INSERT INTO assets(id,name,mime_type,size_bytes,sha256,bytes,metadata) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,name,mimeType,bytes.length,sha256,bytes,metadata]);return id}const dir=path.resolve('data/assets-bin');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,id),bytes);const all=await readJson(ASSETS_META_JSON_PATH);const hit=all.find(x=>x.sha256===sha256);if(hit)return hit.id;all.push({id,name,mimeType,sizeBytes:bytes.length,sha256,metadata,createdAt:new Date().toISOString()});await writeJson(all,ASSETS_META_JSON_PATH);return id}
export async function getBinaryAsset(id){await init();if(pool){const {rows}=await pool.query('SELECT id,name,mime_type,size_bytes,sha256,bytes,metadata,created_at FROM assets WHERE id=$1',[id]);const r=rows[0];return r?{id:r.id,name:r.name,mimeType:r.mime_type,sizeBytes:Number(r.size_bytes),sha256:r.sha256,bytes:r.bytes,metadata:r.metadata,createdAt:r.created_at}:null}const all=await readJson(ASSETS_META_JSON_PATH);const m=all.find(x=>x.id===id);if(!m)return null;try{return {...m,bytes:await fs.readFile(path.resolve('data/assets-bin',id))}}catch{return null}}
export async function listAssets({q='',limit=100}={}){await init();if(pool){const {rows}=await pool.query('SELECT id,name,mime_type,size_bytes,sha256,metadata,created_at FROM assets WHERE ($1=\'\' OR name ILIKE $2) ORDER BY created_at DESC LIMIT $3',[q,`%${q}%`,Math.min(500,limit)]);return rows.map(r=>({id:r.id,name:r.name,mimeType:r.mime_type,sizeBytes:Number(r.size_bytes),sha256:r.sha256,metadata:r.metadata,createdAt:r.created_at,url:`/api/assets/${r.id}`}))}return (await readJson(ASSETS_META_JSON_PATH)).filter(x=>!q||String(x.name).toLowerCase().includes(q.toLowerCase())).slice(0,limit).map(x=>({...x,url:`/api/assets/${x.id}`}))}

export async function createShareLink(item){await init();if(pool){await pool.query('INSERT INTO share_links(id,project_id,token_hash,label,expires_at,allow_download,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[item.id,item.projectId,item.tokenHash,item.label||'',item.expiresAt||null,Boolean(item.allowDownload),item.createdBy||null])}else{const all=await readJson(SHARES_JSON_PATH);all.unshift(item);await writeJson(all,SHARES_JSON_PATH)}return item}
export async function getShareByHash(tokenHash){await init();if(pool){const {rows}=await pool.query('SELECT * FROM share_links WHERE token_hash=$1 AND revoked_at IS NULL',[tokenHash]);const r=rows[0];return r?{id:r.id,projectId:r.project_id,tokenHash:r.token_hash,label:r.label,expiresAt:r.expires_at,allowDownload:r.allow_download,createdBy:r.created_by,createdAt:r.created_at,revokedAt:r.revoked_at}:null}return (await readJson(SHARES_JSON_PATH)).find(x=>x.tokenHash===tokenHash&&!x.revokedAt)||null}
export async function listShareLinks(projectId){await init();if(pool){const {rows}=await pool.query('SELECT id,project_id,label,expires_at,allow_download,created_by,created_at,revoked_at FROM share_links WHERE project_id=$1 ORDER BY created_at DESC',[projectId]);return rows.map(r=>({id:r.id,projectId:r.project_id,label:r.label,expiresAt:r.expires_at,allowDownload:r.allow_download,createdBy:r.created_by,createdAt:r.created_at,revokedAt:r.revoked_at}))}return (await readJson(SHARES_JSON_PATH)).filter(x=>x.projectId===projectId).map(({tokenHash,...x})=>x)}
export async function revokeShareLink(id){await init();if(pool)await pool.query('UPDATE share_links SET revoked_at=NOW() WHERE id=$1',[id]);else{const all=await readJson(SHARES_JSON_PATH);const x=all.find(v=>v.id===id);if(x)x.revokedAt=new Date().toISOString();await writeJson(all,SHARES_JSON_PATH)}}
export async function recordShareEvent(e){await init();const item={shareId:e.shareId,projectId:e.projectId,sessionId:e.sessionId||null,eventType:e.eventType,pageIndex:Number.isInteger(e.pageIndex)?e.pageIndex:null,dwellMs:Number.isFinite(e.dwellMs)?Math.max(0,Math.round(e.dwellMs)):null,meta:e.meta||{},createdAt:new Date().toISOString()};if(pool)await pool.query('INSERT INTO share_events(share_id,project_id,session_id,event_type,page_index,dwell_ms,meta) VALUES($1,$2,$3,$4,$5,$6,$7)',[item.shareId,item.projectId,item.sessionId,item.eventType,item.pageIndex,item.dwellMs,item.meta]);else{const all=await readJson(SHARE_EVENTS_JSON_PATH);all.push(item);await writeJson(all.slice(-10000),SHARE_EVENTS_JSON_PATH)}return item}
export async function projectAnalytics(projectId){await init();let rows;if(pool){({rows}=await pool.query('SELECT share_id,session_id,event_type,page_index,dwell_ms,created_at FROM share_events WHERE project_id=$1 ORDER BY created_at ASC',[projectId]))}else rows=(await readJson(SHARE_EVENTS_JSON_PATH)).filter(x=>x.projectId===projectId).map(x=>({share_id:x.shareId,session_id:x.sessionId,event_type:x.eventType,page_index:x.pageIndex,dwell_ms:x.dwellMs,created_at:x.createdAt}));const sessions=new Set(rows.map(r=>r.session_id).filter(Boolean));const opens=rows.filter(r=>r.event_type==='open').length;const pages={};for(const r of rows){if(r.page_index==null)continue;const k=String(r.page_index);pages[k]||={pageIndex:r.page_index,views:0,dwellMs:0,sessions:new Set()};if(r.event_type==='page_view')pages[k].views++;pages[k].dwellMs+=Number(r.dwell_ms||0);if(r.session_id)pages[k].sessions.add(r.session_id)}return {opens,uniqueViewers:sessions.size,totalEvents:rows.length,pages:Object.values(pages).map(x=>({pageIndex:x.pageIndex,views:x.views,dwellMs:x.dwellMs,uniqueViewers:x.sessions.size,avgDwellMs:x.views?Math.round(x.dwellMs/x.views):x.dwellMs})).sort((a,b)=>a.pageIndex-b.pageIndex)}}

export async function createApiKey(item){await init();if(pool)await pool.query('INSERT INTO api_keys(id,name,key_hash,prefix,scopes,created_by) VALUES($1,$2,$3,$4,$5,$6)',[item.id,item.name,item.keyHash,item.prefix,item.scopes,item.createdBy||null]);else{const all=await readJson(API_KEYS_JSON_PATH);all.unshift({...item,createdAt:new Date().toISOString()});await writeJson(all,API_KEYS_JSON_PATH)}return item}
export async function getApiKeyByHash(hash){await init();if(pool){const {rows}=await pool.query('SELECT * FROM api_keys WHERE key_hash=$1 AND revoked_at IS NULL',[hash]);const r=rows[0];if(!r)return null;await pool.query('UPDATE api_keys SET last_used_at=NOW() WHERE id=$1',[r.id]);return {id:r.id,name:r.name,keyHash:r.key_hash,prefix:r.prefix,scopes:r.scopes,createdBy:r.created_by,createdAt:r.created_at,lastUsedAt:r.last_used_at}}const all=await readJson(API_KEYS_JSON_PATH);const x=all.find(v=>v.keyHash===hash&&!v.revokedAt);if(x){x.lastUsedAt=new Date().toISOString();await writeJson(all,API_KEYS_JSON_PATH)}return x||null}
export async function listApiKeys(){await init();if(pool){const {rows}=await pool.query('SELECT id,name,prefix,scopes,created_by,created_at,last_used_at,revoked_at FROM api_keys ORDER BY created_at DESC');return rows.map(r=>({id:r.id,name:r.name,prefix:r.prefix,scopes:r.scopes,createdBy:r.created_by,createdAt:r.created_at,lastUsedAt:r.last_used_at,revokedAt:r.revoked_at}))}return (await readJson(API_KEYS_JSON_PATH)).map(({keyHash,...x})=>x)}
export async function revokeApiKey(id){await init();if(pool)await pool.query('UPDATE api_keys SET revoked_at=NOW() WHERE id=$1',[id]);else{const all=await readJson(API_KEYS_JSON_PATH);const x=all.find(v=>v.id===id);if(x)x.revokedAt=new Date().toISOString();await writeJson(all,API_KEYS_JSON_PATH)}}

export async function saveWebhook(item){await init();item.updatedAt=new Date().toISOString();item.createdAt||=item.updatedAt;if(pool){await pool.query(`INSERT INTO webhooks(id,name,url,secret,events,active,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,secret=EXCLUDED.secret,events=EXCLUDED.events,active=EXCLUDED.active,updated_at=EXCLUDED.updated_at`,[item.id,item.name,item.url,item.secret,item.events,item.active!==false,item.createdBy||null,item.createdAt,item.updatedAt])}else{const all=await readJson(WEBHOOKS_JSON_PATH);const i=all.findIndex(x=>x.id===item.id);if(i>=0)all[i]=item;else all.unshift(item);await writeJson(all,WEBHOOKS_JSON_PATH)}return item}
export async function listWebhooks(){await init();if(pool){const {rows}=await pool.query('SELECT * FROM webhooks ORDER BY created_at DESC');return rows.map(r=>({id:r.id,name:r.name,url:r.url,secret:r.secret,events:r.events,active:r.active,createdBy:r.created_by,createdAt:r.created_at,updatedAt:r.updated_at}))}return readJson(WEBHOOKS_JSON_PATH)}
export async function deleteWebhook(id){await init();if(pool)await pool.query('DELETE FROM webhooks WHERE id=$1',[id]);else{const all=await readJson(WEBHOOKS_JSON_PATH);await writeJson(all.filter(x=>x.id!==id),WEBHOOKS_JSON_PATH)}}

export function databaseEnabled(){return Boolean(pool)}
