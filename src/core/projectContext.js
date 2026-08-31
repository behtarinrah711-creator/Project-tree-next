export const PROJECT_CONTEXT_EVENT = 'karha:project-context-changed';

const PROJECT_HASH_PATTERNS = [
  /(?:^|[?#&])projectId=([^&#]+)/i,
  /(?:^|[?#&])pid=([^&#]+)/i,
  /^#\/?projects\/([^/?&#]+)/i,
  /^#\/?project\/([^/?&#]+)/i,
];

function decode(value){
  try { return decodeURIComponent(value); } catch { return value; }
}

export function resolveProjectId(locationLike = window.location){
  const search = locationLike.search || '';
  const hash = locationLike.hash || '';
  const combined = `${search}${hash}`;
  for(const pattern of PROJECT_HASH_PATTERNS){
    const match = (pattern.test(hash) ? hash : combined).match(pattern);
    if(match && match[1]) return decode(match[1]);
  }
  return null;
}

export class ProjectContextStore{
  constructor(){
    this.projectId = resolveProjectId();
    this.listeners = new Set();
  }
  getProjectId(){ return this.projectId; }
  synchronizeProjects(projects, preferredProjectId = this.projectId){
    const available = Array.isArray(projects)
      ? projects.filter(project => project && !project.trashed && !project.archived)
      : [];
    const preferred = available.find(project =>
      String(project.id ?? project.projectId) === String(preferredProjectId ?? '')
    );
    const next = preferred || available[0] || null;
    this.setProjectId(next ? (next.id ?? next.projectId) : null);
    return this.projectId;
  }
  setProjectId(projectId, { silent = false } = {}){
    const next = projectId || null;
    if(next === this.projectId) return;
    this.projectId = next;
    if(!silent) this.emit();
  }
  subscribe(listener){
    this.listeners.add(listener);
    listener(this.projectId);
    return () => this.listeners.delete(listener);
  }
  emit(){
    const detail = { projectId: this.projectId };
    window.dispatchEvent(new CustomEvent(PROJECT_CONTEXT_EVENT, { detail }));
    this.listeners.forEach(listener => listener(this.projectId));
  }
  syncFromLocation(){ this.setProjectId(resolveProjectId()); }
}

export const projectContext = new ProjectContextStore();
