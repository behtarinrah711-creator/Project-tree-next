import {canAttachSignedContract,canReviseReturnedSignedContract,isContractInFinance} from '../../src/domain/contractHandoff.js';
import {randomUUID, createHash} from 'node:crypto';
import sharp from 'sharp';
import {fileTypeFromBuffer} from 'file-type';
import {authenticate} from './auth.js';
import {sendJson} from './http.js';
import {contractorDocumentImages} from '../../src/domain/contactDocuments.js';

export const MAX_FILE_BYTES=25*1024*1024;
export const MAX_IMAGE_BYTES=2*1024*1024;
export const MAX_IMAGE_INPUT_BYTES=20*1024*1024;
const PIXELS=40_000_000;
const SEGMENT=/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const DOCUMENTS=new Map([['pdf','application/pdf'],['docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],['xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],['pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation']]);
const IMAGES=new Set(['jpg','png','webp','heic','heif','avif']);
function fail(message,statusCode=400){return Object.assign(new Error(message),{statusCode});}

export function canAccessFiles(row,accountId,write=false,module='people'){
  if(!row || row.payload?.trashed || row.payload?.archived)return false;
  if(String(row.owner_account_id)===String(accountId))return true;
  if(row.membership_status!=='active' || !(row.payload?.projectMembers||[]).some(member=>member.mobile===row.phone && member.status==='active'))return false;
  const permissions=row.permissions||{};
  const level=permissions.modules?.[module] ?? (!permissions.modules ? permissions[module] : null);
  return write ? (level?['create','edit','full'].includes(level):!permissions.modules && permissions.edit===true)
    : (level?['view','create','edit','full'].includes(level):!permissions.modules && (permissions.view===true || permissions.edit===true));
}

export function canReadContractDocument(row,accountId,contractId,recordId,fileId){
  if(!contractId || !row)return false;
  const permissions=row.permissions||{};
  const mapped={...row,permissions:permissions.modules?{...permissions,modules:{people:permissions.modules.contracts}}:{...permissions,people:permissions.contracts}};
  const contract=(row.payload?.contracts||[]).find(value=>!value.trashed && String(value.id)===String(contractId));
  const finance=contract && isContractInFinance(contract) && (canAccessFiles(row,accountId,false,'accounting') || canAccessFiles(row,accountId,false,'accounting-contracts'));
  if(!canAccessFiles(mapped,accountId) && !finance)return false;
  if(!contract || String(contract.contractorId || contract.contactId)!==String(recordId))return false;
  return contractorDocumentImages(finance?contract.accountingPackage.contract:contract,row.payload).some(file=>typeof file!=='string' && String(file.id)===String(fileId) && String(file.recordId)===String(recordId));
}

async function readBytes(request,limit){
  const declared=Number(request.headers['content-length']);
  if(declared>limit)throw fail('file_too_large',413);
  const chunks=[];let size=0;
  for await(const chunk of request){size+=chunk.length;if(size>limit)throw fail('file_too_large',413);chunks.push(chunk);}
  if(!size)throw fail('empty_file');
  return Buffer.concat(chunks);
}

export async function prepareFile(input,name='file'){
  if(input.length>MAX_FILE_BYTES)throw fail('file_too_large',413);
  let type;
  try{type=await fileTypeFromBuffer(input);}catch{throw fail('invalid_file');}
  if(!type)throw fail('unsupported_file_type',415);
  const stem=String(name).replace(/[\x00-\x1f\x7f/\\]/g,'').replace(/\.[^.]*$/,'').trim().slice(0,100)||'file';
  if(!IMAGES.has(type.ext)){
    if(!DOCUMENTS.has(type.ext))throw fail('unsupported_file_type',415);
    return {bytes:input,thumbnail:null,mime:DOCUMENTS.get(type.ext),name:stem+'.'+type.ext};
  }
  if(input.length>MAX_IMAGE_INPUT_BYTES)throw fail('image_too_large',413);
  try{
    let source=input,options={limitInputPixels:PIXELS,failOn:'warning'};
    if(['heic','heif'].includes(type.ext)){
      const {default:decode}=await import('heic-decode');
      const images=await decode.all({buffer:input});
      try{
        const image=images[0];
        if(!image || image.width*image.height>PIXELS)throw fail('image_dimensions_too_large',413);
        const decoded=await image.decode();
        source=Buffer.from(decoded.data);options={raw:{width:decoded.width,height:decoded.height,channels:4},limitInputPixels:PIXELS};
      }finally{images.dispose();}
    }
    const image=sharp(source,options).rotate().flatten({background:'#ffffff'});
    const metadata=await image.metadata();
    if(!metadata.width || !metadata.height || (metadata.pages||1)>1)throw fail('unsupported_image');
    let bytes;
    // Never crop or stretch. Decode from the source on each attempt, not a previous JPEG.
    for(const [edge,quality] of [[3200,90],[3200,82],[2800,80],[2400,78],[2000,75],[1800,72],[1600,72]]){
      bytes=await image.clone().resize({width:edge,height:edge,fit:'inside',withoutEnlargement:true}).jpeg({quality,chromaSubsampling:'4:4:4'}).toBuffer();
      if(bytes.length<=MAX_IMAGE_BYTES)break;
    }
    if(bytes.length>MAX_IMAGE_BYTES)throw fail('image_too_large',413);
    const info=await sharp(bytes).metadata();
    const thumbnail=await sharp(bytes).resize({width:400,height:400,fit:'inside',withoutEnlargement:true}).jpeg({quality:75}).toBuffer();
    return {bytes,thumbnail,mime:'image/jpeg',name:stem+'.jpg',width:info.width,height:info.height};
  }catch(error){if(error.statusCode)throw error;throw fail('invalid_or_unsupported_image',415);}
}

