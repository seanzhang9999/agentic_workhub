# AWiki Mac 本地文档页面

## 2026-09-05 交互与会话控制区更新

- 新入口 `/space`：授权文档树、数量、文档简介/目标/来源线索、关联会话卡；`/guide` 提供三套 Agent 登记提示词。
- 文档页右侧加入引用片段、问题、讨论方式、指示预览、复制和 Markdown 讨论包下载。草稿只在页面内，刷新清空；不自动读取剪贴板或飞书选区，不实际派发 Agent。
- 文档背景信息显式保存至与 `RECEIPT_DB_PATH` 同目录的 `viewer-context.json`，私有 600，原子写入、版本冲突检查。与飞书正文独立。
- 会话登记至同目录 `context-registry.sqlite`，私有 600；独立表、事务与版本检查。当前 13 个 MCP 工具 = 原有 10 个 + `register_context` / `read_context` / `list_contexts`。原文范围不变。ChatGPT 连接需要刷新工具列表才能看到新增工具。
- 会话摘要是自述而非平台身份认证；原生 ID 可空，普通 ChatGPT 链接只允许无查询参数的 `/c/` 地址。登记本身不授权启动任务或读取其他聊天。
- 本轮新增本机背景/上下文记录，没有写入或修改飞书正文。重启 Viewer 会结束网页会话，用户可能需要重新网页登录；CLI 授权未变。
- 当前界面与交互规范、快速导入边界、指定会话续谈的选项和故事见 `docs/context-console-prototype.md`。
- 自动化测试现为 17 项通过；本机实际 catalog 返回 2 个根、25 个 Docx（含根）、1 张当前任务登记卡。此数量是该次检查的快照，不是账户全部文档数。
- 新增私有背景/登记文件不由回滚补丁删除；回滚代码后仍保留数据。需要停用时先保留备份，不能清理整个回执或 CLI 目录。

## 当前交付与边界

本地 Viewer 已作为独立进程部署于 `http://127.0.0.1:8788`，Gateway 仍在 8787。
Viewer 不经过 Tunnel，不开放公网，不修改原文或授权根。

**当前原生嵌入状态：嵌入可读、嵌入可编辑，2026-09-05 已完成本机实际验收。**
独立网页应用配置与用户授权已完成。Mac 浏览器中的官方 SDK 1.0.13 实际显示原文正文、目录；专用测试页通过组件编辑后显示“已经保存到云端”，MCP 读取确认测试文字与 revision=3。未改动任何既有飞书业务页面。

保留的专用测试子页面：

