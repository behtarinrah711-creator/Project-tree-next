import {readJson, route, sendJson} from './http.js';
import {authenticate} from './auth.js';
import {createHash, randomBytes, randomInt, randomUUID} from 'node:crypto';
import {constantTimeEqual, hashToken} from './auth.js';

const SCOPE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const IRAN_PHONE_PATTERN = /^09\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const OTP_LIFETIME_SECONDS = 180;
export const INVITATION_LIFETIME_DAYS = 7;

export function normalizeIranPhone(value){
  const phone = String(value || '');
  return IRAN_PHONE_PATTERN.test(phone) ? phone : null;
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

export function normalizeEmail(value){
  const email=String(value || '').trim().toLowerCase();
  return email && EMAIL_PATTERN.test(email) && email.length <= 254 ? email : (email ? null : '');
}

function invitationRoute(pathname){
  const create=/^\/api\/v1\/projects\/([^/]+)\/invitations$/.exec(pathname);
  if(create) return {action:'create',projectId:decodeURIComponent(create[1])};
  const resend=/^\/api\/v1\/projects\/([^/]+)\/invitations\/([^/]+)\/resend$/.exec(pathname);
  if(resend) return {action:'resend',projectId:decodeURIComponent(resend[1]),invitationId:decodeURIComponent(resend[2])};
  return null;
}

function invitationAccess(permissions){
  const values=Object.values(permissions || {});
  return {view:true,edit:values.some(value=>['edit','create','full'].includes(value)),modules:permissions || {}};
}

async function acceptPhoneInvitations(client, accountId, phone){
  const pending=await client.query(
    `SELECT * FROM project_invitations
      WHERE phone = $1 AND status = 'invited' AND expires_at > now()
      ORDER BY created_at FOR UPDATE`,[phone],
  );
  for(const invitation of pending.rows){
    const roleKey=`invite-${String(invitation.id).slice(0,8)}`;
    const access=invitationAccess(invitation.permissions);
    const role=await client.query(
      `INSERT INTO project_roles(id, project_id, role_key, display_name, permissions, is_system)
       VALUES ($1, $2, $3, $4, $5::jsonb, false)
       ON CONFLICT (project_id, role_key) DO UPDATE SET permissions = EXCLUDED.permissions, updated_at = now()
       RETURNING id`,
      [randomUUID(),invitation.project_id,roleKey,invitation.role_key,JSON.stringify(access)],
    );
    await client.query(
      `INSERT INTO project_memberships(project_id, account_id, role_id, status, invited_by)
       VALUES ($1, $2, $3, 'active', $4)
       ON CONFLICT (project_id, account_id) DO UPDATE SET role_id = EXCLUDED.role_id, status = 'active', updated_at = now()`,
      [invitation.project_id,accountId,role.rows[0].id,invitation.invited_by],
    );
    await client.query(
      `UPDATE project_invitations SET status = 'accepted', accepted_at = now(), updated_at = now() WHERE id = $1`,
      [invitation.id],
    );
    const project=await client.query('SELECT payload FROM projects WHERE id=$1 FOR UPDATE',[invitation.project_id]);
    if(project.rowCount){
      const payload=project.rows[0].payload || {};
      if(Array.isArray(payload.projectMembers)){
        payload.projectMembers=payload.projectMembers.map(member=>member?.mobile===phone?{...member,status:'active',invitationId:invitation.id}:member);
        await client.query('UPDATE projects SET payload=$2::jsonb,revision=revision+1,updated_at=now() WHERE id=$1',[invitation.project_id,JSON.stringify(payload)]);
      }
    }
  }
  return pending.rows.map(row=>row.project_id);
}

const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/i;
const DEFAULT_ROLES = [
  ['owner', 'مالک', {view:true, edit:true, manageMembers:true, manageRoles:true, delete:true}],
  ['admin', 'مدیر', {view:true, edit:true, manageMembers:true, manageRoles:false, delete:false}],
  ['editor', 'ویرایشگر', {view:true, edit:true, manageMembers:false, manageRoles:false, delete:false}],
  ['viewer', 'مشاهده‌گر', {view:true, edit:false, manageMembers:false, manageRoles:false, delete:false}],
];

function normalizeWorkspaceSnapshot(raw){
  if(!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.projects)) return null;
  const ids = new Set();
  for(const project of raw.projects){
    const id = String(project?.id || '');
    if(!project || typeof project !== 'object' || Array.isArray(project) || !PROJECT_ID_PATTERN.test(id) || ids.has(id)) return null;
    ids.add(id);
  }
  return {
    schemaVersion:Number(raw.schemaVersion) || 8,
    projects:raw.projects,
    viewMode:String(raw.viewMode || 'simple').slice(0, 32),
    activeTab:raw.activeTab == null ? null : String(raw.activeTab).slice(0, 128),
    starredOrder:Array.isArray(raw.starredOrder) ? raw.starredOrder : [],
  };
}

