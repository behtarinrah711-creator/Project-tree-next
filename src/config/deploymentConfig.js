export const DEPLOYMENT_CONFIG = Object.freeze({
  instanceId: 'project-tree-next-v1',
  storageNamespace: 'ptnext-v1',
  cloudEnabled: false,
  firebase: null,
});

export function namespacedStorageKey(name){
  return `${DEPLOYMENT_CONFIG.storageNamespace}:${String(name || '')}`;
}

export const STORAGE_KEYS = Object.freeze({
  appData: namespacedStorageKey('app-data'),
  notebook: namespacedStorageKey('notebook'),
  profile: namespacedStorageKey('user-profile'),
  exportNotes: namespacedStorageKey('export-notes'),
  projectStatusQueue: namespacedStorageKey('project-status-queue'),
  taskRecovery: namespacedStorageKey('task-recovery'),
  contactDraft: namespacedStorageKey('contact-draft'),
  realContractDraft: namespacedStorageKey('real-contract-draft'),
  contractTemplateDraftPrefix: namespacedStorageKey('contract-template-draft:'),
});
