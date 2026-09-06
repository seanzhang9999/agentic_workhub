import test from "node:test";import assert from "node:assert/strict";import { ScopeGuard } from "../src/scope.js";
const config={rootNodeToken:"wikcnROOT123",maxTreeDepth:4,maxTreeNodes:20};
const records={wikcnROOT123:{data:{space_id:"1",node_token:"wikcnROOT123",obj_token:"docxROOT",obj_type:"docx",title:"root",has_child:true}},wikcnCHILD123:{data:{space_id:"1",node_token:"wikcnCHILD123",obj_token:"docxCHILD",obj_type:"docx",parent_node_token:"wikcnROOT123",title:"child",has_child:false}},wikcnOTHER123:{data:{space_id:"1",node_token:"wikcnOTHER123",obj_token:"docxOTHER",obj_type:"docx",title:"other",has_child:false}}};
const cli={nodeGet:async ref=>records[ref],nodeList:async()=>({data:{nodes:[records.wikcnCHILD123.data]}})};
test("allows a descendant",async()=>{assert.equal((await new ScopeGuard(cli,config).resolveAllowed("wikcnCHILD123")).obj_token,"docxCHILD");});
test("rejects a same-space non-descendant",async()=>{await assert.rejects(()=>new ScopeGuard(cli,config).resolveAllowed("wikcnOTHER123"),/outside/);});
test("supports a second named root",async()=>{const second={...config,allowedRoots:{awiki:"wikcnROOT123",journal:"wikcnOTHER123"}};assert.equal((await new ScopeGuard(cli,second).resolveAllowed("wikcnOTHER123")).root_alias,"journal");});
