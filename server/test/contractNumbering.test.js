import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assignContractNumbers,contractNumber,makeShortCode} from '../src/contractNumbering.js';

function database(){
  const owners=new Map(),projects=new Map(),contracts=new Map();let updates=0;
  const result=rows=>({rows,rowCount:rows.length});
  return {owners,projects,contracts,get updates(){return updates;},async query(sql,args){
    if(sql.startsWith('SELECT code FROM contract_owner_codes'))return result(owners.has(args[0])?[{code:owners.get(args[0])}]:[]);
    if(sql.startsWith('INSERT INTO contract_owner_codes')){
      if(owners.has(args[0])||[...owners.values()].includes(args[1]))return result([]);
      owners.set(args[0],args[1]);return result([{code:args[1]}]);
    }
    if(sql.startsWith('SELECT * FROM contract_project_codes'))return result(projects.has(args[0])?[projects.get(args[0])]:[]);
    if(sql.startsWith('INSERT INTO contract_project_codes')){
      if(projects.has(args[0])||[...projects.values()].some(x=>x.owner_account_id===args[1]&&x.code===args[2]))return result([]);
      const row={project_id:args[0],owner_account_id:args[1],code:args[2],last_serial:0};projects.set(args[0],row);return result([row]);
    }
    if(sql.startsWith('SELECT * FROM contract_number_registry'))return result(contracts.has(args[0]+':'+args[1])?[contracts.get(args[0]+':'+args[1])]:[]);
    if(sql.startsWith('UPDATE contract_project_codes')){updates++;const row=projects.get(args[0]);row.last_serial++;return result([row]);}
    if(sql.startsWith('INSERT INTO contract_number_registry')){
      const row={contract_uid:args[0],project_id:args[1],source_contract_id:args[2],serial:args[3],contract_no:args[4]};
      assert.ok(![...contracts.values()].some(x=>x.contract_no===row.contract_no));contracts.set(args[1]+':'+args[2],row);return result([row]);
    }
    if(sql.startsWith('SELECT last_serial'))return result([projects.get(args[0])]);
    throw new Error('Unexpected SQL '+sql);
  }};
}
const ids=()=>{let n=0;return ()=>`uuid-${++n}`;};
const codes=(...items)=>()=>items.shift()||'ZZZ';

test('each project starts at 0001, same owner namespace, another owner gets a different namespace',async()=>{
  const db=database(),uuid=ids(),generate=codes('A7K','P3M','R8D','B8N','P3M');
  const a={id:'slaughterhouse',contracts:[{id:'c1'},{id:'c2'}]},b={id:'olive',contracts:[{id:'c1'}]};
  await assignContractNumbers(db,a,'owner',{uuid,generate});
  await assignContractNumbers(db,b,'owner',{uuid,generate});
  assert.deepEqual(a.contracts.map(c=>c.contractNo),['CTR-A7K-P3M-0001','CTR-A7K-P3M-0002']);
  assert.equal(b.contracts[0].contractNo,'CTR-A7K-R8D-0001');
  const other={id:'third',contracts:[{id:'c1'}]};await assignContractNumbers(db,other,'other',{uuid,generate});
  assert.equal(other.contracts[0].contractNo,'CTR-B8N-P3M-0001');
  assert.notEqual(a.contracts[0].contractUid,b.contracts[0].contractUid);
});
test('retry, rename, stale number edits, removal and restore never reissue or alter identities',async()=>{
  const db=database(),options={uuid:ids(),generate:codes('A7K','P3M')};
  const p={id:'p',contracts:[{id:'one',contractNo:'manual-12'},{id:'two'}]};
  await assignContractNumbers(db,p,'owner',options);
  const identity={...p.contracts[0]};assert.equal(identity.legacyContractNo,'manual-12');
  p.contracts=[{id:'one',contractNo:'forged',contractUid:'forged'}];p.name='renamed';
  await assignContractNumbers(db,p,'owner',options);
  assert.equal(p.contracts[0].contractNo,identity.contractNo);assert.equal(p.contracts[0].contractUid,identity.contractUid);assert.equal(db.updates,2);
  p.contracts.push({id:'three'});await assignContractNumbers(db,p,'owner',options);
  assert.equal(p.contracts[1].contractNo,'CTR-A7K-P3M-0003');
  p.contracts.push({id:'two',trashed:false});await assignContractNumbers(db,p,'owner',options);
  assert.equal(p.contracts[2].contractNo,'CTR-A7K-P3M-0002');
  assert.equal(db.updates,3);
});
test('code collisions retry and counters grow beyond four digits without wrapping',async()=>{
  const db=database(),options={uuid:ids(),generate:codes('AAA','BBB','AAA','CCC','DDD')};
  await assignContractNumbers(db,{id:'a',contracts:[]},'one',options);
  const b={id:'b',contracts:[{id:'c'}]};await assignContractNumbers(db,b,'two',options);
  assert.equal(b.contractOwnerCode,'CCC');
  assert.equal(contractNumber('AAA','BBB',10000),'CTR-AAA-BBB-10000');
  for(let i=0;i<100;i++)assert.match(makeShortCode(),/^[A-HJ-NP-Z2-9]{3}$/);
});
test('database constraints and transaction placement enforce permanent globally unique identities',()=>{
  const sql=readFileSync(new URL('../sql/20261029_contract_numbering.sql',import.meta.url),'utf8');
  assert.match(sql,/contract_uid uuid PRIMARY KEY/);assert.match(sql,/contract_no text NOT NULL UNIQUE/);
  assert.match(sql,/UNIQUE\(project_id, source_contract_id\)/);assert.match(sql,/UNIQUE\(project_id, serial\)/);
  assert.doesNotMatch(sql,/ON DELETE CASCADE/);
  const app=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
  assert.match(app,/await assignContractNumbers\(client,savedProject,existing.rows\[0\].owner_account_id\)/);
});
