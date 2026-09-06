import { spawn } from "node:child_process";
import { GatewayError } from "./errors.js";
function redact(text) { return String(text).replace(/(app_secret|access_token|refresh_token|client_secret)["'=: ]+[^\s,"']+/gi,"$1=[REDACTED]").slice(0,4000); }
export class LarkCli {
  constructor(config) { this.config=config; }
  async run(args,{cwd=this.config.larkWorkDir,stdin}={}) {
    if (!Array.isArray(args)||args.some(x=>typeof x!=="string")) throw new GatewayError("INVALID_COMMAND","Internal command arguments are invalid");
    return await new Promise((resolve,reject)=>{
      const child=spawn(this.config.larkCli,args,{cwd,shell:false,env:{...process.env,LARKSUITE_CLI_CONFIG_DIR:this.config.larkConfigDir},stdio:[stdin===undefined?"ignore":"pipe","pipe","pipe"]});
      let stdout="",stderr=""; const timer=setTimeout(()=>child.kill("SIGKILL"),this.config.larkTimeoutMs);
      child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8"); child.stdout.on("data",c=>stdout+=c); child.stderr.on("data",c=>stderr+=c);
      child.on("error",e=>{clearTimeout(timer);reject(new GatewayError("CLI_UNAVAILABLE","lark-cli is unavailable",{message:e.message}));});
      child.on("close",(code,signal)=>{ clearTimeout(timer);
        if(code!==0){reject(new GatewayError("LARK_CLI_ERROR","Feishu operation failed",{exit_code:code,signal,diagnostic:redact(stderr||stdout)}));return;}
        try { const parsed=JSON.parse(stdout); if(parsed?.ok===false){reject(new GatewayError("LARK_BUSINESS_ERROR",parsed?.error?.message||"Feishu rejected the operation",{type:parsed?.error?.type,code:parsed?.error?.code}));return;} resolve(parsed); }
        catch { reject(new GatewayError("INVALID_CLI_RESPONSE","lark-cli returned a non-JSON response",{diagnostic:redact(stdout)})); }
      });
      if(stdin!==undefined) child.stdin.end(stdin);
    });
  }
  authStatus(){return this.run(["auth","status","--json","--verify"]);}
  nodeGet(ref){return this.run(["wiki","+node-get","--node-token",ref,"--as","user","--format","json"]);}
  nodeList(spaceId,parent){const a=["wiki","+node-list","--space-id",spaceId,"--as","user","--page-all","--page-limit","20","--format","json"];if(parent)a.push("--parent-node-token",parent);return this.run(a);}
  nodeCreate(parent,title){return this.run(["wiki","+node-create","--parent-node-token",parent,"--title",title,"--obj-type","docx","--as","user","--format","json"]);}
  docFetch(obj,detail="full"){return this.run(["docs","+fetch","--doc",obj,"--doc-format","markdown","--detail",detail,"--as","user","--format","json"]);}
  docUpdate(obj,command,markdown,revision){return this.run(["docs","+update","--doc",obj,"--command",command,"--doc-format","markdown","--content","-","--revision-id",String(revision),"--as","user","--format","json"],{stdin:markdown});}
  mediaInsert(obj,file,caption){const a=["docs","+media-insert","--doc",obj,"--file",file,"--type","image","--align","center","--as","user","--format","json"];if(caption)a.push("--caption",caption);return this.run(a);}
}