async function readWorkspace(pool, accountId){
  const [projects, preferences] = await Promise.all([
    pool.query(
      `SELECT p.payload, r.role_key, r.permissions
         FROM project_memberships m
         JOIN projects p ON p.id = m.project_id
         JOIN project_roles r ON r.id = m.role_id AND r.project_id = m.project_id
        WHERE m.account_id = $1 AND m.status = 'active'
        ORDER BY p.created_at, p.id`,
      [accountId],
    ),
    pool.query(
      `SELECT payload FROM app_snapshots
        WHERE account_id = $1 AND scope = 'workspace_preferences'`,
      [accountId],
    ),
  ]);
  const prefs = preferences.rows[0]?.payload || {};
  return {
    accountId,
    snapshot:{
      schemaVersion:Number(prefs.schemaVersion) || 8,
      projects:projects.rows.map(row => row.payload),
      viewMode:prefs.viewMode || 'simple',
      activeTab:prefs.activeTab ?? null,
      starredOrder:Array.isArray(prefs.starredOrder) ? prefs.starredOrder : [],
    },
    access:Object.fromEntries(projects.rows.map(row => [row.payload.id, {
      role:row.role_key,
      permissions:row.permissions,
    }])),
  };
}

async function saveWorkspace(pool, accountId, snapshot){
  const client = await pool.connect();
  let committed = false;
  try{
    await client.query('BEGIN');
    for(const project of snapshot.projects){
      const projectId = String(project.id);
      const existing = await client.query('SELECT id FROM projects WHERE id = $1 FOR UPDATE', [projectId]);
      if(!existing.rowCount){
        await client.query(
          `INSERT INTO projects(id, owner_account_id, payload) VALUES ($1, $2, $3::jsonb)`,
          [projectId, accountId, JSON.stringify(project)],
        );
        const roles = DEFAULT_ROLES.map(([key, name, permissions]) => ({
          id:randomUUID(), key, name, permissions,
        }));
        for(const role of roles){
          await client.query(
            `INSERT INTO project_roles(id, project_id, role_key, display_name, permissions, is_system)
             VALUES ($1, $2, $3, $4, $5::jsonb, true)`,
            [role.id, projectId, role.key, role.name, JSON.stringify(role.permissions)],
          );
        }
        const ownerRole = roles.find(role => role.key === 'owner');
        await client.query(
          `INSERT INTO project_memberships(project_id, account_id, role_id, status, invited_by)
           VALUES ($1, $2, $3, 'active', $2)`,
          [projectId, accountId, ownerRole.id],
        );
      }else{
        const membership = await client.query(
          `SELECT r.permissions
             FROM project_memberships m
             JOIN project_roles r ON r.id = m.role_id AND r.project_id = m.project_id
            WHERE m.project_id = $1 AND m.account_id = $2 AND m.status = 'active'`,
          [projectId, accountId],
        );
        if(!membership.rowCount || membership.rows[0].permissions?.edit !== true){
          const error = new Error('forbidden_project');
          error.statusCode = 403;
          throw error;
        }
        await client.query(
          `UPDATE projects SET payload = $2::jsonb, revision = revision + 1, updated_at = now()
            WHERE id = $1`,
          [projectId, JSON.stringify(project)],
        );
      }
    }
    const preferences = {
      schemaVersion:snapshot.schemaVersion,
      viewMode:snapshot.viewMode,
      activeTab:snapshot.activeTab,
      starredOrder:snapshot.starredOrder,
    };
    await client.query(
      `INSERT INTO app_snapshots(account_id, scope, revision, payload, source)
       VALUES ($1, 'workspace_preferences', 1, $2::jsonb, 'browser')
       ON CONFLICT (account_id, scope) DO UPDATE
         SET revision = app_snapshots.revision + 1, payload = EXCLUDED.payload, updated_at = now()`,
      [accountId, JSON.stringify(preferences)],
    );
    await client.query('COMMIT');
    committed = true;
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{
    client.release();
  }
  if(committed) return readWorkspace(pool, accountId);
}

export function createApp({pool, sessionSecret, sendLoginCode, sendInvitationSms=async()=>{}, sendInvitationEmail=async()=>({skipped:true}), invitationBaseUrl='https://saosa.ir', logger = console}){
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
           VALUES ($1, $2, $3, now() + ($5 * interval '1 second'), $4)`,
          [challengeId, phone, hashOtp(phone, code, sessionSecret), requestIp(request),OTP_LIFETIME_SECONDS],
        );
        try{
          await sendLoginCode(phone, code);
        }catch(error){
          await pool.query('DELETE FROM otp_challenges WHERE id = $1', [challengeId]);
          throw error;
        }
        return sendJson(response, 202, {ok:true,expiresIn:OTP_LIFETIME_SECONDS});
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
          const acceptedProjectIds=await acceptPhoneInvitations(client,account.rows[0].id,phone);
          const token = randomBytes(32).toString('base64url');
          await client.query(
            `INSERT INTO sessions(token_hash, account_id, expires_at)
             VALUES ($1, $2, now() + interval '30 days')`,
            [hashToken(token, sessionSecret), account.rows[0].id],
          );
          await client.query('COMMIT');
          return sendJson(response, 200, {token, accountId:account.rows[0].id, expiresIn:2592000, acceptedProjectIds});
        }catch(error){
          await client.query('ROLLBACK');
          throw error;
        }finally{
          client.release();
        }
      }

      const inviteRoute=invitationRoute(url.pathname);
      if(inviteRoute && request.method === 'POST'){
        if(!PROJECT_ID_PATTERN.test(inviteRoute.projectId)) return sendJson(response,400,{error:'invalid_project'});
        const accountId=await authenticate(request,pool,sessionSecret);
        if(!accountId) return sendJson(response,401,{error:'unauthorized'});
        const owner=await pool.query(
          `SELECT p.id, p.payload, a.phone FROM projects p JOIN accounts a ON a.id = p.owner_account_id
            WHERE p.id = $1 AND p.owner_account_id = $2`,[inviteRoute.projectId,accountId],
        );
        if(!owner.rowCount) return sendJson(response,403,{error:'forbidden_project'});

        if(inviteRoute.action==='create'){
          const body=await readJson(request,64*1024);
          const phone=normalizeIranPhone(body.phone);if(!phone) return sendJson(response,400,{error:'invalid_phone'});
          const email=normalizeEmail(body.email);if(email===null) return sendJson(response,400,{error:'invalid_email'});
          if(phone===owner.rows[0].phone) return sendJson(response,409,{error:'project_owner'});
          const member=await pool.query(
            `SELECT m.status FROM project_memberships m JOIN accounts a ON a.id=m.account_id
              WHERE m.project_id=$1 AND a.phone=$2 LIMIT 1`,[inviteRoute.projectId,phone],
          );
          if(member.rowCount) return sendJson(response,409,{error:member.rows[0].status==='active'?'already_member':'inactive_member'});
          const duplicate=await pool.query(
            `SELECT id FROM project_invitations WHERE project_id=$1 AND phone=$2 AND status='invited' LIMIT 1`,
            [inviteRoute.projectId,phone],
          );
          if(duplicate.rowCount) return sendJson(response,409,{error:'already_invited'});
          const id=randomUUID();const rawToken=randomBytes(32).toString('base64url');
          const projectName=String(owner.rows[0].payload?.name || owner.rows[0].payload?.title || body.projectName || 'پروژه').slice(0,100);
          const inserted=await pool.query(
            `INSERT INTO project_invitations(id,project_id,phone,email,first_name,last_name,role_key,permissions,token_hash,status,invited_by,expires_at)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'invited',$10,now()+($11 || ' days')::interval)
             RETURNING id,expires_at`,
            [id,inviteRoute.projectId,phone,email||null,String(body.firstName||'').trim().slice(0,100),String(body.lastName||'').trim().slice(0,100),String(body.role||'member').slice(0,48),JSON.stringify(body.permissions||{}),hashToken(rawToken,sessionSecret),accountId,String(INVITATION_LIFETIME_DAYS)],
          );
          const acceptUrl=`${invitationBaseUrl.replace(/\/$/,'')}/#/invite/${encodeURIComponent(rawToken)}`;
          let smsSent=false;let emailSent=false;
          try{await sendInvitationSms({phone,projectName});smsSent=true;await pool.query('UPDATE project_invitations SET sms_sent_at=now() WHERE id=$1',[id]);}
          catch(error){logger.warn?.('invitation SMS delivery failed',{invitationId:id,error:error.message});}
          if(email){
            try{const delivery=await sendInvitationEmail({email,projectName,acceptUrl});emailSent=!delivery?.skipped;if(emailSent)await pool.query('UPDATE project_invitations SET email_sent_at=now() WHERE id=$1',[id]);}
            catch(error){logger.warn?.('invitation email delivery failed',{invitationId:id,error:error.message});}
          }
          return sendJson(response,201,{id:inserted.rows[0].id,status:'invited',expiresAt:inserted.rows[0].expires_at,smsSent,emailSent});
        }

        const invitation=await pool.query(
          `SELECT * FROM project_invitations WHERE id=$1 AND project_id=$2 AND status='invited'`,
          [inviteRoute.invitationId,inviteRoute.projectId],
        );
        if(!invitation.rowCount) return sendJson(response,404,{error:'invitation_not_found'});
        const item=invitation.rows[0];const rawToken=randomBytes(32).toString('base64url');
        const projectName=String(owner.rows[0].payload?.name || owner.rows[0].payload?.title || 'پروژه').slice(0,100);
        const acceptUrl=`${invitationBaseUrl.replace(/\/$/,'')}/#/invite/${encodeURIComponent(rawToken)}`;
        let smsSent=false;let emailSent=false;
        try{await sendInvitationSms({phone:item.phone,projectName});smsSent=true;}
        catch(error){logger.warn?.('invitation SMS resend failed',{invitationId:item.id,error:error.message});}
        if(item.email){try{const delivery=await sendInvitationEmail({email:item.email,projectName,acceptUrl});emailSent=!delivery?.skipped;}catch(error){logger.warn?.('invitation email resend failed',{invitationId:item.id,error:error.message});}}
        const resent=await pool.query(
          `UPDATE project_invitations SET token_hash=$2,expires_at=now()+($3 || ' days')::interval,sms_sent_at=CASE WHEN $4 THEN now() ELSE sms_sent_at END,email_sent_at=CASE WHEN $5 THEN now() ELSE email_sent_at END,updated_at=now()
            WHERE id=$1 RETURNING id,expires_at`,[item.id,hashToken(rawToken,sessionSecret),String(INVITATION_LIFETIME_DAYS),smsSent,emailSent],
        );
        return sendJson(response,200,{id:resent.rows[0].id,status:'invited',expiresAt:resent.rows[0].expires_at,smsSent,emailSent});
      }

      if(url.pathname === '/api/v1/workspace'){
        const accountId = await authenticate(request, pool, sessionSecret);
        if(!accountId) return sendJson(response, 401, {error: 'unauthorized'});
        if(request.method === 'GET') return sendJson(response, 200, await readWorkspace(pool, accountId));
        if(request.method === 'PUT'){
          const body = await readJson(request);
          const snapshot = normalizeWorkspaceSnapshot(body.snapshot);
          if(!snapshot) return sendJson(response, 400, {error: 'invalid_workspace'});
          return sendJson(response, 200, await saveWorkspace(pool, accountId, snapshot));
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
