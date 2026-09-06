# Security policy

## Trust boundary

This service is intentionally a narrow policy gateway, not a general Feishu proxy. Keep the MCP listener on `127.0.0.1`; connect it only through a Secure MCP Tunnel. Do not publish port 8787 or add a public reverse proxy.

The configured named Wiki roots are the authorization boundary. A matching `space_id` alone is never sufficient: a target must appear in a fresh descendant traversal rooted at `AWIKI_ROOT_NODE_TOKEN` or another explicitly configured root such as `AWIKI_JOURNAL_ROOT_NODE_TOKEN`.

## Secrets

Never commit `.env`, the Lark CLI config directory, OAuth/device tokens, application secrets, tunnel credentials, or exported receipts. The container persists Lark credentials in the `lark_config` Docker volume.

## Write semantics

All write tools require optimistic concurrency (`expected_revision`) and an idempotency key (`operation_id`). A pending or failed receipt is treated as uncertain and is not automatically replayed.

## Independent local viewer

The viewer is a separate process at the explicitly configured `http://127.0.0.1:<port>` origin.
It must never be routed through the MCP Tunnel. It uses the existing fresh root traversal for every
page and every signing/login operation. A Wiki identifier alone grants no authority. The viewer
has no document-writing endpoint, arbitrary URL fetch, file server, or CLI credential export.

Exact Host/Origin checks, cross-site subresource rejection, no CORS, no-store, CSP and frame denial
protect the local surface. User-initiated cross-site top-level GET navigation is allowed so links
from ChatGPT work; POSTs require exact Origin, an HttpOnly SameSite local session, and CSRF proof.
OAuth callback is a special top-level GET guarded by single-use session-bound state and PKCE.
This is not isolation from malicious software or another trusted process on the same Mac.

An optional separate self-built Feishu web app uses only `drive:drive` for Docs Component.
It is **not** automatically enabled and does not alter CLI authorization or the root allowlist.
The App Secret is read only by the viewer from a user-owned 600 non-symlink file outside the repo.
User access tokens remain in process memory, expire, and are discarded on restart/logout.
No offline_access/refresh token grant or browser token storage is implemented.
Only official Docs Component signatures (page URL, DocsComponent API list, ten-minute single-use
official validity), app ID and the corresponding open ID reach the browser; no general API token,
ticket or App Secret does. The official signature is not a document-scoped OAuth grant: the SDK
continues to enforce the logged-in user's Feishu permissions. Root checks gate our page/signature
issuance, not the internal Feishu UI or manually manipulated browser code. Do not present this as
a resource-scoped token or a replacement for Feishu's user permission system.

No raw OAuth/CLI failures, callback queries or request headers are logged. Errors sent to the UI
are fixed safe codes, optionally a numeric upstream code. Do not add request/body debug logging.
Do not strip Feishu X-Frame-Options/CSP, proxy login cookies, or substitute generic iframe/Markdown
for an unverified native integration. SDK CDN loading alone does not prove auth, read or edit.

## Reporting

Report suspected vulnerabilities privately to the repository owner. Do not include live credentials, page contents, or tunnel secrets in an issue.
## 本地文档背景与会话控制区

用户明确要求后新增会话登记/读取/列表工具，仅限最小工作摘要。会话 ID 是定位线索，不是授权；记录是自述，不校验平台身份，不代表实时任务状态。禁止凭记录派发任务、读取全部聊天或越过原有文档根范围。关联文档在登记及 MCP 读取时重新校验；Viewer 仅展示当前目录允许的关联。

文档背景显式保存需要本机会话、Origin、CSRF 与原有根校验，独立 JSON 文件 600、原子替换及版本检查。会话登记存独立 SQLite 文件 600、事务及版本检查，不改原文或回执表。可识别凭据格式作拒绝检查，但不是完备秘密扫描器；调用方仍不得提交任何凭据、完整逐字稿或隐藏指令。

浏览器讨论草稿不持久化，不主动读剪贴板、不跨域读飞书选区。用户点击下载时仅下载其当前明文讨论包。模拟派发明确标注演示，不连接 Agent。新增目录和登记背景 API 仍仅在独立 loopback Viewer，不经 Tunnel；MCP 控制区工具则沿用既有私有 MCP 通道。当前版本不适合未经独立调用者鉴权的公网暴露。

会话采集器 `/collect` 是新的显式授权入口，只创建自述采集队列，不自动发送。仅固定协调会话执行原生操作；数据库中 coordinator_id 不是强认证。队列/API 仅在独立 Viewer，POST 需要同源会话及 CSRF。无浏览器凭据读取、任意 URL 代理或 shell API。发送不确定时禁止自动重发，回复必须匹配目标、轮次和请求编号；提供的报告视为协调端证据，不是平台签名。持久化仅存最小报告，不存完整逐字稿。
