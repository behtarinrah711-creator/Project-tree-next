import {test,expect} from '@playwright/test';
const project={id:'filter-contract-project',name:'پروژه فیلتر قرارداد',tasks:[],contacts:[],activityTemplates:[],contractTemplates:[],statusForms:[],
 contracts:[
 {id:'approved',contractNo:'CTR-0003',title:'قرارداد فونداسیون',status:'final',approvalStatus:'approved',amount:'280000000'},
 {id:'ready',contractNo:'CTR-0001',title:'قرارداد بتن',status:'final',amount:'575000000'}
 ],trashed:false,archived:false};
test('contract search and status compose and no-results exists only for zero matches',async({page})=>{
 await page.addInitScript(seed=>{
  localStorage.clear();localStorage.setItem('ptnext-v1:app-data',JSON.stringify({schemaVersion:4,projects:[seed],activeTab:seed.id,viewMode:'simple',starredOrder:[]}));
 },project);
 await page.goto('/index.html#/projects/filter-contract-project/dashboard');
 await page.waitForFunction(()=>Boolean(window.KarhaLegacy && window.KarhaApp));
 await page.locator('#topbarTitle').click();
 await page.locator('#drawerProjectList .drawer-project-row[data-project-id="filter-contract-project"]').click();
 await page.locator('#bottomReportsBtn').click();
 await page.getByText('قرارداد پیمانکاران',{exact:true}).first().click();
 const body=page.locator('#contractsPageBody'),rows=body.locator('.contract-list .contract-row');
 await expect(rows).toHaveCount(2);await expect(body.locator('.contract-empty')).toHaveCount(0);
 const search=body.getByRole('searchbox',{name:'جستجوی قرارداد'});
 await search.fill('0003');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('CTR-0003');
 await body.locator('.contract-status-filter').click();
 const menu=page.locator('#contractStatusMenu');
 await expect(menu).toBeVisible();
 await expect(menu.getByRole('checkbox')).toHaveCount(5);
 for(const box of await menu.getByRole('checkbox').all())await expect(box).toBeChecked();
 for(const box of await menu.getByRole('checkbox').all()){
   if(await box.inputValue()!=='ready')await box.uncheck();
 }
 await page.getByRole('button',{name:'بستن فیلتر وضعیت',exact:true}).click();
 await expect(menu).toHaveCount(0);
 await expect(page.locator('#searchTemplatePage')).toBeHidden();
 await expect(rows).toHaveCount(0);await expect(body.locator('.contract-empty')).toBeVisible();
 await search.fill('');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('CTR-0001');
 await expect(body.locator('.contract-empty')).toHaveCount(0);
 await body.locator('.contract-status-filter').click();
 for(const box of await page.locator('#contractStatusMenu').getByRole('checkbox').all())await box.check();
 await page.keyboard.press('Escape');
 await expect(page.locator('#contractStatusMenu')).toHaveCount(0);
 await expect(rows).toHaveCount(2);
 await search.fill('بدون نتیجه');await expect(rows).toHaveCount(0);
 await expect(body.locator('.contract-empty')).toHaveCount(1);
 await search.fill('');await expect(rows).toHaveCount(2);
 await expect(body.locator('.contract-empty')).toHaveCount(0);
 await expect(page.locator('#contractFormPage')).toBeHidden();
});
