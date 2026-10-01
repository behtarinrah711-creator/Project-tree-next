import {
  canDeletePermission, canViewPermission, canWritePermission, projectPermissionState,
} from './permissionState.js';

export const PLANNING_PERMISSION_BY_VIEW = Object.freeze({
  tree:'planning:tree',
  timeline:'planning:timeline',
  costline:'planning:costline',
});

export const PLANNING_ACCESS_LEVELS = Object.freeze([
  Object.freeze({id:'none',label:'بدون دسترسی'}),
  Object.freeze({id:'view',label:'مشاهده'}),
  Object.freeze({id:'create',label:'ثبت و ویرایش'}),
  Object.freeze({id:'full',label:'دسترسی کامل (ثبت، ویرایش و حذف)'}),
]);

const PLANNING_PERMISSION_KEYS=Object.freeze(Object.values(PLANNING_PERMISSION_BY_VIEW));

export function planningPermissionState(projectId,windowRef=globalThis.window){
  return projectPermissionState(projectId,PLANNING_PERMISSION_KEYS,windowRef);
}

export function planningAccessLevel(projectId,viewId,windowRef=globalThis.window){
  const key=PLANNING_PERMISSION_BY_VIEW[viewId];
  return key?planningPermissionState(projectId,windowRef).levels[key]:'none';
}

export const canViewPlanning=canViewPermission;
export const canWritePlanning=canWritePermission;
export const canDeletePlanning=canDeletePermission;

export function firstAllowedPlanningView(projectId,views=['tree','timeline','costline'],windowRef=globalThis.window){
  return views.find(view=>canViewPlanning(planningAccessLevel(projectId,view,windowRef))) || null;
}
