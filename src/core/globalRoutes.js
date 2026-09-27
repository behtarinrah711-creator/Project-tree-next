const GLOBAL_ROUTES = Object.freeze([
  Object.freeze({ path:'notebook/export', moduleId:'notebook-export', title:'خروجی دفترچه' }),
  Object.freeze({ path:'notebook', moduleId:'notebook', title:'دفترچه یادداشت' }),
  Object.freeze({ path:'profile', moduleId:'profile', title:'ثبت مشخصات' }),
  Object.freeze({ path:'management', moduleId:'management', title:'مدیریت پروژه‌ها' }),
]);

function normalizedPath(locationLike){
  return String(locationLike?.hash || '')
    .replace(/^#\/?/, '')
    .split('?')[0]
    .replace(/\/+$/, '');
}

export function getGlobalRoute(locationLike = globalThis.location){
  const path = normalizedPath(locationLike);
  return GLOBAL_ROUTES.find(route => path === route.path || path.startsWith(`${route.path}/`)) || null;
}

export function getGlobalRouteByModule(moduleId){
  return GLOBAL_ROUTES.find(route => route.moduleId === moduleId) || null;
}

