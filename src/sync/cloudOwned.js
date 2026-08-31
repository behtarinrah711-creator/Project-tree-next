/**
 * Phase 6.4 — ownership marker for cloud owned-only sync.
 * Behavior (mergePolicy, anti-empty, owner-only visibility) remains implemented
 * in legacy until a pure move without behavior change is verified.
 * Domain/UI must not call Firestore sharedWith paths.
 *
 * Active policy (must stay identical):
 * - Listen: projects where ownerUid == current uid only
 * - Merge collections via KarhaApp.mergePolicy
 * - applyCloudSnapshot to repository after merges
 */

export const CLOUD_SYNC_POLICY = Object.freeze({
  mode: 'owned-only',
  sharedWith: 'disabled',
  mergePolicy: 'KarhaApp.mergePolicy',
  applyPath: 'KarhaApp.applyCloudSnapshot',
});

export function assertOwnedOnlyCloudPolicy(){
  return CLOUD_SYNC_POLICY.mode === 'owned-only' && CLOUD_SYNC_POLICY.sharedWith === 'disabled';
}
