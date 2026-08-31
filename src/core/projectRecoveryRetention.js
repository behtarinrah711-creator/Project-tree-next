function projectKey(project){
  return String(project?.id ?? project?.projectId ?? '');
}

function visibleProjects(projects){
  return (Array.isArray(projects) ? projects : []).filter(project => project && projectKey(project));
}

export function mergeRetainedProjects(liveProjects, retainedProjects){
  if(!Array.isArray(liveProjects)) return { changed:false, restored:0 };
  const retained = visibleProjects(retainedProjects);
  if(!retained.length) return { changed:false, restored:0 };

  const index = new Map(liveProjects.map((project, i) => [projectKey(project), i]));
  let restored = 0;
  retained.forEach(project => {
    const key = projectKey(project);
    if(!key) return;
    const i = index.get(key);
    if(i === undefined){
      index.set(key, liveProjects.length);
      liveProjects.push(project);
      restored++;
    }
  });
  return { changed:restored > 0, restored };
}

/**
 * The legacy Firestore listeners and the migration recovery bridge are both
 * asynchronous. A late legacy snapshot can replace data.projects after the
 * recovery bridge has already restored the user's real projects. Keep the last
 * known-good recovered set and re-apply only missing projects to the *current*
 * live legacy array whenever the user re-enters a routed project surface.
 *
 * This never deletes, renames, migrates, or writes cloud records. It only
 * prevents an older empty/incomplete listener result from erasing projects that
 * were already proven readable during this authenticated session.
 */
export function installProjectRecoveryRetention({ windowRef = window } = {}){
  if(windowRef.__karhaProjectRecoveryRetentionInstalled) return false;
  windowRef.__karhaProjectRecoveryRetentionInstalled = true;

  let retained = [];
  let repairing = false;

  const capture = () => {
    const live = windowRef.KarhaLegacy?.getProjectsList?.();
    if(Array.isArray(live) && live.length){
      retained = live.filter(project => project && projectKey(project));
    }
  };

  const repair = ({ resyncRoute = false, refreshDrawer = false } = {}) => {
    if(repairing || !retained.length) return false;
    const live = windowRef.KarhaLegacy?.getProjectsList?.();
    const result = mergeRetainedProjects(live, retained);
    if(!result.changed) return false;

    repairing = true;
    try{
      windowRef.KarhaApp?.applyCloudProjectList?.(windowRef.KarhaLegacy?.getProjectsList?.() || []);
      windowRef.KarhaLegacy?.persist?.({ local:false });
      if(resyncRoute) windowRef.KarhaApp?.router?.sync?.();
      if(refreshDrawer){
        windowRef.dispatchEvent?.(new windowRef.CustomEvent('karha:drawer-open', {
          detail:{ recoveryRetention:true },
        }));
      }
    } finally {
      repairing = false;
    }
    return true;
  };

  // Capture any projects already present from local storage before the first
  // cloud snapshot. Later recovery events replace this with cloud-proven data.
  capture();

  windowRef.addEventListener?.('karha:projects-recovered', () => {
    capture();
  });

  windowRef.addEventListener?.('karha:drawer-open', event => {
    if(event?.detail?.recoveryRetention) return;
    repair({ refreshDrawer:true });
  });

  windowRef.addEventListener?.('karha:workspace-route-synced', event => {
    if(!event?.detail?.projectId) return;
    repair({ resyncRoute:true });
  });

  return true;
}
