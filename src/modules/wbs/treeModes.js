export const DEFAULT_TREE_MODE = 'register';

export const TREE_MODES = Object.freeze([
  {
    id:'register',
    label:'ثبت و ویرایش',
    icon:'M560-80v-123l221-220q9-9 20-13t22-4q12 0 23 4.5t20 13.5l37 37q8 9 12.5 20t4.5 22q0 11-4 22.5T903-300L683-80H560Zm60-60h38l121-122-18-19-19-18-122 121v38ZM240-80q-33 0-56.5-23.5T160-160v-640q0-33 23.5-56.5T240-880h320l240 240v120h-80v-80H520v-200H240v640h240v80H240Z',
  },
  {
    id:'estimate',
    label:'هزینه‌ها',
    icon:'M441-120v-86q-53-12-91.5-46T293-348l74-30q15 48 44.5 73t77.5 25q41 0 69.5-18.5T587-356q0-35-22-55.5T463-458q-86-27-118-64.5T313-614q0-65 42-101t86-41v-84h80v84q50 8 82.5 36.5T651-650l-74 32q-12-32-34-48t-60-16q-44 0-67 19.5T393-614q0 33 30 52t104 40q69 20 104.5 63.5T667-358q0 71-42 108t-104 46v84h-80Z',
  },
  {
    id:'progress',
    label:'درصد پیشرفت',
    icon:'M300-520q-58 0-99-41t-41-99q0-58 41-99t99-41q58 0 99 41t41 99q0 58-41 99t-99 41Zm0-80q25 0 42.5-17.5T360-660q0-25-17.5-42.5T300-720q-25 0-42.5 17.5T240-660q0 25 17.5 42.5T300-600Zm360 440q-58 0-99-41t-41-99q0-58 41-99t99-41q58 0 99 41t41 99q0 58-41 99t-99 41Zm42.5-97.5Q720-275 720-300t-17.5-42.5Q685-360 660-360t-42.5 17.5Q600-325 600-300t17.5 42.5Q635-240 660-240t42.5-17.5ZM216-160l-56-56 584-584 56 56-584 584Z',
  },
]);

function materialIcon(path){
  return `<svg viewBox="0 -960 960 960" aria-hidden="true" focusable="false"><path d="${path}"/></svg>`;
}

export function createTreeModeTabs(documentRef, activeMode, onSelect){
  const tabs = documentRef.createElement('div');
  tabs.className = 'wbs-tree-mode-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', 'حالت نمایش درخت پروژه');

  TREE_MODES.forEach(mode => {
    const button = documentRef.createElement('button');
    const active = mode.id === activeMode;
    button.type = 'button';
    button.className = 'wbs-tree-mode-tab' + (active ? ' active' : '');
    button.dataset.mode = mode.id;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.setAttribute('aria-label', mode.label);
    button.title = mode.label;
    button.innerHTML = materialIcon(mode.icon);
    button.addEventListener('click', () => {
      if(mode.id !== activeMode) onSelect?.(mode.id);
    });
    tabs.appendChild(button);
  });

  return tabs;
}
