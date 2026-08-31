/**
 * Phase 6.6 — Activity/Contact form runtimes owned outside legacy monolith.
 * Legacy registers dependencies once; modules prefer KarhaApp.formRuntimes.
 * Does not touch contract form / history.
 */

let activityFormRuntime = null;
let contactFormRuntime = null;

export function registerFormRuntimes(deps = {}){
  const d = deps;
  activityFormRuntime = Object.freeze({
    uid: d.uid,
    getCurrentProjectId: d.getCurrentProjectId,
    showToast: d.showToast,
    enterActivityForm: d.enterActivityForm,
    leaveActivityForm: d.leaveActivityForm,
    pushWorkspaceHistory: d.pushWorkspaceHistory,
    renderActivities(projectId){
      window.KarhaApp?.modules?.get('activities')?.render(projectId);
    },
    persistActivities(projectId){
      const project = d.findProject?.(projectId);
      if(project) d.markDirty?.(project.id);
      d.persist?.({ local:false });
    },
  });

  contactFormRuntime = Object.freeze({
    uid: d.uid,
    getCurrentProject: d.getCurrentProject,
    getActivities(projectId){
      const project = d.findProject?.(projectId);
      return project ? (d.getActivityTemplates?.(project) || []) : [];
    },
    openNumpadGeneric: d.openNumpadGeneric,
    setInternalFormMode: d.setInternalFormMode,
    showIncompleteFormExitChoice: d.showIncompleteFormExitChoice,
    showToast: d.showToast,
    markDirty: d.markDirty,
    renderContacts(projectId){
      window.KarhaApp?.modules?.get('people')?.render(projectId);
    },
    closeContactsToSettings: d.closeContactsToSettings,
    persistContacts(projectId){
      const project = d.findProject?.(projectId);
      if(project) d.markDirty?.(project.id);
      d.persist?.({ local:false });
    },
  });

  return { activityFormRuntime, contactFormRuntime };
}

export function getActivityFormRuntime(){
  return activityFormRuntime;
}

export function getContactFormRuntime(){
  return contactFormRuntime;
}
