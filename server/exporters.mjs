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
  const textFont=(block={},fallback=fonts.regular)=>{const st=block.style||{};if(Number(st.fontWeight)>=600)return fonts.bold;if(st.italic)return fonts.italic;return fallback;};
  const textSize=(block={},fallback=10)=>{const n=Number(block.style?.fontSize);return Number.isFinite(n)?Math.max(6,Math.min(96,n)):fallback;};
  const textLineGap=(block={},size=10,fallbackRatio=1.4)=>{const ratio=Number(block.style?.lineHeight)||fallbackRatio;return Math.max(0,size*Math.max(1,Math.min(2.2,ratio))-size);};
  const textAlign=(block={},fallback='left')=>['left','center','right','justify'].includes(block.style?.textAlign)?block.style.textAlign:fallback;
  const looksNumeric=value=>/^\s*[-+]?[$₹€£]?\s*[\d,.]+(?:\s*%|\s*[KMB])?\s*$/i.test(String(value??''));
  const tableWeights=(headers=[],rows=[],indices=[])=>{const explicit=[];const weights=[];for(const c of indices){let max=String(headers[c]??'').length;for(const r of rows)max=Math.max(max,String(r?.[c]??'').length);weights.push(Math.max(.72,Math.min(2.25,Math.sqrt(Math.max(8,max))/3)));}return weights;};
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
  const drawPageSurface=(surface={},W=TRIM_W,H=TRIM_H)=>{const mode=surface?.mode||'plain';if(mode==='plain')return;doc.save();const pale=(hex,opacity=.08)=>{doc.fillColor(hex).fillOpacity(opacity)};if(mode==='top-band'){pale(T.primary,.07);doc.rect(0,0,W,H*.18).fill();}else if(mode==='side-panel'){pale(T.secondary,.08);doc.roundedRect(W*.72,H*.12,W*.30,H*.70,22).fill();}else if(mode==='data-band'){pale(T.primary,.06);doc.rect(0,H*.62,W,H*.24).fill();}else if(mode==='quote-panel'){pale(T.secondary,.07);doc.rect(W*.07,H*.28,W*.86,H*.38).fill();doc.fillOpacity(1).fillColor(T.secondary).rect(W*.07,H*.28,5,H*.38).fill();}else if(mode==='split-tint'){pale(T.primary,.055);doc.rect(W*.56,0,W*.44,H).fill();}else if(mode==='chapter-field'){doc.lineWidth(26).strokeOpacity(.08).strokeColor(T.primary).circle(W*.83,H*.34,W*.27).stroke();doc.lineWidth(15).strokeOpacity(.08).strokeColor(T.secondary).circle(W*.83,H*.34,W*.15).stroke();}else if(mode==='dark'){doc.fillOpacity(1).fillColor(T.dark).rect(0,0,W,H).fill();}else if(mode==='soft-grid'){doc.strokeOpacity(.07).strokeColor(T.primary).lineWidth(.4);for(let x=0;x<W;x+=38)doc.moveTo(x,0).lineTo(x,H).stroke();for(let y=0;y<H;y+=38)doc.moveTo(0,y).lineTo(W,y).stroke();}doc.restore();};
  const footer=()=>{if(!pageOpen)return;const W=TRIM_W,H=TRIM_H;if(master.footerText||master.pageNumbers!==false){doc.strokeColor('#E6EBF1').lineWidth(.6).moveTo(M,H-footerH-8).lineTo(W-M,H-footerH-8).stroke();if(master.footerText)doc.fillColor('#7A8798').font(fonts.regular).fontSize(7.2).text(master.footerText,M,H-footerH,{width:W-2*M-45});if(master.pageNumbers!==false)doc.font(fonts.bold).fillColor(T.muted).text(String(physicalPage).padStart(2,'0'),W-M-35,H-footerH,{width:35,align:'right'});}};
  const addPhysicalPage=(layout='editorial',continued=false,{dark=false,surface=null}={})=>{if(pageOpen)footer();doc.addPage({size:mediaSize,margin:0});pageOpen=true;physicalPage++;const W=TRIM_W,H=TRIM_H;doc.rect(0,0,W,H).fill(dark?T.dark:T.background);if(surface&&!dark)drawPageSurface(surface,W,H);let top=dark?70:54;if(!dark){if(physicalPage===1&&master.logoMode!=='none'&&layout!=='cover'){doc.image(logo,M,24,{fit:[110,30]});top=84;}else if(master.headerText){doc.fillColor(T.muted).font(fonts.regular).fontSize(7.4).text(master.headerText,M,29,{width:W-2*M-170});doc.strokeColor('#E6EBF1').lineWidth(.6).moveTo(M,54).lineTo(W-M,54).stroke();top=72;}}if(review){doc.roundedRect(W-M-142,24,142,20,5).fill('#FFF3F2');doc.fillColor('#B42318').font(fonts.bold).fontSize(7).text(`DRAFT • QC REVIEW • ${Math.round(project.qc?.totalScore||0)}/100`,W-M-136,30,{width:130,align:'center'});top=Math.max(top,64);}return top;};
  const splitToFit=(text,width,height,font=fonts.regular,size=9.4,lineGap=3)=>{const words=String(text||'').split(/\s+/).filter(Boolean);if(!words.length)return['',''];doc.font(font).fontSize(size);let lo=1,hi=words.length,best=0;while(lo<=hi){const mid=Math.floor((lo+hi)/2),part=words.slice(0,mid).join(' '),h=doc.heightOfString(part,{width,lineGap});if(h<=height){best=mid;lo=mid+1}else hi=mid-1;}if(best===0)best=1;return[words.slice(0,best).join(' '),words.slice(best).join(' ')];};
  const titleBlocks=page=>({kicker:page.blocks.find(b=>b.type==='kicker'),heading:page.blocks.find(b=>b.type==='heading'),sub:page.blocks.find(b=>b.type==='subheading')});
  const drawHeading=(page,y,{width=TRIM_W-2*M,dark=false,size=26}={})=>{const {kicker,heading,sub}=titleBlocks(page);if(kicker){const ks=textSize(kicker,8.5),kg=textLineGap(kicker,ks,1.25);doc.fillColor(kicker.style?.textColor||(dark?'#BFF5E5':T.secondary)).font(textFont(kicker,fonts.bold)).fontSize(ks).text(kicker.text||'',M,y,{width,characterSpacing:.8,lineGap:kg,align:textAlign(kicker)});y=doc.y+8;}if(heading){let defaultSize=size;if(!heading.style?.fontSize&&!isPresentation){const n=String(heading.text||page.title||'').length;if(n>90)defaultSize=Math.min(defaultSize,20);else if(n>58)defaultSize=Math.min(defaultSize,23);}const hs=textSize(heading,defaultSize),hg=textLineGap(heading,hs,1.18);doc.fillColor(heading.style?.textColor||(dark?'#FFFFFF':T.text)).font(textFont(heading,fonts.bold)).fontSize(hs).text(heading.text||page.title,M,y,{width,lineGap:hg,align:textAlign(heading)});y=doc.y+10;}if(sub){const ss=textSize(sub,12),sg=textLineGap(sub,ss,1.42);doc.fillColor(sub.style?.textColor||(dark?'#DCE8F4':T.muted)).font(textFont(sub,fonts.regular)).fontSize(ss).text(sub.text||'',M,y,{width:Math.min(width,430),lineGap:sg,align:textAlign(sub)});y=doc.y+12;}return y;};
  const drawPattern=(x,y,w,h,color=T.secondary)=>{doc.save().strokeColor(color).opacity(.35).lineWidth(.8);for(let i=0;i<10;i++){const yy=y+i*(h/10);doc.moveTo(x,yy).bezierCurveTo(x+w*.25,yy-h*.12,x+w*.7,yy+h*.18,x+w,yy-h*.05).stroke();}doc.opacity(1).restore();};
  const drawImage=async(block,x,y,w,h)=>{const src=await resolveImage(block?.imageUrl||'');if(!src)return false;try{doc.save().roundedRect(x,y,w,h,8).clip();doc.image(src.value,x,y,block?.imageFit==='contain'?{fit:[w,h],align:(block?.focalX??50)<34?'left':(block?.focalX??50)>66?'right':'center',valign:(block?.focalY??50)<34?'top':(block?.focalY??50)>66?'bottom':'center'}:{cover:[w,h],align:(block?.focalX??50)<34?'left':(block?.focalX??50)>66?'right':'center',valign:(block?.focalY??50)<34?'top':(block?.focalY??50)>66?'bottom':'center'});if(block?.provenance?.kind==='licensed-stock'&&block?.sourceCredit){doc.rect(x,y+h-15,w,15).fillOpacity(.78).fill('#FFFFFF').fillOpacity(1);doc.fillColor('#52606D').font(fonts.regular).fontSize(5.2).text(String(block.sourceCredit).slice(0,180),x+5,y+h-11,{width:w-10,height:9,ellipsis:true});}doc.restore();return true}catch{return false}};
  const drawVectorPlaceholder=(title,x,y,w,h)=>{doc.save();doc.roundedRect(x,y,w,h,8).fill(T.surface);const cx=x+w*.5,cy=y+h*.48;doc.opacity(.22).strokeColor(T.primary).lineWidth(Math.max(1,w*.012));doc.circle(cx,cy,Math.min(w,h)*.30).stroke();doc.opacity(.12).strokeColor(T.secondary).lineWidth(Math.max(1,w*.008));doc.circle(cx,cy,Math.min(w,h)*.20).stroke();doc.opacity(1);drawIcon(title,cx-18,cy-18,36,T.secondary);doc.restore();};
  const fittedFontSize=(text,font,width,maxHeight,start,min=18)=>{doc.font(font);for(let size=start;size>=min;size-=1){doc.fontSize(size);if(doc.heightOfString(String(text||''),{width,lineGap:Math.max(1,size*.08)})<=maxHeight)return size;}return min;};
  const drawStats=(stats,x,y,w)=>{const gap=10,cols=stats.length===1?1:2,cellW=(w-gap*(cols-1))/cols,cellH=88;stats.forEach((b,i)=>{const cx=x+(i%cols)*(cellW+gap),cy=y+Math.floor(i/cols)*(cellH+gap);doc.roundedRect(cx,cy,cellW,cellH,8).fill(i%2?T.surface:T.surface);drawIcon(`${b.label} ${b.value}`,cx+13,cy+14,22,i%2?T.secondary:T.primary);doc.fillColor(T.text).font(fonts.bold).fontSize(20).text(b.value||'',cx+44,cy+13,{width:cellW-55});doc.fillColor(T.muted).font(fonts.regular).fontSize(8.7).text(b.label||'',cx+14,cy+50,{width:cellW-28,lineGap:1.5});});return y+Math.ceil(stats.length/cols)*(cellH+gap)-gap;};
  const drawBullets=(items,x,y,w,{icons=true,size=9.2}={})=>{for(const item of items||[]){const iconW=icons?28:12;doc.font(fonts.regular).fontSize(size);const h=Math.max(25,doc.heightOfString(item,{width:w-iconW,lineGap:2})+6);if(icons)drawIcon(item,x,y+1,20,T.secondary);else doc.circle(x+3,y+6,2).fill(T.secondary);doc.fillColor(T.text).text(item,x+iconW,y,{width:w-iconW,lineGap:2});y+=h;}return y;};
  const drawColumns=async(page,startY,cols=2)=>{const W=TRIM_W,contentW=W-2*M,gap=18,colW=(contentW-gap*(cols-1))/cols,bottom=TRIM_H-footerH-28;let col=0,ys=Array(cols).fill(startY);const textBlocks=page.blocks.filter(b=>['paragraph','bullets','quote','stat','image'].includes(b.type));const newPhysical=()=>{const top=addPhysicalPage(page.layout,true);col=0;ys=Array(cols).fill(top);return top};const advanceColumn=()=>{col++;if(col>=cols)newPhysical();};for(const b of textBlocks){if(b.type==='stat'||b.type==='image'){let y=Math.max(...ys);const h=b.type==='image'?210:110;if(y+h>bottom)y=newPhysical();if(b.type==='stat')y=drawStats([b],M,y,contentW)+12;else{const ok=await drawImage(b,M,y,contentW,h);if(!ok)drawVectorPlaceholder(page.title,M,y,contentW,h);y+=h+12;}ys=Array(cols).fill(y);col=0;continue;}if(b.type==='bullets'){for(const item of b.items||[]){const sz=cols>1?9.2:9.8;doc.font(fonts.regular).fontSize(sz);let h=Math.max(25,doc.heightOfString(item,{width:colW-28,lineGap:Math.max(2,sz*.3)})+6);if(ys[col]+h>bottom)advanceColumn();const x=M+col*(colW+gap);ys[col]=drawBullets([item],x,ys[col],colW,{icons:true,size:sz});}ys[col]+=6;continue;}let remaining=b.type==='quote'?`“${b.text||''}”`:b.text||'';while(remaining){let available=bottom-ys[col];if(available<35){advanceColumn();available=bottom-ys[col];}const x=M+col*(colW+gap),fallbackSize=b.type==='quote'?14:(cols>1?9.5:10.2),size=textSize(b,fallbackSize),font=textFont(b,b.type==='quote'?fonts.italic:fonts.regular),lineGap=textLineGap(b,size,b.type==='quote'?1.4:1.38);const [part,rest]=splitToFit(remaining,colW,available,font,size,lineGap);if(b.style?.highlightColor){const hh=doc.font(font).fontSize(size).heightOfString(part,{width:colW,lineGap});doc.rect(x-2,ys[col]-1,colW+4,hh+3).fill(b.style.highlightColor);}doc.fillColor(b.style?.textColor||(b.type==='quote'?T.dark:T.text)).font(font).fontSize(size).text(part,x,ys[col],{width:colW,lineGap,align:textAlign(b)});if(b.style?.underline){const yy=doc.y-2;doc.strokeColor(b.style?.textColor||T.text).lineWidth(.5).moveTo(x,yy).lineTo(x+Math.min(colW,doc.widthOfString(part))).stroke();}ys[col]=doc.y+10;remaining=rest;if(remaining)advanceColumn();}}return Math.max(...ys);};
  const drawTable=async(page,block,startY)=>{const W=TRIM_W,contentW=W-2*M,headers=block.tableHeaders||[],rows=block.tableRows||[],cols=Math.max(headers.length,...rows.map(r=>r.length),1),ts={variant:'clean',density:'comfortable',numericAlign:'right',firstColumnEmphasis:true,verticalRules:false,...(block.tableStyle||{})};const allIndices=Array.from({length:cols},(_,i)=>i);const groups=cols<=6?[allIndices]:Array.from({length:Math.ceil((cols-1)/5)},(_,g)=>[0,...Array.from({length:Math.min(5,cols-1-g*5)},(_,i)=>1+g*5+i)]);let y=startY;for(let gi=0;gi<groups.length;gi++){if(gi>0)y=addPhysicalPage(page.layout,true);const indices=groups[gi],weights=tableWeights(headers,rows,indices),sum=weights.reduce((a,b)=>a+b,0),widths=weights.map(v=>contentW*v/sum),xPos=[M];for(let i=1;i<widths.length;i++)xPos[i]=xPos[i-1]+widths[i-1];const fs=indices.length<=4?8.4:indices.length<=6?7.8:7.3,pad=ts.density==='compact'?4:6,minRow=ts.density==='compact'?20:25;const headerFill=ts.variant==='ledger'?T.dark:ts.variant==='minimal'?T.background:T.surface;const headerColor=ts.variant==='ledger'?'#FFFFFF':T.text;const drawCellRules=(x,yy,w,rh,{header=false}={})=>{doc.strokeColor(header?'#AEBBCB':'#D7E0EA').lineWidth(header?0.8:0.55).moveTo(x,yy+rh).lineTo(x+w,yy+rh).stroke();if(ts.verticalRules){doc.strokeColor('#D7E0EA').lineWidth(.45).moveTo(x+w,yy).lineTo(x+w,yy+rh).stroke();}};const drawHeader=()=>{if(!headers.length)return;const heights=indices.map((c,i)=>doc.font(fonts.bold).fontSize(fs).heightOfString(String(headers[c]??''),{width:widths[i]-pad*2,lineGap:1.4}));const rh=Math.max(minRow+2,...heights.map(h=>h+pad*2));if(ts.variant!=='minimal')doc.rect(M,y,contentW,rh).fill(headerFill);indices.forEach((c,i)=>{drawCellRules(xPos[i],y,widths[i],rh,{header:true});doc.fillColor(headerColor).font(fonts.bold).fontSize(fs).text(String(headers[c]??''),xPos[i]+pad,y+pad,{width:widths[i]-pad*2,lineGap:1.4,align:(ts.numericAlign!=='left'&&looksNumeric(headers[c]))?ts.numericAlign:'left'});});y+=rh;};drawHeader();for(let r=0;r<rows.length;r++){const row=rows[r];const heights=indices.map((c,i)=>{const weight=ts.firstColumnEmphasis&&c===0?fonts.bold:fonts.regular;return doc.font(weight).fontSize(fs).heightOfString(String(row[c]??''),{width:widths[i]-pad*2,lineGap:1.5});});const rh=Math.max(minRow,...heights.map(h=>h+pad*2));if(y+rh>TRIM_H-footerH-30){y=addPhysicalPage(page.layout,true);drawHeader();}if(ts.variant==='striped'&&r%2===1)doc.rect(M,y,contentW,rh).fill(T.surface);if(ts.variant==='clean'&&r%2===1)doc.rect(M,y,contentW,rh).fillOpacity(.38).fill(T.surface).fillOpacity(1);for(let i=0;i<indices.length;i++){const c=indices[i],value=String(row[c]??''),numeric=looksNumeric(value),font=ts.firstColumnEmphasis&&c===0?fonts.bold:fonts.regular;drawCellRules(xPos[i],y,widths[i],rh);doc.fillColor(T.text).font(font).fontSize(fs).text(value,xPos[i]+pad,y+pad,{width:widths[i]-pad*2,lineGap:1.5,align:numeric?ts.numericAlign:'left'});}y+=rh;}if(groups.length>1){doc.fillColor(T.muted).font(fonts.regular).fontSize(7.1).text(`Table columns ${indices[0]+1}${indices.length>1?`–${indices[indices.length-1]+1}`:''} of ${cols}${gi<groups.length-1?' · continued':''}`,M,y+5,{width:contentW,align:'right'});y=doc.y+7;}}if(block.caption){doc.fillColor(T.muted).font(fonts.regular).fontSize(7.8).text(block.caption,M,y+7,{width:contentW,lineGap:1.5});y=doc.y+9;}return y;};
  const drawChart=(block,x,y,w,h=190)=>{const data=block.data||[];if(!data.length)return y;const vals=data.map(d=>Number(d.value)||0),min=Math.min(0,...vals),max=Math.max(1,...vals),range=max-min||1;doc.strokeColor('#DCE3EA').lineWidth(.6).moveTo(x,y+h).lineTo(x+w,y+h).stroke();if(block.chartType==='line'||block.chartType==='scatter'){let prev=null;data.forEach((d,i)=>{const px=x+(i/(Math.max(1,data.length-1)))*w,py=y+h-((Number(d.value)-min)/range)*(h-25);if(block.chartType==='line'&&prev)doc.strokeColor(T.primary).lineWidth(1.8).moveTo(prev.x,prev.y).lineTo(px,py).stroke();doc.circle(px,py,3).fill(T.secondary);doc.fillColor(T.muted).font(fonts.regular).fontSize(6.5).text(String(d.label),px-30,y+h+6,{width:60,align:'center'});prev={x:px,y:py};});}else{const n=Math.min(data.length,10),barGap=7,barW=(w-barGap*(n-1))/n;data.slice(0,n).forEach((d,i)=>{const bh=Math.max(2,((Number(d.value)-min)/range)*(h-34)),bx=x+i*(barW+barGap),by=y+h-bh;doc.rect(bx,by,barW,bh).fill(i%2?T.secondary:T.primary);doc.fillColor(T.muted).font(fonts.regular).fontSize(6.2).text(String(d.label),bx,y+h+5,{width:barW,align:'center'});doc.fillColor(T.text).font(fonts.bold).fontSize(6.5).text(String(d.value),bx,by-11,{width:barW,align:'center'});});}return y+h+28;};
  const drawProcess=(page,items,y)=>{const W=TRIM_W,contentW=W-2*M,cols=Math.min(4,Math.max(2,items.length)),gap=9,cellW=(contentW-gap*(cols-1))/cols,cellH=126;for(let i=0;i<items.length;i++){const row=Math.floor(i/cols),col=i%cols,cx=M+col*(cellW+gap),cy=y+row*(cellH+12);doc.roundedRect(cx,cy,cellW,cellH,7).fill(i%2?T.surface:T.surface);doc.rect(cx,cy,cellW,3).fill(i%2?T.secondary:T.primary);drawIcon(items[i],cx+12,cy+14,24,i%2?T.secondary:T.primary);doc.fillColor('#005DFF').font(fonts.bold).fontSize(7.5).text(String(i+1).padStart(2,'0'),cx+43,cy+16,{width:25});doc.fillColor(T.text).font(fonts.regular).fontSize(7.8).text(items[i],cx+12,cy+52,{width:cellW-24,lineGap:1.3});if(col<cols-1&&i<items.length-1){doc.fillColor('#88A4C4').font(fonts.bold).fontSize(12).text('→',cx+cellW-5,cy+54,{width:18});}}return y+Math.ceil(items.length/cols)*(cellH+12);};
  const drawTimeline=(page,items,y)=>{const W=TRIM_W,contentW=W-2*M,x=M+22;doc.strokeColor('#C7D7EA').lineWidth(2).moveTo(x+6,y+10).lineTo(x+6,y+items.length*82-20).stroke();items.forEach((item,i)=>{const yy=y+i*82;doc.circle(x+6,yy+10,6).fill(i%2?T.secondary:T.primary);drawIcon(item,x+28,yy,22,i%2?T.secondary:T.primary);doc.fillColor('#005DFF').font(fonts.bold).fontSize(7.5).text(String(i+1).padStart(2,'0'),x+58,yy+2,{width:28});doc.fillColor(T.text).font(fonts.regular).fontSize(8.5).text(item,x+90,yy,{width:contentW-112,lineGap:1.5});});return y+items.length*82;};

  const drawFreeformBlocks=async(page,blocks=[])=>{if(!blocks.length)return;const W=TRIM_W,H=TRIM_H,contentW=W-2*M,top=76,bottom=H-footerH-24,usableH=Math.max(120,bottom-top);for(const b of blocks){const f={x:6,y:12,w:88,h:18,autoHeight:true,z:1,...(b.frame||{})};const x=M+(Math.max(0,Math.min(96,Number(f.x)||0))/100)*contentW;const yy=top+(Math.max(0,Math.min(96,Number(f.y)||0))/100)*usableH;const w=Math.max(28,Math.min(contentW-(x-M),(Math.max(4,Math.min(100,Number(f.w)||88))/100)*contentW));const h=Math.max(26,Math.min(bottom-yy,(Math.max(4,Math.min(100,Number(f.h)||18))/100)*usableH));doc.save();if(['heading','subheading','paragraph','quote','kicker'].includes(b.type)){const fallback=b.type==='heading'?22:b.type==='subheading'?14:b.type==='quote'?13:b.type==='kicker'?8:9.5,size=textSize(b,fallback),font=textFont(b,b.type==='quote'?fonts.italic:fonts.regular);if(b.style?.highlightColor){doc.fillColor(b.style.highlightColor).roundedRect(x-3,yy-3,w+6,h+6,4).fill();}doc.fillColor(b.style?.textColor||T.text).font(font).fontSize(size).text(b.text||'',x,yy,{width:w,height:f.autoHeight===false?h:undefined,lineGap:textLineGap(b,size,b.type==='heading'?1.12:1.4),align:textAlign(b),ellipsis:false});}else if(b.type==='bullets'){doc.fillColor(T.text).font(fonts.regular).fontSize(8.8);let cy=yy;for(const item of b.items||[]){if(cy>yy+h-14)break;doc.fillColor(T.secondary).circle(x+4,cy+5,2.2).fill();doc.fillColor(T.text).text(String(item),x+13,cy,{width:w-13,lineGap:1.5});cy=doc.y+5;}}else if(b.type==='stat'){doc.roundedRect(x,yy,w,h,6).fill(T.surface);doc.fillColor(T.primary).font(fonts.bold).fontSize(Math.min(27,Math.max(15,h*.18))).text(b.value||'',x+10,yy+10,{width:w-20});doc.fillColor(T.text).font(fonts.regular).fontSize(8).text(b.label||'',x+10,Math.min(yy+h-26,doc.y+4),{width:w-20});}else if(b.type==='image'){if(!(await drawImage(b,x,yy,w,h)))drawVectorPlaceholder(page.title,x,yy,w,h);}else if(b.type==='chart'){drawChart(b,x,yy,w,h);}else if(b.type==='table'){const headers=b.tableHeaders||[],rows=b.tableRows||[],cols=Math.max(1,headers.length,...rows.map(r=>r.length)),cw=w/cols,fs=Math.max(5.8,Math.min(8,w/(cols*11))),rh=Math.max(17,Math.min(28,h/Math.max(2,Math.min(rows.length+1,12))));let cy=yy;if(headers.length){doc.fillColor(T.surface).rect(x,cy,w,rh).fill();headers.forEach((v,c)=>doc.fillColor(T.text).font(fonts.bold).fontSize(fs).text(String(v??''),x+c*cw+4,cy+4,{width:cw-8,height:rh-8}));cy+=rh;}for(const row of rows){if(cy+rh>yy+h)break;row.slice(0,cols).forEach((v,c)=>{doc.strokeColor('#D7E0EA').lineWidth(.45).rect(x+c*cw,cy,cw,rh).stroke();doc.fillColor(T.text).font(fonts.regular).fontSize(fs).text(String(v??''),x+c*cw+4,cy+4,{width:cw-8,height:rh-8});});cy+=rh;}}doc.restore();}};

  for(let pi=0;pi<project.pages.length;pi++){
    const page=project.pages[pi],layout=page.layout||'editorial',W=isPresentation?960:595.28,H=isPresentation?540:841.89,contentW=W-2*M;
    const freeformBlocks=(page.blocks||[]).filter(b=>b.frame?.freeform);const flowPage={...page,blocks:(page.blocks||[]).filter(b=>!b.frame?.freeform)};
    const dark=layout==='closing'||page.surface?.mode==='dark'; let y=addPhysicalPage(layout,false,{dark,surface:page.surface});
    if(layout==='cover'){
      // Cover: fixed A4, no repeated decorative pattern, no oversized filler band.
      doc.rect(0,0,W,H).fill(T.background);if(master.logoMode!=='none')doc.image(logo,M,34,{fit:[126,34]});
      const {kicker,heading,sub}=titleBlocks(flowPage);const leftW=contentW*.53,rightX=M+contentW*.59,rightW=contentW*.41;let cy=150;
      if(kicker){const ks=textSize(kicker,8.2);doc.fillColor(kicker.style?.textColor||T.primary).font(textFont(kicker,fonts.bold)).fontSize(ks).text(kicker.text,M,cy,{width:leftW,characterSpacing:.55,lineGap:textLineGap(kicker,ks,1.2)});cy=doc.y+13;}
      const hb=heading||{text:page.title};const desired=isPresentation?36:36;const hs=heading?.style?.fontSize?textSize(hb,desired):fittedFontSize(hb.text||page.title,textFont(hb,fonts.bold),leftW,210,desired,24);doc.fillColor(hb.style?.textColor||T.text).font(textFont(hb,fonts.bold)).fontSize(hs).text(hb.text||page.title,M,cy,{width:leftW,lineGap:Math.max(2,hs*.08),align:textAlign(hb,'left')});cy=doc.y+18;
      if(sub){const ss=textSize(sub,10.8);doc.fillColor(sub.style?.textColor||T.muted).font(textFont(sub,fonts.regular)).fontSize(ss).text(sub.text,M,cy,{width:leftW,lineGap:textLineGap(sub,ss,1.42),align:textAlign(sub,'left')});}
      const img=flowPage.blocks.find(b=>b.type==='image');const by=150,bh=350;if(!(await drawImage(img,rightX,by,rightW,bh)))drawVectorPlaceholder(page.title,rightX,by,rightW,bh);
      const paras=flowPage.blocks.filter(b=>b.type==='paragraph');if(paras.length){const pb=paras[0],ps=textSize(pb,8.5);doc.fillColor(pb.style?.textColor||T.muted).font(textFont(pb,fonts.regular)).fontSize(ps).text(pb.text,M,H-175,{width:leftW,lineGap:textLineGap(pb,ps,1.4)});}
      doc.rect(M,H-90,contentW,3).fill(T.primary);doc.fillColor(T.muted).font(fonts.regular).fontSize(7.2).text('Recykal Long Form Design Studio',M,H-72,{width:contentW*.6});
      await drawFreeformBlocks(page,freeformBlocks);continue;
    }
    if(layout==='closing'){
      doc.roundedRect(M,H*.44,contentW*.58,H*.22,12).fillOpacity(.10).fill(T.secondary).fillOpacity(1);y=H*.22;drawHeading(flowPage,y,{width:contentW*.75,dark:true,size:30});const paras=flowPage.blocks.filter(b=>b.type==='paragraph');if(paras[0])doc.fillColor('#DDE9F5').font(fonts.regular).fontSize(10).text(paras[0].text,M,H*.34,{width:contentW*.62,lineGap:2.5});await drawFreeformBlocks(page,freeformBlocks);continue;
    }
    y=drawHeading(flowPage,y,{width:contentW,size:isPresentation?28:24});
    const body=flowPage.blocks.filter(b=>!['kicker','heading','subheading'].includes(b.type));
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
      const q=body.find(b=>b.type==='quote')||body.find(b=>b.type==='paragraph');doc.rect(M,y,6,190).fill(T.secondary);doc.fillColor(T.dark).font(fonts.bold).fontSize(22).text(q?.text||'',M+28,y+8,{width:contentW-28,lineGap:3});const img=body.find(b=>b.type==='image');const iy=Math.min(doc.y+35,H-310);if(img)await drawImage(img,M,iy,contentW,220);else{doc.roundedRect(M,iy,contentW,150,10).fillOpacity(.10).fill(T.secondary).fillOpacity(1);drawIcon(page.title,M+22,iy+38,42,T.secondary);}
    }else if(layout==='image-led'){
      const img=body.find(b=>b.type==='image');const leftW=contentW*.43,rightW=contentW-leftW-18;const imageX=M+leftW+18;if(!(await drawImage(img,imageX,y,rightW,340)))drawVectorPlaceholder(page.title,imageX,y,rightW,340);const leftBlocks=body.filter(b=>b!==img);await drawColumns({...page,blocks:leftBlocks},y,1);
    }else{
      await drawColumns(flowPage,y,layout==='two-column'?2:1);
    }
    await drawFreeformBlocks(page,freeformBlocks);
  }
  if(pageOpen)footer(); doc.end(); await endPromise; await fs.writeFile(file,Buffer.concat(chunks)); await postProcessPdf(file,pdfProfile); return file;
}


