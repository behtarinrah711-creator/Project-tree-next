import { readSaosaSession } from '../../cloud/saosaWorkspaceSync.js';

async function request(windowRef, path, options={}){
  const session=readSaosaSession(windowRef);
  if(!session) throw Object.assign(new Error('unauthorized'),{code:'unauthorized'});
  const response=await windowRef.fetch(path,{
    ...options,
    headers:{authorization:`Bearer ${session.token}`,'content-type':'application/json',...(options.headers || {})},
  });
  const payload=await response.json().catch(()=>({}));
  if(!response.ok) throw Object.assign(new Error(payload.error || 'invitation_request_failed'),{code:payload.error,status:response.status});
  return payload;
}

export function createSmsInvitationAdapter({windowRef=globalThis.window}={}){
  const configured=!!windowRef?.fetch && ['saosa.ir','www.saosa.ir'].includes(String(windowRef.location?.hostname || '').toLowerCase());
  return Object.freeze({
    provider:configured?'saosa-api':'not-configured',
    configured,
    async sendInvitation({projectId,projectName,member}){
      if(!configured) return Object.freeze({sent:false,reason:'provider-not-configured'});
      return request(windowRef,`/api/v1/projects/${encodeURIComponent(projectId)}/invitations`,{
        method:'POST',body:JSON.stringify({
          phone:member.mobile,email:member.email || null,firstName:member.firstName,lastName:member.lastName,
          role:member.role,permissions:member.permissions,projectName,
        }),
      });
    },
    async resendInvitation({projectId,invitationId}){
      if(!configured) return Object.freeze({sent:false,reason:'provider-not-configured'});
      return request(windowRef,`/api/v1/projects/${encodeURIComponent(projectId)}/invitations/${encodeURIComponent(invitationId)}/resend`,{method:'POST',body:'{}'});
    },
  });
}

export const smsInvitationAdapter=createSmsInvitationAdapter();
