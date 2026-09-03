const OPENVERSE='https://api.openverse.org/v1/images/';
export async function searchStock({q,licenseType='commercial',pageSize=18}={}){
  q=String(q||'').trim();if(!q)return [];
  const params=new URLSearchParams({q,page_size:String(Math.max(1,Math.min(30,pageSize))) });
  if(licenseType==='commercial') params.set('license_type','commercial');
  else if(licenseType==='modification') params.set('license_type','commercial,modification');
  const r=await fetch(`${OPENVERSE}?${params}`,{headers:{'User-Agent':'Recykal-Long-Form-Design-Studio/1.0'}});
  if(!r.ok)throw new Error(`Stock search unavailable (${r.status}).`);
  const data=await r.json();return (data.results||[]).map(x=>({id:String(x.id),title:x.title||'Untitled image',thumbnail:x.thumbnail||x.url,url:x.url,creator:x.creator||'',creatorUrl:x.creator_url||'',source:x.source||'Openverse',license:x.license||'',licenseVersion:x.license_version||'',licenseUrl:x.license_url||'',attribution:x.attribution||'',width:x.width||null,height:x.height||null,foreignLandingUrl:x.foreign_landing_url||''}));
}
export async function fetchStockImage(item){const url=String(item?.url||'');if(!/^https?:\/\//i.test(url))throw new Error('Invalid stock image URL.');const r=await fetch(url,{redirect:'follow',headers:{'User-Agent':'Recykal-Long-Form-Design-Studio/1.0'}});if(!r.ok)throw new Error(`Could not import stock image (${r.status}).`);const type=r.headers.get('content-type')||'';if(!type.startsWith('image/'))throw new Error('Selected stock result is not an image.');const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>25*1024*1024)throw new Error('Stock image is too large.');return {bytes,mimeType:type.split(';')[0]};}
