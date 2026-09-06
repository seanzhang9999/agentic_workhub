import { GatewayError } from "./errors.js";
const dataOf=r=>r?.data??r?.structuredContent?.data??r;
function node(raw){const n=raw?.node??raw;return {space_id:String(n.space_id??""),node_token:String(n.node_token??""),obj_token:String(n.obj_token??""),obj_type:String(n.obj_type??""),parent_node_token:String(n.parent_node_token??""),title:String(n.title??""),has_child:Boolean(n.has_child)};}
export class ScopeGuard {
  constructor(cli,config){this.cli=cli;this.config=config;}
  roots(){return this.config.allowedRoots??{awiki:this.config.rootNodeToken};}
  rootToken(alias="awiki"){const value=this.roots()[alias];if(!value)throw new GatewayError("UNKNOWN_ROOT","The requested root alias is not configured");return value;}
  async tree(requestedDepth=this.config.maxTreeDepth,alias="awiki"){
    const rootToken=this.rootToken(alias),limit=Math.min(requestedDepth??this.config.maxTreeDepth,this.config.maxTreeDepth); const root=node(dataOf(await this.cli.nodeGet(rootToken)));
    if(root.node_token!==rootToken)throw new GatewayError("ROOT_MISMATCH","Configured root does not resolve to the expected node");
    if(!root.space_id)throw new GatewayError("ROOT_INVALID","Configured root has no wiki space_id");
    const nodes=[{...root,depth:0}],queue=root.has_child?[{token:root.node_token,depth:1}]:[]; let truncated=false;
    while(queue.length){const {token,depth}=queue.shift();if(depth>limit){truncated=true;continue;}const page=dataOf(await this.cli.nodeList(root.space_id,token));const children=page?.nodes??page?.items??[];
      for(const raw of children){const n=node(raw);if(!n.node_token||n.space_id!==root.space_id)throw new GatewayError("TREE_INVALID","Feishu returned an invalid project node");nodes.push({...n,depth});if(nodes.length>this.config.maxTreeNodes)throw new GatewayError("TREE_LIMIT","Project tree exceeds the configured node limit");if(n.has_child){if(depth<limit)queue.push({token:n.node_token,depth:depth+1});else truncated=true;}}
    } return {alias,root,nodes,truncated};
  }
  async resolveAllowed(ref){const resolved=node(dataOf(await this.cli.nodeGet(ref)));for(const alias of Object.keys(this.roots())){const {nodes}=await this.tree(this.config.maxTreeDepth,alias);const allowed=nodes.find(n=>n.node_token===resolved.node_token&&n.obj_token===resolved.obj_token);if(allowed){if(allowed.obj_type!=="docx")throw new GatewayError("UNSUPPORTED_PAGE","Only docx pages are supported");return {...allowed,root_alias:alias};}}throw new GatewayError("OUT_OF_SCOPE","The requested page is outside all configured root trees");}
}
