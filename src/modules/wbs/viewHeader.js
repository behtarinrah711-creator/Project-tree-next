const EXPORT_ICON = 'M160-120q-33 0-56.5-23.5T80-200v-120h80v120h640v-120h80v120q0 33-23.5 56.5T800-120H160Zm280-160v-326L336-402l-56-58 200-200 200 200-56 58-104-104v326h-80Zm-280-40v-400q0-33 23.5-56.5T240-680h120v80H240v280h480v-280H600v-80h120q33 0 56.5 23.5T800-600v400H160Z';

function materialIcon(path){
  return `<svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

export function createExportButton(documentRef){
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = 'wbs-view-tool wbs-export-tool';
  button.setAttribute('aria-label', 'خروجی گرفتن');
  button.setAttribute('title', 'خروجی گرفتن');
  button.innerHTML = materialIcon(EXPORT_ICON);
  return button;
}

export function createViewToolbar(documentRef, {
  className = '',
  ariaLabel = 'ابزارهای نما',
  controls = [],
  includeExport = true,
} = {}){
  const header = documentRef.createElement('div');
  header.className = `wbs-view-header wbs-view-toolbar${className ? ` ${className}` : ''}`;

  const actions = documentRef.createElement('div');
  actions.className = 'wbs-view-actions';
  actions.setAttribute('aria-label', ariaLabel);
  controls.forEach(control => control && actions.appendChild(control));
  if(includeExport) actions.appendChild(createExportButton(documentRef));

  header.appendChild(actions);
  return header;
}
