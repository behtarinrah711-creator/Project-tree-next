export const DEPLOYMENT_CONFIG = Object.freeze({
  instanceId: 'project-tree-next-v1',
  storageNamespace: 'ptnext-v1',
  cloudEnabled: true,
  firebase: Object.freeze({
    apiKey: 'AIzaSyD6rBk4nMvSQj986BN-Es85KXA7ZTKKNiQ',
    authDomain: 'project-tree-next.firebaseapp.com',
    projectId: 'project-tree-next',
    storageBucket: 'project-tree-next.firebasestorage.app',
    messagingSenderId: '97129426242',
    appId: '1:97129426242:web:7790357c1b90b16e7becdb',
  }),
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
