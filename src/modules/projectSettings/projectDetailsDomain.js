import { IRAN_PROVINCES, IRAN_CITIES } from './iranLocations.js';

export const PROJECT_TYPES = Object.freeze([
  'ساختمان و ابنیه', 'نفت و گاز', 'آب و فاضلاب', 'راه و ترابری',
  'تاسیسات و تجهیزات', 'نیرو', 'کشاورزی', 'صنعت و معدن', 'ارتباطات', 'سایر',
]);
export const PROJECT_CURRENCIES = Object.freeze(['ریال', 'تومان', 'افغانی']);
export const sortByPersianName = items => [...items].sort((a,b) => a.name.localeCompare(b.name, 'fa'));
export const projectProvinces = () => sortByPersianName(IRAN_PROVINCES);
export const projectCities = provinceId => sortByPersianName(IRAN_CITIES.filter(city => city.provinceId === String(provinceId)));

export function projectDetailsDraft(project){
  const details = project.settings?.projectDetails || {};
  return {
    name: project.name || '',
    provinceId: details.provinceId || '', cityId: details.cityId || '',
    projectType: details.projectType || '', address: details.address || '',
    currency: details.currency || 'تومان', description: details.description || '',
    employerId: details.employerId || '', startDate: details.startDate || '',
  };
}

export function updateProjectDetails(project, draft){
  const name = String(draft.name || '').trim();
  if(!name) throw new Error('نام پروژه را وارد کنید.');
  const provinceId = String(draft.provinceId || '');
  const cityId = String(draft.cityId || '');
  if(provinceId && !IRAN_PROVINCES.some(item => item.id === provinceId)) throw new Error('استان معتبر نیست.');
  if(cityId && !projectCities(provinceId).some(item => item.id === cityId)) throw new Error('شهر با استان انتخاب‌شده مطابقت ندارد.');
  if(draft.projectType && !PROJECT_TYPES.includes(draft.projectType)) throw new Error('نوع پروژه معتبر نیست.');
  if(!PROJECT_CURRENCIES.includes(draft.currency)) throw new Error('واحد ارزی معتبر نیست.');
  if(draft.employerId && !(project.contacts || []).some(item => !item.trashed && String(item.id) === String(draft.employerId))) throw new Error('کارفرما در لیست مخاطبین موجود نیست.');
  return {
    ...project, name,
    settings: { ...project.settings, projectDetails: {
      provinceId, cityId, projectType: draft.projectType || '',
      address: String(draft.address || '').trim(), currency: draft.currency,
      description: String(draft.description || '').trim(),
      employerId: String(draft.employerId || ''), startDate: String(draft.startDate || ''),
    } },
  };
}
