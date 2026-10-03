import {createEmptyNotebook, createNotebookRepository, NOTEBOOK_STORAGE_KEY} from '../data/notebookRepository.js';
import {localStorageAdapter} from '../data/storageAdapter.js';
import {hasGuestNotebookData, mergeNotebooks} from './notebookCloudLifecycle.js';
import {isSaosaHost, readSaosaSession} from './saosaWorkspaceSync.js';

const clone = value => JSON.parse(JSON.stringify(value));
const updatedAt = notebook => Number(notebook?.updatedAt) || 0;

function accountStorageKey(accountId){
  return `${NOTEBOOK_STORAGE_KEY}:saosa:${String(accountId || '')}`;
}

async function notebookRequest(windowRef, session, options = {}){
  const response = await (windowRef.fetch || fetch)('/api/v1/notebook', {
    ...options,
    headers: {
      authorization: `Bearer ${session.token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if(!response.ok){
    const error = new Error(payload.error || 'notebook_request_failed');
    error.status = response.status;
    error.revision = payload.revision;
    throw error;
  }
  return payload;
}

export function createSaosaNotebookLifecycle({
  windowRef = globalThis.window,
  guestRepository = createNotebookRepository(),
  accountStorage = localStorageAdapter,
  consoleRef = console,
} = {}){
  const listeners = new Set();
  let current = guestRepository;
  let session = null;
  let accountRepository = null;
  let accountForward = null;
  let revision = 0;
  let applyingRemote = false;
  let writeChain = Promise.resolve();
  const notify = () => listeners.forEach(listener => listener(current.get()));
  const forwardGuest = guestRepository.subscribe?.(() => current === guestRepository && notify());

  const queueWrite = (activeSession, snapshot) => {
    const saved = clone(snapshot);
    writeChain = writeChain.catch(() => {}).then(() => writeAccount(activeSession, saved));
    return writeChain;
  };

  async function writeAccount(activeSession, snapshot){
    if(!session || session.token !== activeSession.token) return false;
    try{
      const saved = await notebookRequest(windowRef, activeSession, {
        method: 'PUT',
        body: JSON.stringify({notebook: snapshot, expectedRevision: revision}),
      });
      if(session?.token === activeSession.token) revision = Number(saved.revision) || revision;
      return true;
    }catch(error){
      if(error.status !== 409 || session?.token !== activeSession.token) throw error;
      const remote = await notebookRequest(windowRef, activeSession);
      if(session?.token !== activeSession.token) return false;
      revision = Number(remote.revision) || 0;
      if(remote.notebook?.lists?.length && updatedAt(remote.notebook) >= updatedAt(accountRepository.get())){
        applyingRemote = true;
        try{ accountRepository.replace(remote.notebook); }
        finally{ applyingRemote = false; }
        return true;
      }
      const retried = await notebookRequest(windowRef, activeSession, {
        method: 'PUT',
        body: JSON.stringify({notebook: accountRepository.get(), expectedRevision: revision}),
      });
      if(session?.token === activeSession.token) revision = Number(retried.revision) || revision;
      return true;
    }
  }

  const openAccount = accountId => {
    accountForward?.();
    accountRepository = createNotebookRepository({
      storage: accountStorage,
      storageKey: accountStorageKey(accountId),
    });
    accountRepository.load();
    accountForward = accountRepository.subscribe?.(() => current === accountRepository && notify());
    return accountRepository;
  };

  const connectAccount = async activeSession => {
    const generation = activeSession.token;
    session = activeSession;
    revision = 0;
    const guest = clone(guestRepository.get());
    const account = openAccount(activeSession.accountId || activeSession.phone);
    const local = clone(account.get());
    current = account;
    notify();
    let remote = {notebook: null, revision: 0};
    try{
      remote = await notebookRequest(windowRef, activeSession);
    }catch(error){
      consoleRef.warn('saosa notebook load failed; local copy retained', error);
      if(!hasGuestNotebookData(account.get()) && hasGuestNotebookData(guest)) account.replace(guest);
      return;
    }
    if(session?.token !== generation) return;
    revision = Number(remote.revision) || 0;
    const cloud = remote.notebook;
    let base;
    if(cloud?.lists?.length){
      const localWins = hasGuestNotebookData(local) && updatedAt(local) > updatedAt(cloud);
      base = mergeNotebooks(localWins ? local : cloud, localWins ? cloud : local);
    }else{
      base = hasGuestNotebookData(local) ? local : guest;
    }
    const merged = base === guest ? clone(guest) : mergeNotebooks(base, guest);
    applyingRemote = true;
    try{ account.replace(merged); }
    finally{ applyingRemote = false; }
    if(hasGuestNotebookData(guest) || !cloud?.lists?.length || updatedAt(merged) > updatedAt(cloud)){
      try{
        await queueWrite(activeSession, merged);
        if(session?.token !== generation) return;
        guestRepository.replace(createEmptyNotebook());
      }catch(error){
        consoleRef.warn('saosa notebook write failed; local copy retained', error);
      }
    }
  };

  const connectGuest = () => {
    session = null;
    revision = 0;
    current = guestRepository;
    guestRepository.load();
    notify();
  };

  guestRepository.load();
  const initialSession = isSaosaHost(windowRef) ? readSaosaSession(windowRef) : null;
  if(initialSession) void connectAccount(initialSession).catch(error => consoleRef.warn('saosa notebook connect failed', error));
  else connectGuest();

  return Object.freeze({
    load(){ return current.load(); },
    get(){ return current.get(); },
    replace(next){
      const value = current.replace(next);
      if(session && !applyingRemote){
        const active = session;
        void queueWrite(active, value).catch(error => consoleRef.warn('saosa notebook write failed', error));
      }
      return value;
    },
    mutate(fn){
      const value = current.mutate(fn);
      if(session && !applyingRemote){
        const active = session;
        void queueWrite(active, value).catch(error => consoleRef.warn('saosa notebook write failed', error));
      }
      return value;
    },
    subscribe(listener){ listeners.add(listener); return () => listeners.delete(listener); },
    destroy(){ forwardGuest?.(); accountForward?.(); listeners.clear(); session = null; },
  });
}
