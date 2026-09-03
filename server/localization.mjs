const profiles={
  'en-IN':{label:'English (India)',direction:'ltr',expansion:1,script:'Latin',font:'Poppins'},
  'en-GB':{label:'English (UK)',direction:'ltr',expansion:1,script:'Latin',font:'Poppins'},
  'de-DE':{label:'German',direction:'ltr',expansion:1.28,script:'Latin',font:'Poppins'},
  'fr-FR':{label:'French',direction:'ltr',expansion:1.18,script:'Latin',font:'Poppins'},
  'es-ES':{label:'Spanish',direction:'ltr',expansion:1.15,script:'Latin',font:'Poppins'},
  'pl-PL':{label:'Polish',direction:'ltr',expansion:1.18,script:'Latin',font:'Poppins'},
  'hi-IN':{label:'Hindi',direction:'ltr',expansion:1.18,script:'Devanagari',font:'Noto Sans Devanagari',fontException:true},
  'te-IN':{label:'Telugu',direction:'ltr',expansion:1.22,script:'Telugu',font:'Noto Sans Telugu',fontException:true},
  'ar-AE':{label:'Arabic',direction:'rtl',expansion:1.25,script:'Arabic',font:'Noto Sans Arabic',fontException:true}
};
export function localizationProfiles(){return Object.entries(profiles).map(([locale,p])=>({locale,...p}))}
function blockChars(b){return String(b.text||'').length+(b.items||[]).join('').length+(b.tableHeaders||[]).join('').length+(b.tableRows||[]).flat().join('').length}
export function localizationQA(project,locale){const p=profiles[locale]||profiles['en-IN'];const issues=[];for(const [i,page] of (project.pages||[]).entries()){const chars=(page.blocks||[]).reduce((n,b)=>n+blockChars(b),0);const weighted=chars*p.expansion;if(weighted>5200&&['cover','quote','stat','image-led'].includes(page.layout))issues.push({severity:'warning',pageIndex:i,message:`Translated content may overflow the ${page.layout} composition; consider editorial/two-column reflow.`});if(weighted>8500)issues.push({severity:'blocking',pageIndex:i,message:'Localized page is too dense for accessible long-form reading. Reflow into additional pages.'})}if(p.direction==='rtl')issues.push({severity:'info',message:'RTL reading order must be verified in final rendered export.'});if(p.fontException)issues.push({severity:'warning',message:`${p.label} requires ${p.font} for readable glyph support; this is an accessibility exception to the Poppins-only Latin brand rule.`});return {locale,language:p.label,direction:p.direction,script:p.script,recommendedFont:p.font,brandFontException:Boolean(p.fontException),issues,pass:!issues.some(x=>x.severity==='blocking')}}
