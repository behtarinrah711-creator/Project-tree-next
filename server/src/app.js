import {readJson, route, sendJson} from './http.js';
import {authenticate} from './auth.js';
import {createHash, randomBytes, randomInt, randomUUID} from 'node:crypto';
import {constantTimeEqual, hashToken} from './auth.js';

const SCOPE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const IRAN_PHONE_PATTERN = /^(?:\+98|0098|98|0)?9(\d{9})$/;

function normalizeIranPhone(value){
  const match = IRAN_PHONE_PATTERN.exec(String(value || '').replace(/[\s()-]/g, ''));
  return match ? `09${match[1]}` : null;
}

function createOtpCode(){ return String(randomInt(100000, 1000000)); }
function hashOtp(phone, code, secret){
  return createHash('sha256').update(`${secret}:otp:${phone}:${code}`).digest('hex');
}

function snapshotScope(pathname){
  const match = /^\/api\/v1\/snapshots\/([^/]+)$/.exec(pathname);
  if(!match) return null;
  const scope = decodeURIComponent(match[1]);
  return SCOPE_PATTERN.test(scope) ? scope : null;
}

function requestIp(request){
  const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || request.socket?.remoteAddress || null;
}

export function createApp({pool, sessionSecret, sendLoginCode, logger = console}){
  return async function app(request, response){
    try{
      const url = route(request);
      if(request.method === 'GET' && url.pathname === '/api/health'){
        await pool.query('SELECT 1');
        return sendJson(response, 200, {ok: true, database: 'ready'});
      }

      if(request.method === 'POST' && url.pathname === '/api/v1/auth/otp/request'){
        const body = await readJson(request, 16 * 1024);
        const phone = normalizeIranPhone(body.phone);
        if(!phone) return sendJson(response, 400, {error: 'invalid_phone'});

        const recent = await pool.query(
          `SELECT count(*)::int AS count FROM otp_challenges
             WHERE phone = $1 AND created_at > now() - interval '15 minutes'`,
          [phone],
        );
        if(recent.rows[0].count >= 10) return sendJson(response, 429, {error: 'too_many_requests'});

        const code = createOtpCode();
        const challengeId = randomUUID();
        await pool.query(
          `INSERT INTO otp_challenges(id, phone, code_hash, expires_at, requester_ip)
           VALUES ($1, $2, $3, now() + interval '2 minutes', $4)`,
          [challengeId, phone, hashOtp(phone, code, sessionSecret), requestIp(request)],
        );
        try{
          await sendLoginCode(phone, code);
        }catch(error){
          await pool.query('DELETE FROM otp_challenges WHERE id = $1', [challengeId]);
          throw error;
        }
        return sendJson(response, 202, {ok: true, expiresIn: 120});
      }

      if(request.method === 'POST' && url.pathname === '/api/v1/auth/otp/verify'){
        const body = await readJson(request, 16 * 1024);
        const phone = normalizeIranPhone(body.phone);
        const code = String(body.code || '').trim();
        if(!phone || !/^\d{6}$/.test(code)) return sendJson(response, 400, {error: 'invalid_credentials'});

        const client = await pool.connect();
        try{
          await client.query('BEGIN');
          const found = await client.query(
            `SELECT id, code_hash, attempts_left FROM otp_challenges
               WHERE phone = $1 AND consumed_at IS NULL AND expires_at > now()
               ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
            [phone],
          );
          const challenge = found.rows[0];
          if(!challenge || challenge.attempts_left <= 0 ||
             !constantTimeEqual(challenge.code_hash, hashOtp(phone, code, sessionSecret))){
            if(challenge){
              await client.query(
                'UPDATE otp_challenges SET attempts_left = greatest(attempts_left - 1, 0) WHERE id = $1',
                [challenge.id],
              );
            }
            await client.query('COMMIT');
            return sendJson(response, 401, {error: 'invalid_or_expired_code'});
          }

          await client.query('UPDATE otp_challenges SET consumed_at = now() WHERE id = $1', [challenge.id]);
          const account = await client.query(
            `INSERT INTO accounts(id, phone) VALUES ($1, $2)
             ON CONFLICT (phone) DO UPDATE SET updated_at = now()
             RETURNING id`,
            [randomUUID(), phone],
          );
          const token = randomBytes(32).toString('base64url');
          await client.query(
            `INSERT INTO sessions(token_hash, account_id, expires_at)
             VALUES ($1, $2, now() + interval '30 days')`,
            [hashToken(token, sessionSecret), account.rows[0].id],
          );
          await client.query('COMMIT');
          return sendJson(response, 200, {token, expiresIn: 2592000});
        }catch(error){
          await client.query('ROLLBACK');
          throw error;
        }finally{
          client.release();
        }
      }

      const scope = snapshotScope(url.pathname);
      if(scope){
        const accountId = await authenticate(request, pool, sessionSecret);
        if(!accountId) return sendJson(response, 401, {error: 'unauthorized'});

        if(request.method === 'GET'){
          const result = await pool.query(
            `SELECT scope, revision, payload, source, updated_at
               FROM app_snapshots WHERE account_id = $1 AND scope = $2`,
            [accountId, scope],
          );
          if(!result.rowCount) return sendJson(response, 404, {error: 'not_found'});
          return sendJson(response, 200, result.rows[0]);
        }

        if(request.method === 'PUT'){
          const body = await readJson(request);
          if(!body || !['object'].includes(typeof body.payload) || body.payload === null){
            return sendJson(response, 400, {error: 'payload_must_be_object_or_array'});
          }
          const expectedRevision = Number(body.expectedRevision || 0);
          const client = await pool.connect();
          try{
            await client.query('BEGIN');
            const current = await client.query(
              `SELECT revision FROM app_snapshots
                 WHERE account_id = $1 AND scope = $2 FOR UPDATE`,
              [accountId, scope],
            );
            const revision = Number(current.rows[0]?.revision || 0);
            if(expectedRevision !== revision){
              await client.query('ROLLBACK');
              return sendJson(response, 409, {error: 'revision_conflict', revision});
            }
            const saved = await client.query(
              `INSERT INTO app_snapshots(account_id, scope, revision, payload, source)
               VALUES ($1, $2, 1, $3::jsonb, $4)
               ON CONFLICT (account_id, scope) DO UPDATE
                 SET revision = app_snapshots.revision + 1,
                     payload = EXCLUDED.payload,
                     source = EXCLUDED.source,
                     updated_at = now()
               RETURNING scope, revision, updated_at`,
              [accountId, scope, JSON.stringify(body.payload), String(body.source || 'browser').slice(0, 32)],
            );
            await client.query('COMMIT');
            return sendJson(response, 200, saved.rows[0]);
          }catch(error){
            await client.query('ROLLBACK');
            throw error;
          }finally{
            client.release();
          }
        }
      }

      return sendJson(response, 404, {error: 'not_found'});
    }catch(error){
      logger.error('api request failed', error);
      return sendJson(response, error.statusCode || 500, {error: error.statusCode ? error.message : 'internal_error'});
    }
  };
}
