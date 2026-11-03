import {test,expect} from '@playwright/test';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVQImWNgYPiPhJA4AF+6B/nLL1ojAAAAAElFTkSuQmCC','base64');

test('local uploader adds a private attachment, opens it, downloads it and detaches it',async({page})=>{
  const external=[];const requests=[];
  page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:4173') && !request.url().startsWith('blob:') && !request.url().startsWith('data:'))external.push(request.url());});
  await page.addInitScript(()=>localStorage.setItem('saosa:v1:sms-session',JSON.stringify({token:'test-session',phone:'0912',accountId:'owner',expiresAt:Date.now()+600000})));
  await page.route('**/api/v1/projects/upload-project/files/contacts/person-1**',async route=>{
    const request=route.request();requests.push(request);
    if(request.headers().authorization!=='Bearer test-session')return route.fulfill({status:401,json:{error:'unauthorized'}});
    if(request.method()==='POST')return route.fulfill({status:201,json:{file:{id:'file-1',projectId:'upload-project',recordId:'person-1',name:'photo.jpg',mime:'image/jpeg',size:png.length,hasThumbnail:true}}});
    return route.fulfill({status:200,contentType:'image/png',body:png});
  });
  await page.goto('/tests/e2e/fixtures/file-upload.html');
  await expect(page.locator('.filepond--root')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:png});
  const card=page.locator('.saosa-file-card');await expect(card).toHaveCount(1);
  await expect.poll(()=>page.evaluate(()=>window.savedFiles.length)).toBe(1);
  await card.getByRole('button',{name:'نمایش photo.jpg',exact:true}).click();
  const viewer=page.getByRole('dialog');await expect(viewer).toBeVisible();
  await expect(viewer.getByRole('button',{name:'دانلود',exact:true})).toBeEnabled();
  await expect.poll(()=>viewer.locator('img').evaluate(image=>image.complete && image.naturalWidth>0)).toBe(true);
  const download=page.waitForEvent('download');await viewer.getByRole('button',{name:'دانلود',exact:true}).click();
  expect((await download).suggestedFilename()).toBe('photo.jpg');
  await viewer.getByRole('button',{name:'بازگشت',exact:true}).click();await expect(viewer).toHaveCount(0);
  await card.getByRole('button',{name:'حذف photo.jpg',exact:true}).click();await expect(card).toHaveCount(0);
  expect(await page.evaluate(()=>window.savedFiles)).toEqual([]);
  expect(requests.some(request=>request.url().includes('variant=thumbnail'))).toBe(true);
  expect(external).toEqual([]);
});

test('failed uploads keep an error and never append a saved file reference',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('saosa:v1:sms-session',JSON.stringify({token:'test-session',phone:'0912',accountId:'owner',expiresAt:Date.now()+600000})));
  await page.route('**/api/v1/projects/upload-project/files/contacts/person-1**',route=>route.fulfill({status:413,json:{error:'file_too_large'}}));
  await page.goto('/tests/e2e/fixtures/file-upload.html');
  await expect(page.locator('.filepond--root')).toBeVisible();
  await page.locator('input[type=file]').setInputFiles({name:'document.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.7\ntest')});
  await expect.poll(()=>page.evaluate(()=>window.uploadError||'')).toContain('۲۵ مگابایت');
  expect(await page.evaluate(()=>window.savedFiles)).toEqual([]);
  expect(await page.evaluate(()=>window.uploader.isBusy())).toBe(true);
});
