import { loadConfig } from "./config.js";
import { LarkCli } from "./cli.js";
import { ScopeGuard } from "./scope.js";
import { loadWebAuthConfig } from "./viewer-auth.js";
import { makeViewer } from "./viewer.js";
import { ContextStore } from "./viewer-context.js";
import { dirname, join } from "node:path";
import { ControlStore } from './control.js';
import {Collector} from './collector.js';

try {
  const config=loadConfig();
  if(!config.localViewerBaseUrl || !config.feishuBaseUrl) throw new Error("viewer configuration missing");
  const base=new URL(config.localViewerBaseUrl),webConfig=await loadWebAuthConfig();
  const app=makeViewer(config,new ScopeGuard(new LarkCli(config),config),webConfig,fetch,new ContextStore(join(dirname(config.receiptDbPath),'viewer-context.json')),new ControlStore(join(dirname(config.receiptDbPath),'context-registry.sqlite')),new Collector(process.env.AWIKI_COLLECTION_DB||join(dirname(config.receiptDbPath),'collection-queue.sqlite')));
  const server=app.listen(Number(base.port),"127.0.0.1",()=>console.log(JSON.stringify({event:"viewer_started",host:"127.0.0.1",port:Number(base.port),component_configured:webConfig.enabled})));
  server.on("error",()=>{console.error('{"event":"viewer_listener_failed"}');process.exit(1);});
  for(const signal of ["SIGTERM","SIGINT"]) process.on(signal,()=>server.close(()=>process.exit(0)));
} catch { console.error('{"event":"viewer_start_failed","hint":"Check local viewer configuration and private secret file permissions; no CLI reauthorization is required"}');process.exit(1); }
