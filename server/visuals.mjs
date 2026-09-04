import { BRAND } from './brand.mjs';

export const THEMES = [
  {id:'recykal-core',name:'Recykal Core',description:'Bright, balanced corporate system for general marketing.',className:'theme-core',tokens:{background:'#FFFFFF',surface:'#F6F8FB',text:'#101828',muted:'#52606D',primary:BRAND.colors.brightBlue,secondary:BRAND.colors.brightGreen,accent:BRAND.colors.mediumPurple,dark:BRAND.colors.midnightBlue}},
  {id:'editorial-light',name:'Editorial Light',description:'Publication-first, neutral surfaces and restrained brand accents.',className:'theme-editorial',tokens:{background:'#FFFFFF',surface:'#F2F4F7',text:'#111111',muted:'#667085',primary:BRAND.colors.midnightBlue,secondary:BRAND.colors.darkGreen,accent:BRAND.colors.brightBlue,dark:'#101828'}},
  {id:'midnight',name:'Midnight',description:'Dark chapter/opening moments with strong high-contrast data.',className:'theme-midnight',tokens:{background:'#081426',surface:'#10233D',text:'#FFFFFF',muted:'#DCE5EF',primary:BRAND.colors.brightGreen,secondary:BRAND.colors.brightBlue,accent:BRAND.colors.mediumPurple,dark:'#000000'}},
  {id:'signal-blue',name:'Signal Blue',description:'Clean tech-forward system with bright blue information anchors.',className:'theme-signal',tokens:{background:'#F6FAFF',surface:'#EAF2FF',text:'#0B1F3A',muted:'#52606D',primary:BRAND.colors.brightBlue,secondary:BRAND.colors.midnightBlue,accent:BRAND.colors.brightGreen,dark:'#071C33'}},
  {id:'circular-green',name:'Circular Green',description:'Sustainability-forward without turning every surface green.',className:'theme-green',tokens:{background:'#FBFEFC',surface:'#ECF8F3',text:'#10251E',muted:'#536A61',primary:BRAND.colors.darkGreen,secondary:BRAND.colors.brightGreen,accent:BRAND.colors.brightBlue,dark:'#0B2B21'}},
  {id:'technical',name:'Technical',description:'Precise reports, policy handbooks, tables and schematic information.',className:'theme-technical',tokens:{background:'#FFFFFF',surface:'#F5F7FA',text:'#111827',muted:'#5F6C7B',primary:BRAND.colors.midnightBlue,secondary:BRAND.colors.blue,accent:BRAND.colors.darkGreen,dark:'#111827'}}
];

export const DECK_STYLES = [
  {id:'auto',suggested:true,name:'Auto',description:'Studio chooses density and rhythm from the content.',rules:'Infer the appropriate balance from audience, objective, evidence density and output format.'},
  {id:'minimal',name:'Minimal',description:'Sparse, typographic and deliberate.',rules:'One dominant idea at a time, restrained imagery, concise writing, purposeful whitespace. Preserve facts by adding pages rather than shrinking type.'},
  {id:'visual',name:'Visual',description:'Image-forward and illustrative.',rules:'Prioritize meaningful imagery, diagrams, visual comparisons and large data moments. Keep copy concise and never add decoration without a communication role.'},
  {id:'classic',name:'Classic',description:'Balanced editorial storytelling.',rules:'Balance narrative, visuals, statistics and evidence. Use familiar publication structures with controlled variation.'},
  {id:'consultant',name:'Consultant',description:'Dense, structured and analytical.',rules:'Use compact editorial columns, frameworks, tables, direct-labelled charts, annotations and clear recommendations. Avoid decorative visuals.'}
];

export const IMAGE_SOURCES = [
  {id:'ai',name:'AI images',description:'Generate contextual visuals with Studio Image.'},
  {id:'brand-assets',name:'Recykal / source assets',description:'Prefer images already available in source files and Knowledge Hub.'},
  {id:'stock',name:'Licensed stock',description:'Search rights-aware Openverse media and retain license/attribution metadata.'},
  {id:'mixed',name:'Mixed',description:'Prefer approved/source assets, then licensed stock or AI visuals where gaps remain.'},
  {id:'placeholder',name:'Image placeholders',description:'Create intentional image frames without generating media yet.'},
  {id:'none',name:'No images',description:'Use typography, data, diagrams and vectors only.'}
];

