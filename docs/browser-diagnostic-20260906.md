# 内嵌浏览器初步诊断（2026-09-06）

只读检查本机 Codex 日志及用户 DiagnosticReports，没有读取 Cookie/登录秘密，没有修改账号或关闭用户标签。

## 证据

- 当前协调会话调用浏览器表面发现时返回 tabs=[]，虽然用户提供的环境提示有4个标签。这是自动化表面发现和用户界面状态不一致，不是“网站拒绝了账号”的证据。
- 2026-09-06T00:36:14Z 的 Codex 日志重复出现 IAB backend info request failed / No ChatGPT browser route is available for browser session，目标是当前协调会话。
- 同次检查还出现 No target available。
- 前一天日志有 unregistered debugger listener，reason=session-activity-ended，同时 webContentsDestroyed=false；之后 renderer removed browser sidebar webview、tabType=closed。部分记录的路由归属 client-new-thread，而非正式协调ID。
- 这些关闭事件没有充分证据区分用户主动关闭、生命周期清理或路由缺陷，不能断定它们就是用户描述的全部闪退。
- 用户 DiagnosticReports 文件名检查未发现 Codex/Chrome/Electron 名称的崩溃报告；这不排除其他位置或未生成报告的崩溃。
- 显式创建本次 /collect 本地标签成功，标题及表单、队列空态均可读取。说明内嵌浏览器并非完全不可用。

## 当前结论

更值得排查的是：浏览器标签与会话路由绑定、会话活动结束后的自动化监听器清理、渲染界面与控制接口的生命周期同步。
不能认定“登录账号和 Codex 相同”导致退出；现有日志没有对应证据。也未证明原生 Chromium 进程发生崩溃。
尚未复现 ChatGPT 登录全过程；未为排查退出登录、清缓存、改权限或再次遍历列表。

社区相似报告（不同版本/系统，不能代替本机根因）：
- https://github.com/openai/codex/issues/34990 macOS 权限设置触发有原生崩溃栈的退出。
- https://github.com/openai/codex/issues/26946 Windows OAuth 挂起、标签消失及渲染进程挂起。

下次若重现，应记录发生时刻、消失的是单标签/整个浏览器面板/整个应用、当时所选会话以及是否刚切换会话。以时间关联路由关闭事件，必要时再向官方提交脱敏最小复现；不要发送原始认证日志。
