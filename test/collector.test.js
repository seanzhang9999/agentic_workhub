import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
process.env.AWIKI_COORDINATOR_THREAD_ID='11111111-1111-4111-8111-111111111111';
const {Collector,COORDINATOR,parseReference}=await import('../src/collector.js');
const target='22222222-2222-4222-8222-222222222222',turn='33333333-3333-4333-8333-333333333333';
test('collector accepts only canonical IDs/links',()=>{
 for(const r of [target,'https://chatgpt.com/c/'+target,'chatgpt-conversation://'+target])assert.equal(parseReference(r),target);
 for(const r of ['https://evil.test/c/'+target,'https://chatgpt.com/c/'+target+'?token=x','https://chatgpt.com/share/'+target,'not-id'])assert.throws(()=>parseReference(r));
});
test('persistent queue enforces coordinator, dedup, dispatch uncertainty, correlated report and verified registration',async()=>{
 const file=join(mkdtempSync(join(tmpdir(),'awiki-collector-test-')),'queue.sqlite');let q=new Collector(file);
 const j=q.add(target);assert.equal(q.add(target).request_id,j.request_id);assert.equal(statSync(file).mode&0o777,0o600);
 assert.throws(()=>q.add(COORDINATOR));assert.throws(()=>q.prepare(j.request_id,'wrong',{}));
 q.prepare(j.request_id,COORDINATOR,{target_id:target,title:'原始标题',created_at:null,last_turn_id:target,last_turn_started_at:null,last_turn_completed_at:null});
 q.dispatchIntent(j.request_id,COORDINATOR);assert.throws(()=>q.dispatchIntent(j.request_id,COORDINATOR));q.close();q=new Collector(file);
 assert.equal(q.get(j.request_id).status,'dispatch_uncertain');q.pending(j.request_id,COORDINATOR);q.sent(j.request_id,COORDINATOR,turn);
 const report={request_id:j.request_id,title:'自述主题',summary:'内容',goal:'目标',decisions:['决定'],open_questions:['待定'],next_step:'建议',history_coverage:'可见部分'};
 assert.throws(()=>q.ingest(j.request_id,COORDINATOR,{target_id:target,turn_id:target,report}));
 q.ingest(j.request_id,COORDINATOR,{target_id:target,turn_id:turn,report});
 let record;const client={callTool:async({name,arguments:a})=>({structuredContent:name==='read_context'?(record?{ok:true,context:record}:{ok:false,error:{code:'CONTEXT_NOT_FOUND'}}):((record={...a,revision:1}),{ok:true})})};
 await q.register(j.request_id,COORDINATOR,client);assert.equal(q.get(j.request_id).status,'registered');assert.equal(record.title,'原始标题');assert.deepEqual(record.conversation_timing.excluded_collection_turn_ids,[turn]);assert.equal((await q.register(j.request_id,COORDINATOR,client)).status,'registered');q.close();
});
