import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { GatewayError } from "./errors.js";
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));return value;}
export function stableHash(value){return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");}
export class ReceiptStore {
  constructor(file){mkdirSync(path.dirname(file),{recursive:true});this.db=new DatabaseSync(file);this.db.exec("CREATE TABLE IF NOT EXISTS receipts (operation_id TEXT PRIMARY KEY,tool_name TEXT NOT NULL,input_hash TEXT NOT NULL,status TEXT NOT NULL,result_json TEXT,error_json TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)");}
  get(id){const r=this.db.prepare("SELECT * FROM receipts WHERE operation_id = ?").get(id);return r?{...r,result:r.result_json?JSON.parse(r.result_json):null,error:r.error_json?JSON.parse(r.error_json):null}:null;}
  begin(id,tool,input){const hash=stableHash(input),old=this.get(id);if(old){if(old.tool_name!==tool||old.input_hash!==hash)throw new GatewayError("OPERATION_ID_CONFLICT","operation_id was already used with different input");if(old.status==="succeeded")return {replay:true,result:old.result};throw new GatewayError("OPERATION_UNCERTAIN","A previous attempt is pending or failed; inspect its receipt before deciding whether to retry",{status:old.status});}const now=new Date().toISOString();this.db.prepare("INSERT INTO receipts VALUES (?, ?, ?, 'pending', NULL, NULL, ?, ?)").run(id,tool,hash,now,now);return {replay:false};}
  succeed(id,result){this.db.prepare("UPDATE receipts SET status='succeeded',result_json=?,updated_at=? WHERE operation_id=?").run(JSON.stringify(result),new Date().toISOString(),id);}
  fail(id,error){this.db.prepare("UPDATE receipts SET status='failed',error_json=?,updated_at=? WHERE operation_id=?").run(JSON.stringify({code:error.code??"UNKNOWN",message:error.message}),new Date().toISOString(),id);}
}
