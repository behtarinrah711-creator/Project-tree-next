export function createLegacyModule({ id, title, route, open, render, selectors = [], dataCollections = [] }) {
  return {
    id,
    title,
    route,
    selectors,
    dataCollections,
    mount(context) {
      const projectId = context?.projectId || null;
      const legacy = window.KarhaLegacy;
      if (open && typeof legacy?.[open] === 'function') {
        legacy[open]();
      } else if (render && typeof legacy?.[render] === 'function') {
        legacy[render]();
      } else if (open && typeof window[open] === 'function') {
        window[open]();
      } else if (render && typeof window[render] === 'function') {
        window[render]();
      }
      return { projectId, moduleId: id, delegatedToLegacy: Boolean(open || render) };
    },
  };
}