export const ART_STYLES = [
  {id:'auto',suggested:true,group:'Suggested',name:'Auto suggested',description:'Choose the visual medium per page role.',prompt:'Choose the most appropriate professional visual medium for the specific information. Keep one coherent visual language across the project.'},
  {id:'photo',suggested:true,group:'Photo',name:'Editorial Photo',description:'Authentic corporate/editorial photography.',prompt:'Authentic editorial photography, natural light, real environments, credible human detail, premium corporate publication, no staged stock-photo clichés.'},
  {id:'scene',suggested:true,group:'Photo',name:'Cinematic Scene',description:'Environmental scene with strong spatial context.',prompt:'Cinematic environmental scene, realistic scale and context, sophisticated natural lighting, premium editorial documentary composition.'},
  {id:'still-life',suggested:true,group:'Photo',name:'Still Life',description:'Clean object/product storytelling.',prompt:'Premium editorial still-life photography, tactile materials, controlled natural light, restrained background, sophisticated composition.'},
  {id:'flat-line',suggested:true,group:'Illustration',name:'Flat Line Art',description:'Simple human/process illustration.',prompt:'Clean flat line illustration, minimal shapes, professional proportions, restrained Recykal palette accents, clear semantic storytelling.'},
  {id:'technical-line',group:'Illustration',name:'Technical Line',description:'Schematics, systems and product explanations.',prompt:'Precise technical line illustration, clean strokes, white or neutral background, schematic clarity, labels omitted unless explicitly requested.'},
  {id:'isometric',suggested:true,group:'Illustration',name:'Isometric',description:'Systems, infrastructure and process scenes.',prompt:'Polished isometric illustration, precise geometry, professional enterprise visual language, coherent scale, restrained Recykal palette.'},
  {id:'spot-color',suggested:true,group:'Illustration',name:'Spot Color',description:'Editorial line illustration with one strong accent.',prompt:'Editorial line illustration with restrained spot color accents from the Recykal palette, clean negative space, modern publication quality.'},
  {id:'doodle',group:'Illustration',name:'Doodle',description:'Friendly explanatory sketch language.',prompt:'Refined professional doodle illustration, hand-drawn energy but clean legibility, consistent stroke weight, limited Recykal accents.'},
  {id:'gouache',group:'Illustration',name:'Gouache',description:'Soft tactile editorial illustration.',prompt:'Sophisticated gouache editorial illustration, subtle paper texture, organic forms, controlled Recykal-inspired accents, premium magazine quality.'},
  {id:'digital-collage',group:'Abstract',name:'Digital Collage',description:'Editorial cut-paper compositions.',prompt:'Premium digital collage, cut-paper geometry, restrained texture, sophisticated editorial composition, no kitsch, coherent brand palette.'},
  {id:'modern-art',group:'Abstract',name:'Modern Art',description:'Geometric expressive editorial imagery.',prompt:'Modern geometric editorial art, bold composition, restrained forms, sophisticated Recykal palette, strong figure-ground relationship.'},
  {id:'magazine-cutout',group:'Abstract',name:'Magazine Cutout',description:'Conceptual editorial object collage.',prompt:'Conceptual magazine cutout collage, clean product/object silhouettes, tactile editorial textures, premium art direction, restrained colors.'},
  {id:'bold-poster',group:'Abstract',name:'Bold Poster',description:'Graphic poster-style illustration.',prompt:'Bold contemporary poster illustration, simplified shapes, powerful silhouette, limited Recykal palette, high visual hierarchy, no text.'},
  {id:'minimal-3d',group:'Abstract',name:'Minimal 3D',description:'Clean dimensional icons and objects.',prompt:'Minimal premium 3D object illustration, matte materials, soft studio lighting, simple geometry, clean background, restrained brand accents.'},
  {id:'custom',group:'Custom',name:'Custom',description:'User-defined image art direction.',prompt:''}
];

export function normalizeProjectPalette(values=[]){
  const out=[];
  for(const value of Array.isArray(values)?values:[]){
    const raw=String(value||'').trim().toUpperCase();
    const hex=/^#[0-9A-F]{6}$/.test(raw)?raw:(/^[0-9A-F]{6}$/.test(raw)?`#${raw}`:null);
    if(hex&&!out.includes(hex))out.push(hex);
    if(out.length>=8)break;
  }
  return out;
}
function luminance(hex){
  const c=hex.replace('#','').match(/.{2}/g).map(x=>parseInt(x,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return .2126*c[0]+.7152*c[1]+.0722*c[2];
}
function contrast(a,b){
  const l1=luminance(a),l2=luminance(b),hi=Math.max(l1,l2),lo=Math.min(l1,l2);
  return (hi+.05)/(lo+.05);
}
export function getTheme(id='recykal-core',projectPalette=[]){
  const base=THEMES.find(x=>x.id===id)||THEMES[0];
  const colors=normalizeProjectPalette(projectPalette);
  if(!colors.length)return base;
  const candidateDark=colors[3];
  const safeDark=candidateDark&&contrast(candidateDark,'#FFFFFF')>=4.5?candidateDark:base.tokens.dark;
  return {...base,name:`${base.name} + Project palette`,description:`${base.description} Project-specific colours are applied to design accents.`,tokens:{...base.tokens,primary:colors[0]||base.tokens.primary,secondary:colors[1]||base.tokens.secondary,accent:colors[2]||base.tokens.accent,dark:safeDark},projectPalette:colors};
}
export function getDeckStyle(id='auto'){return DECK_STYLES.find(x=>x.id===id)||DECK_STYLES[0]}
export function getArtStyle(id='auto'){return ART_STYLES.find(x=>x.id===id)||ART_STYLES[0]}
export function getImageSource(id='mixed'){return IMAGE_SOURCES.find(x=>x.id===id)||IMAGE_SOURCES.find(x=>x.id==='mixed')}
