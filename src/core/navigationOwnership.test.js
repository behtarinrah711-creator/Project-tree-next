import assert from 'node:assert/strict';
import test from 'node:test';
import { createAppDataStore } from '../data/appDataStore.js';

function memoryStorage(){
  const values=new Map();
  return {
    getItem:key=>values.get(key) ?? null,
    setItem:(key,value)=>values.set(key,String(value)),
  };
}

test('drawer/project selection uses one Store and Router transaction without a legacy fallback', async()=>{
  const previousWindow=globalThis.window;
  const storage=memoryStorage();
  const store=createAppDataStore({storage});
  store.replaceSnapshot({projects:[{id:'A',name:'A'},{id:'B',name:'B'}],activeTab:'A',viewMode:'simple'});
  const navigations=[];
  let legacySelections=0;
  const drawer={classList:{add(value){this.value=value;}}};
  globalThis.window={
    KarhaAppData:store,
    KarhaLegacy:{selectProject(){legacySelections++;return true;}},
    KarhaApp:{router:{navigate(projectId,moduleId,options){navigations.push({projectId,moduleId,options});return true;}}},
    document:{getElementById:id=>id==='drawerOverlay'?drawer:null},
    location:{hash:'',search:''},
    dispatchEvent(){},
  };
  try{
    const workspace=await import(`./projectWorkspace.js?d6=${Date.now()}`);
    assert.equal(workspace.selectProject('B',{moduleId:'contracts',replace:true,closeDrawer:true}),true);
    assert.equal(store.getActiveTab(),'B');
    assert.deepEqual(navigations,[{projectId:'B',moduleId:'contracts',options:{replace:true}}]);
    assert.equal(drawer.classList.value,'hidden');
    assert.equal(legacySelections,0);
    assert.equal(JSON.parse(storage.getItem(store.STORAGE_KEY)).activeTab,'B');
  }finally{
    if(previousWindow===undefined) delete globalThis.window;
    else globalThis.window=previousWindow;
  }
});

test('an unknown project cannot diverge Store selection from Router', async()=>{
  const previousWindow=globalThis.window;
  const store=createAppDataStore({storage:memoryStorage()});
  store.replaceSnapshot({projects:[{id:'A'}],activeTab:'A'});
  let routed=false;
  globalThis.window={
    KarhaAppData:store,
    KarhaApp:{router:{navigate(){routed=true;return true;}}},
    location:{hash:'',search:''},
    dispatchEvent(){},
  };
  try{
    const workspace=await import(`./projectWorkspace.js?d6-missing=${Date.now()}`);
    assert.equal(workspace.selectProject('legacy-only'),false);
    assert.equal(store.getActiveTab(),'A');
    assert.equal(routed,false);
  }finally{
    if(previousWindow===undefined) delete globalThis.window;
    else globalThis.window=previousWindow;
  }
});


test('Saosa invited project is selected and routed on the first click despite a different ownerUid', async()=>{
  const previousWindow=globalThis.window;
  const storage=memoryStorage();
  const store=createAppDataStore({storage});
  store.replaceSnapshot({projects:[{id:'shared',ownerUid:'project-owner'}],activeTab:null});
  const navigations=[];
  globalThis.window={
    KarhaAppData:store,
    KarhaApp:{router:{navigate(projectId,moduleId,options){navigations.push({projectId,moduleId,options});return true;}}},
    location:{hostname:'saosa.ir',hash:'',search:''},
    localStorage:{
      ...storage,
      getItem(key){
        if(key==='saosa:v1:sms-session') return JSON.stringify({token:'token',phone:'09120000000',expiresAt:Date.now()+60_000});
        return storage.getItem(key);
      },
    },
    document:{getElementById:()=>null},
    dispatchEvent(){},
  };
  try{
    const workspace=await import(`./projectWorkspace.js?invited=${Date.now()}`);
    assert.equal(workspace.selectProject('shared',{moduleId:'dashboard',closeDrawer:true}),true);
    assert.equal(store.getActiveTab(),'shared');
    assert.deepEqual(navigations,[{projectId:'shared',moduleId:'dashboard',options:{replace:false}}]);
  }finally{
    if(previousWindow===undefined) delete globalThis.window;
    else globalThis.window=previousWindow;
  }
});
