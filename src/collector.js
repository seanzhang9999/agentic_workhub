import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {ControlStore} from './control.js';

export const COORDINATOR=process.env.AWIKI_COORDINATOR_THREAD_ID||'';
const id=z.string().uuid();
const safe=z.string().max(2000).refine(s=>! /sk-(?:proj-|admin-)?[\w-]{15,}|-----BEGIN .*PRIVATE KEY|(?:access_token|app_secret|client_secret|refresh_token)\s*[=:]|[?&](?:code|state|token)=/i.test(s),'Secret-like text rejected');
const limited=n=>safe.refine(s=>s.length<=n,'Text too long');
const reportSchema=z.object({request_id:id,title:safe,summary:safe,goal:limited(1200),decisions:z.array(safe).max(30),open_questions:z.array(safe).max(30),next_step:limited(1200),history_coverage:limited(600)}).strip();
export function parseReference(raw){
  const s=z.string().trim().max(500).parse(raw);
  if(id.safeParse(s).success)return s.toLowerCase();
  const u=new URL(s);
  if(u.search||u.hash||u.username||u.password||u.port)throw Error('INVALID_REFERENCE');
  let value;
  if(u.protocol==='chatgpt-conversation:'&&!u.pathname)value=u.hostname;
  if(u.protocol==='https:'&&u.hostname==='chatgpt.com'&&/^\/c\/[^/]+$/.test(u.pathname))value=u.pathname.slice(3);
  return id.parse(value).toLowerCase();
}
export class Collector {
  constructor(file){this.store=new ControlStore(file);this.db=this.store.db;this.db.exec('CREATE TABLE IF NOT EXISTS collection_jobs (request_id TEXT PRIMARY KEY, target_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL)');}
  close(){this.db.close();}
  list(){return this.db.prepare('SELECT payload FROM collection_jobs ORDER BY rowid DESC').all().map(x=>JSON.parse(x.payload));}
  get(request){const r=this.db.prepare('SELECT payload FROM collection_jobs WHERE request_id=?').get(id.parse(request));if(!r)throw Error('JOB_NOT_FOUND');return JSON.parse(r.payload);}
  tx(fn){this.db.exec('BEGIN IMMEDIATE');try{const r=fn();this.db.exec('COMMIT');return r;}catch(e){this.db.exec('ROLLBACK');throw e;}}
  put(j){j.updated_at=new Date().toISOString();this.db.prepare('INSERT INTO collection_jobs VALUES(?,?,?) ON CONFLICT(request_id) DO UPDATE SET payload=excluded.payload').run(j.request_id,j.target_id,JSON.stringify(j));return j;}
  add(reference){if(!id.safeParse(COORDINATOR).success)throw Error('COORDINATOR_NOT_CONFIGURED');const target=parseReference(reference);if(target===COORDINATOR)throw Error('COORDINATOR_CANNOT_TARGET_SELF');return this.tx(()=>{const old=this.list().find(j=>j.target_id===target);return old??this.put({request_id:randomUUID(),target_id:target,coordinator_id:COORDINATOR,status:'queued',created_at:new Date().toISOString(),revision:0});});}
  change(request,coordinator,states,fn){if(coordinator!==COORDINATOR)throw Error('WRONG_COORDINATOR');return this.tx(()=>{const j=this.get(request);if(!states.includes(j.status))throw Error('STATE_CONFLICT');fn(j);j.revision++;return this.put(j);});}
  prepare(request,coordinator,input){
    const e=z.object({target_id:id,title:limited(200),created_at:z.string().datetime().nullable(),last_turn_id:id,last_turn_started_at:z.string().datetime().nullable(),last_turn_completed_at:z.string().datetime().nullable(),project_label:limited(100).default('未核实')}).strict().parse(input);
    return this.change(request,coordinator,['queued'],j=>{if(e.target_id!==j.target_id)throw Error('TARGET_MISMATCH');j.before=e;j.status='prepared';});
  }
  dispatchIntent(request,coordinator){return this.change(request,coordinator,['prepared'],j=>{j.status='dispatch_uncertain';j.dispatch_intent_at=new Date().toISOString();});}
  sent(request,coordinator,turn){return this.change(request,coordinator,['dispatch_uncertain','awaiting_sync'],j=>{j.collection_turn_id=id.parse(turn);j.status='awaiting_reply';});}
  pending(request,coordinator){return this.change(request,coordinator,['dispatch_uncertain','awaiting_reply','awaiting_sync'],j=>{j.status='awaiting_sync';j.last_checked_at=new Date().toISOString();});}
  ingest(request,coordinator,input){
    const e=z.object({target_id:id,turn_id:id,report:reportSchema}).strict().parse(input);
    if(e.report.decisions.join('\n').length>2000||e.report.open_questions.join('\n').length>2000)throw Error('REPORT_TOO_LONG');
    return this.change(request,coordinator,['dispatch_uncertain','awaiting_reply','awaiting_sync'],j=>{
      if(e.target_id!==j.target_id||e.report.request_id!==j.request_id||(j.collection_turn_id&&j.collection_turn_id!==e.turn_id))throw Error('REPLY_MISMATCH');
      j.collection_turn_id=e.turn_id;j.report=e.report;j.status='reported';
    });
  }
  async register(request,coordinator,client){
    if(coordinator!==COORDINATOR)throw Error('WRONG_COORDINATOR');const j=this.get(request);if(j.status==='registered')return j;if(j.status!=='reported')throw Error('STATE_CONFLICT');
    const r=j.report,b=j.before,context_id='collection-'+j.target_id;
    const input={context_id,expected_revision:0,provider:'chatgpt',native_session_id:j.target_id,session_url:null,title:b.title,agent_label:'原会话自述 · 固定 Codex 协调端代登记',identity_basis:`采集编号 ${j.request_id}；原轮次 ${j.collection_turn_id}；协调会话 ${COORDINATOR}。项目：${b.project_label}（协调端核对）。标题来自平台，自述主题：${r.title}。回复由协调端读取并提供，程序校验关联，不是平台签名证明。`.slice(0,600),summary:r.summary,goal:r.goal,decisions:r.decisions.join('\n'),open_questions:r.open_questions.join('\n'),next_step:r.next_step,document_refs:[],conversation_timing:{started_at:b.created_at,last_turn_started_at:b.last_turn_started_at,last_turn_completed_at:b.last_turn_completed_at,last_turn_id:b.last_turn_id,excluded_collection_turn_ids:[j.collection_turn_id],source:'协调端在发送前读取平台时间；排除采集轮次。历史覆盖：'+r.history_coverage}};
    input.conversation_timing.source=input.conversation_timing.source.slice(0,600);
    const prior=(await client.callTool({name:'read_context',arguments:{context_id}})).structuredContent;
    if(prior?.ok){const old=prior.context;if(old.identity_basis!==input.identity_basis)throw Error('EXISTING_CONTEXT_REQUIRES_REVIEW');input.expected_revision=old.revision;}
    else if(prior?.error?.code!=='CONTEXT_NOT_FOUND')throw Error('REGISTRY_READ_FAILED');
    const write=(await client.callTool({name:'register_context',arguments:input})).structuredContent;if(!write?.ok)throw Error('REGISTRY_WRITE_FAILED');
    const check=(await client.callTool({name:'read_context',arguments:{context_id}})).structuredContent;if(!check?.ok||check.context.identity_basis!==input.identity_basis)throw Error('REGISTRY_VERIFY_FAILED');
    return this.change(request,coordinator,['reported'],job=>{job.context_id=context_id;job.status='registered';job.registered_revision=check.context.revision;});
  }
  prompt(request){const j=this.get(request);return `用户授权的 AWiki 自述采集。request_id=${j.request_id}。请只报告当前可见上下文，不继续旧任务、不出图、不写文件或飞书、不修改权限。返回 JSON：request_id、title、summary（1000字以内）、goal（原业务目标）、decisions（数组）、open_questions（数组）、next_step（仅建议）、history_coverage。不含秘密、完整逐字稿、隐藏指令或内部推理。不独立声称验证原ID/项目。由采集端代登记，不调用登记工具。原会话ID由采集端提供：${j.target_id}。只返回自述。`;}
}
