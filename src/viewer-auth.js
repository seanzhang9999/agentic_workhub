import { createHash, randomBytes } from "node:crypto";
import { open, constants } from "node:fs/promises";

export class ViewerError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const random = () => randomBytes(32).toString("hex");
const scope = "drive:drive";
// The authorize endpoint's current PKCE guidance explicitly pairs it with v2.
// v3 returned 20049 in live validation. Keep S256/state; never fall back without PKCE.
export const TOKEN_ENDPOINT = "https://open.feishu.cn/open-apis/authen/v2/oauth/token";
const endpoints = new Set([
  TOKEN_ENDPOINT,
  "https://open.feishu.cn/open-apis/authen/v1/user_info",
  "https://open.feishu.cn/open-apis/jssdk/ticket/get"
]);
// No CLI credential access. This file must be provisioned by the user for this viewer.
export async function loadWebAuthConfig(env = process.env) {
  if (env.AWIKI_DOCS_COMPONENT_ENABLED !== "true") return {enabled:false};
  const appId = env.AWIKI_DOCS_APP_ID ?? "", secretPath = env.AWIKI_DOCS_APP_SECRET_FILE ?? "";
  if (!/^cli_[A-Za-z0-9]+$/.test(appId) || !secretPath.startsWith("/"))
    throw new ViewerError("WEB_APP_CONFIG_INVALID");
  const file = await open(secretPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const st = await file.stat();
    if (!st.isFile() || (st.mode & 0o777) !== 0o600 || st.uid !== process.getuid() || st.size > 4096)
      throw new ViewerError("WEB_SECRET_FILE_NOT_PRIVATE");
    const appSecret = (await file.readFile("utf8")).trim();
    if (!appSecret || /\s/.test(appSecret)) throw new ViewerError("WEB_SECRET_FILE_INVALID");
    return {enabled:true, appId, appSecret};
  } finally { await file.close(); }
}

export class WebAuth {
  constructor(config, baseUrl, fetcher = fetch) {
    this.config = config; this.baseUrl = baseUrl; this.fetcher = fetcher;
    this.sessions = new Map();
  }
  session(req, res, create = false) {
    const now = Date.now();
    for (const [id,s] of this.sessions) if (s.expires <= now) this.sessions.delete(id);
    const id = (req.headers.cookie ?? "").match(/(?:^|;\s*)awiki_viewer_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    if (id && this.sessions.has(id)) return this.sessions.get(id);
    if (!create) throw new ViewerError("WEB_LOGIN_REQUIRED", 401);
    if (this.sessions.size >= 32) throw new ViewerError("TOO_MANY_SESSIONS", 429);
    const s = {id:random(), csrf:random(), expires:now + 2*60*60*1000};
    this.sessions.set(s.id,s);
    this.cookie(res,s.id);
    return s;
  }
  cookie(res,id) {
    // HTTP loopback only. No Domain attribute; token never enters this cookie.
    res.setHeader("Set-Cookie",`awiki_viewer_session=${id}; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200`);
  }
  csrf(req,s) {
    if (typeof req.headers["x-awiki-csrf"] !== "string" || req.headers["x-awiki-csrf"] !== s.csrf)
      throw new ViewerError("CSRF_REJECTED",403);
  }
  begin(s,ref) {
    if (!this.config.enabled) throw new ViewerError("COMPONENT_NOT_CONFIGURED",503);
    const state = random(), verifier = random();
    s.pending = {state,verifier,ref,expires:Date.now()+300000};
    const u = new URL("https://accounts.feishu.cn/open-apis/authen/v1/authorize");
    u.search = new URLSearchParams({client_id:this.config.appId,response_type:"code",redirect_uri:`${this.baseUrl}/oauth/callback`,
      scope,state,prompt:"consent",code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256"}).toString();
    return u.href;
  }
  async request(url,options) {
    if (!endpoints.has(url)) throw new ViewerError("UPSTREAM_NOT_ALLOWED",403);
    try {
      const response = await this.fetcher(url,{...options,redirect:"error",signal:AbortSignal.timeout(20000)});
      const data = await response.json();
      if (!response.ok || data.code !== 0) {
        const e = new ViewerError("FEISHU_WEB_AUTH_FAILED",502);
        e.stage = url === TOKEN_ENDPOINT ? 'oauth_token' : url.endsWith('/user_info') ? 'user_info' : 'sdk_ticket';
        if (Number.isSafeInteger(data.code)) e.upstreamCode = data.code;
        throw e;
      }
      return data;
    } catch(e) { if(e instanceof ViewerError) throw e; throw new ViewerError("FEISHU_WEB_NETWORK_FAILED",502); }
  }
  async finish(s,query,res) {
    const pending=s.pending; delete s.pending;
    if (!pending || pending.expires <= Date.now() || typeof query.state !== "string" || query.state !== pending.state)
      throw new ViewerError("OAUTH_STATE_REJECTED",403);
    if (query.error || typeof query.code !== "string" || !/^[A-Za-z0-9_-]{1,2048}$/.test(query.code))
      throw new ViewerError("OAUTH_NOT_COMPLETED",401);
    const result = await this.request(TOKEN_ENDPOINT,{method:"POST",
      headers:{"Content-Type":"application/json; charset=utf-8"},
      body:JSON.stringify({grant_type:"authorization_code",client_id:this.config.appId,client_secret:this.config.appSecret,
        code:query.code,redirect_uri:`${this.baseUrl}/oauth/callback`,code_verifier:pending.verifier,scope})});
    if (!result.access_token || !Number.isFinite(result.expires_in) || result.expires_in <= 60 || !result.scope?.split(" ").includes(scope))
      throw new ViewerError("WEB_TOKEN_OR_SCOPE_INVALID",403);
    const who = await this.request("https://open.feishu.cn/open-apis/authen/v1/user_info",{headers:{Authorization:`Bearer ${result.access_token}`}});
    if (!/^ou_[A-Za-z0-9_-]+$/.test(who.data?.open_id ?? "")) throw new ViewerError("WEB_IDENTITY_INVALID",403);
    // Rotate session after authentication. Access token lives only in memory; no refresh grant/storage.
    this.sessions.delete(s.id); s.id=random(); s.csrf=random();
    s.user={accessToken:result.access_token,openId:who.data.open_id,expires:Date.now()+(result.expires_in-60)*1000};
    this.sessions.set(s.id,s); this.cookie(res,s.id);
    return pending.ref;
  }
  async signature(s,ref) {
    if (!this.config.enabled) throw new ViewerError("COMPONENT_NOT_CONFIGURED",503);
    if (!s.user || s.user.expires <= Date.now()) { delete s.user; throw new ViewerError("WEB_LOGIN_REQUIRED",401); }
    const result=await this.request("https://open.feishu.cn/open-apis/jssdk/ticket/get",{method:"POST",headers:{Authorization:`Bearer ${s.user.accessToken}`}});
    const ticket=result.data?.ticket;
    if (!ticket || typeof ticket !== "string") throw new ViewerError("WEB_TICKET_INVALID",502);
    const nonceStr=random(),timestamp=Date.now(),url=`${this.baseUrl}/r/${ref}`;
    const signature=createHash("sha1").update(`jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`).digest("hex");
    return {appId:this.config.appId,openId:s.user.openId,nonceStr,timestamp,url,signature,jsApiList:["DocsComponent"]};
  }
}
