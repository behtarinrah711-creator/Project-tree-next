export const EXPAND_ICON_PATH = 'M200-200v-240h80v160h160v80H200Zm480-320v-160H520v-80h240v240h-80Z';

// Tight bounds around EXPAND_ICON_PATH so a 24x24 SVG uses the full visual box.
export const EXPAND_ICON_VIEWBOX = '200 -760 560 560';

export function materialIconMarkup(path, { viewBox = '0 -960 960 960', className = '' } = {}){
  const classAttr = className ? ` class="${className}"` : '';
  return `<svg${classAttr} viewBox="${viewBox}" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

export function expandIconMarkup(className = 'wbs-expand-icon'){
  return materialIconMarkup(EXPAND_ICON_PATH, { viewBox:EXPAND_ICON_VIEWBOX, className });
}
