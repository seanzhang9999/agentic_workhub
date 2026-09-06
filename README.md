# Agentic Workhub

把工作成果与关系留在 Agent 平台之外：本仓库同时包含 **AWiki Feishu MCP Gateway + 本地 Web 文档空间 + 会话控制区 + 固定 Codex 协调端采集器**，不是仅包含最后的采集页面。

- 完整工作与实验索引：[WORK_HISTORY](docs/WORK_HISTORY.md)
- Web 原生文档组件与独立网页授权：[本地 Viewer](docs/local-viewer.md)
- 文档/会话信息模型与交互故事：[原型设计](docs/context-console-prototype.md)
- 会话采集器：[协调协议](docs/collector-coordinator.md)
- 脱敏浏览器诊断：[诊断记录](docs/browser-diagnostic-20260906.md)

这是公开交付副本；真实用户路径、会话 ID、飞书节点与域名均替换为示例。文档中的历史验收是原部署的结果，不表示 clone 后免配置即可连接用户文档。
部署前配置 `.env` 和可选 `viewer.env`；采集器需在 Viewer 和 CLI 环境一致设置 `AWIKI_COORDINATOR_THREAD_ID`，未配置时禁止入队。Node >=22.12；安装依赖后运行 `npm test`。

原始 Gateway 基线来自 `seanzhang9999/awiki-feishu-private-gateway` 的 `b358023`，本仓库是包含后续本机修改的干净源码快照，不迁移原仓库历史中的潜在私人数据。20项测试包含模拟上游；跨会话平台调用由宿主 Codex 执行，尚非无人值守服务。

## AWiki Feishu Private Gateway

部署在自有 Oracle VM 上的**范围锁定**飞书 MCP Gateway。它把官方 `lark-cli` 包装成八个稳定工具，并通过 Secure MCP Tunnel 以出站 HTTPS 接入 ChatGPT；Oracle 无需开放 MCP 入站端口。

## 安全边界

Gateway 只注册：`identity_status`、`list_allowed_roots`、`get_project_tree`、`create_child_page`、`create_journal_entry`、`read_page`、`append_markdown`、`replace_page`、`upload_page_image`、`get_sync_receipt`。

所有页面操作仅限命名白名单根及后代：`awiki` 对应 `AWIKI_ROOT_NODE_TOKEN`，可选的 `journal` 对应 `AWIKI_JOURNAL_ROOT_NODE_TOKEN`。同一知识空间内的其他页面仍然不可访问。写入还必须：

- 先读取并携带当前 `expected_revision`；版本变化即停止。
- 提供稳定且唯一的 `operation_id`；相同 ID 与相同输入只返回原回执。
- 相同 ID 对应不同输入会被拒绝；中断或失败不会自动重放。

服务不提供 shell、任意 HTTP、任意文件访问、删除、移动、权限或成员管理工具，也不会返回飞书凭据。

## Oracle 首次初始化

前提：已安装 Git、Docker Engine、Docker Compose v2，部署用户可以运行 Docker。

```bash
git clone https://github.com/seanzhang9999/awiki-feishu-private-gateway.git
cd awiki-feishu-private-gateway
cp .env.example .env
```

编辑 `.env`，将根页面 URL 中 `/wiki/` 后的 token 写入：

```dotenv
AWIKI_ROOT_NODE_TOKEN=wikcn_xxx
AWIKI_JOURNAL_ROOT_NODE_TOKEN=wikcn_optional_journal_root
PUBLIC_BASE_URL=https://gateway.example.com
```

然后运行：

```bash
./scripts/oracle-init.sh
```

脚本会构建容器，并运行 `lark-cli config init --new` 与 `lark-cli auth login --recommend`。按终端提示在浏览器完成授权。凭据只保存在 Oracle 的 Docker volume `lark_config`。

## 运行与检查

```bash
docker compose up -d
./scripts/doctor.sh
docker compose logs -f --tail=100 gateway
```

本机端点是 `http://127.0.0.1:8787/mcp`。保持它只监听 loopback，让 Secure MCP Tunnel 在 Oracle 上连接。无需让 `gateway.example.com` 反向代理 8787，更不应把 8787 暴露到公网。

## 接入 ChatGPT

1. 在 Oracle 创建/运行 Secure MCP Tunnel，上游指向 `http://127.0.0.1:8787/mcp`。
2. 在 ChatGPT 创建私有插件，传输方式选择 Tunnel，并选中对应 `tunnel_id`。
3. 连接后先调用 `identity_status`、`get_project_tree`；确认根页面标题和范围后再写入。

Tunnel 安装与配对命令以 ChatGPT 管理界面当时显示的指令为准。不要把 tunnel secret 写入 Git、`.env` 或聊天记录。

## 更新

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
./scripts/doctor.sh
```

## 已知限制

- `replace_page` 使用 overwrite；富媒体、评论或 CLI 暂不支持的块可能损失，调用方必须明确确认影响。
- `upload_page_image` 只接受 base64 图片，默认最大 10 MiB，并在文末插入。
- 范围校验实时遍历根页面子树；默认最大深度 8、最大节点数 500。
- 当前使用飞书用户身份；如组织策略禁止长期用户令牌，需改用受控企业应用身份。

## Mac 本地文档页面（可选）

新增独立的 loopback Web 服务，不经过 MCP Tunnel，也不在 8787 上增加网页/API。
部署、网页授权要求、验证证据及回滚见 [本地 Viewer 接入说明](docs/local-viewer.md)。

在 `.env` 设置实际租户来源与本地来源后，普通 Docx 工具结果的 `page`、树的 `root/nodes` 会添加
`feishu_url` 和 `awiki_local_url`，不删除旧字段。创建、随笔、追加、替换、图片写入结果同样覆盖；旧的成功幂等回放也会补充链接。
非 Docx 类型只返回飞书链接，不声称支持嵌入。不增加 MCP 工具。

`awiki_local_url` **仅供运行服务的 Mac 浏览器打开**。云端 Agent 必须继续用 `read_page(page_ref)` 读取；手机和其他电脑请用 `feishu_url`。本地 URL 不赋予额外权限。

页面中的“复制给Agent继续讨论”提供标题、Wiki 资源引用、飞书链接以及默认只读指令。
原生组件默认关闭：本地页面可用不等于原生嵌入已验收。网页 OAuth 独立于 CLI，禁止导出 CLI token。

## 设计依据

- [OpenAI Secure MCP Tunnels](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Connect and test a plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [Official Lark CLI](https://github.com/larksuite/cli)
# 文档空间与会话登记（本机增量）

打开 `http://127.0.0.1:8788/space` 浏览现有授权根的文档树与会话登记卡；`/guide` 有写入后登记、旧文档补登、Agent 自述三套提示词。文档页可粘贴引用、补充问题并复制/下载讨论包，不自动获取组件选区。

用户明确授权的控制区工具：`register_context`、`read_context`、`list_contexts`。它们只登记最小上下文，不是完整聊天导入或任务派发。请刷新客户端工具列表。原有工具和飞书范围保持不变。

设计与后续路线：`docs/context-console-prototype.md`。本机新增数据与现有回执同目录，分别为 `viewer-context.json` 和 `context-registry.sqlite`，不提交 Git。

## 固定协调端会话采集器

本机打开 `/collect` 接入 ChatGPT 原会话 ID/链接。队列持久化、去重、记录发送意图、等待同步、关联自述回复，再经既有 MCP 登记并回读。程序本身不自动唤起 Codex；由固定的当前协调会话执行原生跨会话操作，不改模型，不继续旧任务。使用与恢复协议见 [协调端操作说明](docs/collector-coordinator.md)。
