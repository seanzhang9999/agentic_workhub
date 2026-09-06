import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,openSync,closeSync,constants,fstatSync} from 'node:fs';
import {dirname} from 'node:path';
import {GatewayError} from './errors.js';

export class ControlStore {
  constructor(file){
    mkdirSync(dirname(file),{recursive:true,mode:0o700});
    const fd=openSync(file,constants.O_CREAT|constants.O_RDWR|constants.O_NOFOLLOW,0o600);
    try{const st=fstatSync(fd);if(!st.isFile()||(st.mode&0o777)!==0o600||st.uid!==process.getuid())throw new Error('private file required');}finally{closeSync(fd);}
    this.db=new DatabaseSync(file);this.db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS contexts (context_id TEXT PRIMARY KEY, revision INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL)');
  }
  get(id){const r=this.db.prepare('SELECT * FROM contexts WHERE context_id=?').get(id);return r?{...JSON.parse(r.payload),revision:r.revision,updated_at:r.updated_at}:null;}
  list(){return this.db.prepare('SELECT context_id FROM contexts ORDER BY updated_at DESC LIMIT 201').all().map(r=>this.get(r.context_id));}
  save(input){
    const {expected_revision,...payload}=input;
    this.db.exec('BEGIN IMMEDIATE');
    try{
      const prior=this.get(payload.context_id),body=JSON.stringify(payload);
      // Stable registration id makes retries with identical payload harmless.
      if(prior){const {revision,updated_at,...old}=prior;if(JSON.stringify(old)===body){this.db.exec('COMMIT');return {...prior,idempotent_replay:true};}}
      if((prior?.revision??0)!==expected_revision)throw new GatewayError('CONTEXT_CONFLICT','Read the latest context revision before updating');
      if(!prior&&this.db.prepare('SELECT count(*) AS n FROM contexts').get().n>=200)throw new GatewayError('CONTEXT_LIMIT','Context registry limit reached');
      this.db.prepare('INSERT INTO contexts VALUES (?,?,?,?) ON CONFLICT(context_id) DO UPDATE SET revision=excluded.revision,payload=excluded.payload,updated_at=excluded.updated_at').run(payload.context_id,(prior?.revision??0)+1,body,new Date().toISOString());
      this.db.exec('COMMIT');return this.get(payload.context_id);
    }catch(e){this.db.exec('ROLLBACK');throw e;}
  }
}
export class ControlService {
  constructor(store,guard){this.store=store;this.guard=guard;}
  async check(record){for(const ref of record.document_refs)await this.guard.resolveAllowed(ref);}
  async register(input){
    const text=JSON.stringify(input);
    if(/sk-(?:proj-|admin-)?[A-Za-z0-9_-]{15,}|-----BEGIN .*PRIVATE KEY|(?:access_token|app_secret|client_secret|refresh_token)\s*[=:]|[?&](?:code|state|token)=/i.test(text))throw new GatewayError('CONTEXT_SECRET_REJECTED','Do not register credentials or authorization URLs');
    if(input.session_url){let url;try{url=new URL(input.session_url);}catch{throw new GatewayError('CONTEXT_URL_INVALID','Use a normal conversation URL');}
      if(url.protocol!=='https:'||url.hostname!=='chatgpt.com'||!/^\/c\/[A-Za-z0-9_-]+$/.test(url.pathname)||url.search||url.hash||url.username||url.password||url.port)throw new GatewayError('CONTEXT_URL_INVALID','Only plain ChatGPT conversation URLs can be opened; use native_session_id for other platforms');}
    await this.check(input);
    const old=this.store.get(input.context_id);if(old)await this.check(old);
    if(input.conversation_timing===undefined&&old?.conversation_timing)input={...input,conversation_timing:old.conversation_timing};
    return {ok:true,context:this.store.save(input),notice:'Self-reported context, not verified identity or live task status. No agent was dispatched and no document was modified.'};
  }
  async read({context_id}){const record=this.store.get(context_id);if(!record)throw new GatewayError('CONTEXT_NOT_FOUND','Context is not registered');await this.check(record);return {ok:true,context:record};}
  async list(){const contexts=[];for(const record of this.store.list()){try{await this.check(record);contexts.push(record);}catch(e){if(['OUT_OF_SCOPE','UNSUPPORTED_PAGE'].includes(e.code))continue;throw e;}}return {ok:true,contexts,notice:'Registration snapshots only; native session IDs do not grant permission to resume or send messages.'};}
}
