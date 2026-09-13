import { projectRepository } from '../../data/projectRepository.js';
import { appRouter } from '../../core/router.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';
import { allowsNestedStages } from '../../domain/wbs/branchingPolicy.js';

export default {
  id:'project-settings',
  mount({ projectId }){
    const body = document.getElementById('projectSettingsPageBody');
    if(!body) return { projectId, moduleId:this.id };
    body.replaceChildren();
    document.getElementById('closeProjectSettingsPage').onclick = () => appRouter.navigate(projectId, 'people');
    const project = projectRepository.find(projectId);
    if(!project) return { projectId, moduleId:this.id };
    const list = document.createElement('div');
    list.className = 'workspace-option-list';
    const row = document.createElement('label');
    row.className = 'workspace-option';
    const title = document.createElement('span');
    title.className = 'workspace-option-title';
    title.textContent = 'اضافه کردن بیش از یک شاخه به بسته کاری';
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.className = 'project-setting-switch';
    toggle.setAttribute('role', 'switch');
    toggle.checked = allowsNestedStages(project);
    toggle.addEventListener('change', () => {
      projectRepository.updateProject(projectId, current => ({ ...current,
        settings:{ ...current.settings, allowNestedStages:toggle.checked } }));
      markDirty(projectId);
      persist();
    });
    row.append(title, toggle);
    list.appendChild(row);
    body.appendChild(list);
    return { projectId, moduleId:this.id };
  },
};
