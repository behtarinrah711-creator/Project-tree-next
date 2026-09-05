export const SHOPPING_ICON = 'M221-120q-27 0-48-16.5T144-179L42-549q-5-19 6.5-35T80-600h190l176-262q5-8 14-13t19-5q10 0 19 5t14 13l176 262h192q20 0 31.5 16t6.5 35L816-179q-8 26-29 42.5T739-120H221Zm-1-80h520l88-320H132l88 320Zm316.5-103.5Q560-327 560-360t-23.5-56.5Q513-440 480-440t-56.5 23.5Q400-393 400-360t23.5 56.5Q447-280 480-280t56.5-23.5ZM367-600h225L479-768 367-600Zm113 240Z';

export function renderShoppingView(project, documentRef = document){
  const frame = documentRef.createElement('section');
  frame.className = 'wbs-view-frame wbs-shopping-frame is-shopping-view';
  frame.dataset.view = 'shopping';
  if(project?.id) frame.dataset.projectId = String(project.id);

  const header = documentRef.createElement('div');
  header.className = 'wbs-view-header';

  const title = documentRef.createElement('div');
  title.className = 'wbs-view-title';
  title.textContent = 'لیست خرید';

  const actions = documentRef.createElement('div');
  actions.className = 'wbs-view-actions';
  actions.setAttribute('aria-label', 'ابزارهای نما');

  const body = documentRef.createElement('div');
  body.className = 'wbs-view-body wbs-shopping-body';

  header.append(title, actions);
  frame.append(header, body);
  return frame;
}
