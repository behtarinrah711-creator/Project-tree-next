export function renderAccountSession(documentRef,user){
  const name=documentRef.getElementById('drawerAccountName'),sub=documentRef.getElementById('drawerAccountSub');
  const button=documentRef.getElementById('drawerSigninBtn'),headerImg=documentRef.getElementById('avatarImg');
  const headerIcon=documentRef.getElementById('avatarDefaultIcon'),drawerImg=documentRef.getElementById('drawerAvatarImg');
  const drawerIcon=documentRef.getElementById('drawerAvatarDefaultIcon');
  if(!name||!sub||!button||!headerImg||!headerIcon||!drawerImg||!drawerIcon) return;
  if(user){
    name.textContent=user.displayName||'کاربر گوگل';sub.textContent=user.email||'';button.textContent='خروج از حساب';
    if(user.photoURL){headerImg.src=user.photoURL;headerImg.classList.remove('hidden');headerIcon.classList.add('hidden');drawerImg.src=user.photoURL;drawerImg.classList.remove('hidden');drawerIcon.classList.add('hidden');}
  }else{
    name.textContent='مهمان';sub.textContent='وارد نشده‌اید';button.textContent='ورود با گوگل';
    headerImg.classList.add('hidden');headerIcon.classList.remove('hidden');drawerImg.classList.add('hidden');drawerIcon.classList.remove('hidden');
  }
}

export function createFirebaseSession({auth,documentRef=document,onAuthenticated,onGuest,onOnline,windowRef=window}={}){
  let currentUser=null,cloudMode=false;
  const session=()=>({currentUser,cloudMode});
  const unsubscribe=auth.onAuthStateChanged(async user=>{
    currentUser=user||null;cloudMode=!!user;renderAccountSession(documentRef,currentUser);
    if(user) await onAuthenticated?.(user); else await onGuest?.();
  });
  const online=()=>{if(cloudMode)onOnline?.();};
  windowRef.addEventListener?.('online',online);
  return Object.freeze({
    get currentUser(){return currentUser;},get cloudMode(){return cloudMode;},getSession:session,
    signOut:()=>auth.signOut(),destroy(){unsubscribe?.();windowRef.removeEventListener?.('online',online);},
  });
}
