import {randomInt,randomUUID} from 'node:crypto';
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeShortCode(){
  return Array.from({length:3},()=>ALPHABET[randomInt(ALPHABET.length)]).join('');
}
export function contractNumber(ownerCode,projectCode,serial){
  return `CTR-${ownerCode}-${projectCode}-${String(serial).padStart(4,'0')}`;
}
async function ownerCode(client,owner,generate){
  for(let attempt=0;attempt<256;attempt++){
    const found=await client.query('SELECT code FROM contract_owner_codes WHERE owner_account_id=$1',[owner]);
    if(found.rowCount)return found.rows[0].code;
    const created=await client.query('INSERT INTO contract_owner_codes(owner_account_id,code) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING code',[owner,generate()]);
    if(created.rowCount)return created.rows[0].code;
  }
  throw new Error('contract_owner_code_capacity');
}
/** Called only within the workspace transaction, after authorization. */
export async function assignContractNumbers(client,project,owner,{generate=makeShortCode,uuid=randomUUID}={}){
  const ownerPrefix=await ownerCode(client,owner,generate);
  let registry;
  for(let attempt=0;attempt<256;attempt++){
    const found=await client.query('SELECT * FROM contract_project_codes WHERE project_id=$1 FOR UPDATE',[String(project.id)]);
    if(found.rowCount){registry=found.rows[0];break;}
    const created=await client.query('INSERT INTO contract_project_codes(project_id,owner_account_id,code) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *',[String(project.id),owner,generate()]);
    if(created.rowCount){registry=created.rows[0];break;}
  }
  if(!registry)throw new Error('contract_project_code_capacity');
  // The persistent project namespace never changes with names or membership.
  const actualOwner=registry.owner_account_id===owner ? ownerPrefix
    : (await client.query('SELECT code FROM contract_owner_codes WHERE owner_account_id=$1',[registry.owner_account_id])).rows[0].code;
  project.contractOwnerCode=actualOwner;
  project.contractProjectCode=registry.code;
  const seen=new Set();
  for(const contract of project.contracts||[]){
    if(!contract?.id || seen.has(String(contract.id))){const error=new Error('invalid_contract_id');error.statusCode=400;throw error;}
    seen.add(String(contract.id));
    const found=await client.query('SELECT * FROM contract_number_registry WHERE project_id=$1 AND source_contract_id=$2',[String(project.id),String(contract.id)]);
    let identity=found.rows[0];
    if(!identity){
      const counter=await client.query('UPDATE contract_project_codes SET last_serial=last_serial+1 WHERE project_id=$1 RETURNING last_serial',[String(project.id)]);
      const serial=counter.rows[0].last_serial;
      const number=contractNumber(actualOwner,registry.code,serial);
      const result=await client.query('INSERT INTO contract_number_registry(contract_uid,project_id,source_contract_id,serial,contract_no) VALUES ($1,$2,$3,$4,$5) RETURNING *',[uuid(),String(project.id),String(contract.id),serial,number]);
      identity=result.rows[0];
      if(contract.contractNo && contract.contractNo!==number && !contract.legacyContractNo)contract.legacyContractNo=contract.contractNo;
    }
    contract.contractUid=identity.contract_uid;
    contract.contractNo=identity.contract_no;
    contract.contractSerial=String(identity.serial);
  }
  project.contractLastSerial=String((await client.query('SELECT last_serial FROM contract_project_codes WHERE project_id=$1',[String(project.id)])).rows[0].last_serial);
  return project;
}
