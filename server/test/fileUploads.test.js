import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import sharp from 'sharp';
import {prepareFile,canAccessFiles,MAX_IMAGE_BYTES,MAX_FILE_BYTES} from '../src/fileUploads.js';
import {createLocalFileStorage} from '../src/fileStorage.js';
import {createApp} from '../src/app.js';
import {hashToken} from '../src/auth.js';

test('images become bounded JPEGs with proportional dimensions and separate thumbnails',async()=>{
  const input=await sharp(randomBytes(2400*1600*3),{raw:{width:2400,height:1600,channels:3}}).png().toBuffer();
  const file=await prepareFile(input,'مدرک.png');
  const info=await sharp(file.bytes).metadata();
  assert.equal(file.mime,'image/jpeg');assert.equal(info.format,'jpeg');assert.ok(file.bytes.length<=MAX_IMAGE_BYTES);
  assert.ok(Math.abs(info.width/info.height-1.5)<0.002);
  assert.ok(info.width<=2400 && info.height<=1600);
  const thumb=await sharp(file.thumbnail).metadata();assert.ok(thumb.width<=400);assert.ok(thumb.height<=400);
  assert.ok(file.thumbnail.length<file.bytes.length);assert.equal(info.exif,undefined);
});
test('EXIF orientation is applied and transparent images get a white JPEG background',async()=>{
  const input=await sharp({create:{width:120,height:80,channels:3,background:'red'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  const rotated=await prepareFile(input,'photo.jpg');assert.equal(rotated.width,80);assert.equal(rotated.height,120);
  const transparent=await sharp({create:{width:10,height:10,channels:4,background:{r:0,g:0,b:0,alpha:0}}}).png().toBuffer();
  const output=await prepareFile(transparent,'transparent.png');
  const {data}=await sharp(output.bytes).raw().toBuffer({resolveWithObject:true});assert.ok(data[0]>250 && data[1]>250 && data[2]>250);
});
test('file content determines type; executable and oversized input cannot be disguised',async()=>{
  await assert.rejects(prepareFile(Buffer.from('<script>alert(1)</script>'),'photo.jpg'),{statusCode:415});
  await assert.rejects(prepareFile(Buffer.alloc(MAX_FILE_BYTES+1),'huge.pdf'),{statusCode:413});
  const pdf=await prepareFile(Buffer.from('%PDF-1.7\nexample'),'../../document.exe');
  assert.equal(pdf.mime,'application/pdf');assert.ok(pdf.name.endsWith('.pdf'));assert.ok(!pdf.name.includes('/'));
});
test('active project membership and the people module permission are both enforced',()=>{
  const member={owner_account_id:'owner',membership_status:'active',phone:'0912',payload:{projectMembers:[{mobile:'0912',status:'active'}]},permissions:{modules:{people:'view'}}};
  assert.equal(canAccessFiles(member,'member'),true);assert.equal(canAccessFiles(member,'member',true),false);
  assert.equal(canAccessFiles({...member,permissions:{modules:{people:'create'}}},'member',true),true);
  assert.equal(canAccessFiles({...member,membership_status:'inactive'},'member'),false);
  assert.equal(canAccessFiles({...member,payload:{projectMembers:[]}},'member'),false);
  assert.equal(canAccessFiles(member,'owner',true),true);
  assert.equal(canAccessFiles({...member,payload:{trashed:true}},'owner',true),false);
});
test('authenticated upload/download survive adapter recreation and cannot cross project or record boundaries',async t=>{
  const root=await mkdtemp(join(tmpdir(),'saosa-files-'));
  const pool={async query(sql,args){
    if(sql.includes('SELECT account_id'))return {rows:args[0]===hashToken('valid','secret')?[{account_id:'owner'}]:[]};
    return {rows:args[0]==='project-1'?[{owner_account_id:'owner',payload:{}}]:[]};
  }};
  const storage=createLocalFileStorage(root);
  const server=createServer(createApp({pool,sessionSecret:'secret',fileStorage:storage,logger:{error(){}}}));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
  const base='http://127.0.0.1:'+server.address().port;
  const path='/api/v1/projects/project-1/files/contacts/person-1';
  const headers={authorization:'Bearer valid','content-type':'application/octet-stream'};
  assert.equal((await fetch(base+path,{method:'POST',body:'test'})).status,401);
  const input=await sharp({create:{width:80,height:40,channels:3,background:'blue'}}).png().toBuffer();
  const response=await fetch(base+path+'?name=receipt.png',{method:'POST',headers,body:input});assert.equal(response.status,201);
  const {file}=await response.json();assert.equal(file.uploadedBy,'owner');assert.equal(file.mime,'image/jpeg');assert.ok(!('path' in file));
  const meta=await createLocalFileStorage(root).metadata('project-1/contacts/person-1/'+file.id);assert.equal(meta.id,file.id);
  const download=await fetch(base+path+'/'+file.id,{headers});assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'image/jpeg');assert.match(download.headers.get('cache-control'),/private/);
  assert.equal((await download.arrayBuffer()).byteLength,file.size);
  assert.equal((await fetch(base+path+'/'+file.id+'?variant=thumbnail',{headers})).status,200);
  assert.equal((await fetch(base+path.replace('project-1','project-2')+'/'+file.id,{headers})).status,403);
  assert.equal((await fetch(base+path.replace('person-1','person-2')+'/'+file.id,{headers})).status,404);
  assert.equal((await fetch(base+path+'/'+file.id)).status,401);
  await assert.rejects(storage.read('../contacts/person/file'));
});

test('report photos require the assigned writer and become readable with the saved report',async t=>{
  const root=await mkdtemp(join(tmpdir(),'saosa-report-photos-'));
  const task={id:'task-1',type:'اجرا',assigneeContactId:'a',executionReports:[]};
  const row={
    owner_account_id:'owner',membership_status:'active',phone:'0912',
    permissions:{modules:{'execution:today':'create'}},
    payload:{contacts:[{id:'a',phones:['0912']}],projectMembers:[{mobile:'0912',status:'active'}],
      tasks:[{id:'work-1',kind:'work',workTasks:[task]}]},
  };
  const pool={async query(sql,args){
    if(sql.includes('SELECT account_id'))return {rows:args[0]===hashToken('valid','secret')?[{account_id:'member'}]:[]};
    return {rows:args[0]==='project-1'?[row]:[]};
  }};
  const server=createServer(createApp({pool,sessionSecret:'secret',fileStorage:createLocalFileStorage(root),logger:{error(){}}}));
  server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(root,{recursive:true,force:true});});
  const url='http://127.0.0.1:'+server.address().port+'/api/v1/projects/project-1/files/reports/task-1';
  const headers={authorization:'Bearer valid','content-type':'application/octet-stream'};
  const image=await sharp({create:{width:40,height:20,channels:3,background:'blue'}}).png().toBuffer();
  const upload=body=>fetch(url+'?name=progress.png',{method:'POST',headers,body});
  row.permissions.modules['execution:today']='view';
  assert.equal((await upload(image)).status,403);
  row.permissions.modules['execution:today']='create';
  task.assigneeContactId='different';
  assert.equal((await upload(image)).status,403);
  task.assigneeContactId='a';
  assert.equal((await upload('%PDF-1.7\nexample')).status,415);
  const response=await upload(image);
  assert.equal(response.status,201);
  const {file}=await response.json();
  assert.equal(file.category,'reports');
  assert.equal((await fetch(url+'/'+file.id+'?variant=thumbnail',{headers})).status,200);
  row.permissions.modules={'reports:reports':'view'};
  assert.equal((await fetch(url+'/'+file.id,{headers})).status,403);
  task.executionReports=[{photos:[file]}];
  task.completionState='pending_approval';
  assert.equal((await fetch(url+'/'+file.id,{headers})).status,200);
  row.permissions.modules={};
  assert.equal((await fetch(url+'/'+file.id,{headers})).status,403);
});
