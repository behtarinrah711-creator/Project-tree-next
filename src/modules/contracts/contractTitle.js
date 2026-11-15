import { contactApi } from '../../domain/contactApi.js';
import { findInTree } from '../../domain/wbs/normalize.js';
import { workPath } from '../../domain/wbs/workTaskContractSync.js';

function contractProjectPath(project, contract){
  if(!project || !contract) return '';
  const { projectItemId, workTaskId } = contract;
  const item = projectItemId ? findInTree(project.tasks, projectItemId)?.item : null;
  const task = workTaskId && item?.workTasks?.find(row => row && !row.trashed && String(row.id) === String(workTaskId));
  if(item && !item.trashed && (!workTaskId || task?.title)){
    return [workPath(project, projectItemId).replaceAll(' / ', ' ← '), task?.title].filter(Boolean).join(' ← ');
  }
  return String(contract.projectItemPath || contract.accountingPackage?.contract?.projectItemPath || '').replaceAll(' / ', ' ← ');
}

function baseTitle(projectId, contract){
  const contact = contactApi.lookup(projectId, contract.contractorId || contract.contactId);
  const person = contact ? ([contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.name) : contract.contractorName || 'بدون پیمانکار';
  return [contract.title || 'قرارداد پیمانکاری', person].filter(Boolean).join(' ');
}

export function contractDisplayTitle(project, contract, {prefix=''}={}){
  const title = baseTitle(project?.id, contract);
  const stage = String(contractProjectPath(project, contract) || '').split('←').map(part => part.trim()).filter(Boolean).at(-1);
  const display = stage ? title + ' | ' + stage : title;
  return prefix ? prefix + ' ' + display : display;
}
