import { createEmptyNotebook, createNotebookRepository, NOTEBOOK_STORAGE_KEY } from '../data/notebookRepository.js';
import { localStorageAdapter } from '../data/storageAdapter.js';

const clone = value => JSON.parse(JSON.stringify(value));

export function hasGuestNotebookData(notebook){
  const lists = notebook?.lists || [];
  if(lists.length !== 1) return lists.length > 0;
  const [list] = lists;
  return list.title !== 'کارهای شخصی' || list.trashed || (list.items || []).length > 0;
}

export function mergeNotebooks(cloudNotebook, guestNotebook){
  if(!cloudNotebook?.lists?.length) return clone(guestNotebook);
  if(!hasGuestNotebookData(guestNotebook)) return clone(cloudNotebook);
  const merged = clone(cloudNotebook);
  const ids = new Set(merged.lists.map(list => String(list.id)));
  for(const list of guestNotebook.lists || []){
    if(ids.has(String(list.id))) continue;
    merged.lists.push(clone(list));
  }
  merged.activeListId = guestNotebook.activeListId || merged.activeListId;
  merged.updatedAt = Date.now();
  return merged;
}

const updatedAt = notebook => Number(notebook?.updatedAt) || 0;

export function createNotebookCloudLifecycle({auth,db,guestRepository=createNotebookRepository(),accountStorage=localStorageAdapter,consoleRef=console}={}){
  const listeners = new Set();
  let current = guestRepository, user = null, accountRepository = null, accountForward = null;
  let cloudUnsubscribe = null, authGeneration = 0, writeChain = Promise.resolve();
  const notify = () => listeners.forEach(listener => listener(current.get()));
  const forwardGuest = guestRepository.subscribe?.(() => current === guestRepository && notify());
  const documentFor = uid => db.collection('notebooks').doc(String(uid));
  const stopCloud = () => { try{ cloudUnsubscribe?.(); }catch{} cloudUnsubscribe = null; };
  const writeAccount = async (uid,snapshot) => {
    await documentFor(uid).set({ownerUid:uid,notebook:clone(snapshot),updatedAt:Date.now()},{merge:true});
    return true;
  };
  const queueWrite = (uid,snapshot) => {
    const saved=clone(snapshot);
    writeChain=writeChain.catch(()=>{}).then(()=>writeAccount(uid,saved));
    return writeChain;
  };
  const openAccount = uid => {
    accountForward?.();
    accountRepository=createNotebookRepository({storage:accountStorage,storageKey:`${NOTEBOOK_STORAGE_KEY}:user:${uid}`});
    accountRepository.load();
    accountForward=accountRepository.subscribe?.(()=>current===accountRepository&&notify());
    return accountRepository;
  };

  const connectUser = async nextUser => {
    const generation = ++authGeneration;
    stopCloud();
    user = nextUser;
    const guest = clone(guestRepository.get());
    const account=openAccount(nextUser.uid);
    const local=clone(account.get());
    current = account;
    notify();
    try{
      const ref = documentFor(nextUser.uid);
      const document = await ref.get();
      if(generation !== authGeneration || user?.uid !== nextUser.uid) return;
      const cloud = document.exists ? document.data()?.notebook : null;
      let base;
      if(cloud?.lists?.length){
        const localWins=hasGuestNotebookData(local)&&updatedAt(local)>updatedAt(cloud);
        base=mergeNotebooks(localWins?local:cloud,localWins?cloud:local);
      }else base=hasGuestNotebookData(local)?local:guest;
      const merged=base===guest?clone(guest):mergeNotebooks(base,guest);
      account.replace(merged);
      if(hasGuestNotebookData(guest) || !cloud?.lists?.length || updatedAt(merged)>updatedAt(cloud)){
        await queueWrite(nextUser.uid,merged);
        if(generation !== authGeneration || user?.uid !== nextUser.uid) return;
        guestRepository.replace(createEmptyNotebook());
      }
      cloudUnsubscribe = ref.onSnapshot?.(snapshot => {
        if(generation !== authGeneration || user?.uid !== nextUser.uid || !snapshot.exists) return;
        const notebook = snapshot.data()?.notebook;
        if(notebook?.lists?.length&&updatedAt(notebook)>=updatedAt(account.get())) account.replace(notebook);
      },error => consoleRef.warn('notebook cloud listener failed',error)) || null;
    }catch(error){
      consoleRef.warn('guest notebook migration failed; local copy retained',error);
      if(!hasGuestNotebookData(account.get())) account.replace(guest);
    }
  };

  const connectGuest = () => {
    ++authGeneration;
    stopCloud();
    user = null;
    current = guestRepository;
    guestRepository.load();
    notify();
  };

  guestRepository.load();
  const authUnsubscribe = auth?.onAuthStateChanged?.(nextUser => nextUser ? connectUser(nextUser) : connectGuest());

  return Object.freeze({
    load(){ return current.load(); },
    get(){ return current.get(); },
    replace(next){ const value=current.replace(next); if(user){const uid=user.uid;void queueWrite(uid,value).catch(error=>consoleRef.warn('notebook cloud write failed',error));} return value; },
    mutate(fn){ const value=current.mutate(fn); if(user){const uid=user.uid;void queueWrite(uid,value).catch(error=>consoleRef.warn('notebook cloud write failed',error));} return value; },
    subscribe(listener){ listeners.add(listener); return () => listeners.delete(listener); },
    destroy(){ ++authGeneration; stopCloud(); authUnsubscribe?.(); forwardGuest?.(); accountForward?.(); listeners.clear(); },
  });
}
