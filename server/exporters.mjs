import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import PptxGenJS from 'pptxgenjs';
import sharp from 'sharp';
import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { BRAND } from './brand.mjs';
import { getTheme } from './visuals.mjs';
import { getBinaryAsset } from './store.mjs';

const EXPORT_DIR = path.resolve('data/exports');
const LOGO_PATH = path.resolve('public/assets/recykal-logo.svg');
const execFile=promisify(execFileCb);

async function postProcessPdf(file,profile='digital'){
  const tmp=file.replace(/\.pdf$/i,`.${profile}.tmp.pdf`);
  const common=['-q','-dSAFER','-dBATCH','-dNOPAUSE','-sDEVICE=pdfwrite','-dCompatibilityLevel=1.7','-dEmbedAllFonts=true','-dSubsetFonts=true','-dAutoRotatePages=/None'];
  const digital=['-dPDFSETTINGS=/ebook','-sColorConversionStrategy=RGB','-dProcessColorModel=/DeviceRGB'];
  const print=['-dPDFSETTINGS=/prepress','-sColorConversionStrategy=CMYK','-dProcessColorModel=/DeviceCMYK','-dOverrideICC=true'];
  let icc=String(process.env.PRINT_ICC_PROFILE||'').trim();if(profile==='print'&&!icc){const generic='/usr/share/color/icc/ghostscript/default_cmyk.icc';try{await fs.access(generic);icc=generic}catch{}}
  const permissions=[];if(profile==='print'&&icc){permissions.push(`--permit-file-read=${icc}`);print.push(`-sDefaultCMYKProfile=${icc}`,`-sOutputICCProfile=${icc}`)}
  try{await execFile('gs',[...common,...permissions,...(profile==='print'?print:digital),`-sOutputFile=${tmp}`,file],{timeout:240000,maxBuffer:4*1024*1024});await fs.rename(tmp,file);}catch(e){await fs.rm(tmp,{force:true}).catch(()=>{});if(profile==='print')throw new Error(`Print CMYK conversion failed: ${e.message}`)}
  return file;
}

function hexToRgb(hex) {
  const h = hex.replace('#','');
  return {r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16)};
}

async function firstExisting(paths=[]) {
  for (const candidate of paths) { try { await fs.access(candidate); return candidate; } catch {} }
  return null;
}
function localeKey(project={}) { return String(project.settings?.locale||project.locale||project.language||'en-IN').toLowerCase(); }
function officeFontFace(project={}) {
  const l=localeKey(project);
  if(l.startsWith('ar')) return 'Noto Sans Arabic';
  if(l.startsWith('te')) return 'Noto Sans Telugu';
  if(l.startsWith('hi')) return 'Noto Sans Devanagari';
  return 'Poppins';
}

function safeFilename(name='project') { return name.replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,80)||'project'; }
function blockText(b) {
  if (b.type==='bullets') return (b.items||[]).map(x=>`• ${x}`).join('\n');
  if (b.type==='stat') return `${b.value}${b.label?`\n${b.label}`:''}`;
  if (b.type==='table') { const rows=[b.tableHeaders||[],...(b.tableRows||[])]; return rows.map(r=>r.join(' | ')).join('\n') || b.caption || ''; }
  if (b.type==='chart') return b.caption || b.text || '';
  return b.text || '';
}

async function logoPng() {
  await fs.mkdir(EXPORT_DIR,{recursive:true});
  const out=path.join(EXPORT_DIR,'recykal-logo.png');
  try { await fs.access(out); return out; } catch {}
  await sharp(LOGO_PATH).png().resize({width:600}).toFile(out);
  return out;
}

