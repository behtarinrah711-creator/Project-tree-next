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
          phone:member.mobile,permissions:member.permissions,projectName,
        }),
      });
    },
    async resendInvitation({projectId,invitationId}){
      if(!configured) return Object.freeze({sent:false,reason:'provider-not-configured'});
      return request(windowRef,`/api/v1/projects/${encodeURIComponent(projectId)}/invitations/${encodeURIComponent(invitationId)}/resend`,{method:'POST',body:'{}'});
    },
    async cancelInvitation({projectId,invitationId,mobile}){
      if(!configured) return Object.freeze({cancelled:false,reason:'provider-not-configured'});
      const suffix=invitationId?`/${encodeURIComponent(invitationId)}`:'';
      return request(windowRef,`/api/v1/projects/${encodeURIComponent(projectId)}/invitations${suffix}`,{method:'DELETE',body:JSON.stringify({phone:mobile})});
    },
    async updateMember({projectId,member}){
      if(!configured) return Object.freeze({updated:false,reason:'provider-not-configured',member});
      return request(windowRef,`/api/v1/projects/${encodeURIComponent(projectId)}/members`,{
        method:'PATCH',body:JSON.stringify(member),
      });
    },
    async deleteMember({projectId,mobile}){
      if(!configured) return Object.freeze({deleted:false,reason:'provider-not-configured'});
      return request(windowRef,`/api/v1/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(mobile)}`,{method:'DELETE'});
    },
  });
}

export const smsInvitationAdapter=createSmsInvitationAdapter();
