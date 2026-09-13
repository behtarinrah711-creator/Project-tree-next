import { projectRepository } from '../../data/projectRepository.js';
import { appRouter } from '../../core/router.js';
import { markDirty, persist } from '../../sync/persistAdapter.js';
import { stageModeOf } from '../../domain/wbs/branchingPolicy.js';

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
    const group = document.createElement('fieldset');
    group.className = 'project-stage-modes';
    const legend = document.createElement('legend');
    legend.className = 'workspace-option-title';
    legend.textContent = 'نوع مرحله‌بندی';
    group.appendChild(legend);
    const options = [
      ['base', 'تک‌مرحله‌ای', 'مرحله ← کار', 'برق کشی ← خرید سیم و کابل'],
      ['none', 'دو‌مرحله‌ای', 'مرحله ← مرحله ← کار', 'تاسیسات الکتریکی ← برق کشی ← خرید سیم و کابل'],
      ['single', 'سه‌مرحله‌ای', 'مرحله ← مرحله ← مرحله ← کار', 'بلوک شماره ۱ ← تاسیسات الکتریکی ← برق کشی ← خرید سیم و کابل'],
      ['multiple', 'چندمرحله‌ای', 'مرحله ← مرحله ← مرحله ← مراحل دلخواه ← کار', 'مجتمع شماره ۱ ← بلوک شماره ۱ ← تاسیسات الکتریکی ← برق کشی ← خرید سیم و کابل'],
    ];
    options.forEach(([value, label, description, example]) => {
      const row = document.createElement('label');
      row.className = 'workspace-option';
      const main = document.createElement('span');
      main.className = 'workspace-option-main';
      const title = document.createElement('span');
      title.className = 'workspace-option-title';
      title.textContent = label;
      const detail = document.createElement('span');
      detail.className = 'workspace-option-meta';
      detail.textContent = description;
      const exampleLine = document.createElement('span');
      exampleLine.className = 'workspace-option-meta project-stage-example';
      exampleLine.textContent = `مثال: ${example}`;
      main.append(title, detail, exampleLine);
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'project-stage-mode';
      input.value = value;
      input.className = 'project-stage-mode';
      input.setAttribute('aria-label', label);
      input.checked = stageModeOf(project) === value;
      input.addEventListener('change', () => {
        if(!input.checked) return;
        projectRepository.updateProject(projectId, current => {
          const { allowNestedStages, ...settings } = current.settings || {};
          return { ...current, settings:{ ...settings, stageMode:value } };
        });
        markDirty(projectId);
        persist();
      });
      row.append(main, input);
      group.appendChild(row);
    });
    list.appendChild(group);
    body.appendChild(list);
    return { projectId, moduleId:this.id };
  },
};
