(() => {
  const status=document.querySelector('#space-status'),tree=document.querySelector('#space-tree'),stats=document.querySelector('#space-stats'),button=document.querySelector('#refresh-space');
  const el=(tag,text,className)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;};
  async function load(){
    button.disabled=true;status.textContent='正在读取授权目录，可能需要十几秒…';tree.replaceChildren();stats.replaceChildren();
    try{
      const r=await fetch('/api/catalog',{credentials:'same-origin',cache:'no-store'});
      if(!r.ok)throw new Error('unavailable');const data=await r.json();
      for(const [label,value] of [['授权根',data.counts.roots],['已发现页面（含根）',data.counts.discovered],['MCP 可读写云文档',data.counts.docx],['其他类型 · 仅原链接',data.counts.other]]){
        const card=el('div',undefined,'stat');card.append(el('strong',String(value)),el('span',label));stats.append(card);
      }
      const contextPanel=el('section',undefined,'root-section');contextPanel.id='contexts';
      const nav=el('nav',undefined,'space-nav');const docsLink=el('a','文档区');docsLink.href='#documents';const sessionsLink=el('a',`会话控制区 · ${data.contexts?.length??0}`);sessionsLink.href='#contexts';const guideLink=el('a','Agent 登记提示词');guideLink.href='/guide';nav.append(docsLink,sessionsLink,guideLink);tree.append(nav);
      const docsHeading=el('h2','文档区');docsHeading.id='documents';tree.append(docsHeading);
      for(const root of data.roots){
        const section=el('section',undefined,'root-section');section.append(el('h2',root.title||root.alias),el('p',`${root.alias} · 已发现 ${root.nodes.length} 个页面（含根）${root.truncated?' · 尚未完整展开':''}`,'muted'));
        const list=el('ul',undefined,'doc-tree'),byParent=new Map();
        for(const p of root.nodes){const key=p.parent_node_token;if(!byParent.has(key))byParent.set(key,[]);byParent.get(key).push(p);}
        const rendered=new Set();
        function render(p){
          if(rendered.has(p.node_token))return null;rendered.add(p.node_token);
          const li=el('li'),card=el('article',undefined,'doc-card'),link=el('a',p.title||'未命名文档');
          link.href=p.awiki_local_url||p.feishu_url;link.rel='noopener noreferrer';if(!p.awiki_local_url)link.target='_blank';
          card.append(link,el('span',p.obj_type==='docx'?'MCP 可访问':'仅飞书打开','doc-badge'));
          const children=byParent.get(p.node_token)||[];
          card.append(el('p',`${p.depth===0?'授权根':'子页面'} · 已列出 ${children.length} 个直接子页面${p.has_child&&!children.length?'（子级未展开）':''}`,'muted'));
          const dl=el('dl');for(const [key,label] of [['source','来自'],['summary','内容'],['goal','目标']]){dl.append(el('dt',label),el('dd',p.context?.[key]||'未记录'));}card.append(dl);
          const related=(data.contexts??[]).filter(c=>c.document_refs.includes(p.node_token));
          card.append(el('p',related.length?`关联会话：${related.map(c=>c.title).join('；')}`:'关联会话：尚未登记','muted'));
          for(const c of related){const a=el('a','查看会话卡 → '+c.title);a.href='#context-'+c.context_id;card.append(a);}
          li.append(card);if(children.length){const ul=el('ul');for(const child of children){const item=render(child);if(item)ul.append(item);}li.append(ul);}return li;
        }
        for(const p of root.nodes.filter(p=>p.depth===0)){const item=render(p);if(item)list.append(item);}
        // Keep any unusual hierarchy visible without inventing its parent.
        for(const p of root.nodes){if(!rendered.has(p.node_token)){const item=render(p);if(item)list.append(item);}}
        section.append(list);tree.append(section);
      }
      const collectLink=el('a','接入会话 / 查看采集队列 →');collectLink.href='/collect';
      contextPanel.append(el('h2','会话控制区'),collectLink,el('p','这是已登记的上下文快照，不是全部聊天历史，也不是正在运行的任务。原生会话 ID 是定位线索，不是调用权限。'));
      if(!data.contexts?.length)contextPanel.append(el('p','还没有会话登记。可把“Agent 自我介绍与上下文登记”提示词交给有权限的 Agent。不会自动扫描聊天。','doc-card'));
      for(const c of data.contexts??[]){
        const card=el('article',undefined,'doc-card');card.id='context-'+c.context_id;card.append(el('h3',c.title));
        const dl=el('dl');for(const [label,value] of [['平台',c.provider],['Agent',c.agent_label],['会话 ID',c.native_session_id||'未知'],['依据',c.identity_basis],['概要',c.summary],['目标',c.goal],['结论',c.decisions],['未决',c.open_questions],['下一步',c.next_step]])dl.append(el('dt',label),el('dd',value||'未记录'));card.append(dl);
        const timing=c.conversation_timing,formatTime=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）':'未核实';
        const times=el('dl');for(const [label,value] of [['会话开始时间',formatTime(timing?.started_at)],['最后一轮提问（不含采集）',formatTime(timing?.last_turn_started_at)],['最后一轮完成（不含采集）',formatTime(timing?.last_turn_completed_at)]])times.append(el('dt',label),el('dd',value));card.append(times);
        if(timing)card.append(el('p','时间依据：'+timing.source+'；已排除 '+timing.excluded_collection_turn_ids.length+' 轮自述采集。','muted'));
        if(c.session_url){const a=el('a','返回原会话 ↗');a.href=c.session_url;a.target='_blank';a.rel='noopener noreferrer';card.append(a);}
        card.append(el('p',`登记键 ${c.context_id} · 版本 ${c.revision} · 登记更新时间 ${formatTime(c.updated_at)}（不是会话最后活动时间） · 自述信息，未验证平台身份`,'muted'));
        const select=el('button','选择这个上下文继续讨论'),box=el('textarea');box.readOnly=true;box.setAttribute('aria-label','选定上下文的续谈指示');box.hidden=true;
        select.addEventListener('click',()=>{box.hidden=false;box.value=`请先使用 read_context 读取 context_id=${c.context_id} 的最新登记。\n这是我选择的工作上下文，不代表你已获得原始会话全部历史。\n先核对目标、结论与未决问题，再读取关联文档的最新内容继续讨论。\n如果可以通过官方适配器恢复原生会话，请先展示目标供我确认；否则明确说明是在当前会话承接摘要。\n本次只读，不启动其他 Agent，不改原文。`;box.focus();});
        card.append(select,box);contextPanel.append(card);
      }
      tree.append(contextPanel);
      status.textContent=`${data.truncated?'当前为部分目录，数量不是全量总数。':'已读取当前授权范围内目录。'} 最近检查：${new Date(data.checked_at).toLocaleString()}。Agent 任务状态尚未接入。`;
    }catch{status.textContent='目录读取失败，未显示缓存数量。请稍后刷新；不会扩大授权范围或重新授权。';}
    finally{button.disabled=false;}
  }
  button.addEventListener('click',load);load();
})();
