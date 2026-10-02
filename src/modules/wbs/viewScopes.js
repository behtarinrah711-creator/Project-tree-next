// Each workspace category owns its own views and selection. Shared WBS data
// does not imply a shared navigation surface or a hidden set of other tabs.
export const WBS_VIEW_SCOPES = Object.freeze({
  planning: Object.freeze({ scope:'planning', views:['tree','timeline','costline'], defaultView:'tree' }),
  execution: Object.freeze({ scope:'execution', views:['today','shopping'], defaultView:'today' }),
});

export function activeWbsScope(windowRef = globalThis.window){
  const route = String(windowRef?.location?.hash || '').match(/^#\/projects\/[^/]+\/(planning|execution)(?:[/?]|$)/);
  return route?.[1] || windowRef?.KarhaRoute?.moduleId || null;
}
