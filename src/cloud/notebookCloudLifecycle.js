import { createEmptyNotebook, createNotebookRepository } from '../data/notebookRepository.js';

const clone = value => JSON.parse(JSON.stringify(value));
const activeLists = notebook => (notebook?.lists || []).filter(list => !list.trashed);

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

function memoryStorage(){
  let value = null;
  return {
    getItem(){ return value; },
    setItem(_key,next){ value = next; },
    removeItem(){ value = null; },
  };
}

export function createNotebookCloudLifecycle({auth,db,guestRepository=createNotebookRepository(),consoleRef=console}={}){
  const accountRepository = createNotebookRepository({storage:memoryStorage(),storageKey:'notebook-account-memory'});
  const listeners = new Set();
  let current = guestRepository, user = null, cloudUnsubscribe = null, authGeneration = 0;
  const notify = () => listeners.forEach(listener => listener(current.get()));
  const forwardGuest = guestRepository.subscribe?.(() => current === guestRepository && notify());
  const forwardAccount = accountRepository.subscribe?.(() => current === accountRepository && notify());
  const documentFor = uid => db.collection('notebooks').doc(String(uid));
  const stopCloud = () => { try{ cloudUnsubscribe?.(); }catch{} cloudUnsubscribe = null; };
  const writeAccount = async snapshot => {
    if(!user) return false;
    await documentFor(user.uid).set({ownerUid:user.uid,notebook:clone(snapshot),updatedAt:Date.now()},{merge:true});
    return true;
  };

  const connectUser = async nextUser => {
    const generation = ++authGeneration;
    stopCloud();
    user = nextUser;
    const guest = clone(guestRepository.get());
    current = accountRepository;
    accountRepository.replace(createEmptyNotebook());
    notify();
    try{
      const ref = documentFor(nextUser.uid);
      const document = await ref.get();
      if(generation !== authGeneration || user?.uid !== nextUser.uid) return;
      const cloud = document.exists ? document.data()?.notebook : null;
      const merged = mergeNotebooks(cloud,guest);
      accountRepository.replace(merged);
      if(hasGuestNotebookData(guest) || !cloud?.lists?.length){
        await writeAccount(merged);
        if(generation !== authGeneration || user?.uid !== nextUser.uid) return;
        guestRepository.replace(createEmptyNotebook());
      }
      cloudUnsubscribe = ref.onSnapshot?.(snapshot => {
        if(generation !== authGeneration || user?.uid !== nextUser.uid || !snapshot.exists) return;
        const notebook = snapshot.data()?.notebook;
        if(notebook?.lists?.length) accountRepository.replace(notebook);
      },error => consoleRef.warn('notebook cloud listener failed',error)) || null;
    }catch(error){
      consoleRef.warn('guest notebook migration failed; local copy retained',error);
      accountRepository.replace(guest);
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
  accountRepository.load();
  const authUnsubscribe = auth?.onAuthStateChanged?.(nextUser => nextUser ? connectUser(nextUser) : connectGuest());

  return Object.freeze({
    load(){ return current.load(); },
    get(){ return current.get(); },
    replace(next){ const value=current.replace(next); if(user) void writeAccount(value).catch(error=>consoleRef.warn('notebook cloud write failed',error)); return value; },
    mutate(fn){ const value=current.mutate(fn); if(user) void writeAccount(value).catch(error=>consoleRef.warn('notebook cloud write failed',error)); return value; },
    subscribe(listener){ listeners.add(listener); return () => listeners.delete(listener); },
    destroy(){ ++authGeneration; stopCloud(); authUnsubscribe?.(); forwardGuest?.(); forwardAccount?.(); listeners.clear(); },
  });
}
