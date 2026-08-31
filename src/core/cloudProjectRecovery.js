function normalizeEmail(value){
  return String(value || '').trim().toLowerCase();
}

function asArray(value){
  return Array.isArray(value) ? value : [];
}

function mergeById(primary, fallback){
  const byId = new Map();
  [...asArray(primary), ...asArray(fallback)].forEach(item=>{
    if(!item || item.id == null) return;
    const key=String(item.id);
    if(!byId.has(key)) byId.set(key,item);
  });
  return Array.from(byId.values());
}

function hasOwn(object,key){
  return !!object && Object.prototype.hasOwnProperty.call(object,key);
}

export function projectFromCloudDoc(doc,user,existing=null){
  const data = doc?.data?.() || {};
  const email = normalizeEmail(data.ownerEmail);
  const userEmail = normalizeEmail(user?.email);
  const inferredOwnerUid = data.ownerUid || (user?.uid && email && email===userEmail ? user.uid : undefined);
  const pickArray = key => hasOwn(data,key) ? asArray(data[key]) : asArray(existing?.[key]);
  return {
    ...(existing || {}),
    id: doc.id,
    name: data.name ?? existing?.name ?? 'پروژه بدون نام',
    type: 'project',
    tasks: mergeById(asArray(data.tasks),asArray(existing?.tasks)),
    contacts: pickArray('contacts'),
    activityTemplates: pickArray('activityTemplates'),
    contractTemplates: pickArray('contractTemplates'),
    contracts: pickArray('contracts'),
    contractStatusReports: pickArray('contractStatusReports'),
    completedOpen: data.completedOpen===undefined ? !!existing?.completedOpen : !!data.completedOpen,
    ownerUid: inferredOwnerUid,
    ownerEmail: email || normalizeEmail(existing?.ownerEmail),
    sharedWith: hasOwn(data,'sharedWith') ? asArray(data.sharedWith).map(normalizeEmail).filter(Boolean) : asArray(existing?.sharedWith),
    trashed: data.trashed===undefined ? !!existing?.trashed : !!data.trashed,
    archived: data.archived===undefined ? !!existing?.archived : !!data.archived,
    schemaVersion: Number(data.schemaVersion || existing?.schemaVersion || 1),
    expanded: true,
  };
}

export function mergeRecoveredProjects(liveProjects,recoveredProjects){
  const live=Array.isArray(liveProjects)?liveProjects:[];
  const index=new Map(live.map((project,i)=>[String(project?.id ?? project?.projectId ?? ''),i]));
  asArray(recoveredProjects).forEach(project=>{
    const key=String(project?.id ?? project?.projectId ?? '');
    if(!key) return;
    const i=index.get(key);
    if(i===undefined){
      index.set(key,live.length);
      live.push(project);
    }else{
      live[i]=project;
    }
  });
  return live;
}

export function chooseRecoveredProjectId(projects,{activeProjectId=null,contextProjectId=null,routeProjectId=null}={}){
  const visible=asArray(projects).filter(project=>project && !project.trashed && !project.archived);
  const ids=new Set(visible.map(project=>String(project.id ?? project.projectId)));
  for(const candidate of [activeProjectId,contextProjectId,routeProjectId]){
    if(candidate!=null && ids.has(String(candidate))) return String(candidate);
  }
  return visible.length ? String(visible[0].id ?? visible[0].projectId) : null;
}

