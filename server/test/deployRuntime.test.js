import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink,readlink,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';

const activate=new URL('../ops/activate-release.sh',import.meta.url).pathname;
const checkRuntime=new URL('../ops/check-runtime.sh',import.meta.url).pathname;

for(const scenario of ['success','provision-failure','health-failure']){
  test(`release activation ${scenario} preserves the correct symlink and service`,async t=>{
    const root=await mkdtemp(join(tmpdir(),'saosa-activation-'));
    t.after(()=>rm(root,{recursive:true,force:true}));
    const site=join(root,'site'),units=join(root,'units'),bin=join(root,'bin');
    const previous=join(site,'releases','old'),next=join(site,'releases','new');
    await Promise.all([mkdir(previous,{recursive:true}),mkdir(join(next,'server','ops'),{recursive:true}),mkdir(units),mkdir(bin)]);
    await symlink(previous,join(site,'current'));
    await writeFile(join(units,'saosa-api.service'),'previous service');
    await writeFile(join(next,'server','ops','provision.sh'),`#!/usr/bin/env bash
set -euo pipefail
# Preparation sees the old static release. It may update the API service unit.
test "$(readlink "$SAOSA_SITE_ROOT/current")" = "$PREVIOUS_ROOT_EXPECTED"
printf 'new service' > "$SAOSA_SYSTEMD_ROOT/saosa-api.service"
if [[ "$SCENARIO" == provision-failure ]]; then exit 7; fi
`);
    for(const command of ['systemctl','nginx','curl']){
      await writeFile(join(bin,command),`#!/usr/bin/env bash
printf '%s %s\\n' '${command}' "$*" >> "$CALL_LOG"
if [[ '${command}' == curl && "$SCENARIO" == health-failure ]]; then exit 22; fi
`,{mode:0o755});
    }
    const result=spawnSync('bash',[activate,next],{encoding:'utf8',env:{...process.env,
      PATH:bin+':'+process.env.PATH,SAOSA_SITE_ROOT:site,SAOSA_SYSTEMD_ROOT:units,
      PREVIOUS_ROOT_EXPECTED:previous,SCENARIO:scenario,CALL_LOG:join(root,'calls')},timeout:10000});
    assert.equal(result.status,scenario==='success'?0:scenario==='provision-failure'?7:22,result.stderr);
    assert.equal(await readlink(join(site,'current')),scenario==='success'?next:previous);
    assert.equal(await readFile(join(units,'saosa-api.service'),'utf8'),scenario==='success'?'new service':'previous service');
    const calls=await readFile(join(root,'calls'),'utf8');
    if(scenario!=='success')assert.match(calls,/systemctl restart saosa-api.service/);
    else assert.match(calls,/systemctl reload nginx/);
  });
}

test('missing packaged runtime fails clearly instead of using system Node.js',async t=>{
  const root=await mkdtemp(join(tmpdir(),'saosa-runtime-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const result=spawnSync('bash',[checkRuntime,root],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/missing its packaged Node.js runtime/);
});

test('deployment archive retains the API runtime and dependencies but omits root development modules',async t=>{
  const root=await mkdtemp(join(tmpdir(),'saosa-archive-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const path of ['node_modules/dev','server/node_modules/sharp','server/runtime/bin']){
    await mkdir(join(root,path),{recursive:true});await writeFile(join(root,path,'marker'),'ok');
  }
  const archive=spawnSync('tar',['-cf',join(root,'../'+root.split('/').at(-1)+'.tar'),'--exclude=./node_modules','.'],{cwd:root});
  const archivePath=join(root,'../'+root.split('/').at(-1)+'.tar');t.after(()=>rm(archivePath,{force:true}));
  assert.equal(archive.status,0);
  const contents=spawnSync('tar',['-tf',archivePath],{encoding:'utf8'}).stdout;
  assert.match(contents,/server\/node_modules\/sharp\/marker/);assert.match(contents,/server\/runtime\/bin\/marker/);
  assert.doesNotMatch(contents,/\.\/node_modules\/dev/);
});
