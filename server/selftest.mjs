import fs from 'node:fs/promises';
import path from 'node:path';
import { BRAND } from './brand.mjs';
import { DESIGN_KNOWLEDGE, DESIGN_KNOWLEDGE_VERSION } from './designKnowledge.mjs';
import { staticQualityCheck } from './qc.mjs';
import { exportProject } from './exporters.mjs';
import { preflightExport } from './preflight.mjs';
import { normalizeProject } from './ai.mjs';

// Keep the self-test deterministic and zero-cost; the normal runtime can enable AI visual preflight.
process.env.VISUAL_PREFLIGHT='false';

const project=normalizeProject({title:'Self Test',summary:'Studio production validation',sources:[],pages:[
  {title:'Cover',layout:'cover',speakerNotes:'',blocks:[
    {type:'kicker',text:'RECYKAL'},
    {type:'heading',text:'Long Form Design Studio'},
    {type:'subheading',text:'Progressive generation and production export self-test'},
    {type:'paragraph',text:'A deterministic test page used to validate the export pipeline.'}
  ]},
  {title:'Evidence',layout:'two-column',speakerNotes:'',blocks:[
    {type:'heading',text:'Production checks'},
    {type:'paragraph',text:'Digital output must remain optimized for screen viewing. Print output must use CMYK conversion, embedded fonts and print-resolution validation.'},
    {type:'paragraph',text:'Final delivery is gated by structural and rendered-export validation rather than by generation completion alone.'}
  ]}
]},{type:'document'});
project.settings.masterFields={headerText:'Self Test',footerText:'Recykal — Long Form Design Studio',pageNumbers:true,logoMode:'cover-only'};

const qc=staticQualityCheck(project);
const png=await exportProject(normalizeProject({title:'Graphic Self Test',summary:'',sources:[],pages:[{title:'Graphic',layout:'stat',speakerNotes:'',blocks:[{type:'heading',text:'Long Form Design Studio'},{type:'stat',value:'100%',label:'Brand lock'}]}]},{type:'graphic'}),'png');
const digital=await exportProject(project,'pdf',{profile:'digital'});
const print=await exportProject(project,'pdf',{profile:'print'});
for(const f of [png,digital,print])if(!(await fs.stat(f)).size)throw new Error(`Export self-test failed: ${f}`);
const digitalFlight=await preflightExport(digital,'pdf',project,{profile:'digital'});
const printFlight=await preflightExport(print,'pdf',project,{profile:'print'});
if(!digitalFlight.pass)throw new Error(`Digital PDF preflight failed: ${JSON.stringify(digitalFlight.errors)}`);
if(!printFlight.pass)throw new Error(`Print PDF preflight failed: ${JSON.stringify(printFlight.errors)}`);
if(BRAND.fontFamily!=='Poppins')throw new Error('Brand config failed');
if(DESIGN_KNOWLEDGE.deliveryThreshold!==85)throw new Error('Design knowledge QC threshold failed');
if(!DESIGN_KNOWLEDGE_VERSION.startsWith('1.0'))throw new Error('Design knowledge version failed');
console.log('Self-test passed',{
  png:path.basename(png),digital:path.basename(digital),print:path.basename(print),
  staticQc:qc.totalScore,knowledge:DESIGN_KNOWLEDGE_VERSION,
  printFonts:printFlight.details?.production?.fontCount
});
