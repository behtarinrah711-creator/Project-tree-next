import { appRouter } from '../core/router.js';
import { moduleRegistry } from '../core/moduleRegistry.js';
import { projectContext } from '../core/projectContext.js';
import { projectRepository } from '../data/projectRepository.js';
import { projectModules } from '../modules/index.js';
import { listProjects, getProject, getActiveProject, selectProject } from '../core/projectWorkspace.js';
import { taskRuntimeModule } from '../modules/tasks/taskRuntimeModule.js';
import { createProjectTrashView } from '../modules/trash/projectTrashView.js';
import { createProjectManagementView } from '../modules/projects/projectManagementView.js';
import { loadApplicationRuntime } from './applicationRuntimeLoader.js';
import { exposeKarhaLegacyInstaller } from '../legacy/karhaLegacyFacade.js';
import { installAppDataStore } from '../data/appDataStore.js';
import { installHtmlEscape } from '../core/htmlEscape.js';
import { reconcileDrawerProjectList } from '../core/drawerProjectList.js';
import { startCloudProjectRecovery } from '../core/cloudProjectRecovery.js';
import { installProjectRouteSurfaceSync } from '../core/projectRouteSurface.js';
import { installProjectRecoveryRetention } from '../core/projectRecoveryRetention.js';
import { installSoftDelete } from '../core/softDelete.js';
import { installWorkspaceChrome } from '../ui/workspaceChrome.js';
import { installContractFormExitBridge } from '../modules/contracts/contractFormExitBridge.js';
import { installContractShellView } from '../modules/contracts/contractShellView.js';
import { installContractItemDrag } from '../modules/contracts/contractItemDrag.js';
import { installLogoutSessionGuard } from './logoutSessionGuard.js';
import { getSession, installSessionObserver } from '../core/session.js';
import { activityApi } from '../domain/activityApi.js';
import { contactApi } from '../domain/contactApi.js';
import { contractApi } from '../domain/contractApi.js';
import { taskApi } from '../domain/taskApi.js';
import { projectApi } from '../domain/projectApi.js';
import * as mergePolicy from '../domain/mergePolicy.js';
import { registerPersistImpl, createPersistOrchestrator } from '../sync/persistAdapter.js';
import { applyCloudSnapshot, applyCloudProjectList } from '../sync/applyCloudSnapshot.js';
import { startOwnedCloudListeners, stopOwnedCloudListeners } from '../sync/cloudListeners.js';
import { docToProjectFromCloud } from '../sync/docToProject.js';
import { mergeOwnedCloudSnapshots } from '../sync/mergeCloudSnapshots.js';
import { writeTaskRecordsNormalized, attachCloudTaskListener } from '../sync/taskCloud.js';
import { cloudSyncProjectFull } from '../sync/cloudSyncProject.js';
import { applyOwnedCloudProjects, createOwnedSnapshotHandler } from '../sync/cloudHydration.js';
import {
  readProjectStatusQueue, writeProjectStatusQueue, queueProjectStatus, dequeueProjectStatus,
  writeProjectStatusVerified, flushProjectStatusQueue, scheduleProjectStatusRetry, cloudSyncProjectStatus,
} from '../sync/projectStatusSync.js';
import { registerFormRuntimes, getActivityFormRuntime, getContactFormRuntime } from '../ui/formRuntimes.js';
import { showToast as uiShowToast } from '../ui/toast.js';
import { installUiPrimitives } from '../ui/installUiPrimitives.js';
import { installNotebookWorkspace } from '../modules/notebook/notebookView.js';
import { installProfileStore } from '../modules/profile/profileStore.js';
import { installProfileView } from '../modules/profile/profileView.js';
import { installBrowserHistory } from '../core/browserHistory.js';
import { installExportNotesStore } from '../modules/export/exportNotesStore.js';
import { installExportView } from '../modules/export/exportView.js';
import { showWorkspacePage, hideAllWorkspacePages, SHELL_WORKSPACE_PAGE_IDS } from '../ui/shellSurface.js';
import { installFirebaseRuntime } from '../firebase/firebaseRuntime.js';
import { createCloudRuntime } from '../cloud/cloudRuntime.js';
import { runDataMigrations, normalizeProjectScopedData } from '../data/migrations/index.js';
import * as projectFactories from '../data/projectFactories.js';
import * as taskTree from '../domain/taskTree.js';
import { normalizeEmail, isFloatingConfirmUser } from '../config/featurePolicy.js';
import * as formatting from '../ui/digits.js';
import { taskIcons } from '../ui/taskIcons.js';
import * as projectRecordReferences from '../domain/projectRecordReferences.js';
import { installApplicationTheme } from '../core/applicationTheme.js';
import { createFoundationCloudRuntime } from '../cloud/foundationCloudComposition.js';

