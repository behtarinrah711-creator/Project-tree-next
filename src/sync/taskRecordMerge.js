function timestamp(value){
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function taskRecordFreshness(task){
  if(!task || typeof task !== 'object') return 0;
  let latest = Math.max(
    timestamp(task.updatedAt),
    timestamp(task.createdAt),
    timestamp(task.completedAt),
    timestamp(task.at),
  );

  const scan = array => {
    (Array.isArray(array) ? array : []).forEach(value => {
      if(!value || typeof value !== 'object') return;
      latest = Math.max(latest, taskRecordFreshness(value));
    });
  };

  scan(task.subtasks);
  scan(task.workTasks);
  scan(task.executionReports);
  scan(task.executionComments);
  scan(task.executionHistory);
  return latest;
}

/**
 * Canonical merge for project task records used by hydration, live cloud
 * listeners and recovery. Conflicts are resolved by record freshness rather
 * than caller ordering, so a stale cloud copy cannot replace newer local WBS
 * or Today data nested under the same top-level task id.
 *
 * Equal-freshness ties keep the first source so callers can deliberately put
 * their authoritative source first without duplicating merge implementations.
 */
export function mergeTaskRecords(groups, normalize = value => value){
  const byId = new Map();
  (Array.isArray(groups) ? groups : []).forEach(group => {
    (Array.isArray(group) ? group : []).forEach(task => {
      const value = task && normalize(task);
      const id = String(value?.id || '');
      if(!id) return;
      const current = byId.get(id);
      if(!current || taskRecordFreshness(value) > taskRecordFreshness(current)){
        byId.set(id, value);
      }
    });
  });
  return [...byId.values()];
}
