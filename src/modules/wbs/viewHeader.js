const EXPORT_ICON = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" height="24px" width="24px" fill="currentColor" aria-hidden="true" focusable="false"><path d="M16.2,20.5L19,17.7V20h1V16H16v1h2.3l-2.8,2.8l0.7,0.7ZM5,21q-0.83,0-1.41-0.59T3,19V5Q3,4.17 3.59,3.59T5,3H19q0.83,0 1.41,0.59T21,5v6.7q-0.47-0.22-0.97-0.39T19,11.08V5H5V19h6.05q0.07,0.55 0.24,1.05T11.68,21H5Zm0-3q0,0.27 0,0.51T5,19V5v6.07q0-0.05 0-0.06T5,11t0,2.05T5,18Zm2-1h4.08q0.07-0.52 0.24-1.03q0.16-0.5 0.36-0.97H7v2Zm0-4h6.1q0.8-0.75 1.79-1.25T17,11.08V11H7v2ZM7,9H17V7H7V9ZM18,23q-2.07,0-3.54-1.46T13,18t1.46-3.54T18,13t3.54,1.46T23,18t-1.46,3.54T18,23Z"/></svg>';

export function createExportButton(documentRef){
  const button = documentRef.createElement('button');
  button.type = 'button';
  button.className = 'wbs-view-tool wbs-export-tool';
  button.setAttribute('aria-label', 'خروجی گرفتن');
  button.setAttribute('title', 'خروجی گرفتن');
  button.innerHTML = EXPORT_ICON;
  return button;
}

export function createViewToolbar(documentRef, {
  className = '',
  ariaLabel = 'ابزارهای نما',
  controls = [],
  includeExport = true,
} = {}){
  const header = documentRef.createElement('div');
  header.className = `wbs-view-header wbs-view-toolbar wbs-frame-header${className ? ` ${className}` : ''}`;

  const actions = documentRef.createElement('div');
  actions.className = 'wbs-view-actions';
  actions.setAttribute('aria-label', ariaLabel);
  if(includeExport) actions.appendChild(createExportButton(documentRef));
  controls.forEach(control => control && actions.appendChild(control));

  header.appendChild(actions);
  return header;
}
