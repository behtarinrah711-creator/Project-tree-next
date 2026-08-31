/* Contract form shell/session lifecycle. Business mutations remain in form modules. */
(function installContractFormLifecycle(){
  let templateDirty=false;

  function openTemplate(id=null){
    const project=getCurrentProject(); if(!project)return false;
    closeDrawer();
    workspaceSubpage='contractTemplateForm'; setInternalFormMode(true);
    showOnlyWorkspacePage('contractTemplateFormPage'); setBottomNavActive('Settings');
    renderTabs(); updateWorkspaceContextBar();
    window.KarhaContractHistory?.enterTemplate();
    const title=document.getElementById('contractTemplateFormTitle');
    if(title) title.textContent=id?'ویرایش قالب قرارداد':'قالب قرارداد جدید';
    window.KarhaContractTemplateForm?.open?.(id,project.id);
    return true;
  }

  function closeTemplate(fromPopState=false){
    setInternalFormMode(false);
    document.getElementById('contractTemplateFormPage')?.classList.add('hidden');
    templateDirty=false;
    workspaceSubpage='contractTemplates';
    showOnlyWorkspacePage('contractTemplatesPage'); setBottomNavActive('Settings');
    renderTabs(); updateWorkspaceContextBar(); renderContractTemplatesPage();
    window.KarhaContractHistory?.leaveTemplate(fromPopState);
  }

  function requestCloseTemplate(fromPopState=false){
    if(!templateDirty){closeTemplate(fromPopState);return;}
    showIncompleteFormExitChoice({
      onYes:()=>saveContractTemplateClean(true),
      onNo:()=>closeTemplate(fromPopState)
    });
  }

  window.KarhaContractFormLifecycle=Object.freeze({
    openTemplate,closeTemplate,requestCloseTemplate,
    setTemplateDirty(value){templateDirty=!!value;},
    isTemplateDirty(){return templateDirty;}
  });
})();