- [AWiki 本机测试页](http://127.0.0.1:8788/r/TEST_WIKI_NODE_REPLACE_ME)
- [对应飞书测试页](https://YOUR_TENANT.feishu.cn/wiki/TEST_WIKI_NODE_REPLACE_ME)
- 测试标记：`AWIKI-VIEWER-EDIT-20260905-01`；父节点为已有 awiki 授权根。

已选择的只读验证对象：

- 标题：当 MCP 成为用户能力协议：Agent、数据产权与个人控制平面
- [AWiki 本机打开](http://127.0.0.1:8788/r/READ_WIKI_NODE_REPLACE_ME)
- [飞书打开](https://YOUR_TENANT.feishu.cn/wiki/READ_WIKI_NODE_REPLACE_ME)
- 资源引用：`READ_WIKI_NODE_REPLACE_ME`；现有 MCP 参数为 `read_page({page_ref, detail:"simple"})`。
- Wiki 通过现有 `wiki +node-get --as user` 解析为真实 Docx 对象，SDK 使用该对象的 `/docx/` 地址；未复制、移动或另存文档。

## 官方依据与本地来源结论（2026-09-05 核对）

1. [网页组件概述](https://open.feishu.cn/document/uYjL24iN/uQDO3YjL0gzN24CN4cjN/web-component-overview)：Docs Component 是把飞书文档嵌入业务网页；只适用于自建应用。不是 [Docs Add-on](https://open.feishu.cn/document/client-docs/docs-add-on/docs-add-on-introduction)。
2. [开始使用](https://open.feishu.cn/document/common-capabilities/web-components/uYDO3YjL2gzN24iN3cjN/introduction)：当前示例 SDK 为 `https://sf1-scmcdn-cn.feishucdn.com/obj/feishu-static/docComponentSdk/lib/1.0.13.js`，入口为 `new window.DocComponentSdk({src,mount,auth,size,...})` 与 `start()`。用户身份依照该用户的文档读写权限；应用身份不能编辑。
3. [组件 SDK 鉴权流程](https://open.feishu.cn/document/common-capabilities/web-components/component-sdk-authentication-process)：服务端以独立网页登录取得的 user access token 换取 `jsapi_ticket`，按官方顺序生成 SHA-1 签名；前端仅获得签名和必要 SDK 参数。签名包含页面 URL（不带 query/fragment）、毫秒时间、随机串、`DocsComponent` 列表；官方有效期十分钟，单次鉴权。
4. [接入需知](https://open.feishu.cn/document/web-components/uYDO3YjL2gzN24iN3cjN/access-notice) 与 [FAQ Q22](https://open.feishu.cn/document/uYjL24iN/uYDO3YjL2gzN24iN3cjN/faq)：Wiki 地址需解析真实文档对象，不直接作为组件 src。已知且经验证的本租户域名用于拼接 `/docx/<obj_token>`；不要盲猜其他租户域名。
5. [获取授权码](https://open.feishu.cn/document/authentication-management/access-token/obtain-oauth-code) 的当前 PKCE 指引明确配对 [v2 token 接口](https://open.feishu.cn/document/authentication-management/access-token/get-user-access-token)。实现 `accounts.feishu.cn` 授权地址、PKCE S256、一次性 state、精确回调，JSON 请求 `https://open.feishu.cn/open-apis/authen/v2/oauth/token`。初始 v3/form 请求实际返回 oauth_token 20049；改用上述官方配对后成功。额外将授权挑战值改成不匹配值进行真实反向测试，v2 明确返回 20049，证明本流程没有跳过 PKCE 校验。未删除或降级 PKCE；不将这次兼容性结果解释为 v3 普遍不可用。
6. [配置重定向 URL](https://open.feishu.cn/document/develop-web-apps/configure-redirect-urls)：回调须加入安全设置的重定向 URL 列表。官方 OAuth 示例包含 HTTP localhost 回调，未发现上述 Docs Component 文档明确禁止 HTTP loopback，亦未列出独立 Docs Component 可信域名/能力申请开关。

**已经证实**：该应用接受 HTTP loopback 回调；`http://127.0.0.1:8788/r/...` 签名通过组件鉴权，能查看真实原文并编辑有权限的测试文档。证据包括原生组件正文/目录、云端保存提示及独立 MCP 读取的测试标记。不代表其他租户、浏览器或 localhost 域名已经验证。
如后台明确拒绝该来源，应记录具体安全错误，停留在当前页面外壳；不自动改 HTTPS、公网、Tunnel 或反向代理。

## 后台与本机配置（当前已完成，以下保留为复现说明）

建议为本地 Viewer 单独使用一个**企业自建应用**，避免动现有 CLI 应用。
现有 CLI 应用也只有在所有者确认复用后才配置；不要从 CLI 内部文件读取其 Secret。

| 后台位置 | 填写/处理 |
| --- | --- |
| 飞书开放平台 → 开发者后台 → 企业自建应用 → 凭证与基础信息 | 获取该网页应用 App ID；App Secret 仅填写到下述本机文件，不发聊天 |
| 应用 → 开发配置 → 权限管理 → 开通权限 → 用户身份权限 | `drive:drive`，官方名称“查看、评论、编辑和管理云空间中所有文件” |
| 应用 → 开发配置 → 安全设置 → 重定向 URL → 添加 | `http://127.0.0.1:8788/oauth/callback`，必须是该完整地址，不替换为 localhost |
| 应用发布 → 版本管理与发布 | 若租户将上述权限设为需审核，则创建版本并等待管理员审核生效；免审权限无需为了本例额外发布 |
| 应用可用范围 | 保持最小，只包含实际使用本机 Viewer 的用户 |

无需添加成员名片 `component:user_profile`、搜索 `component:selector`、通讯录或离线访问 `offline_access`。
未自动申请/修改任何权限；`drive:drive` 是官方组件要求，范围比单文档更宽，须由应用所有者在后台判断并授权。
网页后端仍只为已有 allowlist 范围内的 Docx 页面签名。官方 SDK 签名不是“根页面限定 token”；不能声称它限制了用户在飞书内部的全部行为。

本机文件（均不要提交 Git）：

1. `/Users/YOUR_USER/services/awiki-feishu-private-gateway/viewer.env`：把 `AWIKI_DOCS_APP_ID` 填成上述网页应用的 App ID，准备完成后才把 `AWIKI_DOCS_COMPONENT_ENABLED` 改为 `true`。
2. `/Users/YOUR_USER/.local/share/awiki-feishu-private-gateway/viewer-secrets/app-secret`：由用户在本机编辑，内容**只有该网页应用的 App Secret**，不带引号、变量名或说明。目录 700、文件 600，只能由当前用户拥有；符号链接被拒绝。
3. `AWIKI_DOCS_APP_SECRET_FILE` 已指向上述文件。Secret 不进入 `.env`、LaunchAgent、进程参数、浏览器、CLI 子进程或日志。

重启 Viewer 后打开上述本地文档页，点击“飞书网页登录”。流程会转到官方飞书授权页，并回到固定本地回调；不要复制授权码到聊天。
浏览器只保存随机 HttpOnly 会话 Cookie，用户 access token 仅在 Viewer 内存，未申请长期刷新权限。服务重启、会话过期或注销后须重新网页登录，但不会影响 CLI 登录。

无需为此进行 `lark-cli auth login`，无需修改 Tunnel。若真实网页登录失败，页面只显示固定安全错误或数字错误码，保留飞书原链接。

## 运行方式

部署目录：`/Users/YOUR_USER/services/awiki-feishu-private-gateway`。
LaunchAgent：`/Users/YOUR_USER/Library/LaunchAgents/com.awiki.local-viewer.plist`。
真实路径已核对：Node `/usr/local/bin/node`，CLI `/usr/local/bin/lark-cli`（指向已安装的官方 npm CLI 脚本），PATH 将 `/usr/local/bin` 放在前面。
CLI 配置仍是 `/Users/YOUR_USER/.local/share/awiki-feishu-private-gateway/lark-cli`，未读取其秘密文件。

```sh
cd /Users/YOUR_USER/services/awiki-feishu-private-gateway
sh scripts/local-viewer.sh status
sh scripts/local-viewer.sh stop
sh scripts/local-viewer.sh start
# 修改 .env / viewer.env 后，只重启 Viewer：
sh scripts/local-viewer.sh restart
```

`restart` 用于已加载的服务；停止之后用 `start`。如果改动 LaunchAgent plist 本身，先 stop 再 start。
首次新增双链接已重启 Gateway。以后修改共享链接配置时再运行：

```sh
launchctl kickstart -k gui/$(id -u)/com.awiki.feishu-gateway
```

前台调试（先停止 Viewer，避免端口冲突）：

```sh
/usr/local/bin/node --env-file=.env --env-file=viewer.env src/viewer-index.js
```

不要开启 HTTP 请求日志、调试 token 输出或打印整个环境。
Viewer 日志只记录启动/启动失败安全事件，位于 `~/Library/Logs/awiki-local-viewer.log` 和 `.error.log`。

## 本机验证记录

- 修改前已有 4 项测试通过；新增安全、链接和 OAuth/SDK 模拟测试后共 13 项通过。
- 使用真实 MCP 客户端连接本机 8787：10 个既有工具，未增加；身份 authenticated=true。
- 实际 `read_page` 通过，上述文档 revision=2；旧 markdown/revision/page 字段仍在，两个链接指向同一 Wiki 文档。
- 实际 journal 一级树通过（3 个节点），Docx 节点同时有双链接。
- 8787 `/healthz` 返回 `{ "ok": true }`；8788 健康返回 viewer 正常、`component_configured:true`。
- Mac 浏览器实际显示正确标题与飞书链接；官方 1.0.13 SDK 加载成功；复制操作返回成功，复制指示使用 `read_page` 与 `page_ref`，没有授权材料。
- 真实非允许根页面访问拒绝；外部 Origin 拒绝。单元测试覆盖页面和签名 API 的范围拒绝、Host/Origin/CSRF、跨站 iframe、静态文件隔离、标题转义、非 Docx 降级。
- Gateway 的 `/r/...` 返回 404；Viewer 的 `/mcp` 返回 404。
- 两个服务实际只监听 `127.0.0.1:8787`、`127.0.0.1:8788`。
- Tunnel plist 与 profile 修改前后 SHA-256 一致，未停止或重启 Tunnel。本机 MCP 回归通过，不冒称重新跑过 ChatGPT 云端端到端调用。
- OAuth 交换、一次性 state、PKCE、票据签名、SDK 回调状态有模拟上游/DOM 测试；另完成真实网页登录、原生嵌入查看、错误 PKCE 挑战值拒绝（20049）和上述专用测试页编辑读回验收。
- 测试页由既有 `create_child_page` 创建；组件写入标记后云端保存，`read_page` 返回 revision=3 且包含唯一标记。只读验证的既有文章仍为 revision=2。复制按钮显示成功。

## 回滚（只撤销本次功能）

实施前已有用户修改，禁止 `git reset --hard`、`git checkout --` 或整仓回退。
回滚补丁会保存在本机 `~/.local/share/awiki-feishu-private-gateway/viewer-rollback-20260905/viewer-change.patch`，仅描述本次仓库变动，不包含 `.env` 或秘密。
执行前先停止 Viewer，并用 `git apply --reverse --check` 检查补丁；有冲突就停止人工合并，不能覆盖后续修改。

```sh
cd /Users/YOUR_USER/services/awiki-feishu-private-gateway
sh scripts/local-viewer.sh stop
git apply --reverse --check /Users/YOUR_USER/.local/share/awiki-feishu-private-gateway/viewer-rollback-20260905/viewer-change.patch
git apply --reverse /Users/YOUR_USER/.local/share/awiki-feishu-private-gateway/viewer-rollback-20260905/viewer-change.patch
```

随后仅移除 `.env` 中本次新增的 `AWIKI_FEISHU_BASE_URL`、`AWIKI_LOCAL_VIEWER_BASE_URL` 两行（若用户已改动，先确认）。
将 `com.awiki.local-viewer.plist` 从 `~/Library/LaunchAgents` 移到本机回滚目录，防止下次登录重启。
`viewer.env` 可保留在原路径且权限保持 600，也可移到私有回滚目录；含 Secret 的文件只由用户自行处理。
最后只重启 `com.awiki.feishu-gateway`。回滚不改 Tunnel、CLI 凭据、授权根、回执数据库或任何飞书文档。
