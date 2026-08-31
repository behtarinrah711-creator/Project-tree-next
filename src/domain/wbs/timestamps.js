export function nowIso(clock = () => new Date()){
  const value = clock();
  return value instanceof Date ? value.toISOString() : String(value);
}

export function stampCreate(record, clock){
  const ts = nowIso(clock);
  return { ...record, createdAt: record.createdAt || ts, updatedAt: record.updatedAt || ts };
}

export function stampUpdate(record, clock){
  return { ...record, createdAt: record.createdAt || nowIso(clock), updatedAt: nowIso(clock) };
}
