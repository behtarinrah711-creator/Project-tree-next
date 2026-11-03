import {mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {resolve, join} from 'node:path';

// Object keys, not absolute paths, are the persistence boundary for a future S3 adapter.
export function createLocalFileStorage(root){
  const base=resolve(root);
  function directory(key){
    if(!/^[a-zA-Z0-9._:-]+(?:\/[a-zA-Z0-9._:-]+){3}$/.test(key) || key.split('/').some(part=>part==='.' || part==='..')) throw new Error('invalid_file_key');
    const path=resolve(base,key);
    if(!path.startsWith(base+'/')) throw new Error('invalid_file_key');
    return path;
  }
  return {
    async put(key,metadata,bytes,thumbnail){
      const dir=directory(key);
      await mkdir(resolve(dir,'..'),{recursive:true,mode:0o700});
      await mkdir(dir,{mode:0o700});
      try{
        await writeFile(join(dir,'original'),bytes,{flag:'wx',mode:0o600});
        if(thumbnail)await writeFile(join(dir,'thumbnail.jpg'),thumbnail,{flag:'wx',mode:0o600});
        await writeFile(join(dir,'metadata.json'),JSON.stringify(metadata),{flag:'wx',mode:0o600});
      }catch(error){await rm(dir,{recursive:true,force:true});throw error;}
    },
    async metadata(key){return JSON.parse(await readFile(join(directory(key),'metadata.json'),'utf8'));},
    async read(key,thumbnail=false){return readFile(join(directory(key),thumbnail?'thumbnail.jpg':'original'));},
  };
}
