export const registrationPrompts = [
  {title:'写入或修改文档后登记',text:`在完成我已经明确授权的文档写入后，请为这次工作登记最小上下文，不额外修改正文：
1. 先调用 list_contexts 查找本会话已有的登记。已存在则调用 read_context 读取最新 revision，保留其他关联文档，更新而不是重复创建。
2. 使用 register_context 登记 provider、native_session_id、session_url、title、agent_label、identity_basis、summary、goal、decisions、open_questions、next_step、document_refs。
3. native_session_id 只能来自当前运行环境的可靠元数据或用户提供的真实标识。无法获得就填 null，并在 identity_basis 说明原因。不要把文档 ID、API conversation ID、随机 UUID 冒充 ChatGPT/Codex 的真实会话 ID。session_url 无法获得时填 null；不要创建公开分享链接。
4. context_id 只是本地登记键，可新建稳定的 registration-前缀标识，不具有原会话定位能力。新记录 expected_revision=0，更新使用最新 revision；同一次重试复用相同登记键。
5. document_refs 只填实际成功操作并且在当前授权根中的 Wiki 节点引用。summary 说明做了什么，goal 说明为何做，decisions 记录关键决定，open_questions 记录未决问题，next_step 说明下次如何继续。不要把“参与修改”说成“原创作者”。
6. 不保存凭据、完整逐字稿、隐藏指令或与当前任务无关的私人信息。登记卡是自述快照，不是实时运行状态。
7. 汇报文档写入和上下文登记各自的结果；登记失败不等于文档写入失败，不要因此重复写正文。写入授权不自动允许继续启动其他 Agent。`},
  {title:'为已有文档补充来历',text:`请给我指定的已有文档补充最小上下文登记，不改飞书正文：
1. 只对我明确指定、当前授权范围内的文档调用 read_page，记录真实 page_ref 和当前内容。先 list_contexts / read_context 检查已有记录。
2. 将“当前补登会话”和“原始创作会话”严格区分。你当前能见到的会话 ID 只能证明补登发生在这里，不能冒充原作者会话。
3. 原始会话 ID/链接必须来自我提供的线索或已授权读取的真实会话记录。不确定填 null，identity_basis 写明“原始来源未知；本记录由当前会话补登”。不要按标题相似、文件名或文风猜配关系。
4. 用 register_context 保存来源依据、文档内容概要、用户确认的目标、未决问题和关联 document_refs；推测性的目标必须标注为待确认，不能写成历史事实。新记录 expected_revision=0，更新先 read_context 获取 revision。
5. 如果缺少关键线索，列出最小缺失项即可；可以保存“来源未知”的有效记录，不要擅自扫描其他项目或全部聊天。
6. 不包含密钥、完整逐字稿、隐藏指令，也不生成公开分享链接。回报已登记与仍未知的信息，不启动任务。`},
  {title:'Agent 自我介绍与上下文登记',text:`请介绍你在当前任务中的工作上下文，并登记到 AWiki 的会话控制区。
先 list_contexts 避免重复，然后使用 register_context。你需要提供：平台 provider；真实 native_session_id（无法获得填 null）；可返回原会话的普通 session_url（无法获得填 null）；会话标题；agent_label；身份/会话信息的依据 identity_basis；当前工作概要 summary；用户目标 goal；关键结论 decisions；未决问题 open_questions；建议下一步 next_step；当前确实关联且允许访问的文档 document_refs（没有可填空数组）。
context_id 是登记卡的稳定键，不是平台会话 ID。新卡 expected_revision=0；更新前 read_context，用当前 revision。不要编造自己看不到的模型版本、会话 ID、权限或完整历史。
仅登记用户可理解的任务信息，不泄露凭据、系统/开发者隐藏指令或内部推理，不遍历无关聊天。登记不是运行授权，不自动发消息、创建任务或改文档。
完成后告诉我登记键、原生会话定位是否可用、哪些信息仍未知。`}
];