/** Start the modular API, then the classic application runtime, then routing. */
export async function startApplication({
  windowRef = window,
  registry = moduleRegistry,
  modules = projectModules,
  router = appRouter,
  loadRuntime = loadApplicationRuntime,
} = {}){
  exposeKarhaLegacyInstaller({ windowRef });
  installApplicationTheme({windowRef,documentRef:windowRef.document});
  modules.forEach(moduleDefinition => registry.register(moduleDefinition));

  const application = Object.freeze({
    modules: registry,
    router,
    projectContext,
    projectRepository,
    taskRuntime: taskRuntimeModule,
    createProjectTrashView,
    createProjectManagementView,
    reconcileDrawerProjectList,
    projectWorkspace: Object.freeze({ listProjects, getProject, getActiveProject, selectProject }),
    getSession,
    activityApi,
    contactApi,
    contractApi,
    taskApi,
    projectApi,
    mergePolicy,
    createPersistOrchestrator,
    applyCloudSnapshot,
    applyCloudProjectList,
    startOwnedCloudListeners,
    stopOwnedCloudListeners,
    docToProjectFromCloud,
    mergeOwnedCloudSnapshots,
    writeTaskRecordsNormalized,
    attachCloudTaskListener,
    cloudSyncProjectFull,
    applyOwnedCloudProjects,
    createOwnedSnapshotHandler,
    readProjectStatusQueue,
    writeProjectStatusQueue,
    queueProjectStatus,
    dequeueProjectStatus,
    writeProjectStatusVerified,
    flushProjectStatusQueue,
    scheduleProjectStatusRetry,
    cloudSyncProjectStatus,
    registerFormRuntimes,
    getActivityFormRuntime,
    getContactFormRuntime,
    showToast: uiShowToast,
    shellSurface: Object.freeze({ showWorkspacePage, hideAllWorkspacePages, SHELL_WORKSPACE_PAGE_IDS }),
    createCloudRuntime,
    foundation: Object.freeze({
      runDataMigrations,
      normalizeProjectScopedData,
      projectFactories: Object.freeze({ ...projectFactories }),
      taskTree: Object.freeze({ ...taskTree }),
      featurePolicy: Object.freeze({ normalizeEmail, isFloatingConfirmUser }),
      formatting: Object.freeze({ ...formatting }),
      taskIcons,
      projectRecordReferences: Object.freeze({ ...projectRecordReferences }),
      createCloudRuntime: createFoundationCloudRuntime,
    }),
  });
  windowRef.KarhaApp = application;

  // D1: AppDataStore must exist before classic loadData() runs.
  installAppDataStore({ windowRef, schemaVersion: 8 });
  installFirebaseRuntime({windowRef});
  installHtmlEscape({ windowRef });
  installBrowserHistory({windowRef});
  await loadRuntime();
  // Attach after install so KarhaApp holds the live store reference.
  if(windowRef.KarhaApp && windowRef.KarhaAppData){
    try{
      Object.defineProperty(windowRef, '__karhaAppDataBound', { value: true });
    }catch(e){}
  }
  // Phase 8.2: UI primitives own toast/confirm/numpad/jalali (no new DOM ownership in legacy).
  installUiPrimitives({ windowRef, documentRef: windowRef.document });
  installNotebookWorkspace({ windowRef, documentRef: windowRef.document });
  installProfileStore({ windowRef });
  installProfileView({ windowRef, documentRef: windowRef.document });
  installExportNotesStore({ windowRef });
  installExportView({ windowRef, documentRef: windowRef.document });
  // Phase 4.2: Domain APIs call persistAdapter; legacy remains the implementation
  // until cloud/persist are fully extracted. Auth stays in legacy.
  registerPersistImpl({
    markDirty(projectId){ windowRef.KarhaLegacy?.markDirty?.(projectId); },
    persist(options){ windowRef.KarhaLegacy?.persist?.(options); },
  });
  // Observe uid only. Does not own login, logout, or cloud migrate.
  installSessionObserver({windowRef});
  installSoftDelete({ windowRef, documentRef: windowRef.document });
  installWorkspaceChrome({
    windowRef,
    documentRef: windowRef.document,
    getPresentationState: () => windowRef.KarhaLegacy?.getWorkspaceChromeState?.() || {},
    navigateFooter: moduleId => windowRef.KarhaLegacy?.navigateFooter?.(moduleId),
    goHomeProjects: () => windowRef.KarhaLegacy?.goHomeProjects?.(),
    renderDrawerProjectList: () => windowRef.KarhaLegacy?.renderDrawerProjectList?.(),
    clearWorkspaceSubpage: () => windowRef.KarhaLegacy?.clearWorkspaceSubpage?.(),
    clearMenuRoot: () => windowRef.KarhaLegacy?.clearMenuRoot?.(),
    renderProjectsSurface: () => windowRef.KarhaLegacy?.renderAll?.(),
    handleContextBack: () => windowRef.KarhaLegacy?.handleWorkspaceContextBack?.(),
    handleContextAction: () => windowRef.KarhaLegacy?.handleWorkspaceContextAction?.(),
  });
  // Contract forms use a reusable baseline/dirty policy. New records may save
  // drafts; edits never draft and save changes back to the same contract.
  installContractFormExitBridge({windowRef});
  installContractShellView({ windowRef, documentRef: windowRef.document });
  installContractItemDrag({ windowRef });
  // Logout is a session boundary. Clear Project-tree's local user cache only
  // when Firebase actually transitions from an authenticated user to guest,
  // then reload so legacy in-memory recovery state cannot resurrect it.
  installLogoutSessionGuard({windowRef});
  // Workspace Chrome owns route presentation; Router remains the route owner.
  installProjectRouteSurfaceSync({windowRef,documentRef:windowRef.document});
  // Preserve the last known-good project set across the migration boundary.
  // A later legacy Firestore snapshot must not erase projects already restored
  // by the authenticated recovery bridge during this same session.
  installProjectRecoveryRetention({windowRef});
  router.start();
  // Recovery runs beside the legacy listeners and only adds readable project
  // records back into the live array. This covers pre-ownerUid cloud documents
  // and protects login from listener-order races without changing cloud data.
  startCloudProjectRecovery({windowRef,projectContext,router});
  windowRef.dispatchEvent(new windowRef.CustomEvent('karha:ready'));
  return application;
}
