/** Contact form shell presentation. History and workspace ownership stay with legacy. */
export function enterContactFormShell({page,body,title,addButton,isEdit,setFormMode}){
  if(!page||!body) return false;
  if(title) title.textContent=isEdit ? 'ویرایش مخاطب' : 'ثبت مخاطب';
  page.classList.add('contact-form-mode');
  setFormMode?.(true);
  if(addButton) addButton.hidden=true;
  body.innerHTML='';
  return true;
}

export function leaveContactFormShell({page,title,addButton,setFormMode}){
  page?.classList.remove('contact-form-mode');
  if(title) title.textContent='مخاطبین';
  if(addButton) addButton.hidden=false;
  setFormMode?.(false);
}
