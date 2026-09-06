const refPattern = /^[A-Za-z0-9_-]{8,200}$/;
export const validResourceRef = value => typeof value === "string" && refPattern.test(value);

export function viewerBase(value = "") {
  if (!value) return "";
  const u = new URL(value);
  if (u.protocol !== "http:" || u.hostname !== "127.0.0.1" || !u.port || u.username || u.password || u.pathname !== "/" || u.search || u.hash)
    throw new Error("AWIKI_LOCAL_VIEWER_BASE_URL must be http://127.0.0.1:<port>");
  return u.origin;
}
export function feishuBase(value = "") {
  if (!value) return "";
  const u = new URL(value);
  if (u.protocol !== "https:" || !/^[a-z0-9-]+\.(feishu\.cn|larkoffice\.com)$/.test(u.hostname) || u.port || u.username || u.password || u.pathname !== "/" || u.search || u.hash)
    throw new Error("AWIKI_FEISHU_BASE_URL must be the verified HTTPS tenant origin");
  return u.origin;
}
// Call only with nodes obtained from an allowed-root traversal; a ref is not authority.
export function pageLinks(page, config) {
  if (!validResourceRef(page?.node_token) || !config.feishuBaseUrl) return {};
  return {
    feishu_url: `${config.feishuBaseUrl}/wiki/${page.node_token}`,
    ...(page.obj_type === "docx" && validResourceRef(page.obj_token) && config.localViewerBaseUrl
      ? { awiki_local_url: `${config.localViewerBaseUrl}/r/${page.node_token}` } : {})
  };
}
export function linkedPage(page, config) { return {...page, ...pageLinks(page, config)}; }
export function continuationText(page, config) {
  const title = String(page.title ?? "未命名文档").replace(/[\r\n\u0000-\u001f\u007f]/g, " ");
  return `请使用 AWiki 飞书连接的 read_page 工具读取以下文档的最新内容：\n标题：${title}\n资源引用（page_ref）：${page.node_token}\n飞书链接：${pageLinks(page, config).feishu_url}\n先概括当前结论和未决问题，再结合我接下来的补充继续讨论。\n本次先读取，不修改原文；修改须按我后续要求及现有写入规则执行。`;
}
