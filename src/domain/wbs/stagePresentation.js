import { walkTree } from './normalize.js';
import { stageModeOf } from './branchingPolicy.js';

export const STAGE_EXAMPLES = Object.freeze({
  base: Object.freeze(['برق کشی']),
  none: Object.freeze(['تاسیسات الکتریکی', 'برق کشی']),
  single: Object.freeze(['بلوک شماره ۱', 'تاسیسات الکتریکی', 'برق کشی']),
  multiple: Object.freeze(['مجتمع شماره ۱', 'بلوک شماره ۱', 'تاسیسات الکتریکی', 'برق کشی']),
});

export function stageCreationPlaceholder(project, parentId = null){
  const mode = stageModeOf(project);
  if(mode === 'base') return 'مثال: گچ کاری';
  let depth = 0;
  if(parentId !== null){
    walkTree(project?.tasks || [], (item, parent, itemDepth) => {
      if(String(item.id) === String(parentId)) depth = itemDepth + 1;
    });
  }
  const example = STAGE_EXAMPLES[mode][depth];
  return example ? `مثال: ${example}` : 'پیشنهاد می شود تعداد مراحل را کمتر کنید';
}
