export function applyDrop({ draggedId, targetId, targetKind, onReorderSiblings, onReparentInto }){
  if(!draggedId || !targetId || draggedId === targetId) return false;
  if(targetKind === 'stage') return !!onReparentInto?.(draggedId, targetId);
  return !!onReorderSiblings?.(draggedId, targetId);
}

export function bindRowDrag(row, { id, kind, onDrop }){
  if(!row) return;
  row.dataset.wbsId = id;
  row.dataset.wbsKind = kind;
  const grip = row.querySelector('.wbs-grip');
  if(grip){
    grip.setAttribute('draggable', 'true');
    grip.addEventListener('dragstart', ev => {
      ev.dataTransfer?.setData('text/plain', id);
      ev.dataTransfer && (ev.dataTransfer.effectAllowed = 'move');
    });
  }
  row.addEventListener('dragover', ev => {
    ev.preventDefault();
    row.classList.add('is-drop');
  });
  row.addEventListener('dragleave', () => row.classList.remove('is-drop'));
  row.addEventListener('drop', ev => {
    ev.preventDefault();
    row.classList.remove('is-drop');
    const draggedId = ev.dataTransfer?.getData('text/plain');
    onDrop?.({ draggedId, targetId: id, targetKind: kind });
  });
}
