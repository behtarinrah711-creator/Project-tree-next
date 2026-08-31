/**
 * Guest: hide ownerUid projects until login.
 * Authenticated: only projects owned by this uid (Phase 5 — no sharedWith visibility).
 */
export function isProjectVisibleForSession(project, session){
  if(!project) return false;
  if(!session || session.ready === false) return true;
  if(!session.uid){
    return !project.ownerUid;
  }
  // Logged in: owner only. Shared-collaborator path removed in Phase 5.
  if(!project.ownerUid) return true; // local/guest-origin still owned after migrate
  return String(project.ownerUid) === String(session.uid);
}

export function projectsVisibleForSession(projects, session){
  const list = Array.isArray(projects) ? projects : [];
  return list.filter(project => isProjectVisibleForSession(project, session));
}
