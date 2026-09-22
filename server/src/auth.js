import {createHash, timingSafeEqual} from 'node:crypto';

export function hashToken(token, secret){
  return createHash('sha256').update(`${secret}:${token}`).digest('hex');
}

export function bearerToken(request){
  const header = String(request.headers.authorization || '');
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() || null;
}

export function constantTimeEqual(left, right){
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function authenticate(request, pool, secret){
  const token = bearerToken(request);
  if(!token) return null;
  const tokenHash = hashToken(token, secret);
  const result = await pool.query(
    `SELECT account_id FROM sessions
       WHERE token_hash = $1 AND expires_at > now()
       LIMIT 1`,
    [tokenHash],
  );
  return result.rows[0]?.account_id || null;
}
