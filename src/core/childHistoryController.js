/* Same-route child history. Route history remains owned by core/router.js. */
(function installChildHistoryController(){
  const registrations = new Map();
  const layers = [];
  const transientStates = new Map();
  let sequence = 0;
  let handlingPop = false;
  let popSequence = 0;
  let activeTransition = null;
  let traversalTransaction = null;
  const afterPopQueue=[];
  const futurePopQueue=[];

  function closeKnownChild(key){
    if(key==='contacts'){ workspaceSubpage=null; renderSettingsWorkspace(); showOnlyWorkspacePage('settingsPage'); return; }
    if(key==='activities'){ workspaceSubpage=null; showOnlyWorkspacePage('settingsPage'); renderSettingsWorkspace(); return; }
    if(key==='projectTrash'){ workspaceSubpage=null; showOnlyWorkspacePage('settingsPage'); setBottomNavActive('Settings'); renderTabs(); renderSettingsWorkspace(); updateWorkspaceContextBar(); return; }
    if(key==='settings'){ workspaceSubpage=null; goHomeProjects(); return; }
    if(key==='reports' || key==='accounting'){ goHomeProjects(); return; }
    if(key==='contractTemplates'){ closeContractTemplatesPage(); return; }
    if(key==='contracts'){ closeContractsPage(); return; }
    if(key==='activityForm'){ requestCloseActivityForm(true); }
  }
  function registration(key){ return registrations.get(String(key)) || {onPop:()=>closeKnownChild(String(key))}; }
  function top(){ return layers[layers.length-1] || null; }
  function isOpen(key){ return layers.some(layer=>layer.key===String(key)); }
  function transientKey(key){ return `transient:${String(key)}`; }
  function releaseTraversalAfterPaint(transaction){
    if(!transaction) return;
    const release=()=>{
      if(traversalTransaction===transaction) traversalTransaction=null;
    };
    if(typeof requestAnimationFrame==='function') requestAnimationFrame(release);
    else release();
  }

  function register(key, handlers={}){
    key=String(key);
    registrations.set(key, handlers);
    return ()=>{
      registrations.delete(key);
      for(let i=layers.length-1;i>=0;i--) if(layers[i].key===key) layers.splice(i,1);
    };
  }

  function registerGuardedForm(key,{shouldIntercept,requestExit,onPop,onRestore}={}){
    key=String(key);
    return register(key,{
      onTraverse(context,layer){
        if(typeof shouldIntercept!=='function' || shouldIntercept(context,layer)!==true) return false;
        return {
          afterCancel(){ requestExit?.({source:'browser',context,layer}); }
        };
      },
      onPop,
      onRestore,
    });
  }

  function open(key, payload=null){
    key=String(key);
    const existing=layers.find(layer=>layer.key===key);
    if(existing) return existing.id;
    const layer={id:`child-${++sequence}`,key,payload};
    layers.push(layer);
    window.KarhaBrowserHistory?.push(window.KarhaBrowserHistory.stateForChild(layer),location.href);
    return layer.id;
  }

  function releaseExitProtection(layer){
    if(!layer) return;
    layer.exitProtected=false;
    for(const item of layers){
      if(String(item.id)===String(layer.id) || item.key===layer.key) item.exitProtected=false;
    }
  }

  function consume(key, {fromPopState=false, steps=1}={}){
    key=String(key);
    const index=layers.map(layer=>layer.key).lastIndexOf(key);
    if(index<0) return false;
    const [removed]=layers.splice(index,1);
    releaseExitProtection(removed);
    if(!fromPopState){
      const expected=top();
      traversalTransaction={phase:'requested',origin:'controller',to:expected?{...expected}:null};
      window.KarhaBrowserHistory?.go(-Math.max(1,steps));
    }
    return true;
  }

  function replace(key,payload=null){
    const layer=top();
    if(!layer || layer.key!==String(key)) return false;
    layer.payload=payload;
    window.KarhaBrowserHistory?.replace(window.KarhaBrowserHistory.stateForChild({...layer}),location.href);
    return true;
  }

  function afterFuturePop(callback){
    if(typeof callback!=='function') return;
    futurePopQueue.push({target:popSequence+1,callback});
  }

  function cleanupTransient(key){
    const state=transientStates.get(String(key));
    if(!state) return null;
    transientStates.delete(String(key));
    registrations.delete(state.internalKey);
    return state;
  }

  function presentTransient(key,{payload=null,onDismiss,onReady}={}){
    key=String(key);
    if(transientStates.has(key)) return false;
    const internalKey=transientKey(key);
    const state={key,internalKey,payload,onDismiss,onReady,ready:false,pendingDismiss:false,pendingAfter:null};
    transientStates.set(key,state);
    registrations.set(internalKey,{
      onPop:()=>{
        const current=cleanupTransient(key);
        if(current) current.onDismiss?.({fromBack:true,key});
      }
    });

    const openTransientEntry=()=>{
      const current=transientStates.get(key);
      if(!current) return;
      open(internalKey,{key,payload});
      current.ready=true;
      queueMicrotask(()=>{
        if(transientStates.get(key)===current) current.onReady?.({key,internalKey});
      });
      if(current.pendingDismiss){
        const after=current.pendingAfter;
        current.pendingDismiss=false;
        current.pendingAfter=null;
        dismissTransient(key,{after});
      }
    };

    const transition=activeTransition;
    if(transition?.consumed && typeof transition.restore==='function'){
      transition.restore(openTransientEntry);
    }else{
      openTransientEntry();
    }
    return true;
  }

  function dismissTransient(key,{after}={}){
    key=String(key);
    const state=transientStates.get(key);
    if(!state){ if(typeof after==='function') after(); return false; }
    if(!state.ready){
      state.pendingDismiss=true;
      state.pendingAfter=after;
      return true;
    }
    afterFuturePop(()=>{
      cleanupTransient(key);
      if(typeof after==='function') after();
    });
    if(!consume(state.internalKey,{fromPopState:false})){
      cleanupTransient(key);
      if(typeof after==='function') after();
      return false;
    }
    return true;
  }

  function onPopState(event){
    if(handlingPop) return;
    handlingPop=true;
    popSequence++;
    try{
      const target=event.state && event.state.child;
      const targetIndex=target ? layers.findIndex(layer=>layer.id===target.id) : -1;
      const controllerRequestedTraversal=traversalTransaction?.origin==='controller';
      if(!controllerRequestedTraversal && layers.length-1>targetIndex){
        const layer=layers.pop();
        let restoredDuringPolicy=false;
        const transition=Object.freeze({
          type:'pop',
          consumed:true,
          layer:{...layer},
          target:target ? {...target} : null,
          restore(onSettled){
            if(restoredDuringPolicy) return false;
            restoredDuringPolicy=true;
            layer.exitProtected=true;
            if(!layers.some(item=>String(item.id)===String(layer.id))) layers.push({...layer});
            window.KarhaBrowserHistory?.push(window.KarhaBrowserHistory.stateForChild(layer),location.href);
            onSettled?.();
            return true;
          },
        });
        const previousTransition=activeTransition;
        activeTransition=transition;
        try{
          registration(layer.key)?.onPop?.(layer.payload,transition);
        }finally{
          activeTransition=previousTransition;
        }
      }

      if(!controllerRequestedTraversal && target && targetIndex<0 && !layers.some(layer=>String(layer.id)===String(target.id))){
        const handlers=registration(target.key);
        if(handlers){
          layers.push({...target});
          handlers.onRestore?.(target.payload,Object.freeze({type:'restore',consumed:false,layer:{...target}}));
        }
      }

      const canonicalTop=top();
      const browserChild=window.KarhaBrowserHistory?.current?.()?.child||null;
      if(canonicalTop && String(browserChild?.id||'')!==String(canonicalTop.id)){
        window.KarhaBrowserHistory?.replace(window.KarhaBrowserHistory.stateForChild(canonicalTop),location.href);
      }
    }finally{
      releaseTraversalAfterPaint(traversalTransaction);
      handlingPop=false;
      afterPopQueue.splice(0).forEach(callback=>callback());
      for(let i=futurePopQueue.length-1;i>=0;i--){
        if(futurePopQueue[i].target<=popSequence){
          const [{callback}]=futurePopQueue.splice(i,1);
          callback();
        }
      }
    }
  }

  window.KarhaBrowserHistory?.registerTraversalGuard?.('child',context=>{
    const currentTop=top();
    const destination=context?.destinationState?.child||null;
    if(traversalTransaction){
      if(traversalTransaction.phase!=='requested') return true;
      if(context?.sameDocument!==true) return true;
      traversalTransaction=Object.freeze({...traversalTransaction,phase:'admitted',destination:destination?{...destination}:null});
      return false;
    }
    if(!currentTop) return false;

    const handlers=registration(currentTop.key);
    if(typeof handlers?.onTraverse==='function'){
      const claim=handlers.onTraverse(context,{...currentTop});
      if(claim){
        const transaction=Object.freeze({phase:'intercepted',origin:'browser',from:{...currentTop},destination:destination?{...destination}:null});
        traversalTransaction=transaction;
        const afterCancel=typeof claim==='object' && typeof claim.afterCancel==='function' ? claim.afterCancel : null;
        return {
          afterCancel(){
            try{ afterCancel?.(); }
            finally{ if(traversalTransaction===transaction) traversalTransaction=null; }
          }
        };
      }
    }

    if(context?.sameDocument!==true) return true;
    const predecessor=layers[layers.length-2]||null;
    traversalTransaction=Object.freeze({phase:'admitted',origin:'browser',from:{...currentTop},to:predecessor?{...predecessor}:null,destination:destination?{...destination}:null});
    return false;
  });
  window.KarhaBrowserHistory?.register('child',(_state,event)=>onPopState(event));
  window.KarhaBrowserHistory?.registerExitGuard?.('child',()=>layers.some(layer=>layer.exitProtected));
  window.KarhaChildHistory=Object.freeze({register,registerGuardedForm,open,consume,replace,isOpen,top,
    afterNextPop(callback){if(typeof callback==='function')afterPopQueue.push(callback);},
    afterFuturePop,
    presentTransient,
    dismissTransient,
    isTransientOpen:key=>transientStates.has(String(key)),
    currentTransition:()=>activeTransition,
    currentTraversalTransaction:()=>traversalTransaction,
    getDepth:()=>layers.length});
})();

function pushWorkspaceHistory(kind){ return window.KarhaChildHistory?.open(kind); }
