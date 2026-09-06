import path from "node:path";
import { viewerBase, feishuBase } from "./links.js";
function positiveInt(name, fallback) {
  const value = Number.parseInt(process.env[name] ?? String(fallback), 10);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
function token(name) {
  const value = (process.env[name] ?? "").trim();
  if (!/^[A-Za-z0-9_-]{8,}$/.test(value)) throw new Error(`${name} is missing or invalid`);
  return value;
}
export function loadConfig() {
  const awikiRoot = token("AWIKI_ROOT_NODE_TOKEN");
  const journalRoot = (process.env.AWIKI_JOURNAL_ROOT_NODE_TOKEN ?? "").trim();
  if (journalRoot && !/^[A-Za-z0-9_-]{8,}$/.test(journalRoot)) throw new Error("AWIKI_JOURNAL_ROOT_NODE_TOKEN is invalid");
  return Object.freeze({
    localViewerBaseUrl: viewerBase(process.env.AWIKI_LOCAL_VIEWER_BASE_URL),
    feishuBaseUrl: feishuBase(process.env.AWIKI_FEISHU_BASE_URL),
    host: (process.env.HOST ?? "127.0.0.1").trim() || "127.0.0.1",
    port: positiveInt("PORT", 8787), rootNodeToken: awikiRoot,
    allowedRoots: Object.freeze({awiki:awikiRoot,...(journalRoot?{journal:journalRoot}:{})}),
    publicBaseUrl: (process.env.PUBLIC_BASE_URL ?? "").trim(), larkCli: process.env.LARK_CLI_BIN || "lark-cli",
    larkConfigDir: process.env.LARKSUITE_CLI_CONFIG_DIR || "/data/lark-cli",
    larkWorkDir: path.resolve(process.env.LARK_CLI_WORK_DIR || "/app/tmp"),
    receiptDbPath: path.resolve(process.env.RECEIPT_DB_PATH || "/data/gateway/receipts.sqlite"),
    maxTreeDepth: positiveInt("MAX_TREE_DEPTH", 8), maxTreeNodes: positiveInt("MAX_TREE_NODES", 500),
    maxMarkdownBytes: positiveInt("MAX_MARKDOWN_BYTES", 500000), maxImageBytes: positiveInt("MAX_IMAGE_BYTES", 10485760),
    larkTimeoutMs: positiveInt("LARK_TIMEOUT_MS", 90000)
  });
}
