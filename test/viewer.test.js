import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { makeViewer } from "../src/viewer.js";
import { WebAuth } from "../src/viewer-auth.js";
import { GatewayError } from "../src/errors.js";
import { pageLinks, linkedPage, continuationText, viewerBase, feishuBase } from "../src/links.js";
import { GatewayService } from "../src/service.js";
import { makeApp } from "../src/server.js";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const config={localViewerBaseUrl:"http://127.0.0.1:8788",feishuBaseUrl:"https://example.feishu.cn"};
const node={node_token:"wikiDOC123",obj_token:"docxDOC123",obj_type:"docx",title:'Title <script>alert("x")</script>'};
const guard={roots:()=>({awiki:node.node_token}),tree:async()=>({root:node,nodes:[{...node,depth:0}],truncated:false}),resolveAllowed:async ref=>{if(ref==="wikiDENY123")throw new GatewayError("OUT_OF_SCOPE","outside");if(ref==="wikiSHEET123")throw new GatewayError("UNSUPPORTED_PAGE","type");return node;}};
async function serve(app,t) {const s=app.listen(0,"127.0.0.1");await once(s,"listening");t.after(()=>s.close());return `http://127.0.0.1:${s.address().port}`;}
async function setup(t,web={enabled:false},fetcher) {
  const url=await serve(makeViewer(config,guard,web,fetcher),t);
  const request=(path,options={})=>new Promise((resolve,reject)=>{
    const req=httpRequest(url+path,{...options,headers:{Host:"127.0.0.1:8788",...options.headers}},res=>{
      const chunks=[];res.on("data",c=>chunks.push(c));res.on("end",()=>resolve(new Response(Buffer.concat(chunks),{status:res.statusCode,headers:res.headers})));
    });req.on("error",reject);req.end(options.body);
  });
  const page=await request("/r/wikiDOC123"),cookie=page.headers.get("set-cookie").split(";")[0],text=await page.text(),csrf=text.match(/data-csrf="([a-f0-9]+)"/)[1];
  const post=(path,ref="wikiDOC123",headers={})=>request(path,{method:"POST",headers:{Cookie:cookie,Origin:config.localViewerBaseUrl,"X-AWiki-CSRF":csrf,"Content-Type":"application/json",...headers},body:JSON.stringify({ref})});
  return {request,post,text,cookie,csrf};
}
test("links are additive, canonical and docx-only; no localhost cloud reference",()=>{
  assert.deepEqual(pageLinks(node,config),{feishu_url:"https://example.feishu.cn/wiki/wikiDOC123",awiki_local_url:"http://127.0.0.1:8788/r/wikiDOC123"});
  for(const obj_type of ["sheet","bitable","file","doc","slides"]) assert.equal(pageLinks({...node,obj_type},config).awiki_local_url,undefined);
  assert.equal(linkedPage(node,config).obj_token,node.obj_token);
  assert.match(continuationText(node,config),/read_page[\s\S]*page_ref[\s\S]*本次先读取，不修改原文/);
  assert.doesNotMatch(continuationText(node,config),/127\.0\.0\.1|localhost|access_token|signature/);
  assert.deepEqual(pageLinks(node,{}),{});
});
test("configuration refuses public/local alternate origins and URL injection",()=>{
  for(const u of ["https://127.0.0.1:8788","http://0.0.0.0:8788","http://example.com:8788","http://127.0.0.1:8788/foo","http://127.0.0.1:8788/?x=1","http://user@127.0.0.1:8788"]) assert.throws(()=>viewerBase(u));
  for(const u of ["http://example.feishu.cn","https://evil.com","https://example.feishu.cn@evil.com","https://example.feishu.cn/?x=1"]) assert.throws(()=>feishuBase(u));
});
test("page escapes external text, no-cache and disabled component is honest",async t=>{
  const {request,text}=await setup(t);
  assert.match(text,/Title &lt;script&gt;/); assert.doesNotMatch(text,/<script>alert/);
  assert.match(text,/原生文档嵌入尚未启用/);
  const r=await request("/r/wikiDOC123");assert.equal(r.headers.get("cache-control"),"no-store");assert.equal(r.headers.get("access-control-allow-origin"),null);
  assert.match(r.headers.get("content-security-policy"),/frame-ancestors 'none'/);
  assert.match(r.headers.get("set-cookie"),/HttpOnly; SameSite=Lax/);
});
test("Host, Origin, cross-site inclusion, root, unsupported type and static-file isolation",async t=>{
  const {request,post}=await setup(t);
  assert.equal((await request("/healthz",{headers:{Host:"evil.test"}})).status,403);
  assert.equal((await request("/r/wikiDOC123",{headers:{Origin:"https://evil.test"}})).status,403);
  assert.equal((await request("/r/wikiDOC123",{headers:{"Sec-Fetch-Site":"cross-site","Sec-Fetch-Dest":"iframe"}})).status,403);
  assert.equal((await request("/r/wikiDENY123")).status,403);
  assert.equal((await post("/api/component-auth","wikiDENY123")).status,403);
  const r=await request("/r/wikiSHEET123");assert.equal(r.status,415);assert.match(await r.text(),/飞书打开/);
  for(const path of ["/.env","/viewer.env","/src/config.js","/mcp","/assets/../.env"])assert.equal((await request(path)).status,404);
  assert.equal((await request("/r/wikiDOC123?url=https://evil.test")).status,400);
  assert.equal((await request("/r/https%3A%2F%2Fevil.test")).status,400);
});
test("signature/login operations require local session, exact Origin and CSRF",async t=>{
  const {request,post}=await setup(t);
  assert.equal((await post("/api/component-auth","wikiDOC123",{"X-AWiki-CSRF":"wrong"})).status,403);
  assert.equal((await post("/api/component-auth","wikiDOC123",{Origin:"http://localhost:8788"})).status,403);
  assert.equal((await post("/api/component-auth","wikiDOC123",{Cookie:""})).status,401);
  const r=await post("/api/component-auth");assert.equal(r.status,503);assert.equal((await r.json()).error.code,"COMPONENT_NOT_CONFIGURED");
  assert.equal((await request("/oauth/callback?state=wrong&code=not-a-real-code")).status,401);
  const configured=await setup(t,{enabled:true,appId:"cli_testonly",appSecret:"TEST_ONLY_SECRET"},async()=>({ok:false,json:async()=>({code:20002,error_description:"TEST_ONLY_SECRET"})}));
  const login=await (await configured.post("/auth/login")).json();
  const state=new URL(login.url).searchParams.get("state");
  const failed=await configured.request(`/oauth/callback?state=${state}&code=TEST_ONLY_CODE`,{headers:{Cookie:configured.cookie}});
  const failedHtml=await failed.text();assert.equal(failed.status,502);assert.match(failedHtml,/飞书打开/);assert.doesNotMatch(failedHtml,/TEST_ONLY_SECRET|TEST_ONLY_CODE/);
});
test("official OAuth+PKCE+ticket signing contract, state one-time, no general tokens in response (mock upstream)",async()=>{
  const responses=[{code:0,access_token:"TEST_ONLY_PRIVATE_TOKEN",expires_in:7200,scope:"drive:drive"},{code:0,data:{open_id:"ou_testonly"}},{code:0,data:{ticket:"TEST_ONLY_TICKET",expire_in:7200}}];
  const calls=[];
  const auth=new WebAuth({enabled:true,appId:"cli_testonly",appSecret:"TEST_ONLY_SECRET"},config.localViewerBaseUrl,async(url,options)=>{calls.push({url,...options});return {ok:true,json:async()=>responses.shift()};});
  const res={setHeader(){}};const s=auth.session({headers:{}},res,true),id=s.id;
  const url=new URL(auth.begin(s,node.node_token)),pending={...s.pending};
  assert.equal(url.origin,"https://accounts.feishu.cn");assert.equal(url.searchParams.get("scope"),"drive:drive");
  assert.equal(url.searchParams.get("code_challenge"),createHash("sha256").update(pending.verifier).digest("base64url"));
  assert.equal(await auth.finish(s,{state:pending.state,code:"TEST_ONLY_CODE"},res),node.node_token);
  assert.notEqual(id,s.id);
  const body=JSON.parse(calls[0].body);assert.equal(body.code_verifier,pending.verifier);assert.equal(body.scope,"drive:drive");
  assert.equal(calls[0].url,"https://open.feishu.cn/open-apis/authen/v2/oauth/token");assert.equal(calls[0].redirect,"error");
  assert.equal(calls[0].headers['Content-Type'],'application/json; charset=utf-8');
  const signed=await auth.signature(s,node.node_token);
  assert.equal(signed.url,"http://127.0.0.1:8788/r/wikiDOC123");assert.deepEqual(signed.jsApiList,["DocsComponent"]);
  assert.equal(signed.signature,createHash("sha1").update(`jsapi_ticket=TEST_ONLY_TICKET&noncestr=${signed.nonceStr}&timestamp=${signed.timestamp}&url=${signed.url}`).digest("hex"));
  assert.doesNotMatch(JSON.stringify(signed),/TEST_ONLY_PRIVATE_TOKEN|TEST_ONLY_TICKET|TEST_ONLY_SECRET/);
  await assert.rejects(()=>auth.finish(s,{state:pending.state,code:"TEST_ONLY_CODE"},res),/OAUTH_STATE_REJECTED/);
});
test("read/tree/write/replay retain old fields and add page links",async()=>{
  const cli={docFetch:async()=>({data:{document:{revision_id:3,content:"text"}}})};
  const g={...guard,tree:async()=>({alias:"awiki",root:node,nodes:[node,{...node,obj_type:"sheet"}],truncated:false})};
  let saved; const receipts={begin:()=>saved?{replay:true,result:saved}:{},succeed:(_id,r)=>saved=r,fail(){}};
  const service=new GatewayService(cli,g,receipts,config);
  const read=await service.readPage({page_ref:node.node_token});assert.equal(read.markdown,"text");assert.equal(read.revision,"3");assert.ok(read.page.awiki_local_url);
  const tree=await service.getProjectTree({});assert.ok(tree.nodes[0].awiki_local_url);assert.equal(tree.nodes[1].awiki_local_url,undefined);
  const write=await service.write("create_child_page","test-op",{},async()=>({ok:true,page:node}));assert.ok(write.page.awiki_local_url);
  const replay=await service.write("create_child_page","test-op",{},()=>{throw new Error("should not run");});assert.equal(replay.idempotent_replay,true);
});
test("existing Gateway routes do not expose viewer or authorization API",async t=>{
  const url=await serve(makeApp({}),t);
  for(const p of ["/r/wikiDOC123","/assets/viewer.js","/api/component-auth","/oauth/callback","/collect","/api/collections"])assert.equal((await fetch(url+p)).status,404);
  assert.deepEqual(await (await fetch(url+"/healthz")).json(),{ok:true});
});
test('collector API is session gated and mutations require Origin and CSRF',async t=>{
  const {request,cookie,csrf}=await setup(t);
  assert.equal((await request('/collect')).status,200);
  assert.equal((await request('/api/collections')).status,401);
  assert.equal((await request('/api/collections',{headers:{Cookie:cookie}})).status,200);
  const post=(headers={})=>request('/api/collections',{method:'POST',headers:{Cookie:cookie,Origin:config.localViewerBaseUrl,'Content-Type':'application/json','X-AWiki-CSRF':csrf,...headers},body:JSON.stringify({reference:'22222222-2222-4222-8222-222222222222'})});
  assert.equal((await post({Origin:'https://evil.test'})).status,403);
  assert.equal((await post({'X-AWiki-CSRF':'wrong'})).status,403);
  assert.equal((await post()).status,503);
});
test("browser SDK failure/permission/unauthenticated states preserve original link; copy excludes auth (DOM fixture)",async()=>{
  const source=await readFile(new URL("../src/viewer-assets/viewer.js",import.meta.url),"utf8");
  const entries=new Map(),get=selector=>{
    if(!entries.has(selector))entries.set(selector,{textContent:"",disabled:false,dataset:{ref:node.node_token,csrf:"fixture-csrf"},value:continuationText(node,config),addEventListener(name,fn){this[name]=fn;},select(){}});
    return entries.get(selector);
  };
  get("#feishu-open").href=pageLinks(node,config).feishu_url;
  let script,options,copied;
  const context={document:{querySelector:get,createElement:()=>({}),head:{append:s=>script=s}},
    navigator:{clipboard:{writeText:async value=>copied=value}},URL,
    location:{reload(){},assign(){}},window:{innerHeight:800,DocComponentSdk:class {constructor(o){options=o;}async start(){options.onAuthError();}}},
    fetch:async()=>({ok:true,json:async()=>({src:"https://example.feishu.cn/docx/docxDOC123",auth:{signature:"test-signature"}})})};
  vm.runInNewContext(source,context);
  script.onerror();assert.match(get("#sdk-status").textContent,/加载失败/);
  script.onload();await new Promise(resolve=>setImmediate(resolve));
  assert.match(get("#status-title").textContent,/网页登录未通过/);
  options.onError({code:"4",message:"NEVER_DISPLAY_PRIVATE_ERROR"});assert.match(get("#status-detail").textContent,/没有该文档的阅读权限/);
  assert.equal(get("#feishu-open").href,pageLinks(node,config).feishu_url);
  assert.equal(get("#continuation").value,continuationText(node,config));
});
test('catalog needs local session; metadata saves require origin/CSRF/root',async t=>{
  const {request,cookie,csrf,text}=await setup(t);
  assert.match(text,/本次讨论/);assert.match(text,/文档空间/);
  assert.equal((await request('/api/catalog')).status,401);
  const catalog=await (await request('/api/catalog',{headers:{Cookie:cookie}})).json();assert.equal(catalog.counts.docx,1);
  const context={source:'用户填写的来源',summary:'只保存本机',goal:'验证上下文',revision:0};
  const write=(ref,extra={})=>request('/api/page-context',{method:'POST',headers:{Cookie:cookie,Origin:config.localViewerBaseUrl,'X-AWiki-CSRF':csrf,'Content-Type':'application/json',...extra},body:JSON.stringify({ref,context})});
  assert.equal((await write(node.node_token,{'X-AWiki-CSRF':'bad'})).status,403);assert.equal((await write('wikiDENY123')).status,403);assert.equal((await write(node.node_token,{Origin:'https://evil.test'})).status,403);
  assert.equal((await write(node.node_token)).status,200);assert.equal((await write(node.node_token)).status,409);
  const next=await (await request('/api/catalog',{headers:{Cookie:cookie}})).json();assert.equal(next.roots[0].nodes[0].context.goal,context.goal);
  assert.equal((await request('/assets/viewer-context.js')).status,404);
});
