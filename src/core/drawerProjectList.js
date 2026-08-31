function projectKey(project){
  return String(project?.id ?? project?.projectId ?? '');
}

const SELECT_HANDLER = Symbol('drawerProjectSelectHandler');

export function resolveDrawerProjectState(projects, {
  activeProjectId = null,
  windowRef = typeof window !== 'undefined' ? window : null,
} = {}){
  const supplied = Array.isArray(projects) ? projects : [];
  const fromWorkspace = windowRef?.KarhaApp?.projectWorkspace?.listProjects?.();
  const source = supplied.length
    ? supplied
    : (Array.isArray(fromWorkspace) ? fromWorkspace : supplied);

  const contextProjectId = windowRef?.KarhaApp?.projectContext?.getProjectId?.() || null;
  const selectedProjectId = contextProjectId || (activeProjectId && activeProjectId !== 'starred' ? activeProjectId : null);

  return { projects: source, activeProjectId: selectedProjectId };
}

/**
 * Reconcile drawer rows by project id so an in-flight pointer interaction is
 * not detached merely because a cloud snapshot refreshed the project list.
 */
export function reconcileDrawerProjectList(list, projects, {
  activeProjectId = null,
  createRow,
  updateRow,
  onSelect,
} = {}){
  if(!list || typeof createRow !== 'function' || typeof updateRow !== 'function') return [];

  const resolved = resolveDrawerProjectState(projects, { activeProjectId });
  const effectiveProjects = resolved.projects;
  const effectiveActiveProjectId = resolved.activeProjectId;

  const existing = new Map();
  Array.from(list.children || []).forEach(row => {
    const id = row?.dataset?.projectId;
    if(id) existing.set(String(id), row);
  });

  const rows = effectiveProjects.map(project => {
    const id = projectKey(project);
    let row = existing.get(id);
    if(!row){
      row = createRow();
      row.addEventListener('click', event => {
        const clickedId = event.currentTarget?.dataset?.projectId;
        if(clickedId) event.currentTarget[SELECT_HANDLER]?.(clickedId);
      });
    }
    row.dataset.projectId = id;
    row[SELECT_HANDLER] = onSelect;
    updateRow(row, project, String(effectiveActiveProjectId ?? '') === id);
    return row;
  });

  list.replaceChildren(...rows);
  return rows;
}