function tableColumnWeightsForExport(block={}){const headers=block.tableHeaders||[],rows=block.tableRows||[],cols=Math.max(1,headers.length,...rows.map(r=>r.length));const explicit=Array.isArray(block.tableStyle?.columnWidths)?block.tableStyle.columnWidths.map(Number):[];if(explicit.length===cols&&explicit.every(x=>Number.isFinite(x)&&x>0))return explicit;const weights=[];for(let c=0;c<cols;c++){let max=String(headers[c]??'').length;for(const r of rows)max=Math.max(max,String(r?.[c]??'').length);weights.push(Math.max(.72,Math.min(2.25,Math.sqrt(Math.max(8,max))/3)));}return weights;}

export async function exportPptx(project, {review=false}={}) {
  await fs.mkdir(EXPORT_DIR,{recursive:true});
  const reviewTag=review?`-QC-REVIEW-${Math.round(project.qc?.totalScore||0)}`:'';
  const file=path.join(EXPORT_DIR,`${safeFilename(project.title)}-${project.id.slice(0,8)}${reviewTag}.pptx`);
  const pptx=new PptxGenJS();
  const pptFont=officeFontFace(project);
  const pptTextSize=(block={},fallback=11)=>{const n=Number(block.style?.fontSize);return Number.isFinite(n)?Math.max(6,Math.min(96,n)):fallback;};
  const pptTextStyle=(block={},fallback=11)=>({fontFace:pptFont,fontSize:pptTextSize(block,fallback),bold:Number(block.style?.fontWeight||0)>=600,italic:Boolean(block.style?.italic),underline:block.style?.underline?{color:(block.style?.textColor||'#101828').replace('#','')}:undefined,align:block.style?.textAlign||'left',color:(block.style?.textColor||'#101828').replace('#',''),breakLine:false,fit:'shrink'});
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
  const addSlideSurface=(slide,page)=>{const mode=page.surface?.mode||'plain',pc=c=>c.replace('#','');if(mode==='top-band')slide.addShape(pptx.ShapeType.rect,{x:0,y:0,w:13.333,h:1.25,fill:{color:pc(T.primary),transparency:93},line:{transparency:100}});else if(mode==='side-panel')slide.addShape(pptx.ShapeType.roundRect,{x:9.65,y:.9,w:3.7,h:5.35,rectRadius:.08,fill:{color:pc(T.secondary),transparency:92},line:{transparency:100}});else if(mode==='data-band')slide.addShape(pptx.ShapeType.rect,{x:0,y:4.7,w:13.333,h:1.7,fill:{color:pc(T.primary),transparency:94},line:{transparency:100}});else if(mode==='quote-panel')slide.addShape(pptx.ShapeType.rect,{x:.8,y:2.0,w:11.7,h:2.8,fill:{color:pc(T.secondary),transparency:93},line:{color:pc(T.secondary),width:3,beginArrowType:'none'}});else if(mode==='split-tint')slide.addShape(pptx.ShapeType.rect,{x:7.45,y:0,w:5.88,h:7.5,fill:{color:pc(T.primary),transparency:95},line:{transparency:100}});else if(mode==='chapter-field'){slide.addShape(pptx.ShapeType.ellipse,{x:9.0,y:1.1,w:3.8,h:3.8,fill:{transparency:100},line:{color:pc(T.primary),transparency:88,width:14}});slide.addShape(pptx.ShapeType.ellipse,{x:10.0,y:2.1,w:1.8,h:1.8,fill:{transparency:100},line:{color:pc(T.secondary),transparency:86,width:9}});}else if(mode==='dark')slide.background={color:pc(T.dark)};};
  for (let i=0;i<project.pages.length;i++) {
    const page=project.pages[i]; const slide=pptx.addSlide();
    slide.background={color:T.background.replace('#','')};addSlideSurface(slide,page);
    if(i===0&&master.logoMode!=='none')slide.addImage({path:logo,x:0.45,y:0.30,w:1.55,h:0.34,transparency:0});else if(master.headerText)slide.addText(master.headerText,{x:0.48,y:0.30,w:6.8,h:0.22,fontFace:pptFont,fontSize:7,color:'667085',margin:0});
    if(review){slide.addText(`DRAFT • QC REVIEW • ${Math.round(project.qc?.totalScore||0)}/100`,{x:10.65,y:0.25,w:2.2,h:0.28,fontFace:pptFont,fontSize:7,bold:true,color:'B42318',fill:{color:'FFF3F2'},margin:0.05,align:'center'});}
    slide.addText(page.layout.toUpperCase(),{x:0.5,y:0.83,w:3,h:0.18,fontFace:pptFont,fontSize:7,bold:true,color:T.primary.replace('#',''),charSpacing:1.5});
    let y=1.15;
    for (const b of page.blocks) {
      const free=Boolean(b.frame?.freeform),f={x:6,y:12,w:88,h:18,autoHeight:true,z:1,...(b.frame||{})};
      const bx=free?0.5+(Math.max(0,Math.min(96,Number(f.x)||0))/100)*12.3:0.5;
      const by=free?0.82+(Math.max(0,Math.min(96,Number(f.y)||0))/100)*5.95:y;
      const bw=free?Math.max(.5,Math.min(12.3-(bx-.5),(Math.max(4,Math.min(100,Number(f.w)||88))/100)*12.3)):7.8;
      const bh=free?Math.max(.25,Math.min(6.55-by,(Math.max(4,Math.min(100,Number(f.h)||18))/100)*5.95)):null;
      const advance=n=>{if(!free)y+=n};
      if (b.type==='heading') {slide.addText(b.text||'',{x:bx,y:by,w:bw,h:bh||0.75,...pptTextStyle(b,25),bold:b.style?.fontWeight!=null?Number(b.style.fontWeight)>=600:true,color:(b.style?.textColor||T.text).replace('#',''),margin:0});advance(0.90);}
      else if (b.type==='subheading') {slide.addText(b.text||'',{x:bx,y:by,w:bw,h:bh||0.45,...pptTextStyle(b,13),color:(b.style?.textColor||T.dark).replace('#',''),margin:0});advance(0.57);}
      else if (b.type==='kicker') {slide.addText(b.text||'',{x:bx,y:by,w:free?bw:5,h:bh||0.25,...pptTextStyle(b,8),bold:b.style?.fontWeight!=null?Number(b.style.fontWeight)>=600:true,color:(b.style?.textColor||T.secondary).replace('#',''),margin:0});advance(0.32);}
      else if (b.type==='stat') {slide.addShape(pptx.ShapeType.roundRect,{x:bx,y:by,w:free?bw:3.0,h:bh||1.05,rectRadius:0.06,fill:{color:T.surface.replace('#','')},line:{color:T.surface.replace('#','')}});slide.addText(b.value||'',{x:bx+0.22,y:by+0.18,w:Math.max(.3,bw-0.5),h:0.35,fontFace:pptFont,fontSize:23,bold:true,color:T.primary.replace('#',''),margin:0});slide.addText(b.label||'',{x:bx+0.22,y:by+0.62,w:Math.max(.3,bw-0.6),h:0.24,fontFace:pptFont,fontSize:8,color:'243B53',margin:0});advance(1.18);}
      else if (b.type==='bullets') {const runs=(b.items||[]).map(t=>({text:t,options:{bullet:{indent:12},hanging:3,breakLine:true}}));slide.addText(runs,{x:bx,y:by,w:free?bw:7.6,h:bh||Math.min(2.2,0.35*(b.items||[]).length+0.2),fontFace:pptFont,fontSize:11,color:T.text.replace('#',''),margin:0.02,breakLine:false,fit:'shrink'});advance(Math.min(2.25,0.35*(b.items||[]).length+0.25));}
      else if (b.type==='table' && (b.tableRows?.length || b.tableHeaders?.length)) {
        const rows=[b.tableHeaders||[],...(b.tableRows||[])].map((r,ri)=>r.map(c=>({text:String(c??''),options:ri===0?{bold:true,color:T.text.replace('#',''),fill:'EEF4FF'}:{color:T.text.replace('#','')}})));
        const weights=tableColumnWeightsForExport(b),sumW=weights.reduce((a,v)=>a+v,0),colW=weights.map(v=>(free?bw:7.8)*v/sumW);slide.addTable(rows,{x:bx,y:by,w:free?bw:7.8,h:bh||Math.min(2.7,0.32*rows.length+0.4),fontFace:pptFont,fontSize:b.tableStyle?.density==='compact'?7.2:8,border:{type:'solid',color:'DCE3EA',pt:b.tableStyle?.verticalRules?0.7:0.35},margin:b.tableStyle?.density==='compact'?0.035:0.06,autoFit:false,colW});advance(Math.min(2.85,0.32*rows.length+0.55));
      }
      else if (b.type==='chart' && b.data?.length) {
        const cats=b.data.map(d=>d.label); const vals=b.data.map(d=>Number(d.value)||0);
        const chartType=b.chartType==='line'?pptx.ChartType.line:b.chartType==='scatter'?pptx.ChartType.scatter:pptx.ChartType.bar;
        const series=b.chartType==='scatter'?[{name:b.caption||'Value',values:b.data.map(d=>({x:Number(d.x)||0,y:Number(d.value)||0}))}]:[{name:b.caption||'Value',labels:cats,values:vals}];
        slide.addChart(chartType,series,{x:bx,y:by,w:free?bw:7.8,h:bh||2.2,catAxisLabelFontFace:pptFont,valAxisLabelFontFace:pptFont,showLegend:false,showTitle:false,chartColors:[palette[i%palette.length].replace('#','')],showValue:b.chartType!=='line'});advance(2.35);
      }
      else if (b.type==='image' && b.imageUrl) {
        try{let input=null,dataUri=null;if(b.imageUrl.startsWith('/uploads/')){input=path.resolve('data',b.imageUrl.replace(/^\//,''));await fs.access(input)}else if(b.imageUrl.startsWith('/api/assets/')){const a=await getBinaryAsset(b.imageUrl.split('/').pop());if(a){input=a.bytes;dataUri=`data:${a.mimeType};base64,${a.bytes.toString('base64')}`}}if(!input)throw new Error('missing image');const meta=await sharp(input).metadata();const box=free?{x:bx,y:by,w:bw,h:bh||2.2}:{x:8.7,y:1.45,w:4.0,h:3.7};if((b.imageFit||'cover')==='contain'){const r=(meta.width||1)/(meta.height||1);let iw=box.w,ih=iw/r;if(ih>box.h){ih=box.h;iw=ih*r}const ix=box.x+(box.w-iw)/2,iy=box.y+(box.h-ih)/2;if(dataUri)slide.addImage({data:dataUri,x:ix,y:iy,w:iw,h:ih});else slide.addImage({path:input,x:ix,y:iy,w:iw,h:ih});}else{const fx=Number(b.focalX??50),fy=Number(b.focalY??50);const pos=(fy<34?(fx<34?'northwest':fx>66?'northeast':'north'):fy>66?(fx<34?'southwest':fx>66?'southeast':'south'):(fx<34?'west':fx>66?'east':'centre'));const crop=path.join(EXPORT_DIR,`ppt-crop-${project.id}-${i}-${b.id}.png`);await sharp(input).resize({width:1200,height:1110,fit:'cover',position:pos}).png().toFile(crop);slide.addImage({path:crop,x:box.x,y:box.y,w:box.w,h:box.h});}if(b.provenance?.kind==='licensed-stock'&&b.sourceCredit)slide.addText(String(b.sourceCredit).slice(0,180),{x:box.x+0.05,y:box.y+box.h-0.20,w:box.w-0.1,h:0.15,fontFace:pptFont,fontSize:4.5,color:'52606D',fill:{color:'FFFFFF',transparency:18},margin:0.02,fit:'shrink'});}catch{}
      }
      else if (['paragraph','quote','table'].includes(b.type)) {const t=blockText(b);slide.addText(t,{x:bx,y:by,w:free?bw:7.8,h:bh||Math.min(1.45,0.32+Math.ceil(t.length/110)*0.23),...pptTextStyle(b,b.type==='quote'?13:10.5),italic:b.style?.italic??(b.type==='quote'),color:(b.style?.textColor||T.text).replace('#',''),margin:0});advance(Math.min(1.55,0.40+Math.ceil(t.length/110)*0.23));}
      if (!free&&y>6.5) break;
    }
    // Visual emphasis is semantic and page-role driven; no repeated decorative motif is added here.
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