export function createFileUploadHandler({pool,sessionSecret,storage}){
  let active=0;
  return async function handleFiles(request,response,url){
    const match=/^\/api\/v1\/projects\/([^/]+)\/files\/(contacts|contracts)\/([^/]+)(?:\/([^/]+))?$/.exec(url.pathname);
    if(!match)return false;
    let projectId,category,recordId,id;
    try{[projectId,category,recordId,id]=match.slice(1).map(value=>value===undefined?undefined:decodeURIComponent(value));}
    catch{sendJson(response,400,{error:'invalid_file_path'});return true;}
    if(![projectId,recordId,...(id?[id]:[])].every(value=>SEGMENT.test(value) && value!=='.' && value!=='..')){sendJson(response,400,{error:'invalid_file_path'});return true;}
    const write=request.method==='POST' && !id;
    if(!write && !(request.method==='GET' && id)){sendJson(response,405,{error:'method_not_allowed'});return true;}
    const accountId=await authenticate(request,pool,sessionSecret);
    if(!accountId){sendJson(response,401,{error:'unauthorized'});return true;}
    const result=await pool.query(`SELECT p.owner_account_id,p.payload,m.status AS membership_status,r.permissions,a.phone
      FROM projects p JOIN accounts a ON a.id=$2
      LEFT JOIN project_memberships m ON m.project_id=p.id AND m.account_id=a.id
      LEFT JOIN project_roles r ON r.id=m.role_id AND r.project_id=p.id WHERE p.id=$1`,[projectId,accountId]);
    const row=result.rows[0];
    const contract=category==='contracts'?(row?.payload?.contracts||[]).find(c=>!c.trashed && String(c.id)===recordId):null;
    const allowed=category==='contacts'
      ? canAccessFiles(row,accountId,write) || (!write && canReadContractDocument(row,accountId,url.searchParams.get('contractId'),recordId,id))
      : !!contract && (canAccessFiles(row,accountId,write,'contracts') || (!write && isContractInFinance(contract) && (canAccessFiles(row,accountId,false,'accounting') || canAccessFiles(row,accountId,false,'accounting-contracts'))));
    if(!allowed){sendJson(response,403,{error:'forbidden_project_files'});return true;}
    if(category==='contracts' && write && (!(canAttachSignedContract(contract) || canReviseReturnedSignedContract(contract)) || isContractInFinance(contract))){sendJson(response,409,{error:'contract_files_locked'});return true;}
    if(!storage){sendJson(response,503,{error:'file_storage_unavailable'});return true;}
    const prefix=projectId+'/'+category+'/'+recordId+'/';
    if(write){
      if(active>=2){sendJson(response,429,{error:'upload_busy'});return true;}
      active++;
      try{
        const input=await readBytes(request,MAX_FILE_BYTES);
        const file=await prepareFile(input,url.searchParams.get('name'));
        const fileId=randomUUID();
        if(category==='contracts' && !['image/jpeg','application/pdf'].includes(file.mime)){sendJson(response,415,{error:'unsupported_signed_type'});return true;}
        const metadata={id:fileId,projectId,category,recordId,name:file.name,mime:file.mime,size:file.bytes.length,
          width:file.width,height:file.height,hasThumbnail:!!file.thumbnail,sha256:createHash('sha256').update(file.bytes).digest('hex'),createdAt:Date.now(),uploadedBy:accountId};
        await storage.put(prefix+fileId,metadata,file.bytes,file.thumbnail);
        sendJson(response,201,{file:metadata});
      }finally{active--;}
    }else{
      try{
        const metadata=await storage.metadata(prefix+id);
        if(category==='contracts' && String(metadata.uploadedBy)!==String(accountId) && ![...(contract.signedFiles||[]),...(contract.accountingPackage?.signedFiles||[])].some(file=>file.id===id)){
          sendJson(response,403,{error:'forbidden_project_files'});return true;
        }
        const thumbnail=url.searchParams.get('variant')==='thumbnail' && metadata.hasThumbnail;
        const bytes=await storage.read(prefix+id,thumbnail);
        response.writeHead(200,{'content-type':thumbnail?'image/jpeg':metadata.mime,'content-length':bytes.length,
          'cache-control':'private, no-store','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; sandbox",
          'content-disposition':`attachment; filename="file"; filename*=UTF-8''${encodeURIComponent(metadata.name)}`});
        response.end(bytes);
      }catch(error){if(error.code!=='ENOENT')throw error;sendJson(response,404,{error:'file_not_found'});}
    }
    return true;
  };
}
