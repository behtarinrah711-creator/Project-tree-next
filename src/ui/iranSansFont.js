/** IRANSansX Pro webfonts (all weights). Paths are absolute so print popups can load them. */
export const IRAN_SANS_WEIGHTS = [
  ['Thin', 100],
  ['UltraLight', 200],
  ['Light', 300],
  ['Regular', 400],
  ['Medium', 500],
  ['DemiBold', 600],
  ['Bold', 700],
  ['ExtraBold', 800],
  ['Black', 900],
  ['ExtraBlack', 950],
  ['Heavy', 1000],
];

export function iranSansFontBase(windowRef = globalThis){
  const href = windowRef?.location?.href || 'https://saosa.ir/';
  return new URL('src/assets/fonts/', href).href;
}

export function iranSansFaceCss(fontBase){
  const base = String(fontBase || '').endsWith('/') ? String(fontBase) : String(fontBase || '') + '/';
  return IRAN_SANS_WEIGHTS.map(([name, weight]) =>
    `@font-face{font-family:'IRANSansX';src:url('${base}IRANSansX-${name}.woff2') format('woff2');font-weight:${weight};font-style:normal;font-display:swap;}`
  ).join('');
}
