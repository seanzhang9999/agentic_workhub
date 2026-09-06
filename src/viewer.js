import express from "express";
import { fileURLToPath } from "node:url";
import { ViewerError, WebAuth } from "./viewer-auth.js";
import { linkedPage, continuationText, validResourceRef } from "./links.js";
import { ContextStore } from './viewer-context.js';
import {registrationPrompts} from './prompts.js';

const assets = fileURLToPath(new URL("./viewer-assets/",import.meta.url));
export const escapeHtml = x => String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const messages = {
  OUT_OF_SCOPE:"该文档不在当前授权根页面范围内。", UNSUPPORTED_PAGE:"首版仅支持普通 Docx 文档；此类型未启用嵌入。",
  WEB_LOGIN_REQUIRED:"尚未完成独立网页登录，或网页登录已过期。CLI 登录保持不变。",
  COMPONENT_NOT_CONFIGURED:"原生文档嵌入尚未启用：请先完成本机网页应用配置。",
  FEISHU_WEB_AUTH_FAILED:"飞书网页鉴权失败，请核对应用配置与权限。",
  FEISHU_WEB_NETWORK_FAILED:"无法连接飞书网页鉴权服务。",
  OAUTH_NOT_COMPLETED:"网页登录未完成或已取消。", OAUTH_STATE_REJECTED:"网页登录状态无效，请从文档页重新登录。"
};
function html(body,title="AWiki") { return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · AWiki</title><link rel="stylesheet" href="/assets/viewer.css"></head><body>${body}</body></html>`; }
function errorView(code,page,config,diagnostic="") {
  const url=page?linkedPage(page,config).feishu_url:null;
  return html(`<main><h1>AWiki</h1><p role="alert">${escapeHtml(messages[code]??"本地页面暂时无法加载，请稍后重试。")}</p><p class="muted">${escapeHtml(code)} ${escapeHtml(diagnostic)}</p>${url?`<a href="${escapeHtml(url)}" rel="noopener noreferrer">飞书打开</a> · <a href="/r/${page.node_token}">返回本地文档页</a>`:""}</main>`);
}

export function makeViewer(config,guard,webConfig={enabled:false},fetcher=fetch,contexts=new ContextStore(),registry=null,collector=null) {
  const base=new URL(config.localViewerBaseUrl), auth=new WebAuth(webConfig,base.origin,fetcher), app=express();
  app.disable("x-powered-by"); app.disable("etag");
  app.use((req,res,next)=>{
    res.set({"Cache-Control":"no-store","Pragma":"no-cache","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff",
      "X-Frame-Options":"DENY","Cross-Origin-Resource-Policy":"same-origin",
      "Content-Security-Policy":`default-src 'none'; script-src 'self' https://sf1-scmcdn-cn.feishucdn.com; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://open.feishu.cn https://accounts.feishu.cn https://internal-api-lark-api.feishu.cn https://internal-api-space.feishu.cn https://www.feishu.cn; frame-src ${config.feishuBaseUrl} https://*.feishu.cn https://*.larkoffice.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`});
    if (req.headers.host !== base.host) return res.status(403).type("text").send("HOST_REJECTED");
    const callback=req.method==="GET"&&req.path==="/oauth/callback";
    if (!callback && req.headers.origin && req.headers.origin!==base.origin) return res.status(403).type("text").send("ORIGIN_REJECTED");
    const site=req.headers["sec-fetch-site"],navigation=req.method==="GET"&&req.headers["sec-fetch-mode"]==="navigate"&&req.headers["sec-fetch-dest"]==="document";
    // Permit user navigation from ChatGPT; prohibit cross-site fetch/iframe inclusion.
    if (site && !["same-origin","none"].includes(site) && !navigation) return res.status(403).type("text").send("CROSS_SITE_REJECTED");
    if (!["GET","POST"].includes(req.method)) return res.status(405).end();
    next();
  });
  app.use(express.json({limit:"16kb"}));
  app.get("/healthz",(_req,res)=>res.json({ok:true,service:"awiki-local-viewer",component_configured:webConfig.enabled}));
  // Explicit asset allowlist; never serve repository or credential files.
  for (const name of ["viewer.js","viewer.css","discussion.js","space.js","guide.js","collector.js"]) app.get(`/assets/${name}`,(_req,res)=>res.sendFile(`${assets}${name}`));
  app.get('/collect',(req,res)=>{const s=auth.session(req,res,true);res.type('html').send(html(`<header><a href="/space#contexts" class="brand">AWiki</a><h1>接入一个原会话</h1></header><main data-csrf="${s.csrf}"><section class="doc-card"><h2>一个协调会话，持续整理工作</h2><p>固定协调端：初始化 AWiki Feishu 网关。程序管理队列；由该 Codex 会话读取、发问与回收。当前不自动唤起 Codex，不通过浏览器抓取。</p><form id="collection-form"><label for="collection-ref">ChatGPT 原会话 ID 或原链接</label><input id="collection-ref" maxlength="500" required placeholder="会话 UUID、https://chatgpt.com/c/… 或 chatgpt-conversation://…"><button>加入自述采集队列</button></form><p>入队表示你授权协调端向该原会话发送一次仅限自述的请求，不授权继续旧任务或修改文档。不支持公开分享链接或带授权参数的链接。</p><p id="collection-status" role="status"></p><button id="collection-refresh">刷新状态</button></section><section class="doc-card"><h2>交给固定协调端</h2><p>入队不会自动发送。回到当前 Codex 协调会话，发送下面这句话：</p><textarea readonly id="collection-instruction">请按 /Users/YOUR_USER/services/awiki-feishu-private-gateway/docs/collector-coordinator.md 处理已授权的采集队列；保持原会话模型设置，只自述，不继续旧任务。</textarea><button id="collection-copy">复制协调指示</button></section><div id="collection-jobs"></div></main><script src="/assets/collector.js" defer></script>`,'会话采集器'));});
  app.get('/api/collections',(req,res,next)=>{try{auth.session(req,res);res.json({ok:true,jobs:collector?.list()??[]});}catch(e){next(e);}});
  app.post('/api/collections',(req,res,next)=>{try{
    if(req.headers.origin!==base.origin)throw new ViewerError('ORIGIN_REJECTED',403);
    auth.csrf(req,auth.session(req,res));if(!collector)throw new ViewerError('COLLECTOR_UNAVAILABLE',503);
    let job;try{job=collector.add(req.body?.reference);}catch{throw new ViewerError('COLLECTION_INPUT_REJECTED',400);}
    res.json({ok:true,job});
  }catch(e){next(e);}});
  app.get('/guide',(_req,res)=>res.type('html').send(html(`<header><a class="brand" href="/space">AWiki</a><h1>让 Agent 留下上下文</h1><a href="/space">文档与会话空间</a></header><main><p>先在连接设置中刷新工具，确认 register_context、read_context、list_contexts 可见。以下提示词只登记摘要，不收集完整聊天，也不会自动启动 Agent。</p>${registrationPrompts.map((p,i)=>`<section class="doc-card"><h2>${escapeHtml(p.title)}</h2><textarea id="prompt-${i}" readonly aria-label="${escapeHtml(p.title)}">${escapeHtml(p.text)}</textarea><button data-prompt="${i}">复制这份提示词</button></section>`).join('')}<p id="guide-status" role="status"></p></main><script src="/assets/guide.js" defer></script>`,'上下文登记提示词')));
  app.get('/space',(req,res)=>{auth.session(req,res,true);res.type('html').send(html(`<header><strong class="brand">AWiki</strong><h1>我的文档空间</h1></header><main><div class="space-intro"><div><h2>文档有位置，讨论有来历</h2><p>这里仅展示现有授权根内的页面。MCP 可访问不代表 Agent 正在处理，也不代表页面由 Agent 创建。</p></div><button id="refresh-space">刷新目录</button></div><p id="space-status" role="status">正在读取授权目录…</p><section id="space-stats" class="space-stats"></section><div id="space-tree"></div><p class="muted">简介、目标和来源是你维护的本机记录，不是自动读取的会话历史。未记录的信息不会猜测补齐。</p></main><script src="/assets/space.js" defer></script>`,'我的文档空间'));});
  app.get('/api/catalog',async(req,res,next)=>{try{
    auth.session(req,res);const roots=[],seen=new Set();let docx=0;
    for(const alias of Object.keys(guard.roots())){
      const tree=await guard.tree(undefined,alias);
      const nodes=[];
      for(const n of tree.nodes){const p=linkedPage(n,config);nodes.push({...p,context:await contexts.get(n.node_token)});if(!seen.has(n.node_token)){seen.add(n.node_token);if(n.obj_type==='docx')docx++;}}
      roots.push({alias,title:tree.root.title,nodes,truncated:tree.truncated});
    }
    const sessions=(registry?.list()??[]).filter(c=>c.document_refs.every(ref=>seen.has(ref)));
    res.json({ok:true,roots,contexts:sessions,counts:{roots:roots.length,discovered:seen.size,docx,other:seen.size-docx},truncated:roots.some(r=>r.truncated),checked_at:new Date().toISOString()});
  }catch(e){next(e);}});
  app.get("/r/:ref",async(req,res,next)=>{try{
    if (!validResourceRef(req.params.ref) || req.url.includes("?")) throw new ViewerError("INVALID_RESOURCE_REF");
    const page=linkedPage(await guard.resolveAllowed(req.params.ref),config),s=auth.session(req,res,true);
    const title=page.title||"未命名文档";
    const context=await contexts.get(page.node_token);
    res.type("html").send(html(`<header><a class="brand" href="/space">AWiki</a><h1>${escapeHtml(title)}</h1><a href="/space">文档空间</a><a id="feishu-open" href="${escapeHtml(page.feishu_url)}" target="_blank" rel="noopener noreferrer">飞书打开 ↗</a></header>
<main data-ref="${page.node_token}" data-csrf="${s.csrf}"><section class="toolbar"><button id="login" ${webConfig.enabled?"":"disabled"}>飞书网页登录</button><button id="logout">退出网页登录</button></section>
<p class="muted">本机入口 · 原文仍在飞书 · 此链接不会增加文档权限</p>
<section id="component-state" role="status"><h2 id="status-title">${webConfig.enabled?"正在检查网页登录…":"原生文档嵌入尚未启用"}</h2><p id="status-detail">${webConfig.enabled?"组件使用独立的网页用户身份，不读取 CLI 凭据。":"尚未配置独立网页应用与用户授权。你仍可打开飞书原文，或复制指示继续讨论。"}</p><details id="connection-details"><summary>连接详情</summary><p id="sdk-status" class="muted">正在加载官方 Docs Component SDK…</p></details></section>
<div class="workspace"><section class="document-pane" aria-label="原文">
<div id="doc-pos" aria-label="飞书原生文档组件"></div>
</section><aside class="discussion" aria-labelledby="discussion-title">
<div class="panel-heading"><h2 id="discussion-title">本次讨论</h2><span class="pill">只读</span></div>
<details id="document-context"><summary>这篇文档的来历与目标</summary><p class="hint">MCP 可访问 · ${escapeHtml(page.root_alias??'授权根')} · 非实时 Agent 状态</p>
<label for="context-source">来自哪个会话</label><textarea id="context-source" rows="2" maxlength="600" placeholder="未记录。可填写会话名称、普通链接或本地记录线索。">${escapeHtml(context.source)}</textarea>
<label for="context-summary">这篇在说什么</label><textarea id="context-summary" rows="3" maxlength="1200" placeholder="未记录。用几句话说明核心内容。">${escapeHtml(context.summary)}</textarea>
<label for="context-goal">希望达成什么</label><textarea id="context-goal" rows="3" maxlength="1200" placeholder="未记录。写下下一步目标或未解决的问题。">${escapeHtml(context.goal)}</textarea>
<p class="hint">手动维护，仅保存本机；不改飞书原文。不要填写密钥或带授权码的链接。</p><button id="save-context" data-revision="${context.revision}">保存文档信息</button><p id="context-status" role="status">${context.updated_at?'已有本机记录':'来源与目标尚未记录'}</p></details>
<p class="hint">选中原文 → 复制 → 粘贴到引用框。选区不会自动传入。</p>
<label for="quote">引用片段 <span class="optional">可选</span></label>
<textarea id="quote" maxlength="12000" rows="5" placeholder="在左侧复制你想讨论的一段话，粘贴到这里。"></textarea>
<p class="field-note" id="quote-count">未添加引用 · 将围绕整篇文档讨论</p>
<label for="question">我的问题</label>
<textarea id="question" maxlength="4000" rows="4" placeholder="例如：这段判断有哪些反例？帮我把隐含假设拆开。"></textarea>
<label for="discussion-mode">从哪里开始</label>
<select id="discussion-mode"><option value="discuss">围绕我的问题讨论</option><option value="challenge">找反例与隐含假设</option><option value="outline">整理成下一步提纲</option></select>
<p class="privacy-note">内容仅留在当前页面，刷新即清空。未发送给任何 Agent；不要粘贴密钥或授权信息。</p>
<div class="discussion-actions"><button id="copy">复制讨论指示</button><button id="download">下载讨论包 .md</button></div>
<p id="copy-status" role="status" aria-live="polite"></p>
<details id="instruction-preview"><summary>预览 Agent 将收到的内容</summary><textarea id="continuation" readonly aria-label="给 Agent 的指示">${escapeHtml(continuationText(page,config))}</textarea></details>
<details class="next-prototype"><summary>下一步原型：交给我的 Agent</summary>
<p class="hint">仅交互演示，无真实发送或后台任务。不使用当前输入内容模拟结果。</p>
<p><strong>故事：</strong>我在手机上读到“Agent 应该附着在信息结构上”，想让研究 Agent 检查反例，自己先去做别的事。</p>
<ol class="handoff-story"><li>确认引用、问题与只读边界</li><li>交给已配对的研究 Agent</li><li>Agent 接收任务，离线时排队</li><li>回到这篇文档，查看讨论结果</li><li>需要改原文时，另行确认修改</li></ol>
<div id="prototype-state" role="status">演示 1/4 · 任务草稿：先确认交给谁、读哪些内容。</div>
<div class="discussion-actions"><button id="prototype-next">演示下一步</button><button id="prototype-reset">重置演示</button></div>
</details></aside></div>
</main><script src="/assets/discussion.js" defer></script><script src="/assets/viewer.js" defer></script>`,title));
  }catch(e){
    // Only an already allowlisted unsupported resource may get an original link.
    if(e.code==="UNSUPPORTED_PAGE") {
      const url=`${config.feishuBaseUrl}/wiki/${req.params.ref}`;
      return res.status(415).type("html").send(html(`<main><h1>AWiki</h1><p>${messages.UNSUPPORTED_PAGE}</p><a href="${escapeHtml(url)}" rel="noopener noreferrer">飞书打开</a></main>`));
    }
    next(e);
  }});
  const protectedPost=async(req,res,next)=>{try{
    if(req.headers.origin!==base.origin) throw new ViewerError("ORIGIN_REJECTED",403);
    const s=auth.session(req,res); auth.csrf(req,s); req.viewerSession=s;
    if (!validResourceRef(req.body?.ref)) throw new ViewerError("INVALID_RESOURCE_REF");
    req.viewerPage=await guard.resolveAllowed(req.body.ref); next();
  }catch(e){next(e);}};
  app.post("/auth/login",protectedPost,(req,res,next)=>{try{res.json({url:auth.begin(req.viewerSession,req.viewerPage.node_token)});}catch(e){next(e);}});
  app.post('/api/page-context',protectedPost,async(req,res,next)=>{try{res.json({ok:true,context:await contexts.save(req.viewerPage.node_token,req.body.context)});}catch(e){next(e);}});
  app.post("/auth/logout",protectedPost,(req,res)=>{auth.sessions.delete(req.viewerSession.id);res.setHeader("Set-Cookie","awiki_viewer_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");res.json({ok:true});});
  app.post("/api/component-auth",protectedPost,async(req,res,next)=>{try{
    const authFields=await auth.signature(req.viewerSession,req.viewerPage.node_token);
    res.json({auth:authFields,src:`${config.feishuBaseUrl}/docx/${req.viewerPage.obj_token}`});
  }catch(e){next(e);}});
  app.get("/oauth/callback",async(req,res,next)=>{try{
    const s=auth.session(req,res);
    if (!s.pending) throw new ViewerError("OAUTH_STATE_REJECTED",403);
    req.viewerPage=await guard.resolveAllowed(s.pending.ref);
    const ref=await auth.finish(s,req.query,res); res.redirect(303,`/r/${ref}`);
  }catch(e){next(e);}});
  app.use((_req,res)=>res.status(404).type("text").send("NOT_FOUND"));
  app.use((e,req,res,_next)=>{
    // Never return/log raw CLI output, OAuth query strings, tokens, or provider error messages.
    const known=e instanceof ViewerError || ["OUT_OF_SCOPE","CLI_UNAVAILABLE","UNSUPPORTED_PAGE"].includes(e.code);
    const code=known?e.code:"VIEWER_OPERATION_FAILED",status=e.status??(e.code==="OUT_OF_SCOPE"?403:502);
    const diagnostic=Number.isSafeInteger(e.upstreamCode)?`${['oauth_token','user_info','sdk_ticket'].includes(e.stage)?e.stage:''} ${e.upstreamCode}`:"";
    if(req.path.startsWith("/r/")||req.path==="/oauth/callback") return res.status(status).type("html").send(errorView(code,req.viewerPage,config,diagnostic));
    res.status(status).json({ok:false,error:{code,message:messages[code]??"本地操作失败",...(Number.isSafeInteger(e.upstreamCode)?{upstream_code:e.upstreamCode}:{})}});
  });
  return app;
}
