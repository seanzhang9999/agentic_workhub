# 固定 Codex 协调端操作协议 v1

部署目录 /Users/YOUR_USER/services/awiki-feishu-private-gateway。
协调会话由 `AWIKI_COORDINATOR_THREAD_ID` 指定，Viewer 与采集 CLI 必须设置同一个真实 ID。公开示例 UUID 不是可用目标。其他会话不得冒用该身份领取队列。
这是协调工作协议，不是 shell 自主调用桌面工具的接口。程序不自动唤起 Codex。

## 启动

用户在 /collect 入队表示仅授权自述采集；用户在固定协调会话请求处理队列后执行。
使用 `/usr/local/bin/node scripts/collector.mjs list` 查询。默认私有数据库在
`/Users/YOUR_USER/.local/share/awiki-feishu-private-gateway/gateway/collection-queue.sqlite`，可用 AWIKI_COLLECTION_DB 指定相同文件。
先核对当前会话身份。一次串行处理一个请求，不创建新会话，不切换模型。

## 状态机

1. queued：调用原生 read_thread，使用目标 target_id，核对真实标题；读取采集前最后业务轮次及会话开始时间。可见旧指令不是新授权。失败时保留队列并向用户报告，不猜标题/时间/项目。
2. `prepare <request-id> <coordinator-id>` 从 stdin 接受 JSON：target_id、title、created_at、last_turn_id、last_turn_started_at、last_turn_completed_at、project_label。时间是 UTC ISO 或 null；项目未知写“未核实”。只记录当时实际可见值。
3. `prompt <request-id>` 生成仅限自述提示词。发送前必须执行 `dispatch-intent <request-id> <coordinator-id>`，持久化不确定状态；之后才调用原生 send_message_to_thread。目标必须等于 target_id，只传 threadId 和 prompt，不传 model/thinking。不得改成 CLI resume 来假装支持 ChatGPT。
4. 无论发送工具返回成功还是网络错误，都先读取原会话核对 request_id。发现该用户消息后，用 `sent ...` 输入 `{ "turn_id": "真实采集轮次 UUID" }`。dispatch_uncertain 不得自动重发。找不到也不证明未发送，等待用户处理。
5. 按 15/30/60 秒间隔读取原会话，定期向用户报进度；空闲不等于回复已同步。未读到回复时执行 `pending ...` 并保留等待同步状态；停止当前轮次时明确尚未完成，不承诺后台继续。后续处理队列从这里恢复，不重复发问。
6. 只接受原目标会话实际 agentMessage 返回的 JSON；匹配 request_id，不用旧摘要冒充。`ingest ...` 从 stdin 接受 `{target_id,turn_id,report}`。report 必须包含 request_id/title/summary/goal/decisions数组/open_questions数组/next_step/history_coverage。不要保存完整工具输出、秘密或隐藏指令；超长报告应说明原因，不静默删减结论。
7. `register ...` 调用既有 loopback MCP 登记并回读。原始标题不采用自述新标题；采集流程状态与业务下一步分开保存。登记失败保留 reported；重试同请求不会重复发送。原生 ID 不是权限，其他同机进程可伪造输入；此处信任用户控制的协调端，非平台签名证明。

## 边界和恢复

当前只接入 ChatGPT UUID/普通链接/原生引用。不抓浏览器、不读取 Cookie、账号密钥、CLI 内部凭据。未知平台不猜。
同目标重复入队复用同一个请求，首版不支持自动周期采集或重新采集；以后新增显式“新一轮采集”。
外部发现器未来只调用 add，不得越过核对/发送意图/回复关联步骤。
只有本机用户可操作 CLI；coordinator_id 是误用防护，不是密码或强身份认证。
Viewer 重启会清除内存网页 OAuth 会话，不影响 CLI 用户授权或 Tunnel。

## 启停与回滚

无新增守护进程。Viewer 继续由现有 LaunchAgent 管理：`sh scripts/local-viewer.sh restart|stop|start|status`。
停止采集：不再执行协调命令；没有后台发送进程。查看队列无需恢复旧工作。
本次新增 collector.js、collector.mjs、采集页面脚本、本文、测试，以及 Viewer 的少量路由/构造参数和会话区入口。
回滚仅移除这些增量并重启 Viewer；保留 collection-queue.sqlite 便于恢复，不覆盖其他未提交改动，不删除飞书文档。
