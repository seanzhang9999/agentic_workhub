import {Collector,COORDINATOR} from '../src/collector.js';
import {join} from 'node:path';
import {homedir} from 'node:os';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
const file=process.env.AWIKI_COLLECTION_DB||join(homedir(),'.local/share/awiki-feishu-private-gateway/gateway/collection-queue.sqlite');
const [command,request,coordinator]=process.argv.slice(2);let q;
try{
 q=new Collector(file);let result;
 const input=async()=>{let s='';for await(const chunk of process.stdin){s+=chunk;if(s.length>32000)throw Error('INPUT_TOO_LARGE');}return JSON.parse(s);};
 switch(command){
 case 'list':result={coordinator_id:COORDINATOR,jobs:q.list()};break;
 case 'add':result=q.add(request);break;
 case 'prompt':result={prompt:q.prompt(request)};break;
 case 'prepare':result=q.prepare(request,coordinator,await input());break;
 case 'dispatch-intent':result=q.dispatchIntent(request,coordinator);break;
 case 'sent':result=q.sent(request,coordinator,(await input()).turn_id);break;
 case 'pending':result=q.pending(request,coordinator);break;
 case 'ingest':result=q.ingest(request,coordinator,await input());break;
 case 'register':{const c=new Client({name:'awiki-collector',version:'1.0'});try{await c.connect(new StreamableHTTPClientTransport(new URL('http://127.0.0.1:8787/mcp')));result=await q.register(request,coordinator,c);}finally{await c.close();}break;}
 default:result={usage:'collector.mjs list | add <reference> | prompt <request> | prepare/dispatch-intent/sent/pending/ingest/register <request> <coordinator-id>',notice:'prepare/sent/ingest read JSON from stdin. Native platform calls are performed by the fixed Codex coordinator, not by this CLI.'};
 }
 console.log(JSON.stringify(result,null,2));
}catch(e){console.error(JSON.stringify({ok:false,error:/^[A-Z_]+$/.test(e.message)?e.message:'COLLECTION_OPERATION_FAILED'}));process.exitCode=1;}finally{q?.close();}
