/**
 * Phase 6.5 — workspace page visibility helpers.
 * Does not own contract form history or form exit policy.
 */

const DEFAULT_PAGE_IDS = [
  'projectsPage','profilePage','calendarPage','createPage','reportsPage','accountingPage','settingsPage',
  'projectActivitiesPage','contactsPage','projectTrashPage','contractsPage','contractFormPage',
  'contractTemplateFormPage','contractTemplatesPage','activityFormPage',
];

export function hideAllWorkspacePages(documentRef = document, pageIds = DEFAULT_PAGE_IDS){
  const content = documentRef.getElementById('content');
  if(content) content.replaceChildren();
  pageIds.forEach(id => {
    const el = documentRef.getElementById(id);
    if(el) el.classList.add('hidden');
  });
}

export function showWorkspacePage(pageId, documentRef = document, pageIds = DEFAULT_PAGE_IDS){
  hideAllWorkspacePages(documentRef, pageIds);
  const el = documentRef.getElementById(pageId);
  if(el) el.classList.remove('hidden');
}

export { DEFAULT_PAGE_IDS as SHELL_WORKSPACE_PAGE_IDS };
