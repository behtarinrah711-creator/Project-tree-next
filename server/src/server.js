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

const server = createServer(createApp({pool, sessionSecret: config.sessionSecret}));
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
