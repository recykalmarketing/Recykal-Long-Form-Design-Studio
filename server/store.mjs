import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const JSON_PATH = path.resolve('data/projects.json');
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
  } else {
    await fs.mkdir(path.dirname(JSON_PATH), { recursive: true });
    try { await fs.access(JSON_PATH); } catch { await fs.writeFile(JSON_PATH, '[]'); }
  }
}

async function readJson() {
  await init();
  return JSON.parse(await fs.readFile(JSON_PATH, 'utf8'));
}
async function writeJson(data) { await fs.writeFile(JSON_PATH, JSON.stringify(data, null, 2)); }

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
