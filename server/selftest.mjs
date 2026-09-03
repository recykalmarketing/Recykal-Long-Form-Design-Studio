import fs from 'node:fs/promises';
import path from 'node:path';
import { BRAND } from './brand.mjs';
import { DESIGN_KNOWLEDGE, DESIGN_KNOWLEDGE_VERSION } from './designKnowledge.mjs';
import { staticQualityCheck } from './qc.mjs';
import { exportProject } from './exporters.mjs';
import { normalizeProject } from './ai.mjs';

const project=normalizeProject({title:'Self Test',summary:'',sources:[],pages:[{title:'Cover',layout:'cover',speakerNotes:'',blocks:[
  {type:'heading',text:'Long Form Design Studio'},
  {type:'subheading',text:'Recykal internal design system'},
  {type:'stat',value:'100%',label:'Brand lock',items:[],text:'',caption:'',data:[],imagePrompt:''}
]}]},{type:'graphic'});
const qc=staticQualityCheck(project);
const png=await exportProject(project,'png');
const pdf=await exportProject({...project,type:'document'},'pdf');
if(!(await fs.stat(png)).size || !(await fs.stat(pdf)).size) throw new Error('Export self-test failed');
if(BRAND.fontFamily!=='Poppins') throw new Error('Brand config failed');
if(DESIGN_KNOWLEDGE.deliveryThreshold!==85) throw new Error('Design knowledge QC threshold failed');
if(!DESIGN_KNOWLEDGE_VERSION.startsWith('1.0')) throw new Error('Design knowledge version failed');
if(qc.totalScore<85) throw new Error(`Static QC self-test failed: ${qc.totalScore}`);
console.log('Self-test passed', {png:path.basename(png),pdf:path.basename(pdf),qc:qc.totalScore,knowledge:DESIGN_KNOWLEDGE_VERSION});
