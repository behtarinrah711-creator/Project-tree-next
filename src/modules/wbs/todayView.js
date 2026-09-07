export const TODAY_ICON = 'M200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v255l-80 80v-175H200v400h248l80 80H200Zm0-560h560v-80H200v80Zm0 0v-80 80ZM662-60 520-202l56-56 85 85 170-170 56 57L662-60Z';

export function renderTodayView(project, documentRef = document){
  const frame = documentRef.createElement('section');
  frame.className = 'wbs-view-frame wbs-today-frame is-today-view';
  frame.dataset.view = 'today';
  if(project?.id) frame.dataset.projectId = String(project.id);

  const header = documentRef.createElement('div');
  header.className = 'wbs-view-header';

  const title = documentRef.createElement('div');
  title.className = 'wbs-view-title';
  title.textContent = 'کارهای امروز';

  const actions = documentRef.createElement('div');
  actions.className = 'wbs-view-actions';
  actions.setAttribute('aria-label', 'ابزارهای نما');

  const body = documentRef.createElement('div');
  body.className = 'wbs-view-body wbs-today-body';

  header.append(title, actions);
  frame.append(header, body);
  return frame;
}
