import {test,expect} from '@playwright/test';

for(const [mode,depth] of [['base',1],['none',2],['single',3],['multiple',4]]){
  test(`Gantt settings render final works under new stages in ${mode}`,async ({page})=>{
    await page.addInitScript(({mode,depth})=>{
      let leaf={id:'leaf',kind:mode==='multiple'?'stage':'work',text:'مرحله نهایی',subtasks:[],workTasks:[
        {id:'source',workId:'leaf',title:'خرید کابل',type:'',weight:1,progress:100,completed:true,scheduleStart:'1405/06/20',scheduleEnd:'1405/06/22',amount:100},
        {id:'target',workId:'leaf',title:'نصب کابل',type:'',weight:1,progress:50,scheduleStart:'1405/06/23',scheduleEnd:'1405/06/25',predecessorIds:['source'],amount:200}
      ]};
      for(let i=depth-1;i>0;i--) leaf={id:'stage-'+i,kind:'stage',text:'مرحله '+i,subtasks:[leaf],workTasks:[]};
      localStorage.setItem('ptnext-v1:app-data',JSON.stringify({schemaVersion:8,activeTab:'gantt-new',viewMode:'simple',projects:[{id:'gantt-new',name:'گانت',settings:{stageMode:mode},tasks:[leaf]}]}));
    },{mode,depth});
    await page.goto('/index.html#/projects/gantt-new/dashboard');
    await page.locator('.wbs-tab[aria-label="تایم‌لاین"]').click();
    if(mode==='base'){
      const controls=[
        page.locator('.wbs-timescale-toggle'),
        page.getByRole('button',{name:'لول‌های WBS'}),
        page.getByRole('button',{name:'کانفیگور نمودار گانت'}),
        page.locator('.wbs-gantt-order-toggle'),
        page.locator('.wbs-tree-toggle'),
      ];
      const x=[];
      for(const control of controls) x.push((await control.boundingBox()).x);
      expect(x).toEqual([...x].sort((a,b)=>a-b));
      for(const [control, menu] of [
        [controls[1], page.locator('#wbsGanttLevelMenu')],
        [controls[2], page.locator('#wbsGanttConfigMenu')],
      ]){
        await control.click();
        const box=await menu.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x+box.width).toBeLessThanOrEqual((await page.evaluate(()=>window.innerWidth))+.5);
        await control.click();
      }
    }
    for(let i=0;i<depth;i++) await page.locator('.wbs-tree-toggle').click();
    const target=page.locator('.wbs-gantt-line[data-dependency-entry-id="target"]');
    await expect(target.locator('.wbs-gantt-bar')).toBeVisible();
    await expect(target.locator('.wbs-gantt-detail-title')).toHaveText('نصب کابل');
    await expect(target.locator('.wbs-gantt-detail-date.is-start')).toHaveText('۶/۲۳');
    await expect(target.locator('.wbs-gantt-detail-date.is-finish')).toHaveText('۶/۲۵');
    await expect(target.locator('.wbs-gantt-detail-actual')).toHaveText('٪۵۰');
    await expect(target.locator('.wbs-gantt-planned-marker')).toBeVisible();
    await expect(page.locator('.wbs-gantt-line')).toHaveCount(depth+3);
    const configure=page.getByRole('button',{name:'کانفیگور نمودار گانت'});
    await configure.click();
    await page.locator('.wbs-gantt-menu-row',{hasText:'خطوط پیش‌نیاز'}).locator('input').check();
    const dependency=page.locator('.wbs-gantt-dependency-link[data-source-id="source"][data-target-id="target"]');
    await expect(dependency).toBeVisible();
    await configure.click();
    await page.locator('.wbs-gantt-menu-row',{hasText:'عنوان'}).locator('input').uncheck();
    await expect(target.locator('.wbs-gantt-detail-title')).toBeHidden();
    await configure.click();
    await page.locator('.wbs-gantt-menu-row',{hasText:'عنوان'}).locator('input').check();
    await expect(target.locator('.wbs-gantt-detail-title')).toBeVisible();
    await page.getByRole('button',{name:'لول‌های WBS'}).click();
    await expect(page.locator('#wbsGanttLevelMenu .wbs-gantt-menu-row')).toHaveCount(depth+1);
    await expect(page.locator('#wbsGanttLevelMenu')).not.toContainText('خرده کار');
    await page.locator('#wbsGanttLevelMenu .wbs-gantt-menu-row',{hasText:'مرحله ۱'}).locator('input').uncheck();
    await expect(target.locator('.wbs-gantt-detail-title')).toBeVisible();
    await page.locator('.wbs-timescale-toggle').click();
    await expect(target.locator('.wbs-gantt-detail-actual')).toHaveText('٪۵۰');
    await expect(target.locator('.wbs-gantt-detail-title')).toBeVisible();
  });
}
