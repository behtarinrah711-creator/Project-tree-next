import { STORAGE_KEYS } from '../../config/deploymentConfig.js';
/** Phase 8.5 — export page notes storage (UI remains in legacy until full export module cutover). */
export const EXPORT_NOTES_KEY = STORAGE_KEYS.exportNotes;

export function loadExportNotes({ storage = localStorage } = {}){
  try{ return JSON.parse(storage.getItem(EXPORT_NOTES_KEY) || '{}') || {}; }catch(e){ return {}; }
}

export function saveExportNote(pid, text, { storage = localStorage } = {}){
  const all = loadExportNotes({ storage });
  if(text && String(text).trim()) all[pid] = text;
  else delete all[pid];
  try{ storage.setItem(EXPORT_NOTES_KEY, JSON.stringify(all)); }catch(e){}
}

export function getExportNote(pid, { storage = localStorage } = {}){
  return loadExportNotes({ storage })[pid] || '';
}

export function installExportNotesStore({ windowRef = globalThis } = {}){
  const api = Object.freeze({
    EXPORT_NOTES_KEY,
    loadExportNotes: () => loadExportNotes(),
    saveExportNote: (pid, text) => saveExportNote(pid, text),
    getExportNote: (pid) => getExportNote(pid),
  });
  windowRef.KarhaExportNotes = api;
  return api;
}
