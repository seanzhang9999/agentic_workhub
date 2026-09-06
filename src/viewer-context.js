import { mkdir, open, rename, unlink, constants } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { ViewerError } from './viewer-auth.js';
import { validResourceRef } from './links.js';

export const emptyContext = () => ({source:'',summary:'',goal:'',revision:0,updated_at:null});
export function cleanContext(value) {
  if (!value || typeof value!=='object' || Array.isArray(value)) throw new ViewerError('CONTEXT_INVALID');
  const out={};
  for(const [key,max] of Object.entries({source:600,summary:1200,goal:1200})) {
    if(typeof value[key]!=='string'||value[key].length>max) throw new ViewerError('CONTEXT_INVALID');
    out[key]=value[key].trim();
  }
  if(!Number.isSafeInteger(value.revision)||value.revision<0)throw new ViewerError('CONTEXT_INVALID');
  // Avoid accidentally retaining recognizable credentials; not a universal secret detector.
  if(/(?:sk-(?:proj-|admin-)?[A-Za-z0-9_-]{15,}|-----BEGIN .*PRIVATE KEY|(?:access_token|app_secret|client_secret|refresh_token)\s*[=:]|[?&](?:code|state|token)=)/i.test(Object.values(out).join('\n')))
    throw new ViewerError('CONTEXT_SECRET_REJECTED');
  return {...out,revision:value.revision};
}
// Dedicated local metadata, never business document content or CLI credential files.
export class ContextStore {
  constructor(file=null){this.file=file;this.memory={};this.queue=Promise.resolve();}
  async read(){
    if(!this.file)return this.memory;
    let file;
    try{
      file=await open(this.file,constants.O_RDONLY|constants.O_NOFOLLOW);
      const stat=await file.stat();
      if(!stat.isFile()||(stat.mode&0o777)!==0o600||stat.uid!==process.getuid()||stat.size>8_000_000)throw new ViewerError('CONTEXT_STORAGE_UNSAFE',500);
      const data=JSON.parse(await file.readFile('utf8'));
      if(!data||Array.isArray(data)||typeof data!=='object')throw new Error('invalid');
      return data;
    }catch(e){if(e.code==='ENOENT')return {};throw new ViewerError('CONTEXT_STORAGE_UNAVAILABLE',500);}
    finally{await file?.close();}
  }
  async get(ref){const all=await this.read();return Object.hasOwn(all,ref)?all[ref]:emptyContext();}
  async save(ref,input){
    if(!validResourceRef(ref))throw new ViewerError('INVALID_RESOURCE_REF');
    const data=cleanContext(input);
    const operation=this.queue.then(async()=>{
      const all=await this.read(),prior=Object.hasOwn(all,ref)?all[ref]:emptyContext();
      if(prior.revision!==data.revision)throw new ViewerError('CONTEXT_CONFLICT',409);
      if(!Object.hasOwn(all,ref)&&Object.keys(all).length>=1000)throw new ViewerError('CONTEXT_LIMIT',409);
      const value={...data,revision:data.revision+1,updated_at:new Date().toISOString()};
      Object.defineProperty(all,ref,{value,enumerable:true,writable:true,configurable:true});
      if(this.file){
        await mkdir(dirname(this.file),{recursive:true,mode:0o700});
        const tmp=this.file+'.'+randomUUID()+'.tmp';let f;
        try{f=await open(tmp,'wx',0o600);await f.writeFile(JSON.stringify(all));await f.sync();await f.close();f=null;await rename(tmp,this.file);}
        finally{await f?.close();await unlink(tmp).catch(()=>{});}
      }else this.memory=all;
      return value;
    });
    this.queue=operation.catch(()=>{});return operation;
  }
}
