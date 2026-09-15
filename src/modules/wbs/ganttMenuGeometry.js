export function ganttMenuPosition(buttonRect, menuSize, viewport, gap = 5, margin = 8){
  const maxLeft = Math.max(margin, viewport.width - menuSize.width - margin);
  const left = Math.min(Math.max(buttonRect.left, margin), maxLeft);
  const below = buttonRect.bottom + gap;
  const above = buttonRect.top - menuSize.height - gap;
  const top = below + menuSize.height <= viewport.height - margin
    ? below
    : Math.max(margin, above);
  return { left, top };
}
