function timestamp(value){
  const n = Number(value);
  if(Number.isFinite(n)) return n;
  if(typeof value === 'string'){
    const parsed = Date.parse(value);
    if(Number.isFinite(parsed)) return parsed;
  }
  if(value instanceof Date){
    const parsed = value.getTime();
    if(Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function ownRecordFreshness(record){
  if(!record || typeof record !== 'object') return 0;
  return Math.max(
    timestamp(record.updatedAt),
    timestamp(record.createdAt),
    timestamp(record.completedAt),
    timestamp(record.at),
    timestamp(record.deletedAt),
  );
}

export function taskRecordFreshness(task){
  if(!task || typeof task !== 'object') return 0;
  let latest = ownRecordFreshness(task);

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

function mergeEntityArrays(first, second){
  const byId = new Map();
  const withoutId = [];
  const add = value => {
    if(!value || typeof value !== 'object') return;
    const id = String(value.id || '');
    if(!id){
      withoutId.push(value);
      return;
    }
    const current = byId.get(id);
    byId.set(id, current ? mergeEntityRecord(current, value) : value);
  };
  (Array.isArray(first) ? first : []).forEach(add);
  (Array.isArray(second) ? second : []).forEach(add);
  return [...byId.values(), ...withoutId];
}

function mergeEntityRecord(first, second){
  if(!first) return second;
  if(!second) return first;

  // Scalar fields are selected by this entity's own revision. Nested children
  // are merged independently so a newer child can never make the whole parent
  // overwrite another parent's distinct children.
  const secondIsNewer = ownRecordFreshness(second) > ownRecordFreshness(first);
  const preferred = secondIsNewer ? second : first;
  const fallback = secondIsNewer ? first : second;
  const merged = { ...fallback, ...preferred };

  if(Array.isArray(first.subtasks) || Array.isArray(second.subtasks)){
    merged.subtasks = mergeEntityArrays(first.subtasks, second.subtasks);
  }
  if(Array.isArray(first.workTasks) || Array.isArray(second.workTasks)){
    merged.workTasks = mergeEntityArrays(first.workTasks, second.workTasks);
  }
  return merged;
}

/**
 * Canonical merge for project task records used by hydration, live cloud,
 * upload and recovery. WBS children are merged by entity id rather than by
 * replacing an entire top-level tree record.
 *
 * Equal-freshness ties keep the first source for scalar fields. Distinct
 * subtasks/workTasks from every source are always retained; deletion remains
 * explicit through the entity's trashed/deleted state.
 */
export function mergeTaskRecords(groups, normalize = value => value){
  const byId = new Map();
  (Array.isArray(groups) ? groups : []).forEach(group => {
    (Array.isArray(group) ? group : []).forEach(task => {
      const value = task && normalize(task);
      const id = String(value?.id || '');
      if(!id) return;
      const current = byId.get(id);
      byId.set(id, current ? mergeEntityRecord(current, value) : value);
    });
  });
  return [...byId.values()];
}
