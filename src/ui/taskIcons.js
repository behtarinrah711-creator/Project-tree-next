export const taskIcons=Object.freeze({
  check:()=>'<svg width="13" height="10" viewBox="0 0 13 10" fill="none"><path d="M1 5l3.5 3.5L12 1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star:filled=>'<svg width="18" height="18" viewBox="0 0 20 20" fill="'+(filled?'currentColor':'none')+'"><path d="M10 1.8l2.5 5.2 5.6.6-4.2 3.8 1.1 5.6L10 14.2l-5 2.8 1.1-5.6-4.2-3.8 5.6-.6L10 1.8z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  chevron:()=>'<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash:()=>'<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V2.6c0-.4.3-.7.7-.7h2.6c.4 0 .7.3.7.7V4M6.6 7v5M9.4 7v5M3.7 4l.6 9.2c0 .6.5 1 1.1 1h5.2c.6 0 1.1-.4 1.1-1L12.3 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  plus:()=>'<svg width="15" height="15" viewBox="0 0 15 15" fill="none"><path d="M7.5 1v13M1 7.5h13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
});
