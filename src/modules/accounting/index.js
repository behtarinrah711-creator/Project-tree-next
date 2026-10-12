const ACCOUNTING_SECTIONS = Object.freeze([
  Object.freeze({
    id: 'accounting-statements',
    title: 'صورت وضعیت‌ها',
    meta: 'ثبت و مدیریت صورت وضعیت‌های پروژه',
  }),
  Object.freeze({
    id: 'pending-payments',
    title: 'در انتظار پرداخت',
    meta: 'پرداخت‌های تأییدشده و سررسیدهای پیش رو',
  }),
  Object.freeze({
    id: 'account-ledger',
    title: 'گردش حساب',
    meta: 'مشاهده تمام دریافت‌ها و پرداخت‌های پروژه',
  }),
  Object.freeze({
    id: 'party-ledgers',
    title: 'گردش حساب اشخاص',
    meta: 'مشاهده بدهکاری، بستانکاری و مانده اشخاص',
  }),
  Object.freeze({
    id: 'petty-cash',
    title: 'تنخواه',
    meta: 'مدیریت تنخواه‌ها و هزینه‌های روزمره پروژه',
  }),
  Object.freeze({
    id: 'payment-forecast',
    title: 'پیش‌بینی پرداخت‌ها',
    meta: 'برنامه پرداخت‌های آینده پروژه',
  }),
]);

function accountingBody(){
  return document.getElementById('accountingPageBody');
}

function renderAccountingRoot(projectId){
  const body = accountingBody();
  if(!body) return;
  body.replaceChildren();

  const list = document.createElement('div');
  list.className = 'workspace-option-list';

  ACCOUNTING_SECTIONS.forEach(section => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'workspace-option';
    row.innerHTML = `
      <span class="workspace-option-main">
        <span class="workspace-option-title">${section.title}</span>
        <span class="workspace-option-meta">${section.meta}</span>
      </span>
      <span class="workspace-option-arrow">›</span>
    `;
    row.addEventListener('click', () => {
      window.KarhaApp?.router?.navigate(projectId, section.id);
    });
    list.appendChild(row);
  });

  body.appendChild(list);
}

function renderEmptyAccountingSection(){
  accountingBody()?.replaceChildren();
}

const accountingModule = {
  id: 'accounting',
  title: 'مالی',
  route: 'accounting',
  mount({ projectId } = {}){
    renderAccountingRoot(projectId);
    return { projectId: projectId || null, moduleId: 'accounting' };
  },
};

export const accountingSectionModules = ACCOUNTING_SECTIONS.map(section => ({
  id: section.id,
  title: section.title,
  route: section.id,
  mount({ projectId } = {}){
    renderEmptyAccountingSection();
    return { projectId: projectId || null, moduleId: section.id };
  },
}));

export { ACCOUNTING_SECTIONS };
export default accountingModule;
