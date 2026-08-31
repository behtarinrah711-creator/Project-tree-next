import { isDirty, isPending } from './storeSyncState.js';

/**
 * Phase 7.2 — project metadata doc → local project shape.
 * Behavior: mergePolicy anti-empty + projectDirty metadata; tasks cached until hydrate.
 */

export function docToProjectFromCloud(doc, localExisting, ctx = {}){
  const d = doc.data?.() || doc.data || {};
  const normalizeTaskRecord = ctx.normalizeTaskRecord || (t => t);
  const getRecoveredLocalTasks = ctx.getRecoveredLocalTasks || (() => []);
  const normalizeEmail = ctx.normalizeEmail || (e => String(e || '').trim().toLowerCase());
  const policy = ctx.mergePolicy || (typeof window !== 'undefined' ? window.KarhaApp?.mergePolicy : null);

  const localTasks = localExisting && Array.isArray(localExisting.tasks)
    ? localExisting.tasks.map(normalizeTaskRecord) : [];
  const legacyTasks = Array.isArray(d.tasks) ? d.tasks.map(normalizeTaskRecord) : [];
  const recoveryTasks = getRecoveredLocalTasks({ id: doc.id });
  const cachedMap = new Map();
  [...localTasks, ...legacyTasks, ...recoveryTasks].forEach(t => {
    if(t && t.id && !cachedMap.has(String(t.id))) cachedMap.set(String(t.id), t);
  });
  const cachedTasks = Array.from(cachedMap.values());

  const localContacts = localExisting && Array.isArray(localExisting.contacts) ? localExisting.contacts : [];
  const localActivities = localExisting && Array.isArray(localExisting.activityTemplates) ? localExisting.activityTemplates : [];
  const localContractTemplates = localExisting && Array.isArray(localExisting.contractTemplates) ? localExisting.contractTemplates : [];
  const localContracts = localExisting && Array.isArray(localExisting.contracts) ? localExisting.contracts : [];

  const projectDirty = !!(isDirty(ctx.appDataStore, doc.id) || isPending(ctx.appDataStore, doc.id));
  const mergeCol = (localArr, cloudArr, fieldPresent) => {
    if(!policy?.mergeCollection){
      if(!fieldPresent) return localArr;
      if(Array.isArray(cloudArr) && cloudArr.length === 0 && localArr.length > 0) return localArr;
      return fieldPresent ? cloudArr : localArr;
    }
    if(!fieldPresent) return localArr;
    return policy.mergeCollection(localArr, cloudArr, { dirty: projectDirty }).items;
  };

  const hasCloudContacts = Object.prototype.hasOwnProperty.call(d, 'contacts');
  const hasCloudActivities = Object.prototype.hasOwnProperty.call(d, 'activityTemplates');
  const hasCloudContractTemplates = Object.prototype.hasOwnProperty.call(d, 'contractTemplates');
  const hasCloudContracts = Object.prototype.hasOwnProperty.call(d, 'contracts');
  const contacts = mergeCol(localContacts, Array.isArray(d.contacts) ? d.contacts : [], hasCloudContacts);
  const activityTemplates = mergeCol(localActivities, Array.isArray(d.activityTemplates) ? d.activityTemplates : [], hasCloudActivities);
  const contractTemplates = mergeCol(localContractTemplates, Array.isArray(d.contractTemplates) ? d.contractTemplates : [], hasCloudContractTemplates);
  const contracts = mergeCol(localContracts, Array.isArray(d.contracts) ? d.contracts : [], hasCloudContracts);

  const meta = policy?.mergeProjectMetadata
    ? policy.mergeProjectMetadata(localExisting, {
        name: d.name,
        completedOpen: d.completedOpen,
        trashed: d.trashed,
        archived: d.archived,
        ownerUid: d.ownerUid,
        ownerEmail: normalizeEmail(d.ownerEmail || ''),
        sharedWith: (d.sharedWith || []).map(e => normalizeEmail(e)).filter(Boolean),
      }, { projectDirty })
    : {
        name: projectDirty ? (localExisting?.name ?? d.name) : d.name,
        completedOpen: projectDirty ? !!(localExisting?.completedOpen) : !!d.completedOpen,
        trashed: projectDirty ? !!(localExisting?.trashed) : !!d.trashed,
        archived: projectDirty ? !!(localExisting?.archived) : !!d.archived,
        ownerUid: d.ownerUid,
        ownerEmail: normalizeEmail(d.ownerEmail || ''),
        sharedWith: (d.sharedWith || []).map(e => normalizeEmail(e)).filter(Boolean),
      };

  return {
    id: doc.id,
    name: meta.name,
    type: 'project',
    tasks: cachedTasks,
    contacts,
    activityTemplates,
    contractTemplates,
    contracts,
    completedOpen: !!meta.completedOpen,
    ownerUid: meta.ownerUid,
    ownerEmail: meta.ownerEmail || normalizeEmail(d.ownerEmail || ''),
    sharedWith: meta.sharedWith || [],
    trashed: !!meta.trashed,
    archived: !!meta.archived,
    schemaVersion: Number(d.schemaVersion || 1),
    expanded: true,
  };
}
