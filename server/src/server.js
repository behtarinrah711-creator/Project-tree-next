import {createServer} from 'node:http';
import pg from 'pg';
import {createApp} from './app.js';
import {loadConfig} from './config.js';

const config = loadConfig();
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 5,
  idleTimeoutMillis: 30_000,
});

async function sendLoginCode(phone, code){
  const endpoint = new URL(`https://api.kavenegar.com/v1/${encodeURIComponent(config.kavenegarApiKey)}/verify/lookup.json`);
  endpoint.searchParams.set('receptor', phone);
  endpoint.searchParams.set('token', code);
  endpoint.searchParams.set('template', config.kavenegarTemplate);
  const response = await fetch(endpoint);
  if(!response.ok){
    const error = new Error('sms_provider_error');
    error.statusCode = 502;
    throw error;
  }
}
async function kavenegarLookup(phone,token,template){
  const endpoint=new URL(`https://api.kavenegar.com/v1/${encodeURIComponent(config.kavenegarApiKey)}/verify/lookup.json`);
  endpoint.searchParams.set('receptor',phone);endpoint.searchParams.set('token',token);endpoint.searchParams.set('template',template);
  const response=await fetch(endpoint);
  if(!response.ok){const error=new Error('sms_provider_error');error.statusCode=502;throw error;}
}
async function sendInvitationSms({phone,projectName}){return kavenegarLookup(phone,projectName,config.kavenegarInviteTemplate);}
function escapeHtml(value){return String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));}
async function sendInvitationEmail({email,projectName,acceptUrl}){
  if(!config.resendApiKey || !config.invitationFromEmail) return {skipped:true};
  const safeProject=escapeHtml(projectName);const safeUrl=escapeHtml(acceptUrl);
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${config.resendApiKey}`,'content-type':'application/json'},body:JSON.stringify({from:config.invitationFromEmail,to:[email],subject:`دعوت به پروژه ${projectName} در ساُسا`,html:`<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:2"><h2>دعوت به پروژه ${safeProject}</h2><p>شما برای همکاری در این پروژه به ساُسا دعوت شده‌اید.</p><p><a href="${safeUrl}">مشاهده دعوت‌نامه</a></p><p>برای فعال‌شدن عضویت، با همان شماره موبایلی که دعوت شده وارد شوید.</p></div>`})});
  if(!response.ok){const error=new Error('email_provider_error');error.statusCode=502;throw error;}
  return response.json().catch(()=>({ok:true}));
}
const server = createServer(createApp({pool,sessionSecret:config.sessionSecret,sendLoginCode,sendInvitationSms,sendInvitationEmail,invitationBaseUrl:config.invitationBaseUrl}));
server.listen(config.port, '127.0.0.1', () => {
  console.log(`Saosa API listening on 127.0.0.1:${config.port}`);
});

async function shutdown(){
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