export async function exportPdf(project, {review=false,profile='digital'}={}) {
  await fs.mkdir(EXPORT_DIR,{recursive:true});
  const reviewTag=review?`-QC-REVIEW-${Math.round(project.qc?.totalScore||0)}`:'';
  const pdfProfile=profile==='print'?'print':'digital';
  const profileTag=pdfProfile==='print'?'-Print':'-Digital';
  const file = path.join(EXPORT_DIR, `${safeFilename(project.title)}-${project.id.slice(0,8)}${profileTag}${reviewTag}.pdf`);
  const isPresentation = project.type==='presentation';
  const trimSize=isPresentation?[960,540]:[595.28,841.89];const TRIM_W=trimSize[0],TRIM_H=trimSize[1];
  const isPrint=pdfProfile==='print';const bleedPt=0;const mediaSize=trimSize;
  const doc = new PDFDocument({ autoFirstPage:false, size:mediaSize, margin:0, info:{Title:project.title,Author:'Recykal — Long Form Design Studio',Subject:isPrint?'Print PDF — CMYK conversion and print-quality preflight':'Digital PDF — screen-optimised RGB',Keywords:isPrint?'print, CMYK, embedded fonts, image resolution':'digital, RGB, screen optimised'} });
  let fonts={regular:'Helvetica',bold:'Helvetica-Bold',italic:'Helvetica-Oblique'};
  const locale=localeKey(project);
  const forceStandardPdfFonts = project.settings?.pdfFontMode==='standard' || String(process.env.LFDS_PDF_STANDARD_FONTS||'').toLowerCase()==='true';
  try {
    if(forceStandardPdfFonts){
      // PDFKit's built-in Helvetica family is deterministic and bypasses fontkit.
      // Used by diagnostics/self-tests so a third-party fontkit regression can never block deployment.
    } else 
    if(locale.startsWith('ar')){
      const regular=await firstExisting(['/usr/share/fonts/truetype/noto/NotoSansArabic-Regular.ttf','/usr/share/fonts/opentype/noto/NotoSansArabic-Regular.ttf']);
      const bold=await firstExisting(['/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf','/usr/share/fonts/opentype/noto/NotoSansArabic-Bold.ttf']);
      if(regular){doc.registerFont('LFDS-Regular',regular);doc.registerFont('LFDS-Bold',bold||regular);fonts={regular:'LFDS-Regular',bold:'LFDS-Bold',italic:'LFDS-Regular'};}
    }else if(locale.startsWith('te')){
      const regular=await firstExisting(['/usr/share/fonts/truetype/noto/NotoSansTelugu-Regular.ttf','/usr/share/fonts/opentype/noto/NotoSansTelugu-Regular.ttf']);
      const bold=await firstExisting(['/usr/share/fonts/truetype/noto/NotoSansTelugu-Bold.ttf','/usr/share/fonts/opentype/noto/NotoSansTelugu-Bold.ttf']);
      if(regular){doc.registerFont('LFDS-Regular',regular);doc.registerFont('LFDS-Bold',bold||regular);fonts={regular:'LFDS-Regular',bold:'LFDS-Bold',italic:'LFDS-Regular'};}
    }else if(locale.startsWith('hi')){
      const regular=await firstExisting(['/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf','/usr/share/fonts/opentype/noto/NotoSansDevanagari-Regular.ttf']);
      const bold=await firstExisting(['/usr/share/fonts/truetype/noto/NotoSansDevanagari-Bold.ttf','/usr/share/fonts/opentype/noto/NotoSansDevanagari-Bold.ttf']);
      if(regular){doc.registerFont('LFDS-Regular',regular);doc.registerFont('LFDS-Bold',bold||regular);fonts={regular:'LFDS-Regular',bold:'LFDS-Bold',italic:'LFDS-Regular'};}
    }else{
      const base=path.resolve('node_modules/@fontsource/poppins/files');
      doc.registerFont('Poppins', path.join(base,'poppins-latin-400-normal.woff'));
      doc.registerFont('Poppins-Bold', path.join(base,'poppins-latin-700-normal.woff'));
      doc.registerFont('Poppins-Italic', path.join(base,'poppins-latin-400-normal.woff'));
      fonts={regular:'Poppins',bold:'Poppins-Bold',italic:'Poppins-Italic'};
    }
  } catch {}
  const chunks=[]; doc.on('data',c=>chunks.push(c));
  const endPromise=new Promise((resolve,reject)=>{doc.on('end',resolve);doc.on('error',reject)});
  const logo=await logoPng();
  const master={headerText:'',footerText:'',pageNumbers:true,logoMode:'cover-only',...(project.settings?.masterFields||{})};
  const theme=getTheme(project.settings?.themeId||'recykal-core',project.settings?.projectPalette||[]); const T=theme.tokens;
  const M=isPresentation?48:42;
  const footerH=isPresentation?26:34;
  let physicalPage=0,pageOpen=false;
  const resolveImage=async(url='')=>{if(url.startsWith('/uploads/')){const p=path.resolve('data',url.replace(/^\//,''));try{await fs.access(p);return {kind:'path',value:p,mime:null}}catch{return null}}if(url.startsWith('/api/assets/')){const id=url.split('/').pop();const a=await getBinaryAsset(id);return a?{kind:'buffer',value:a.bytes,mime:a.mimeType}:null}return null};
  const iconKey=(text='')=>{const t=String(text).toLowerCase();if(/recycl|circular|return|reuse/.test(t))return'recycle';if(/people|team|community|consumer|stakeholder/.test(t))return'people';if(/finance|cost|profit|revenue|economic|deposit|refund|fund/.test(t))return'finance';if(/policy|government|govern|legal|compliance|regulat/.test(t))return'policy';if(/data|digital|technology|system|platform|trace/.test(t))return'data';if(/logistic|transport|collection|supply|return point/.test(t))return'logistics';if(/target|goal|objective|outcome|impact/.test(t))return'target';if(/global|market|country|region|world/.test(t))return'globe';if(/environment|green|sustain|climate|nature/.test(t))return'leaf';return'insight'};
  const drawIcon=(text,x,y,size=22,color=T.secondary)=>{const k=iconKey(text);doc.save().lineCap('round').lineJoin('round').lineWidth(Math.max(1,size/15)).strokeColor(color).fillColor(color);const s=size/24, X=n=>x+n*s, Y=n=>y+n*s;
    if(k==='people'){doc.circle(X(9),Y(7),3*s).stroke();doc.circle(X(17),Y(8),2.2*s).stroke();doc.moveTo(X(3),Y(20)).bezierCurveTo(X(3),Y(15),X(6),Y(13),X(9),Y(13)).bezierCurveTo(X(12),Y(13),X(15),Y(15),X(15),Y(20)).stroke();doc.moveTo(X(14),Y(14)).bezierCurveTo(X(18),Y(13),X(21),Y(16),X(21),Y(20)).stroke();}
    else if(k==='finance'){doc.circle(X(12),Y(12),8*s).stroke();doc.font(fonts.bold).fontSize(12*s).fillColor(color).text('$',X(8.5),Y(5.5),{width:7*s,align:'center'});}
    else if(k==='policy'){doc.rect(X(6),Y(3),11*s,18*s).stroke();doc.moveTo(X(9),Y(9)).lineTo(X(14),Y(9)).moveTo(X(9),Y(13)).lineTo(X(15),Y(13)).moveTo(X(9),Y(17)).lineTo(X(13),Y(17)).stroke();}
    else if(k==='data'){doc.roundedRect(X(4),Y(4),16*s,16*s,2*s).stroke();doc.rect(X(7),Y(13),2*s,4*s).fill();doc.rect(X(11),Y(9),2*s,8*s).fill();doc.rect(X(15),Y(11),2*s,6*s).fill();}
    else if(k==='logistics'){doc.rect(X(3),Y(7),11*s,10*s).stroke();doc.moveTo(X(14),Y(10)).lineTo(X(18),Y(10)).lineTo(X(21),Y(13)).lineTo(X(21),Y(17)).lineTo(X(14),Y(17)).stroke();doc.circle(X(7),Y(18),2*s).stroke();doc.circle(X(18),Y(18),2*s).stroke();}
    else if(k==='target'){doc.circle(X(12),Y(12),8*s).stroke();doc.circle(X(12),Y(12),4*s).stroke();doc.moveTo(X(12),Y(12)).lineTo(X(19),Y(5)).stroke();}
    else if(k==='globe'){doc.circle(X(12),Y(12),9*s).stroke();doc.moveTo(X(3),Y(12)).lineTo(X(21),Y(12)).stroke();doc.ellipse(X(7),Y(3),10*s,18*s).stroke();}
    else if(k==='leaf'){doc.moveTo(X(5),Y(18)).bezierCurveTo(X(5),Y(9),X(12),Y(4),X(20),Y(4)).bezierCurveTo(X(20),Y(13),X(15),Y(20),X(8),Y(20)).stroke();doc.moveTo(X(7),Y(18)).lineTo(X(17),Y(8)).stroke();}
    else if(k==='recycle'){doc.moveTo(X(9),Y(5)).lineTo(X(11),Y(2)).lineTo(X(13),Y(5)).stroke();doc.moveTo(X(18),Y(9)).lineTo(X(21),Y(10)).lineTo(X(19),Y(13)).stroke();doc.moveTo(X(7),Y(18)).lineTo(X(4),Y(17)).lineTo(X(5),Y(14)).stroke();doc.moveTo(X(10),Y(6)).bezierCurveTo(X(14),Y(4),X(17),Y(6),X(19),Y(9)).stroke();doc.moveTo(X(18),Y(14)).bezierCurveTo(X(15),Y(19),X(9),Y(20),X(6),Y(16)).stroke();doc.moveTo(X(5),Y(13)).bezierCurveTo(X(5),Y(10),X(6),Y(8),X(9),Y(6)).stroke();}
    else{doc.circle(X(12),Y(10),6*s).stroke();doc.moveTo(X(9),Y(19)).lineTo(X(15),Y(19)).moveTo(X(10),Y(22)).lineTo(X(14),Y(22)).stroke();}
    doc.restore();};
  const footer=()=>{if(!pageOpen)return;const W=TRIM_W,H=TRIM_H;if(master.footerText||master.pageNumbers!==false){doc.strokeColor('#E6EBF1').lineWidth(.6).moveTo(M,H-footerH-8).lineTo(W-M,H-footerH-8).stroke();if(master.footerText)doc.fillColor('#7A8798').font(fonts.regular).fontSize(7.2).text(master.footerText,M,H-footerH,{width:W-2*M-45});if(master.pageNumbers!==false)doc.font(fonts.bold).fillColor(T.muted).text(String(physicalPage).padStart(2,'0'),W-M-35,H-footerH,{width:35,align:'right'});}};
  const addPhysicalPage=(layout='editorial',continued=false,{dark=false}={})=>{if(pageOpen)footer();doc.addPage({size:mediaSize,margin:0});pageOpen=true;physicalPage++;const W=TRIM_W,H=TRIM_H;doc.rect(0,0,W,H).fill(dark?T.dark:T.background);let top=dark?70:54;if(!dark){if(physicalPage===1&&master.logoMode!=='none'&&layout!=='cover'){doc.image(logo,M,24,{fit:[110,30]});top=84;}else if(master.headerText){doc.fillColor(T.muted).font(fonts.regular).fontSize(7.4).text(master.headerText,M,29,{width:W-2*M-170});doc.strokeColor('#E6EBF1').lineWidth(.6).moveTo(M,54).lineTo(W-M,54).stroke();top=72;}}if(review){doc.roundedRect(W-M-142,24,142,20,5).fill('#FFF3F2');doc.fillColor('#B42318').font(fonts.bold).fontSize(7).text(`DRAFT • QC REVIEW • ${Math.round(project.qc?.totalScore||0)}/100`,W-M-136,30,{width:130,align:'center'});top=Math.max(top,64);}return top;};
  const splitToFit=(text,width,height,font=fonts.regular,size=9.4,lineGap=3)=>{const words=String(text||'').split(/\s+/).filter(Boolean);if(!words.length)return['',''];doc.font(font).fontSize(size);let lo=1,hi=words.length,best=0;while(lo<=hi){const mid=Math.floor((lo+hi)/2),part=words.slice(0,mid).join(' '),h=doc.heightOfString(part,{width,lineGap});if(h<=height){best=mid;lo=mid+1}else hi=mid-1;}if(best===0)best=1;return[words.slice(0,best).join(' '),words.slice(best).join(' ')];};
  const titleBlocks=page=>({kicker:page.blocks.find(b=>b.type==='kicker'),heading:page.blocks.find(b=>b.type==='heading'),sub:page.blocks.find(b=>b.type==='subheading')});
  const drawHeading=(page,y,{width=TRIM_W-2*M,dark=false,size=26}={})=>{const {kicker,heading,sub}=titleBlocks(page);if(kicker){doc.fillColor(dark?'#BFF5E5':T.secondary).font(fonts.bold).fontSize(8).text(kicker.text||'',M,y,{width,characterSpacing:.8});y=doc.y+8;}if(heading){doc.fillColor(dark?'#FFFFFF':T.text).font(fonts.bold).fontSize(size).text(heading.text||page.title,M,y,{width,lineGap:1});y=doc.y+10;}if(sub){doc.fillColor(dark?'#DCE8F4':T.muted).font(fonts.regular).fontSize(11.5).text(sub.text||'',M,y,{width:Math.min(width,430),lineGap:2});y=doc.y+12;}return y;};
  const drawPattern=(x,y,w,h,color=T.secondary)=>{doc.save().strokeColor(color).opacity(.35).lineWidth(.8);for(let i=0;i<10;i++){const yy=y+i*(h/10);doc.moveTo(x,yy).bezierCurveTo(x+w*.25,yy-h*.12,x+w*.7,yy+h*.18,x+w,yy-h*.05).stroke();}doc.opacity(1).restore();};
  const drawImage=async(block,x,y,w,h)=>{const src=await resolveImage(block?.imageUrl||'');if(!src)return false;try{doc.save().roundedRect(x,y,w,h,8).clip();doc.image(src.value,x,y,block?.imageFit==='contain'?{fit:[w,h],align:(block?.focalX??50)<34?'left':(block?.focalX??50)>66?'right':'center',valign:(block?.focalY??50)<34?'top':(block?.focalY??50)>66?'bottom':'center'}:{cover:[w,h],align:(block?.focalX??50)<34?'left':(block?.focalX??50)>66?'right':'center',valign:(block?.focalY??50)<34?'top':(block?.focalY??50)>66?'bottom':'center'});if(block?.provenance?.kind==='licensed-stock'&&block?.sourceCredit){doc.rect(x,y+h-15,w,15).fillOpacity(.78).fill('#FFFFFF').fillOpacity(1);doc.fillColor('#52606D').font(fonts.regular).fontSize(5.2).text(String(block.sourceCredit).slice(0,180),x+5,y+h-11,{width:w-10,height:9,ellipsis:true});}doc.restore();return true}catch{return false}};
  const drawVectorPlaceholder=(title,x,y,w,h)=>{doc.roundedRect(x,y,w,h,8).fill(T.surface);drawPattern(x+12,y+20,w-24,h-40,T.primary);drawIcon(title,x+w/2-18,y+h/2-18,36,T.secondary);};
  const drawStats=(stats,x,y,w)=>{const gap=10,cols=stats.length===1?1:2,cellW=(w-gap*(cols-1))/cols,cellH=88;stats.forEach((b,i)=>{const cx=x+(i%cols)*(cellW+gap),cy=y+Math.floor(i/cols)*(cellH+gap);doc.roundedRect(cx,cy,cellW,cellH,8).fill(i%2?T.surface:T.surface);drawIcon(`${b.label} ${b.value}`,cx+13,cy+14,22,i%2?T.secondary:T.primary);doc.fillColor(T.text).font(fonts.bold).fontSize(20).text(b.value||'',cx+44,cy+13,{width:cellW-55});doc.fillColor(T.muted).font(fonts.regular).fontSize(8.7).text(b.label||'',cx+14,cy+50,{width:cellW-28,lineGap:1.5});});return y+Math.ceil(stats.length/cols)*(cellH+gap)-gap;};
  const drawBullets=(items,x,y,w,{icons=true,size=9.2}={})=>{for(const item of items||[]){const iconW=icons?28:12;doc.font(fonts.regular).fontSize(size);const h=Math.max(25,doc.heightOfString(item,{width:w-iconW,lineGap:2})+6);if(icons)drawIcon(item,x,y+1,20,T.secondary);else doc.circle(x+3,y+6,2).fill(T.secondary);doc.fillColor(T.text).text(item,x+iconW,y,{width:w-iconW,lineGap:2});y+=h;}return y;};
  const drawColumns=async(page,startY,cols=2)=>{const W=TRIM_W,contentW=W-2*M,gap=18,colW=(contentW-gap*(cols-1))/cols,bottom=TRIM_H-footerH-28;let col=0,ys=Array(cols).fill(startY);const textBlocks=page.blocks.filter(b=>['paragraph','bullets','quote','stat','image'].includes(b.type));const newPhysical=()=>{const top=addPhysicalPage(page.layout,true);col=0;ys=Array(cols).fill(top);return top};const advanceColumn=()=>{col++;if(col>=cols)newPhysical();};for(const b of textBlocks){if(b.type==='stat'||b.type==='image'){let y=Math.max(...ys);const h=b.type==='image'?210:110;if(y+h>bottom)y=newPhysical();if(b.type==='stat')y=drawStats([b],M,y,contentW)+12;else{const ok=await drawImage(b,M,y,contentW,h);if(!ok)drawVectorPlaceholder(page.title,M,y,contentW,h);y+=h+12;}ys=Array(cols).fill(y);col=0;continue;}if(b.type==='bullets'){for(const item of b.items||[]){doc.font(fonts.regular).fontSize(8.9);let h=Math.max(25,doc.heightOfString(item,{width:colW-28,lineGap:2})+6);if(ys[col]+h>bottom)advanceColumn();const x=M+col*(colW+gap);ys[col]=drawBullets([item],x,ys[col],colW,{icons:true,size:8.9});}ys[col]+=6;continue;}let remaining=b.type==='quote'?`“${b.text||''}”`:b.text||'';while(remaining){let available=bottom-ys[col];if(available<35){advanceColumn();available=bottom-ys[col];}const x=M+col*(colW+gap),font=b.type==='quote'?fonts.italic:fonts.regular,size=b.type==='quote'?12:9.4,lineGap=3;const [part,rest]=splitToFit(remaining,colW,available,font,size,lineGap);doc.fillColor(b.type==='quote'?T.dark:T.text).font(font).fontSize(size).text(part,x,ys[col],{width:colW,lineGap});ys[col]=doc.y+10;remaining=rest;if(remaining)advanceColumn();}}return Math.max(...ys);};
  const drawTable=async(page,block,startY)=>{const W=TRIM_W,contentW=W-2*M,headers=block.tableHeaders||[],rows=block.tableRows||[],cols=Math.max(headers.length,...rows.map(r=>r.length),1),cellW=contentW/cols;let y=startY;const drawHeader=()=>{if(!headers.length)return;const heights=headers.map(h=>doc.font(fonts.bold).fontSize(7.6).heightOfString(String(h),{width:cellW-10,lineGap:1}));const rh=Math.max(26,...heights.map(h=>h+12));doc.rect(M,y,contentW,rh).fill(T.surface);headers.forEach((c,i)=>{doc.rect(M+i*cellW,y,cellW,rh).stroke('#BFCBDA');doc.fillColor(T.text).font(fonts.bold).fontSize(7.6).text(String(c),M+i*cellW+5,y+6,{width:cellW-10,lineGap:1});});y+=rh;};drawHeader();for(let r=0;r<rows.length;r++){const row=rows[r];const heights=Array.from({length:cols},(_,i)=>doc.font(fonts.regular).fontSize(7.5).heightOfString(String(row[i]??''),{width:cellW-10,lineGap:1}));const rh=Math.max(24,...heights.map(h=>h+12));if(y+rh>TRIM_H-footerH-30){y=addPhysicalPage(page.layout,true);drawHeader();}if(r%2===1)doc.rect(M,y,contentW,rh).fill(T.surface);for(let i=0;i<cols;i++){doc.rect(M+i*cellW,y,cellW,rh).stroke('#D7E0EA');doc.fillColor(T.text).font(fonts.regular).fontSize(7.5).text(String(row[i]??''),M+i*cellW+5,y+6,{width:cellW-10,lineGap:1});}y+=rh;}if(block.caption){doc.fillColor(T.muted).font(fonts.regular).fontSize(7.3).text(block.caption,M,y+6,{width:contentW});y=doc.y+8;}return y;};
  const drawChart=(block,x,y,w,h=190)=>{const data=block.data||[];if(!data.length)return y;const vals=data.map(d=>Number(d.value)||0),min=Math.min(0,...vals),max=Math.max(1,...vals),range=max-min||1;doc.strokeColor('#DCE3EA').lineWidth(.6).moveTo(x,y+h).lineTo(x+w,y+h).stroke();if(block.chartType==='line'||block.chartType==='scatter'){let prev=null;data.forEach((d,i)=>{const px=x+(i/(Math.max(1,data.length-1)))*w,py=y+h-((Number(d.value)-min)/range)*(h-25);if(block.chartType==='line'&&prev)doc.strokeColor(T.primary).lineWidth(1.8).moveTo(prev.x,prev.y).lineTo(px,py).stroke();doc.circle(px,py,3).fill(T.secondary);doc.fillColor(T.muted).font(fonts.regular).fontSize(6.5).text(String(d.label),px-30,y+h+6,{width:60,align:'center'});prev={x:px,y:py};});}else{const n=Math.min(data.length,10),barGap=7,barW=(w-barGap*(n-1))/n;data.slice(0,n).forEach((d,i)=>{const bh=Math.max(2,((Number(d.value)-min)/range)*(h-34)),bx=x+i*(barW+barGap),by=y+h-bh;doc.rect(bx,by,barW,bh).fill(i%2?T.secondary:T.primary);doc.fillColor(T.muted).font(fonts.regular).fontSize(6.2).text(String(d.label),bx,y+h+5,{width:barW,align:'center'});doc.fillColor(T.text).font(fonts.bold).fontSize(6.5).text(String(d.value),bx,by-11,{width:barW,align:'center'});});}return y+h+28;};
  const drawProcess=(page,items,y)=>{const W=TRIM_W,contentW=W-2*M,cols=Math.min(4,Math.max(2,items.length)),gap=9,cellW=(contentW-gap*(cols-1))/cols,cellH=126;for(let i=0;i<items.length;i++){const row=Math.floor(i/cols),col=i%cols,cx=M+col*(cellW+gap),cy=y+row*(cellH+12);doc.roundedRect(cx,cy,cellW,cellH,7).fill(i%2?T.surface:T.surface);doc.rect(cx,cy,cellW,3).fill(i%2?T.secondary:T.primary);drawIcon(items[i],cx+12,cy+14,24,i%2?T.secondary:T.primary);doc.fillColor('#005DFF').font(fonts.bold).fontSize(7.5).text(String(i+1).padStart(2,'0'),cx+43,cy+16,{width:25});doc.fillColor(T.text).font(fonts.regular).fontSize(7.8).text(items[i],cx+12,cy+52,{width:cellW-24,lineGap:1.3});if(col<cols-1&&i<items.length-1){doc.fillColor('#88A4C4').font(fonts.bold).fontSize(12).text('→',cx+cellW-5,cy+54,{width:18});}}return y+Math.ceil(items.length/cols)*(cellH+12);};
  const drawTimeline=(page,items,y)=>{const W=TRIM_W,contentW=W-2*M,x=M+22;doc.strokeColor('#C7D7EA').lineWidth(2).moveTo(x+6,y+10).lineTo(x+6,y+items.length*82-20).stroke();items.forEach((item,i)=>{const yy=y+i*82;doc.circle(x+6,yy+10,6).fill(i%2?T.secondary:T.primary);drawIcon(item,x+28,yy,22,i%2?T.secondary:T.primary);doc.fillColor('#005DFF').font(fonts.bold).fontSize(7.5).text(String(i+1).padStart(2,'0'),x+58,yy+2,{width:28});doc.fillColor(T.text).font(fonts.regular).fontSize(8.5).text(item,x+90,yy,{width:contentW-112,lineGap:1.5});});return y+items.length*82;};

  for(let pi=0;pi<project.pages.length;pi++){
    const page=project.pages[pi],layout=page.layout||'editorial',W=isPresentation?960:595.28,H=isPresentation?540:841.89,contentW=W-2*M;
    const dark=layout==='closing'; let y=addPhysicalPage(layout,false,{dark});
    if(layout==='cover'){
      // Strong editorial cover with meaningful visual field and no accidental empty space.
      doc.rect(0,0,W,H).fill(T.background);doc.rect(0,H*.62,W,H*.38).fill(T.dark);doc.rect(0,H*.59,W,8).fill(T.secondary);if(master.logoMode!=='none')doc.image(logo,M,34,{fit:[130,35]});
      const {kicker,heading,sub}=titleBlocks(page);y=130;if(kicker){doc.fillColor(T.secondary).font(fonts.bold).fontSize(8).text(kicker.text,M,y,{width:contentW});y=doc.y+12;}doc.fillColor(T.text).font(fonts.bold).fontSize(isPresentation?36:35).text(heading?.text||page.title,M,y,{width:contentW*.77,lineGap:1});y=doc.y+15;if(sub){doc.fillColor(T.muted).font(fonts.regular).fontSize(12).text(sub.text,M,y,{width:contentW*.63,lineGap:2});}
      const img=page.blocks.find(b=>b.type==='image');const bx=W*.56,by=135,bw=W*.37,bh=H*.34;if(!(await drawImage(img,bx,by,bw,bh)))drawVectorPlaceholder(page.title,bx,by,bw,bh);drawPattern(M,H*.68,contentW,H*.21,'#71D9BB');
      const paras=page.blocks.filter(b=>b.type==='paragraph');if(paras.length){doc.fillColor('#E8EEF7').font(fonts.regular).fontSize(8.8).text(paras[0].text,M,H*.67,{width:contentW*.52,lineGap:2});}
      continue;
    }
    if(layout==='closing'){
      drawPattern(M,H*.42,contentW,H*.34,'#79DFC2');y=H*.22;drawHeading(page,y,{width:contentW*.75,dark:true,size:30});const paras=page.blocks.filter(b=>b.type==='paragraph');if(paras[0])doc.fillColor('#DDE9F5').font(fonts.regular).fontSize(10).text(paras[0].text,M,H*.34,{width:contentW*.62,lineGap:2.5});continue;
    }
    y=drawHeading(page,y,{width:contentW,size:isPresentation?28:24});
    const body=page.blocks.filter(b=>!['kicker','heading','subheading'].includes(b.type));
    if(layout==='table'){
      const tbl=body.find(b=>b.type==='table');const intro=body.filter(b=>b.type==='paragraph');if(intro.length){doc.fillColor(T.muted).font(fonts.regular).fontSize(8.8).text(intro[0].text,M,y,{width:contentW,lineGap:2});y=doc.y+12;}if(tbl)y=await drawTable(page,tbl,y);
    }else if(layout==='chart'){
      const chart=body.find(b=>b.type==='chart');const stats=body.filter(b=>b.type==='stat');if(stats.length)y=drawStats(stats.slice(0,4),M,y,contentW)+16;if(chart){y=drawChart(chart,M,y,contentW,220);if(chart.caption)doc.fillColor(T.muted).font(fonts.regular).fontSize(7.5).text(chart.caption,M,y,{width:contentW});}const paras=body.filter(b=>b.type==='paragraph');if(paras.length){y+=14;await drawColumns({...page,blocks:paras},y,2);}
    }else if(layout==='stat'){
      const stats=body.filter(b=>b.type==='stat');if(stats.length)y=drawStats(stats.slice(0,6),M,y,contentW)+14;const chart=body.find(b=>b.type==='chart');if(chart)y=drawChart(chart,M,y,contentW,180);const paras=body.filter(b=>b.type==='paragraph');if(paras.length){y+=12;await drawColumns({...page,blocks:paras},y,2);}
    }else if(layout==='process'){
      const bullets=body.find(b=>b.type==='bullets');if(bullets)y=drawProcess(page,bullets.items||[],y)+8;const paras=body.filter(b=>b.type==='paragraph');if(paras.length)await drawColumns({...page,blocks:paras},y,2);
    }else if(layout==='timeline'){
      const bullets=body.find(b=>b.type==='bullets');if(bullets)y=drawTimeline(page,bullets.items||[],y)+4;const paras=body.filter(b=>b.type==='paragraph');if(paras.length)await drawColumns({...page,blocks:paras},y,2);
    }else if(layout==='comparison'){
      const bullets=body.find(b=>b.type==='bullets');const items=bullets?.items||[];if(items.length){const gap=16,colW=(contentW-gap)/2;items.forEach((item,i)=>{const col=i%2,row=Math.floor(i/2),cx=M+col*(colW+gap),cy=y+row*90;doc.roundedRect(cx,cy,colW,78,7).fill(i%2?T.surface:T.surface);drawIcon(item,cx+12,cy+12,22,i%2?T.secondary:T.primary);doc.fillColor(T.text).font(fonts.regular).fontSize(8.3).text(item,cx+45,cy+10,{width:colW-57,lineGap:1.4});});y+=Math.ceil(items.length/2)*90;}const paras=body.filter(b=>b.type==='paragraph');if(paras.length)await drawColumns({...page,blocks:paras},y,2);
    }else if(layout==='quote'){
      const q=body.find(b=>b.type==='quote')||body.find(b=>b.type==='paragraph');doc.rect(M,y,6,190).fill(T.secondary);doc.fillColor(T.dark).font(fonts.bold).fontSize(22).text(q?.text||'',M+28,y+8,{width:contentW-28,lineGap:3});const img=body.find(b=>b.type==='image');const iy=Math.min(doc.y+35,H-310);if(img)await drawImage(img,M,iy,contentW,220);else drawPattern(M,iy,contentW,190,T.primary);
    }else if(layout==='image-led'){
      const img=body.find(b=>b.type==='image');const leftW=contentW*.43,rightW=contentW-leftW-18;const imageX=M+leftW+18;if(!(await drawImage(img,imageX,y,rightW,340)))drawVectorPlaceholder(page.title,imageX,y,rightW,340);const leftBlocks=body.filter(b=>b!==img);await drawColumns({...page,blocks:leftBlocks},y,1);
    }else{
      await drawColumns(page,y,layout==='two-column'?2:1);
    }
  }
  if(pageOpen)footer(); doc.end(); await endPromise; await fs.writeFile(file,Buffer.concat(chunks)); await postProcessPdf(file,pdfProfile); return file;
}


export async function exportPptx(project, {review=false}={}) {
  await fs.mkdir(EXPORT_DIR,{recursive:true});
  const reviewTag=review?`-QC-REVIEW-${Math.round(project.qc?.totalScore||0)}`:'';
  const file=path.join(EXPORT_DIR,`${safeFilename(project.title)}-${project.id.slice(0,8)}${reviewTag}.pptx`);
  const pptx=new PptxGenJS();
  const pptFont=officeFontFace(project);
  pptx.layout='LAYOUT_WIDE';
  pptx.author='Recykal — Long Form Design Studio';
  pptx.subject=project.summary||'';
  pptx.title=project.title;
  pptx.company='Recykal';
  pptx.lang='en-IN';
  pptx.theme={headFontFace:pptFont,bodyFontFace:pptFont,lang:project.settings?.locale||'en-IN'};
  const logo=await logoPng();
  const master={headerText:'',footerText:'',pageNumbers:true,logoMode:'cover-only',...(project.settings?.masterFields||{})};
  const theme=getTheme(project.settings?.themeId||'recykal-core',project.settings?.projectPalette||[]); const T=theme.tokens;
  const palette=[T.primary,T.secondary,T.accent,T.dark];
  for (let i=0;i<project.pages.length;i++) {
    const page=project.pages[i]; const slide=pptx.addSlide();
    slide.background={color:T.background.replace('#','')};
    if(i===0&&master.logoMode!=='none')slide.addImage({path:logo,x:0.45,y:0.30,w:1.55,h:0.34,transparency:0});else if(master.headerText)slide.addText(master.headerText,{x:0.48,y:0.30,w:6.8,h:0.22,fontFace:pptFont,fontSize:7,color:'667085',margin:0});
    if(review){slide.addText(`DRAFT • QC REVIEW • ${Math.round(project.qc?.totalScore||0)}/100`,{x:10.65,y:0.25,w:2.2,h:0.28,fontFace:pptFont,fontSize:7,bold:true,color:'B42318',fill:{color:'FFF3F2'},margin:0.05,align:'center'});}
    slide.addText(page.layout.toUpperCase(),{x:0.5,y:0.83,w:3,h:0.18,fontFace:pptFont,fontSize:7,bold:true,color:T.primary.replace('#',''),charSpacing:1.5});
    let y=1.15;
    for (const b of page.blocks) {
      if (b.type==='heading') {slide.addText(b.text||'',{x:0.5,y,w:7.8,h:0.75,fontFace:pptFont,fontSize:25,bold:true,color:T.text.replace('#',''),margin:0,breakLine:false,fit:'shrink'});y+=0.90;}
      else if (b.type==='subheading') {slide.addText(b.text||'',{x:0.5,y,w:7.8,h:0.45,fontFace:pptFont,fontSize:13,color:T.dark.replace('#',''),margin:0,fit:'shrink'});y+=0.57;}
      else if (b.type==='kicker') {slide.addText(b.text||'',{x:0.5,y,w:5,h:0.25,fontFace:pptFont,fontSize:8,bold:true,color:T.secondary.replace('#',''),margin:0});y+=0.32;}
      else if (b.type==='stat') {slide.addShape(pptx.ShapeType.roundRect,{x:0.5,y,w:3.0,h:1.05,rectRadius:0.06,fill:{color:T.surface.replace('#','')},line:{color:T.surface.replace('#','')}});slide.addText(b.value||'',{x:0.72,y:y+0.18,w:2.5,h:0.35,fontFace:pptFont,fontSize:23,bold:true,color:T.primary.replace('#',''),margin:0});slide.addText(b.label||'',{x:0.72,y:y+0.62,w:2.4,h:0.24,fontFace:pptFont,fontSize:8,color:'243B53',margin:0});y+=1.18;}
      else if (b.type==='bullets') {const runs=(b.items||[]).map(t=>({text:t,options:{bullet:{indent:12},hanging:3,breakLine:true}}));slide.addText(runs,{x:0.5,y,w:7.6,h:Math.min(2.2,0.35*(b.items||[]).length+0.2),fontFace:pptFont,fontSize:11,color:T.text.replace('#',''),margin:0.02,breakLine:false,fit:'shrink'});y+=Math.min(2.25,0.35*(b.items||[]).length+0.25);}
      else if (b.type==='table' && (b.tableRows?.length || b.tableHeaders?.length)) {
        const rows=[b.tableHeaders||[],...(b.tableRows||[])].map((r,ri)=>r.map(c=>({text:String(c??''),options:ri===0?{bold:true,color:T.text.replace('#',''),fill:'EEF4FF'}:{color:T.text.replace('#','')}})));
        slide.addTable(rows,{x:0.5,y,w:7.8,h:Math.min(2.7,0.32*rows.length+0.4),fontFace:pptFont,fontSize:8,border:{type:'solid',color:'DCE3EA',pt:0.5},margin:0.05,autoFit:false});y+=Math.min(2.85,0.32*rows.length+0.55);
      }
      else if (b.type==='chart' && b.data?.length) {
        const cats=b.data.map(d=>d.label); const vals=b.data.map(d=>Number(d.value)||0);
        const chartType=b.chartType==='line'?pptx.ChartType.line:b.chartType==='scatter'?pptx.ChartType.scatter:pptx.ChartType.bar;
        const series=b.chartType==='scatter'?[{name:b.caption||'Value',values:b.data.map(d=>({x:Number(d.x)||0,y:Number(d.value)||0}))}]:[{name:b.caption||'Value',labels:cats,values:vals}];
        slide.addChart(chartType,series,{x:0.5,y,w:7.8,h:2.2,catAxisLabelFontFace:pptFont,valAxisLabelFontFace:pptFont,showLegend:false,showTitle:false,chartColors:[palette[i%palette.length].replace('#','')],showValue:b.chartType!=='line'});y+=2.35;
      }
      else if (b.type==='image' && b.imageUrl) {
        try{let input=null,dataUri=null;if(b.imageUrl.startsWith('/uploads/')){input=path.resolve('data',b.imageUrl.replace(/^\//,''));await fs.access(input)}else if(b.imageUrl.startsWith('/api/assets/')){const a=await getBinaryAsset(b.imageUrl.split('/').pop());if(a){input=a.bytes;dataUri=`data:${a.mimeType};base64,${a.bytes.toString('base64')}`}}if(!input)throw new Error('missing image');const meta=await sharp(input).metadata();const box={x:8.7,y:1.45,w:4.0,h:3.7};if((b.imageFit||'cover')==='contain'){const r=(meta.width||1)/(meta.height||1);let iw=box.w,ih=iw/r;if(ih>box.h){ih=box.h;iw=ih*r}const ix=box.x+(box.w-iw)/2,iy=box.y+(box.h-ih)/2;if(dataUri)slide.addImage({data:dataUri,x:ix,y:iy,w:iw,h:ih});else slide.addImage({path:input,x:ix,y:iy,w:iw,h:ih});}else{const fx=Number(b.focalX??50),fy=Number(b.focalY??50);const pos=(fy<34?(fx<34?'northwest':fx>66?'northeast':'north'):fy>66?(fx<34?'southwest':fx>66?'southeast':'south'):(fx<34?'west':fx>66?'east':'centre'));const crop=path.join(EXPORT_DIR,`ppt-crop-${project.id}-${i}-${b.id}.png`);await sharp(input).resize({width:1200,height:1110,fit:'cover',position:pos}).png().toFile(crop);slide.addImage({path:crop,x:box.x,y:box.y,w:box.w,h:box.h});}if(b.provenance?.kind==='licensed-stock'&&b.sourceCredit)slide.addText(String(b.sourceCredit).slice(0,180),{x:box.x+0.05,y:box.y+box.h-0.20,w:box.w-0.1,h:0.15,fontFace:pptFont,fontSize:4.5,color:'52606D',fill:{color:'FFFFFF',transparency:18},margin:0.02,fit:'shrink'});}catch{}
      }
      else if (['paragraph','quote','table'].includes(b.type)) {const t=blockText(b);slide.addText(t,{x:0.5,y,w:7.8,h:Math.min(1.45,0.32+Math.ceil(t.length/110)*0.23),fontFace:pptFont,fontSize:b.type==='quote'?13:10.5,italic:b.type==='quote',color:T.text.replace('#',''),margin:0,fit:'shrink'});y+=Math.min(1.55,0.40+Math.ceil(t.length/110)*0.23);}
      if (y>6.5) break;
    }
    // right-side visual device for visual balance
    slide.addShape(pptx.ShapeType.arc,{x:9.1,y:1.2,w:3.5,h:3.5,adjustPoint:0.25,rotate:18,line:{color:palette[i%palette.length].replace('#',''),transparency:20,width:18}});
    slide.addShape(pptx.ShapeType.arc,{x:9.6,y:1.7,w:2.5,h:2.5,rotate:180,line:{color:T.secondary.replace('#',''),transparency:20,width:10}});
    if(master.footerText)slide.addText(master.footerText,{x:0.5,y:7.03,w:6.5,h:0.18,fontFace:pptFont,fontSize:7,color:'667085',margin:0});if(master.pageNumbers!==false)slide.addText(`${i+1} / ${project.pages.length}`,{x:11.9,y:7.05,w:1,h:0.18,fontFace:pptFont,fontSize:7,color:'667085',align:'right',margin:0});
    if (page.speakerNotes) slide.addNotes(page.speakerNotes);
  }
  await pptx.writeFile({fileName:file});
  return file;
}

function esc(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function wrapSvgText(text,maxChars=34){const words=String(text).split(/\s+/);const lines=[];let line='';for(const w of words){if((line+' '+w).trim().length>maxChars){if(line)lines.push(line);line=w;}else line=(line+' '+w).trim();}if(line)lines.push(line);return lines;}

export async function exportGraphicPng(project, {review=false}={}) {
  await fs.mkdir(EXPORT_DIR,{recursive:true});
  const page=project.pages[0];
  const theme=getTheme(project.settings?.themeId||'recykal-core',project.settings?.projectPalette||[]); const T=theme.tokens;
  const w=1080,h=1350;
  const logoSvg=await fs.readFile(LOGO_PATH,'utf8');
  const logoData=`data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;
  const heading=page.blocks.find(b=>b.type==='heading')?.text || page.title;
  const sub=page.blocks.find(b=>b.type==='subheading')?.text || page.blocks.find(b=>b.type==='paragraph')?.text || '';
  const stat=page.blocks.find(b=>b.type==='stat');
  const bullets=page.blocks.find(b=>b.type==='bullets')?.items || [];
  const imageBlock=page.blocks.find(b=>b.type==='image' && b.imageUrl);
  let imageData='';
  if(imageBlock){try{let bytes,mime;if(imageBlock.imageUrl.startsWith('/uploads/')){const imagePath=path.resolve('data',imageBlock.imageUrl.replace(/^\//,''));bytes=await fs.readFile(imagePath);const ext=path.extname(imagePath).toLowerCase();mime=ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg';}else if(imageBlock.imageUrl.startsWith('/api/assets/')){const a=await getBinaryAsset(imageBlock.imageUrl.split('/').pop());if(a){bytes=a.bytes;mime=a.mimeType}}if(bytes)imageData=`data:${mime};base64,${bytes.toString('base64')}`;}catch{}}
  const lines=wrapSvgText(heading,25).slice(0,4);
  const sublines=wrapSvgText(sub,48).slice(0,5);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${T.background}"/><stop offset="1" stop-color="${T.surface}"/></linearGradient><clipPath id="imgclip"><rect x="620" y="170" width="390" height="430" rx="36"/></clipPath></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    ${review?`<rect x="700" y="32" width="300" height="42" rx="12" fill="#FFF3F2"/><text x="850" y="60" text-anchor="middle" font-family="Poppins,Arial,sans-serif" font-size="16" font-weight="700" fill="#B42318">DRAFT • QC REVIEW • ${Math.round(project.qc?.totalScore||0)}/100</text>`:''}
    <circle cx="930" cy="200" r="230" fill="${T.primary}" opacity="0.08"/><circle cx="870" cy="280" r="155" fill="${T.secondary}" opacity="0.12"/>
    ${imageData?`<image href="${imageData}" x="620" y="170" width="390" height="430" preserveAspectRatio="${(imageBlock?.focalX??50)<34?'xMin':(imageBlock?.focalX??50)>66?'xMax':'xMid'}${(imageBlock?.focalY??50)<34?'YMin':(imageBlock?.focalY??50)>66?'YMax':'YMid'} ${(imageBlock?.imageFit||'cover')==='contain'?'meet':'slice'}" clip-path="url(#imgclip)"/>`:''}
    <image href="${logoData}" x="72" y="66" width="240" height="60" preserveAspectRatio="xMinYMid meet"/>
    <text x="72" y="205" font-family="Poppins,Arial,sans-serif" font-size="23" font-weight="600" fill="${T.secondary}" letter-spacing="2">RECYKAL INSIGHT</text>
    ${lines.map((l,i)=>`<text x="72" y="${310+i*82}" font-family="Poppins,Arial,sans-serif" font-size="70" font-weight="700" fill="${T.text}">${esc(l)}</text>`).join('')}
    ${sublines.map((l,i)=>`<text x="72" y="${675+i*38}" font-family="Poppins,Arial,sans-serif" font-size="28" font-weight="400" fill="${T.muted}">${esc(l)}</text>`).join('')}
    ${stat?`<rect x="72" y="900" width="410" height="205" rx="28" fill="#ffffff"/><text x="105" y="985" font-family="Poppins,Arial,sans-serif" font-size="64" font-weight="700" fill="${T.primary}">${esc(stat.value)}</text><text x="105" y="1040" font-family="Poppins,Arial,sans-serif" font-size="24" fill="${T.text}">${esc(stat.label)}</text>`:''}
    ${bullets.slice(0,3).map((b,i)=>`<circle cx="620" cy="${930+i*72}" r="11" fill="${T.secondary}"/><text x="650" y="${940+i*72}" font-family="Poppins,Arial,sans-serif" font-size="24" fill="${T.text}">${esc(wrapSvgText(b,27)[0]||'')}</text>`).join('')}
    <rect x="0" y="1250" width="1080" height="100" fill="${T.dark}"/><text x="72" y="1312" font-family="Poppins,Arial,sans-serif" font-size="24" font-weight="500" fill="#ffffff">Make circularity work.</text>
  </svg>`;
  const reviewTag=review?`-QC-REVIEW-${Math.round(project.qc?.totalScore||0)}`:'';
  const file=path.join(EXPORT_DIR,`${safeFilename(project.title)}-${project.id.slice(0,8)}${reviewTag}.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

export async function exportProject(project, format, options={}) {
  if (format==='pdf') return exportPdf(project, options);
  if (format==='pptx') {
    if (project.type!=='presentation') throw new Error('PPTX export is available for presentations.');
    return exportPptx(project, options);
  }
  if (format==='png') {
    if (project.type!=='graphic') throw new Error('PNG export is available for graphics.');
    return exportGraphicPng(project, options);
  }
  throw new Error('Unsupported export format.');
}