function routeProjectId(windowRef){
  const explicit=windowRef?.KarhaRoute?.projectId;
  if(explicit) return String(explicit);
  const match=String(windowRef?.location?.hash || '').match(/^#\/?projects?\/([^/?&#]+)/i);
  if(!match?.[1]) return null;
  try{return decodeURIComponent(match[1]);}catch{return match[1];}
}

function dedupeDocs(groups){
  const byId=new Map();
  groups.flat().forEach(doc=>{if(doc?.id!=null) byId.set(String(doc.id),doc);});
  return Array.from(byId.values());
}

function refreshOpenDrawer(windowRef){
  const drawer=windowRef?.document?.getElementById?.('drawerOverlay');
  if(!drawer || drawer.classList?.contains?.('hidden')) return;
  try{ windowRef.dispatchEvent(new windowRef.CustomEvent('karha:drawer-open')); }catch{}
}

/**
 * Recovery bridge for project documents created before the ownerUid migration.
 * It never deletes or rewrites cloud documents. It only merges every readable
 * ownership source into the live legacy project array and restores a valid
 * active project when the legacy listeners temporarily emptied that array.
 */
export function startCloudProjectRecovery({windowRef=window,projectContext,router}={}){
  const firebaseRef=windowRef?.firebase;
  if(!firebaseRef?.auth || !firebaseRef?.firestore) return ()=>{};
  const auth=firebaseRef.auth();
  const db=firebaseRef.firestore();
  let sourceUnsubs=[];
  let authUnsub=null;
  let generation=0;

  const stopSources=()=>{
    sourceUnsubs.forEach(unsub=>{try{unsub?.();}catch{}});
    sourceUnsubs=[];
  };

  const attach=user=>{
    generation++;
    const token=generation;
    stopSources();
    if(!user) return;

    const email=normalizeEmail(user.email);
    const sources={owned:[],ownerEmail:[],shared:[]};
    const hydrated=new Set();
    const hydrating=new Set();
    let running=false;
    let rerun=false;

    const recover=async()=>{
      if(running){rerun=true;return;}
      running=true;
      try{
        do{
          rerun=false;
          if(token!==generation) return;
          const docs=dedupeDocs([sources.owned,sources.ownerEmail,sources.shared]);
          if(!docs.length) continue;

          const legacy=windowRef.KarhaLegacy;
          const live=legacy?.getProjectsList?.();
          if(!Array.isArray(live)) continue;
          const existingById=new Map(live.map(project=>[String(project?.id ?? project?.projectId ?? ''),project]));
          const recovered=docs.map(doc=>projectFromCloudDoc(doc,user,existingById.get(String(doc.id))));
          mergeRecoveredProjects(live,recovered);

          const activeId=windowRef.KarhaAppData?.getActiveTab?.()
            || legacy?.getActiveProjectId?.() || null;
          const contextId=projectContext?.getProjectId?.() || null;
          const preferred=chooseRecoveredProjectId(live,{
            activeProjectId:activeId,
            contextProjectId:contextId,
            routeProjectId:routeProjectId(windowRef),
          });

          // If the legacy snapshot race erased the active project, route through
          // the modular selection lifecycle so activeTab, Context, Router and UI
          // are restored together. Otherwise keep the user's current project.
          const activeStillExists=activeId && live.some(project=>String(project.id)===String(activeId) && !project.trashed && !project.archived);
          if(preferred && !activeStillExists){
            const selected=windowRef.KarhaApp?.projectWorkspace?.selectProject?.(preferred,{moduleId:'dashboard',replace:true});
            if(!selected){
              windowRef.KarhaAppData?.setActiveTab?.(preferred);
              projectContext?.setProjectId?.(preferred);
              router?.navigate?.(preferred,'dashboard',{replace:true});
            }
          }else if(preferred && !projectContext?.getProjectId?.()){
            projectContext?.setProjectId?.(preferred);
            router?.navigate?.(preferred,'dashboard',{replace:true});
          }
          legacy?.persist?.();
          refreshOpenDrawer(windowRef);

          for(const project of recovered){
            const projectId=String(project.id);
            if(token!==generation || hydrated.has(projectId) || hydrating.has(projectId)) continue;
            hydrating.add(projectId);
            try{
              const snap=await db.collection('projects').doc(project.id).collection('tasks').get();
              if(token!==generation) return;
              const taskDocs=snap.docs.map(taskDoc=>({id:taskDoc.id,...(taskDoc.data?.() || {})}));
              if(taskDocs.length){
                const current=legacy?.getProject?.(project.id) || live.find(item=>String(item.id)===projectId);
                if(current){
                  current.tasks=mergeById(taskDocs,current.tasks);
                  legacy?.persist?.();
                  const active=legacy?.getActiveProjectId?.();
                  const moduleId=windowRef?.KarhaRoute?.moduleId || 'dashboard';
                  if(String(active)===projectId && moduleId==='dashboard') legacy?.renderAll?.();
                }
              }
              // Mark hydration complete only after Firestore answered successfully.
              // A transient failure during a fresh login must be retried by the
              // next ownership/shared snapshot instead of hiding tasks all session.
              hydrated.add(projectId);
            }catch(err){
              console.warn('project task recovery skipped; will retry',project.id,err);
            }finally{
              hydrating.delete(projectId);
            }
          }

          windowRef.dispatchEvent?.(new windowRef.CustomEvent('karha:projects-recovered',{detail:{count:live.length,projectId:preferred}}));
        }while(rerun);
      }finally{
        running=false;
      }
    };

    const listen=(name,query)=>{
      try{
        const unsub=query.onSnapshot(snap=>{
          sources[name]=snap.docs || [];
          recover();
        },err=>{
          console.warn('project recovery source failed',name,err);
          sources[name]=[];
          recover();
        });
        sourceUnsubs.push(unsub);
      }catch(err){
        console.warn('project recovery source unavailable',name,err);
      }
    };

    listen('owned',db.collection('projects').where('ownerUid','==',user.uid));
    if(email) listen('ownerEmail',db.collection('projects').where('ownerEmail','==',email));
    // Phase 5: no sharedWith recovery listener
    // if(email) listen('shared',...);
  };

  // Firebase immediately emits the current auth state to this listener, so do
  // not attach a second copy from auth.currentUser.
  authUnsub=auth.onAuthStateChanged(attach);
  return ()=>{generation++;stopSources();try{authUnsub?.();}catch{}};
}
