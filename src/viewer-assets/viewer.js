/* Official Docs Component 1.0.13 (not Docs Add-on or legacy h5-js-sdk).
 * Auth comes from our session-bound endpoint, never the CLI or browser storage. */
const main=document.querySelector("main[data-ref]");
const statusTitle=document.querySelector("#status-title"),statusDetail=document.querySelector("#status-detail");
const setState=(title,detail)=>{statusTitle.textContent=title;statusDetail.textContent=detail;};
let component;
async function post(path) {
  const response=await fetch(path,{method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json","X-AWiki-CSRF":main.dataset.csrf},body:JSON.stringify({ref:main.dataset.ref})});
  const body=await response.json();
  if(!response.ok) throw Object.assign(new Error("Local operation failed"),{code:body.error?.code,upstreamCode:body.error?.upstream_code});
  return body;
}
document.querySelector("#login").addEventListener("click",async()=>{
  try {
    const {url}=await post("/auth/login"),target=new URL(url);
    if(target.origin!=="https://accounts.feishu.cn" || target.pathname!=="/open-apis/authen/v1/authorize") throw new Error("Invalid login destination");
    location.assign(target.href);
  } catch {setState("无法开始网页登录","请核对独立网页应用配置，现有 CLI 登录不会被改变。仍可使用“飞书打开”。");}
});
document.querySelector("#logout").addEventListener("click",async()=>{
  try {await post("/auth/logout");component?.destroy();location.reload();}
  catch {setState("退出失败","请重载本地页面后重试；不会退出 CLI 登录。");}
});
const errorMessages={
  "4":"当前网页用户没有该文档的阅读权限。", "1002":"文档已被删除。", "1004":"未找到原文档。",
  "-8":"组件网络连接失败。", "1":"飞书组件请求失败。", "-100":"组件不支持此文档地址。", "-500":"组件加载失败。"
};
async function mount() {
  try {
    const data=await post("/api/component-auth");
    setState("正在加载飞书原文…","身份由飞书校验；不会复制或另存原文。");
    component=new window.DocComponentSdk({src:data.src,mount:document.querySelector("#doc-pos"),auth:data.auth,
      size:{height:Math.max(420,window.innerHeight-280),width:"100%"},
      onAuthError:()=>setState("网页登录未通过","请重新完成独立网页登录，或检查应用权限与回调设置。飞书原链接仍可使用。"),
      onError:error=>setState("组件加载失败",errorMessages[String(error?.code)]??"原生组件返回异常；请使用飞书原链接。"),
      onMountTimeout:()=>setState("组件加载超时","请检查网络或使用飞书原链接。"),
      onMountSuccess:()=>setState("飞书组件已连接","直接在原文中阅读和编辑；可用操作由飞书权限决定。")});
    await component.start();
  } catch(error) {
    if(error.code==="COMPONENT_NOT_CONFIGURED") setState("原生文档嵌入尚未启用","请先完成独立网页应用配置；本地页和复制指示现在可用，CLI 授权无需变更。");
    else if(error.code==="WEB_LOGIN_REQUIRED") setState("尚未完成网页登录","点击“飞书网页登录”完成独立网页授权。已有 CLI 登录不等于组件登录。");
    else setState("原生文档组件暂不可用",`请使用飞书原链接。${Number.isSafeInteger(error.upstreamCode)?`飞书错误码：${error.upstreamCode}`:"请检查组件配置或网络。"}`);
  }
}
const script=document.createElement("script");
script.src="https://sf1-scmcdn-cn.feishucdn.com/obj/feishu-static/docComponentSdk/lib/1.0.13.js";
script.onload=()=>{
  if(typeof window.DocComponentSdk!=="function") {document.querySelector("#sdk-status").textContent="官方 SDK 接口未就绪；未启用原生嵌入。";return;}
  document.querySelector("#sdk-status").textContent="官方 Docs Component SDK 1.0.13 已加载；文档状态以组件内显示为准。";
  if(!document.querySelector("#login").disabled) mount();
};
script.onerror=()=>{document.querySelector("#sdk-status").textContent="官方 SDK 加载失败；原生文档未嵌入，飞书原链接仍可使用。";};
document.head.append(script);
