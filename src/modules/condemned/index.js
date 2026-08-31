/**
 * Phase 6 — fully removed from product UI (code stubs may remain offline).
 */
export const CONDEMNED_MODULE_IDS = Object.freeze([
  "letters","minutes","purchases","statuses","collab","share",
]);
export function isCondemnedModuleId(id){
  return CONDEMNED_MODULE_IDS.includes(String(id||""));
}
export const CONDEMNED_ROUTE_REDIRECT = Object.freeze([
  "letters","minutes","purchases","statuses","collab","share","shareForm",
  "contract-status","contractStatus","contract-approval","status-test",
]);
export function isCondemnedRoute(moduleId){
  return CONDEMNED_ROUTE_REDIRECT.includes(String(moduleId||""));
}
