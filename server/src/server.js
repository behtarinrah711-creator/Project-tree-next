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
const server = createServer(createApp({pool, sessionSecret: config.sessionSecret, sendLoginCode}));
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
