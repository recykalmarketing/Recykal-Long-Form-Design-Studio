import fs from 'node:fs/promises';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import PptxGenJS from 'pptxgenjs';
import sharp from 'sharp';
import { BRAND } from './brand.mjs';

const EXPORT_DIR = path.resolve('data/exports');
const LOGO_PATH = path.resolve('public/assets/recykal-logo.svg');

function hexToRgb(hex) {
  const h = hex.replace('#','');
  return {r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16)};
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

export async function exportPdf(project) {
  await fs.mkdir(EXPORT_DIR,{recursive:true});
  const file = path.join(EXPORT_DIR, `${safeFilename(project.title)}-${project.id.slice(0,8)}.pdf`);
  const isPresentation = project.type==='presentation';
  const doc = new PDFDocument({ autoFirstPage:false, size:isPresentation?[960,540]:'A4', margin:isPresentation?42:56, info:{Title:project.title,Author:'Recykal — Long Form Design Studio'} });
  let fonts={regular:'Helvetica',bold:'Helvetica-Bold',italic:'Helvetica-Oblique'};
  try {
    const base=path.resolve('node_modules/@fontsource/poppins/files');
    doc.registerFont('Poppins', path.join(base,'poppins-latin-400-normal.woff2'));
    doc.registerFont('Poppins-Bold', path.join(base,'poppins-latin-700-normal.woff2'));
    doc.registerFont('Poppins-Italic', path.join(base,'poppins-latin-400-italic.woff2'));
    doc.font('Poppins'); doc.font('Poppins-Bold'); doc.font('Poppins-Italic');
    fonts={regular:'Poppins',bold:'Poppins-Bold',italic:'Poppins-Italic'};
  } catch {}
  const chunks=[];
  doc.on('data',c=>chunks.push(c));
  const endPromise = new Promise((resolve,reject)=>{doc.on('end',resolve);doc.on('error',reject);});
  const logo=await logoPng();
  let pageOpen=false;
  let physicalPage=0;
  let currentSection='';

  const footer=()=>{
    if(!pageOpen)return;
    const W=doc.page.width,H=doc.page.height;
    doc.fillColor('#98A2B3').font(fonts.regular).fontSize(7.5).text(`Recykal • Long Form Design Studio`,42,H-34,{width:W-110});
    doc.fillColor('#98A2B3').text(String(physicalPage).padStart(2,'0'),W-70,H-34,{width:28,align:'right'});
  };
  const addPhysicalPage=(layout='editorial',continued=false)=>{
    if(pageOpen)footer();
    doc.addPage({ size:isPresentation?[960,540]:'A4', margin:isPresentation?42:56 });
    pageOpen=true;physicalPage++;
    const W=doc.page.width,H=doc.page.height;
    doc.rect(0,0,W,H).fill(BRAND.colors.white);
    doc.image(logo,42,28,{fit:[120,36]});
    doc.fillColor(BRAND.colors.brightBlue).font(fonts.bold).fontSize(isPresentation?10:8.5).text(`${layout.toUpperCase()}${continued?' • CONTINUED':''}`,42,isPresentation?80:82);
    return isPresentation?105:112;
  };
  const ensure=(height,y,layout)=> y+height>doc.page.height-70 ? addPhysicalPage(layout,true) : y;
  const resolveLocalImage=(url='')=>{
    if(!url.startsWith('/uploads/'))return null;
    const f=path.resolve('data',url.replace(/^\//,''));
    return f;
  };
  const splitToFit=(text,width,available,fontName,fontSize,lineGap=3)=>{
    const words=String(text||'').split(/\s+/).filter(Boolean); if(!words.length)return ['', ''];
    doc.font(fontName).fontSize(fontSize);
    let lo=1,hi=words.length,best=0;
    while(lo<=hi){const mid=Math.floor((lo+hi)/2);const part=words.slice(0,mid).join(' ');const h=doc.heightOfString(part,{width,lineGap});if(h<=available){best=mid;lo=mid+1}else hi=mid-1;}
    if(best===0)best=1;
    return [words.slice(0,best).join(' '),words.slice(best).join(' ')];
  };

  for (const section of project.pages) {
    currentSection=section.title;
    let y=addPhysicalPage(section.layout,false);
    const W=doc.page.width,H=doc.page.height,contentW=W-84;
    for (const b of section.blocks) {
      const txt=blockText(b);
      if (b.type==='kicker') {
        y=ensure(24,y,section.layout);doc.fillColor(BRAND.colors.darkGreen).font(fonts.bold).fontSize(10).text(txt,42,y,{width:contentW});y=doc.y+8;
      } else if (b.type==='heading') {
        doc.font(fonts.bold).fontSize(isPresentation?30:23);const h=doc.heightOfString(txt,{width:contentW});y=ensure(h+14,y,section.layout);doc.fillColor(BRAND.colors.black).text(txt,42,y,{width:contentW});y=doc.y+12;
      } else if (b.type==='subheading') {
        doc.font(fonts.regular).fontSize(isPresentation?16:13);const h=doc.heightOfString(txt,{width:contentW});y=ensure(h+14,y,section.layout);doc.fillColor(BRAND.colors.midnightBlue).text(txt,42,y,{width:contentW});y=doc.y+12;
      } else if (b.type==='stat') {
        y=ensure(112,y,section.layout);doc.roundedRect(42,y,Math.min(300,contentW),92,12).fill('#F0F6FF');doc.fillColor(BRAND.colors.brightBlue).font(fonts.bold).fontSize(30).text(b.value||'',58,y+16);doc.fillColor(BRAND.colors.black).font(fonts.regular).fontSize(11).text(b.label||'',58,y+54,{width:255});y+=106;
      } else if (b.type==='quote') {
        doc.font(fonts.italic).fontSize(14);const h=doc.heightOfString(txt,{width:contentW-16,lineGap:3});y=ensure(h+18,y,section.layout);doc.rect(42,y,4,h+4).fill(BRAND.colors.mediumPurple);doc.fillColor(BRAND.colors.black).text(txt,58,y,{width:contentW-16,lineGap:3});y=doc.y+14;
      } else if (b.type==='bullets') {
        for(const item of b.items||[]){
          let remaining=String(item); while(remaining){
            y=ensure(26,y,section.layout);const available=doc.page.height-80-y;const [part,rest]=splitToFit(remaining,contentW-18,available,fonts.regular,isPresentation?14:10.5,3);doc.circle(48,y+5,2.3).fill(BRAND.colors.brightGreen);doc.fillColor(BRAND.colors.black).font(fonts.regular).fontSize(isPresentation?14:10.5).text(part,60,y,{width:contentW-18,lineGap:3});y=doc.y+8;remaining=rest;if(remaining)y=addPhysicalPage(section.layout,true);
          }
        }
      } else if (b.type==='table' && (b.tableRows?.length || b.tableHeaders?.length)) {
        const rows=[b.tableHeaders||[],...(b.tableRows||[])]; const cols=Math.max(1,...rows.map(r=>r.length)); const cellW=contentW/cols;
        for(let ri=0;ri<rows.length;ri++){const row=rows[ri];const rowH=28;y=ensure(rowH,y,section.layout);if(ri===0&&b.tableHeaders?.length){doc.rect(42,y,contentW,rowH).fill('#EEF4FF')}else if(ri%2===0){doc.rect(42,y,contentW,rowH).fill('#F8FAFC')}for(let ci=0;ci<cols;ci++){doc.rect(42+ci*cellW,y,cellW,rowH).stroke('#DCE3EA');doc.fillColor('#263342').font(ri===0&&b.tableHeaders?.length?fonts.bold:fonts.regular).fontSize(7.8).text(String(row[ci]??''),46+ci*cellW,y+7,{width:cellW-8,height:rowH-8,ellipsis:true});}y+=rowH;}if(b.caption){doc.fillColor('#667085').font(fonts.regular).fontSize(8).text(b.caption,42,y+4,{width:contentW});y=doc.y+10;}else y+=8;
      } else if (b.type==='chart' && b.data?.length) {
        const vals=b.data.map(d=>Number(d.value)||0);const min=Math.min(0,...vals),max=Math.max(1,...vals),range=max-min||1;
        if(['line','scatter'].includes(b.chartType)){const chartH=160;y=ensure(chartH+30,y,section.layout);const left=70,right=W-70,top=y+10,bottom=y+chartH;doc.moveTo(left,top).lineTo(left,bottom).lineTo(right,bottom).stroke('#98A2B3');const xs=b.data.map((d,i)=>b.chartType==='scatter'?(Number.isFinite(Number(d.x))?Number(d.x):i):i);const xmin=Math.min(...xs,0),xmax=Math.max(...xs,1),xr=xmax-xmin||1;let prev=null;b.data.forEach((d,i)=>{const xv=xs[i],v=Number(d.value)||0;const px=left+((xv-xmin)/xr)*(right-left),py=bottom-((v-min)/range)*(chartH-20);if(b.chartType==='line'&&prev){doc.moveTo(prev.x,prev.y).lineTo(px,py).lineWidth(1.5).stroke(BRAND.colors.brightBlue)}doc.circle(px,py,3).fill(BRAND.colors.darkGreen);doc.fillColor('#667085').font(fonts.regular).fontSize(6.8).text(String(d.label),px-28,bottom+5,{width:56,align:'center'});prev={x:px,y:py};});y=bottom+24;}else{const needed=Math.min(10,b.data.length)*20+22;y=ensure(needed,y,section.layout);doc.font(fonts.regular).fontSize(9.5);for(const d of b.data.slice(0,10)){const pct=((Number(d.value)||0)-min)/range;doc.fillColor(BRAND.colors.black).text(d.label,42,y,{width:120});if(b.chartType==='dot'){doc.moveTo(165,y+5).lineTo(W-78,y+5).stroke('#D9E2EC');doc.circle(165+Math.max(0,pct)*(W-243),y+5,4).fill(BRAND.colors.brightBlue)}else{doc.rect(165,y,Math.max(2,(W-243)*Math.max(0,pct)),10).fill(BRAND.colors.brightGreen)}doc.fillColor(BRAND.colors.midnightBlue).text(String(d.value),W-58,y,{align:'right',width:38});y+=20;}}if(b.caption){doc.fillColor('#667085').fontSize(8).text(b.caption,42,y,{width:contentW});y=doc.y+10;}else y+=8;
      } else if (b.type==='image' && b.imageUrl) {
        const imagePath=resolveLocalImage(b.imageUrl);try{if(imagePath){await fs.access(imagePath);y=ensure(isPresentation?250:310,y,section.layout);doc.image(imagePath,42,y,{fit:[contentW,isPresentation?230:290],align:'center'});y+=isPresentation?245:305;if(b.caption){doc.fillColor('#667085').font(fonts.regular).fontSize(8).text(b.caption,42,y,{width:contentW});y=doc.y+9;}}}catch{}
      } else if (txt) {
        let remaining=txt;const size=isPresentation?13:10.5;while(remaining){
          y=ensure(28,y,section.layout);const available=doc.page.height-80-y;const [part,rest]=splitToFit(remaining,contentW,available,fonts.regular,size,3);doc.fillColor('#263342').font(fonts.regular).fontSize(size).text(part,42,y,{width:contentW,lineGap:3});y=doc.y+10;remaining=rest;if(remaining)y=addPhysicalPage(section.layout,true);
        }
      }
      if(isPresentation && y>H-68) break;
    }
  }
  footer();
  doc.end();
  await endPromise;
  await fs.writeFile(file,Buffer.concat(chunks));
  return file;
}

export async function exportPptx(project) {
  await fs.mkdir(EXPORT_DIR,{recursive:true});
  const file=path.join(EXPORT_DIR,`${safeFilename(project.title)}-${project.id.slice(0,8)}.pptx`);
  const pptx=new PptxGenJS();
  pptx.layout='LAYOUT_WIDE';
  pptx.author='Recykal — Long Form Design Studio';
  pptx.subject=project.summary||'';
  pptx.title=project.title;
  pptx.company='Recykal';
  pptx.lang='en-IN';
  pptx.theme={headFontFace:'Poppins',bodyFontFace:'Poppins',lang:'en-IN'};
  const logo=await logoPng();
  const palette=[BRAND.colors.brightBlue,BRAND.colors.brightGreen,BRAND.colors.mediumPurple,BRAND.colors.midnightBlue];
  for (let i=0;i<project.pages.length;i++) {
    const page=project.pages[i]; const slide=pptx.addSlide();
    slide.background={color:'FFFFFF'};
    slide.addImage({path:logo,x:0.45,y:0.30,w:1.55,h:0.34,transparency:0});
    slide.addText(page.layout.toUpperCase(),{x:0.5,y:0.83,w:3,h:0.18,fontFace:'Poppins',fontSize:7,bold:true,color:BRAND.colors.brightBlue.replace('#',''),charSpacing:1.5});
    let y=1.15;
    for (const b of page.blocks) {
      if (b.type==='heading') {slide.addText(b.text||'',{x:0.5,y,w:7.8,h:0.75,fontFace:'Poppins',fontSize:25,bold:true,color:'000000',margin:0,breakLine:false,fit:'shrink'});y+=0.90;}
      else if (b.type==='subheading') {slide.addText(b.text||'',{x:0.5,y,w:7.8,h:0.45,fontFace:'Poppins',fontSize:13,color:BRAND.colors.midnightBlue.replace('#',''),margin:0,fit:'shrink'});y+=0.57;}
      else if (b.type==='kicker') {slide.addText(b.text||'',{x:0.5,y,w:5,h:0.25,fontFace:'Poppins',fontSize:8,bold:true,color:BRAND.colors.darkGreen.replace('#',''),margin:0});y+=0.32;}
      else if (b.type==='stat') {slide.addShape(pptx.ShapeType.roundRect,{x:0.5,y,w:3.0,h:1.05,rectRadius:0.06,fill:{color:'F0F6FF'},line:{color:'F0F6FF'}});slide.addText(b.value||'',{x:0.72,y:y+0.18,w:2.5,h:0.35,fontFace:'Poppins',fontSize:23,bold:true,color:BRAND.colors.brightBlue.replace('#',''),margin:0});slide.addText(b.label||'',{x:0.72,y:y+0.62,w:2.4,h:0.24,fontFace:'Poppins',fontSize:8,color:'243B53',margin:0});y+=1.18;}
      else if (b.type==='bullets') {const runs=(b.items||[]).map(t=>({text:t,options:{bullet:{indent:12},hanging:3,breakLine:true}}));slide.addText(runs,{x:0.5,y,w:7.6,h:Math.min(2.2,0.35*(b.items||[]).length+0.2),fontFace:'Poppins',fontSize:11,color:'263342',margin:0.02,breakLine:false,fit:'shrink'});y+=Math.min(2.25,0.35*(b.items||[]).length+0.25);}
      else if (b.type==='table' && (b.tableRows?.length || b.tableHeaders?.length)) {
        const rows=[b.tableHeaders||[],...(b.tableRows||[])].map((r,ri)=>r.map(c=>({text:String(c??''),options:ri===0?{bold:true,color:'000000',fill:'EEF4FF'}:{color:'263342'}})));
        slide.addTable(rows,{x:0.5,y,w:7.8,h:Math.min(2.7,0.32*rows.length+0.4),fontFace:'Poppins',fontSize:8,border:{type:'solid',color:'DCE3EA',pt:0.5},margin:0.05,autoFit:false});y+=Math.min(2.85,0.32*rows.length+0.55);
      }
      else if (b.type==='chart' && b.data?.length) {
        const cats=b.data.map(d=>d.label); const vals=b.data.map(d=>Number(d.value)||0);
        const chartType=b.chartType==='line'?pptx.ChartType.line:b.chartType==='scatter'?pptx.ChartType.scatter:pptx.ChartType.bar;
        const series=b.chartType==='scatter'?[{name:b.caption||'Value',values:b.data.map(d=>({x:Number(d.x)||0,y:Number(d.value)||0}))}]:[{name:b.caption||'Value',labels:cats,values:vals}];
        slide.addChart(chartType,series,{x:0.5,y,w:7.8,h:2.2,catAxisLabelFontFace:'Poppins',valAxisLabelFontFace:'Poppins',showLegend:false,showTitle:false,chartColors:[palette[i%palette.length].replace('#','')],showValue:b.chartType!=='line'});y+=2.35;
      }
      else if (b.type==='image' && b.imageUrl?.startsWith('/uploads/')) {
        const imagePath=path.resolve('data',b.imageUrl.replace(/^\//,''));
        try{await fs.access(imagePath);const meta=await sharp(imagePath).metadata();const box={x:8.7,y:1.45,w:4.0,h:3.7};const r=(meta.width||1)/(meta.height||1);let iw=box.w,ih=iw/r;if(ih>box.h){ih=box.h;iw=ih*r}const ix=box.x+(box.w-iw)/2,iy=box.y+(box.h-ih)/2;slide.addImage({path:imagePath,x:ix,y:iy,w:iw,h:ih});}catch{}
      }
      else if (['paragraph','quote','table'].includes(b.type)) {const t=blockText(b);slide.addText(t,{x:0.5,y,w:7.8,h:Math.min(1.45,0.32+Math.ceil(t.length/110)*0.23),fontFace:'Poppins',fontSize:b.type==='quote'?13:10.5,italic:b.type==='quote',color:'263342',margin:0,fit:'shrink'});y+=Math.min(1.55,0.40+Math.ceil(t.length/110)*0.23);}
      if (y>6.5) break;
    }
    // right-side visual device for visual balance
    slide.addShape(pptx.ShapeType.arc,{x:9.1,y:1.2,w:3.5,h:3.5,adjustPoint:0.25,rotate:18,line:{color:palette[i%palette.length].replace('#',''),transparency:20,width:18}});
    slide.addShape(pptx.ShapeType.arc,{x:9.6,y:1.7,w:2.5,h:2.5,rotate:180,line:{color:BRAND.colors.brightGreen.replace('#',''),transparency:20,width:10}});
    slide.addText(`${i+1} / ${project.pages.length}`,{x:11.9,y:7.05,w:1,h:0.18,fontFace:'Poppins',fontSize:7,color:'667085',align:'right',margin:0});
    if (page.speakerNotes) slide.addNotes(page.speakerNotes);
  }
  await pptx.writeFile({fileName:file});
  return file;
}

function esc(s='') { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function wrapSvgText(text,maxChars=34){const words=String(text).split(/\s+/);const lines=[];let line='';for(const w of words){if((line+' '+w).trim().length>maxChars){if(line)lines.push(line);line=w;}else line=(line+' '+w).trim();}if(line)lines.push(line);return lines;}

export async function exportGraphicPng(project) {
  await fs.mkdir(EXPORT_DIR,{recursive:true});
  const page=project.pages[0];
  const w=1080,h=1350;
  const logoSvg=await fs.readFile(LOGO_PATH,'utf8');
  const logoData=`data:image/svg+xml;base64,${Buffer.from(logoSvg).toString('base64')}`;
  const heading=page.blocks.find(b=>b.type==='heading')?.text || page.title;
  const sub=page.blocks.find(b=>b.type==='subheading')?.text || page.blocks.find(b=>b.type==='paragraph')?.text || '';
  const stat=page.blocks.find(b=>b.type==='stat');
  const bullets=page.blocks.find(b=>b.type==='bullets')?.items || [];
  const imageBlock=page.blocks.find(b=>b.type==='image' && b.imageUrl?.startsWith('/uploads/'));
  let imageData='';
  if(imageBlock){try{const imagePath=path.resolve('data',imageBlock.imageUrl.replace(/^\//,''));const bytes=await fs.readFile(imagePath);const ext=path.extname(imagePath).toLowerCase();const mime=ext==='.png'?'image/png':ext==='.webp'?'image/webp':'image/jpeg';imageData=`data:${mime};base64,${bytes.toString('base64')}`;}catch{}}
  const lines=wrapSvgText(heading,25).slice(0,4);
  const sublines=wrapSvgText(sub,48).slice(0,5);
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F4F8FF"/><stop offset="1" stop-color="#ECFFF8"/></linearGradient><clipPath id="imgclip"><rect x="620" y="170" width="390" height="430" rx="36"/></clipPath></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>
    <circle cx="930" cy="200" r="230" fill="#005DFF" opacity="0.08"/><circle cx="870" cy="280" r="155" fill="#1DC797" opacity="0.12"/>
    ${imageData?`<image href="${imageData}" x="620" y="170" width="390" height="430" preserveAspectRatio="xMidYMid slice" clip-path="url(#imgclip)"/>`:''}
    <image href="${logoData}" x="72" y="66" width="240" height="60" preserveAspectRatio="xMinYMid meet"/>
    <text x="72" y="205" font-family="Poppins,Arial,sans-serif" font-size="23" font-weight="600" fill="#049769" letter-spacing="2">RECYKAL INSIGHT</text>
    ${lines.map((l,i)=>`<text x="72" y="${310+i*82}" font-family="Poppins,Arial,sans-serif" font-size="70" font-weight="700" fill="#000000">${esc(l)}</text>`).join('')}
    ${sublines.map((l,i)=>`<text x="72" y="${675+i*38}" font-family="Poppins,Arial,sans-serif" font-size="28" font-weight="400" fill="#314254">${esc(l)}</text>`).join('')}
    ${stat?`<rect x="72" y="900" width="410" height="205" rx="28" fill="#ffffff"/><text x="105" y="985" font-family="Poppins,Arial,sans-serif" font-size="64" font-weight="700" fill="#005DFF">${esc(stat.value)}</text><text x="105" y="1040" font-family="Poppins,Arial,sans-serif" font-size="24" fill="#263342">${esc(stat.label)}</text>`:''}
    ${bullets.slice(0,3).map((b,i)=>`<circle cx="620" cy="${930+i*72}" r="11" fill="#1DC797"/><text x="650" y="${940+i*72}" font-family="Poppins,Arial,sans-serif" font-size="24" fill="#263342">${esc(wrapSvgText(b,27)[0]||'')}</text>`).join('')}
    <rect x="0" y="1250" width="1080" height="100" fill="#024C8A"/><text x="72" y="1312" font-family="Poppins,Arial,sans-serif" font-size="24" font-weight="500" fill="#ffffff">Make circularity work.</text>
  </svg>`;
  const file=path.join(EXPORT_DIR,`${safeFilename(project.title)}-${project.id.slice(0,8)}.png`);
  await sharp(Buffer.from(svg)).png().toFile(file);
  return file;
}

export async function exportProject(project, format) {
  if (format==='pdf') return exportPdf(project);
  if (format==='pptx') {
    if (project.type!=='presentation') throw new Error('PPTX export is available for presentations.');
    return exportPptx(project);
  }
  if (format==='png') {
    if (project.type!=='graphic') throw new Error('PNG export is available for graphics.');
    return exportGraphicPng(project);
  }
  throw new Error('Unsupported export format.');
}
