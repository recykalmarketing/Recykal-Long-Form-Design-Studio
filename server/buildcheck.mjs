import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
const execFile=promisify(execFileCb);

const requiredFiles=[
  'server/index.mjs','server/ai.mjs','server/exporters.mjs','server/preflight.mjs',
  'src/main.jsx','src/styles.css','dist/index.html','public/assets/recykal-logo.svg'
];
for(const rel of requiredFiles){
  try{await fs.access(path.resolve(rel));}
  catch{throw new Error(`Build validation failed: required file missing: ${rel}`)}
}

for(const bin of ['gs','pdfinfo','pdffonts','pdfimages','pdftoppm','libreoffice']){
  try{await execFile('sh',['-lc',`command -v ${bin}`],{timeout:5000});}
  catch{throw new Error(`Build validation failed: required system binary not found: ${bin}`)}
}

const pkg=JSON.parse(await fs.readFile('package.json','utf8'));
if(!pkg.scripts?.start||!pkg.scripts?.build||!pkg.scripts?.check)throw new Error('Build validation failed: required npm scripts are missing.');
if(String(pkg.scripts.check).includes('selftest'))throw new Error('Build validation failed: npm run check must remain deployment-safe; use check:full for export diagnostics.');
console.log('Deployment-safe build validation passed. Full export self-test is available with: npm run check:full');
