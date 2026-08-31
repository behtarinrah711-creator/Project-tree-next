/**
 * Phase 4.2 — Domain entry for markDirty / persist.
 * After legacy boots, applicationStartup registers the real implementations
 * so dirty flags and cloud flush stay single-sourced in legacy until full extract.
 * Auth is not handled here.
 */

let impl = {
  markDirty(_projectId){},
  persist(_options){},
};

export function registerPersistImpl(next = {}){
  if(typeof next.markDirty === 'function') impl.markDirty = next.markDirty;
  if(typeof next.persist === 'function') impl.persist = next.persist;
}

export function markDirty(projectId){
  return impl.markDirty(projectId);
}

export function persist(options){
  return impl.persist(options);
}

/**
 * D5 Store-backed persistence/flush owner. Auth and rendering stay injected;
 * dirty consumption always comes directly from AppDataStore at flush time.
 */
export function createPersistOrchestrator({
  appDataStore,
  rememberProjectTasks = () => {},
  isCloudEnabled = () => false,
  findProject = () => null,
  syncProject = () => {},
  onLocalError = () => {},
  delay = 120,
} = {}){
  let timer = null;
  let scheduleVersion = 0;
  return function persistStoreSnapshot(options){
    const writeLocal = !options || options.local !== false;
    clearTimeout(timer);
    const version = ++scheduleVersion;
    const flush = () => {
      if(version !== scheduleVersion) return;
      if(writeLocal){
        appDataStore.getProjects().forEach(rememberProjectTasks);
        if(!appDataStore.persistLocal()) onLocalError();
      }
      if(isCloudEnabled()){
        // Snapshot ids before starting promises; acknowledgements never mutate
        // this canonical dirty owner.
        [...appDataStore.getDirtyProjectIds()].forEach(projectId => {
          const project = findProject(projectId);
          if(project) syncProject(project);
        });
      }
      appDataStore.clearProjectDirty();
    };
    // A zero delay is used by deterministic callers/tests to request the next
    // turn without a wall-clock timer. setTimeout(0) can run after setImmediate
    // when scheduled from an I/O phase, so use a cancellable microtask there.
    // The normal 120ms runtime debounce remains timer-backed and unchanged.
    if(delay === 0){
      timer = null;
      queueMicrotask(flush);
    } else {
      timer = setTimeout(flush, delay);
    }
  };
}
