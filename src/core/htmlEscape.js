/**
 * Shared HTML escape for text interpolated into HTML strings.
 * Sole owner for escapeHtml used by export / contract helpers via KarhaLegacy facade.
 */

export function escapeHtml(str){
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function installHtmlEscape({ windowRef = globalThis } = {}){
  if(windowRef.KarhaHtmlEscape?.escapeHtml) return windowRef.KarhaHtmlEscape;
  const api = Object.freeze({ escapeHtml });
  windowRef.KarhaHtmlEscape = api;
  return api;
}

export default { escapeHtml, installHtmlEscape };
