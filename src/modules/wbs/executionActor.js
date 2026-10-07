import { readSaosaSession } from '../../cloud/saosaWorkspaceSync.js';

function phonesOf(contact){
  return (Array.isArray(contact?.phones) ? contact.phones : [contact?.phone]).map(String).filter(Boolean);
}

function personName(contact){
  return [contact?.firstName, contact?.lastName].filter(Boolean).join(' ').trim()
    || String(contact?.name || '').trim();
}

export function currentExecutionActor(project, windowRef = window){
  const session = readSaosaSession(windowRef);
  const firebaseUser = windowRef.firebase?.auth?.()?.currentUser || null;
  const phone = String(session?.phone || firebaseUser?.phoneNumber || '');
  const member = (project?.projectMembers || []).find(row => String(row?.mobile || '') === phone);
  const contact = (project?.contacts || []).find(row =>
    !row?.trashed && (String(row.id) === String(member?.contactId || '') || phonesOf(row).includes(phone))
  );
  return {
    id:String(session?.accountId || firebaseUser?.uid || (phone ? `phone:${phone}` : 'guest')),
    contactId:String(contact?.id || member?.contactId || ''),
    name:personName(contact) || firebaseUser?.displayName || phone || 'کاربر',
  };
}

export function isExecutionAssignee(entity, actor){
  return Boolean(entity?.assigneeContactId)
    && String(entity.assigneeContactId) === String(actor?.contactId || '');
}

export function isExecutionApprover(entity, actor){
  return Boolean(entity?.approvalContactId)
    && String(entity.approvalContactId) === String(actor?.contactId || '');
}
