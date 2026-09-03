import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import net from 'node:net';
import { listWebhooks } from './store.mjs';

function privateIp(ip=''){
  if(net.isIP(ip)===4){const p=ip.split('.').map(Number);return p[0]===10||p[0]===127||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||p[0]===0;}
  if(net.isIP(ip)===6){const x=ip.toLowerCase();return x==='::1'||x.startsWith('fc')||x.startsWith('fd')||x.startsWith('fe80:')||x==='::';}
  return false;
}
export async function assertSafeWebhookUrl(raw){
  const u=new URL(String(raw||''));if(!['https:','http:'].includes(u.protocol))throw new Error('Webhook URL must be HTTP(S).');
  if(u.username||u.password)throw new Error('Webhook URLs cannot contain embedded credentials.');
  if(String(process.env.ALLOW_PRIVATE_WEBHOOKS||'false').toLowerCase()==='true')return u.toString();
  const host=u.hostname.toLowerCase();if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal'))throw new Error('Private/internal webhook targets are disabled.');
  if(privateIp(host))throw new Error('Private IP webhook targets are disabled.');
  try{const answers=await dns.lookup(host,{all:true});if(answers.some(a=>privateIp(a.address)))throw new Error('Webhook hostname resolves to a private network address.');}catch(e){if(/private network/.test(e.message))throw e;throw new Error('Webhook hostname could not be resolved safely.');}
  return u.toString();
}
export async function dispatchWebhook(event,payload){const hooks=(await listWebhooks()).filter(h=>h.active!==false&&(h.events||[]).includes(event));for(const h of hooks){const body=JSON.stringify({event,createdAt:new Date().toISOString(),data:payload});const sig=crypto.createHmac('sha256',h.secret).update(body).digest('hex');fetch(h.url,{method:'POST',headers:{'content-type':'application/json','user-agent':'Recykal-Long-Form-Design-Studio/1.0','x-lfds-event':event,'x-lfds-signature':`sha256=${sig}`},body,signal:AbortSignal.timeout(8000)}).catch(()=>{});}return hooks.length}
export function newWebhookSecret(){return crypto.randomBytes(32).toString('hex')}
