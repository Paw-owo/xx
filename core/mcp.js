// core/mcp.js
// MCP 客户端：支持两种传输模式
//   1. SSE 模式（自建服务器）：GET /mcp/sse 建流 → 解析 endpoint → POST /mcp/messages?sessionId=xxx → 从 SSE 流读响应
//   2. Streamable HTTP 模式（远程公共 MCP，如 Context7/DeepWiki/GitMCP/Microsoft Learn）：
//      POST 到单一端点 → 响应体是 SSE 流或 JSON，直接读出 JSON-RPC 结果
// ensureSession 统一入口：先试 streamable HTTP，失败回退 SSE，保证自建服务器不受影响
// imports: getData from './storage.js'

import { getData, setData } from './storage.js';

/* ── 常量 ── */
const MCP_TIMEOUT = 20000;
const CLIENT_INFO = { name: 'ai-phone', version: '1.0.0' };
const PROTOCOL_VERSION = '2025-03-26';

/* ── 内部状态 ── */
let rpcId = 0;
const sessions = new Map();

/* ── 工具函数 ── */

function nextId() {
  return ++rpcId;
}

function toast(msg) {
  if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
    window.showToast(msg);
  }
}

function buildRpc(method, params) {
  const msg = { jsonrpc: '2.0', id: nextId(), method };
  if (params !== undefined) msg.params = params;
  return msg;
}

function buildNotification(method, params) {
  const msg = { jsonrpc: '2.0', method };
  if (params !== undefined) msg.params = params;
  return msg;
}

// 草稿 server 机制：编辑页新建/修改但未保存时，临时注册 draft server
// 让 findServer 能找到它，从而复用现有 ensureSession/rpcCall 全套逻辑
// key = serverId，value = server 对象
const draftServers = new Map();

function findServer(serverId) {
  // 优先查 draft（未保存的草稿，或表单值已改但未保存）
  const draft = draftServers.get(serverId);
  if (draft) return draft;
  const settings = getData('app_settings');
  const servers = settings?.mcpServers || [];
  return servers.find(s => s.id === serverId) || null;
}

// 读取某个服务器的工具开关配置（按 server.id 隔离）
// 返回 { [toolName]: { enabled, requireApproval } }，未配置的工具不包含在内
function getToolSettings(serverId) {
  const server = findServer(serverId);
  const raw = server?.toolSettings;
  if (!raw || typeof raw !== 'object') return {};
  const result = {};
  for (const [name, cfg] of Object.entries(raw)) {
    if (!name || !cfg || typeof cfg !== 'object') continue;
    result[name] = {
      enabled: cfg.enabled !== false,
      requireApproval: cfg.requireApproval === true
    };
  }
  return result;
}

// 合并工具原始定义与 toolSettings，给每个工具注入状态字段
//   enabled：是否启用（默认 true）
//   requireApproval：是否需要审批（默认 false）
//   blockedByApproval：enabled && requireApproval（本轮禁止自动调用）
function attachToolStatus(rawTools, toolSettings) {
  if (!Array.isArray(rawTools)) return [];
  return rawTools.map((tool) => {
    const name = tool?.name || '';
    const cfg = toolSettings[name] || { enabled: true, requireApproval: false };
    return {
      ...tool,
      enabled: cfg.enabled !== false,
      requireApproval: cfg.requireApproval === true,
      blockedByApproval: cfg.enabled !== false && cfg.requireApproval === true
    };
  });
}

/**
 * 从持久化 server.tools + toolSettings 读取工具列表（不依赖网络）
 * 用于 AI 调用链：getUsableMcpTools / callMcpTool 二次校验
 * 数据源：app_settings.mcpServers[serverId].tools + .toolSettings
 * @param {string} serverId
 * @returns {Array<{name,description,inputSchema,enabled,requireApproval,blockedByApproval}>}
 */
export function getPersistedTools(serverId) {
  const server = findServer(serverId);
  if (!server) return [];
  const rawTools = server.tools || [];
  const toolSettings = getToolSettings(serverId);
  return attachToolStatus(rawTools, toolSettings);
}

// ═══════════════════════════════════════
// 【URL 规范化】用户填的地址可能是：
//   https://kiss.eoty.cn
//   https://kiss.eoty.cn/mcp
//   https://kiss.eoty.cn/mcp/sse
// 统一归一化为 SSE 端点 URL
// ═══════════════════════════════════════

function normalizeSseUrl(rawUrl) {
  let url = String(rawUrl || '').trim();
  if (!url) return '';
  // 去掉末尾 /
  url = url.replace(/\/+$/, '');
  // 已明确以 /mcp/sse 结尾，原样使用
  if (/\/mcp\/sse$/i.test(url)) return url;
  // 以 /mcp 结尾，补 /sse
  if (/\/mcp$/i.test(url)) return url + '/sse';
  // 其他情况（裸域名或带其他路径），补 /mcp/sse
  return url + '/mcp/sse';
}

function resolveMessageUrl(sseUrl, endpoint) {
  // endpoint 可能是相对路径 /mcp/messages?sessionId=xxx 或绝对 URL
  if (!endpoint) return '';
  try {
    const origin = new URL(sseUrl).origin;
    if (/^https?:\/\//i.test(endpoint)) return endpoint;
    return origin + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);
  } catch (_) {
    return '';
  }
}

// ═══════════════════════════════════════
// 【请求头】支持自定义认证头名
//   apiKeyHeader 为空/未传 → 默认 Authorization: Bearer <apiKey>
//   apiKeyHeader 有值（如 'x-phone-token'）→ 用该名直接作 header，值为 apiKey 原值
//   兼容服务器期望 x-api-key / X-Phone-Token / x-phone-token 等自定义头
// ═══════════════════════════════════════

function buildHeaders(sessionId, apiKey, accept, apiKeyHeader) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (accept) headers['Accept'] = accept;
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  if (apiKey) {
    const headerName = String(apiKeyHeader || '').trim().toLowerCase();
    if (headerName) {
      // 用户指定了自定义头名：直接用原值，不加 Bearer 前缀
      headers[headerName] = String(apiKey);
    } else {
      // 默认 Bearer 认证
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }
  return headers;
}

function extractTextFromContent(content) {
  if (!Array.isArray(content)) return '';
  return content
    .filter(c => c.type === 'text' && c.text)
    .map(c => c.text)
    .join('\n');
}

function parseRpcResult(data) {
  if (!data || data.jsonrpc !== '2.0') {
    return { ok: false, error: '响应不是合法 JSON-RPC', result: null };
  }
  if (data.error) {
    const code = data.error.code || '';
    const message = data.error.message || '未知错误';
    return { ok: false, error: `[${code}] ${message}`, result: null };
  }
  return { ok: true, error: null, result: data.result };
}

// ═══════════════════════════════════════
// 【SSE 会话】每个 serverId 维护一条 SSE 长连接
// session 结构：
//   { transport:'sse', ready, sseUrl, messageUrl, sessionId, apiKey, abortController, reader, pending: Map<id, {resolve, reject, timer}> }
// ═══════════════════════════════════════

async function ensureSseSession(serverId) {
  const cached = sessions.get(serverId);
  if (cached && cached.ready && cached.transport === 'sse') return cached;

  const server = findServer(serverId);
  if (!server) return null;

  const sseUrl = normalizeSseUrl(server.url);
  if (!sseUrl) return null;
  const apiKey = server.apiKey || '';
  const apiKeyHeader = server.apiKeyHeader || '';

  const session = {
    transport: 'sse',
    ready: false,
    sseUrl,
    messageUrl: '',
    sessionId: '',
    apiKey,
    apiKeyHeader,
    abortController: null,
    reader: null,
    pending: new Map()
  };

  // 立即注册到 sessions 表（ready:false），让 pump 的 done/error 回调能通过
  // cleanupSession(serverId) 找到并清理当前 session，避免断流后坏会话留在表里。
  // ensureSession 仍会因 ready:false 跳过它，不会返回未就绪会话。
  sessions.set(serverId, session);

  try {
    // 建立 SSE 流：用 fetch GET + ReadableStream 手动解析（避免 EventSource 不支持自定义头）
    const controller = new AbortController();
    session.abortController = controller;

    const response = await fetch(sseUrl, {
      method: 'GET',
      headers: buildHeaders(null, apiKey, 'text/event-stream', apiKeyHeader),
      signal: controller.signal
    });

    if (!response.ok) {
      // 读取响应正文，给用户脱敏后的真实原因（不暴露凭据）
      let detail = '';
      try {
        const errText = await response.text();
        detail = String(errText || '').slice(0, 200).trim();
      } catch (_) {}
      const hint = detail ? `：${detail}` : '';
      toast(`MCP SSE 连接失败 (HTTP ${response.status})${hint}`);
      return null;
    }

    const reader = response.body.getReader();
    session.reader = reader;
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    // 等待 endpoint 事件，同时启动后台读取循环处理后续 message 事件
    const endpointPromise = new Promise((resolve, reject) => {
      const endpointTimer = setTimeout(() => {
        reject(new Error('等待 endpoint 超时'));
      }, MCP_TIMEOUT);

      const pump = () => {
        reader.read().then(({ done, value }) => {
          if (done) {
            clearTimeout(endpointTimer);
            if (!session.messageUrl) {
              // 流关闭时还没拿到 endpoint：reject endpointPromise 让上层走重连
              reject(new Error('SSE 流关闭，未收到 endpoint'));
            } else {
              // endpoint 已拿到后流关闭：清理当前 session，让下次调用重建连接，
              // 而不是复用这个 ready:true 但 SSE 已断的坏会话（POST 还能发出去，
              // 但永远收不到 SSE 响应，直到 20s 超时）
              cleanupSession(serverId);
            }
            return;
          }
          buffer += decoder.decode(value, { stream: true });

          // 按空行分割 SSE 事件块
          const blocks = buffer.split('\n\n');
          buffer = blocks.pop() || '';

          for (const block of blocks) {
            const lines = block.split('\n');
            let eventType = '';
            let dataLines = [];
            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trim());
              }
            }
            const dataStr = dataLines.join('\n');

            if (eventType === 'endpoint' && dataStr) {
              const messageUrl = resolveMessageUrl(sseUrl, dataStr);
              if (messageUrl) {
                session.messageUrl = messageUrl;
                // 从 query 提取 sessionId 备用（实际认证靠 messageUrl 里的 sessionId query）
                const sidMatch = messageUrl.match(/[?&]sessionId=([^&]+)/);
                if (sidMatch) session.sessionId = decodeURIComponent(sidMatch[1]);
                clearTimeout(endpointTimer);
                resolve();
              }
            } else if (eventType === 'message' && dataStr) {
              handleSseMessage(session, dataStr);
            }
          }

          pump();
        }).catch((err) => {
          clearTimeout(endpointTimer);
          if (session.messageUrl) {
            // endpoint 已拿到，流异常但已有 messageUrl：清理 session 让下次重连
            cleanupSession(serverId);
          } else {
            reject(err);
          }
        });
      };

      pump();
    });

    await endpointPromise;

    // endpoint 已拿到，发送 initialize（POST 到 messageUrl）
    const initBody = buildRpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO
    });

    const initResult = await rpcPostAndWait(session, serverId, initBody);
    if (initResult && initResult.ok) {
      session.serverInfo = initResult.result?.serverInfo || null;
      session.capabilities = initResult.result?.capabilities || null;
    }
    // initialize 失败不阻塞，兼容不要求初始化的服务器

    // 会话已就绪；session 在创建时就已注册到 sessions 表（ready:false），
    // 这里只翻转 ready 标志，让 ensureSession 能复用，不再重复 set
    session.ready = true;
    return session;
  } catch (error) {
    cleanupSession(serverId);
    if (error.name === 'AbortError') {
      toast('MCP SSE 连接超时');
    } else {
      toast('MCP SSE 连接失败');
    }
    return null;
  }
}

// ═══════════════════════════════════════
// 【Streamable HTTP 会话】远程公共 MCP（Context7/DeepWiki/GitMCP/Microsoft Learn）
//   POST 到单一端点，响应体是 SSE 流（text/event-stream）或 JSON（application/json）
//   每次 RPC 独立 POST，不需要长连接，不需要 endpoint 协商
//   session-id 通过 MCP-Session-Id header 传递
// session 结构：
//   { transport:'streamable', ready, endpointUrl, sessionId, apiKey, serverInfo, capabilities }
// ═══════════════════════════════════════

// 从响应文本解析 JSON-RPC 结果（兼容 application/json 和 text/event-stream 两种响应格式）
// expectedId 用于匹配请求 id，避免误读 notifications
function parseStreamableResponse(text, expectedId) {
  if (!text) return null;

  // 优先尝试直接 JSON 解析（application/json 响应）
  try {
    const json = JSON.parse(text);
    if (json && json.jsonrpc === '2.0' && json.id === expectedId) return json;
  } catch (_) { /* 不是 JSON，继续尝试 SSE 解析 */ }

  // SSE 格式解析：按空行分块，每块找 data: 行
  const blocks = String(text).split('\n\n');
  for (const block of blocks) {
    const lines = block.split('\n');
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
    }
    if (dataLines.length === 0) continue;
    const dataStr = dataLines.join('\n');
    try {
      const json = JSON.parse(dataStr);
      if (json && json.jsonrpc === '2.0' && json.id === expectedId) return json;
    } catch (_) { /* 跳过非法块 */ }
  }
  return null;
}

// 尝试建立 streamable HTTP 会话：POST initialize 到原始 URL
// 成功返回 session，失败返回 null（让上层回退 SSE）
async function tryStreamableSession(serverId, rawUrl, apiKey, apiKeyHeader) {
  let response;
  let initBody;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCP_TIMEOUT);
  try {
    initBody = buildRpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: CLIENT_INFO
    });

    response = await fetch(rawUrl, {
      method: 'POST',
      headers: buildHeaders(null, apiKey, 'application/json, text/event-stream', apiKeyHeader),
      body: JSON.stringify(initBody),
      signal: controller.signal
    });
  } catch (_) {
    // 网络错误（CORS 拦截 / 域名不通 / 超时）→ 不是 streamable，回退 SSE
    clearTimeout(timer);
    return null;
  }
  clearTimeout(timer);

  // 404/405/406 等表示这个 URL 不支持 POST → 回退 SSE 模式
  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') || '';
  // 只接受 JSON 或 SSE 响应，其他类型回退
  if (!/application\/json/i.test(contentType) && !/text\/event-stream/i.test(contentType)) {
    return null;
  }

  const sessionId = response.headers.get('mcp-session-id') || '';
  // 读响应体也加超时保护，避免服务器保持 SSE 流不关闭
  const bodyController = new AbortController();
  const bodyTimer = setTimeout(() => bodyController.abort(), MCP_TIMEOUT);
  let text;
  try {
    text = await response.text();
  } catch (_) {
    clearTimeout(bodyTimer);
    return null;
  }
  clearTimeout(bodyTimer);

  // 用 initBody.id 匹配响应，不能用写死值（rpcId 全局递增）
  const parsed = parseStreamableResponse(text, initBody.id);
  if (!parsed) return null; // 响应里没有匹配 id 的 JSON-RPC，不是 streamable

  const session = {
    transport: 'streamable',
    ready: true,
    endpointUrl: rawUrl,
    sessionId,
    apiKey,
    apiKeyHeader: apiKeyHeader || '',
    serverInfo: parsed.result?.serverInfo || null,
    capabilities: parsed.result?.capabilities || null,
    // SSE 相关字段保留空值，避免外部代码访问报错
    sseUrl: '',
    messageUrl: rawUrl,
    abortController: null,
    reader: null,
    pending: new Map()
  };
  return session;
}

// streamable HTTP 的单次 RPC：POST 到 endpointUrl，从响应体读 JSON-RPC 结果
async function rpcCallStreamable(session, rpcBody) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MCP_TIMEOUT);
  try {
    const response = await fetch(session.endpointUrl, {
      method: 'POST',
      headers: buildHeaders(session.sessionId, session.apiKey, 'application/json, text/event-stream', session.apiKeyHeader),
      body: JSON.stringify(rpcBody),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`MCP POST 失败 (${response.status})`);
    }

    const text = await response.text();
    const parsed = parseStreamableResponse(text, rpcBody.id);
    if (!parsed) {
      throw new Error('MCP 响应未匹配请求 id');
    }
    return parseRpcResult(parsed);
  } finally {
    clearTimeout(timer);
  }
}

// ═══════════════════════════════════════
// 【统一会话入口】先试 streamable HTTP，失败回退 SSE
// 自建服务器（kiss.eoty.cn）走 SSE 分支，行为完全不变
// 远程公共 MCP（Context7 等）走 streamable 分支
// ═══════════════════════════════════════

async function ensureSession(serverId) {
  const cached = sessions.get(serverId);
  if (cached && cached.ready) return cached;

  const server = findServer(serverId);
  if (!server) return null;

  const rawUrl = String(server.url || '').trim().replace(/\/+$/, '');
  if (!rawUrl) return null;
  const apiKey = server.apiKey || '';
  const apiKeyHeader = server.apiKeyHeader || '';

  // 先试 streamable HTTP：POST initialize 到原始 URL
  // 只对"看起来像 streamable 端点"的 URL 尝试（避免对自建 SSE 服务器浪费一次 POST）
  // 启发式：URL 以 /mcp、/docs、/api/mcp 结尾，或不是裸域名 + /mcp/sse 模式
  const looksStreamable = /\/(mcp|docs|api\/mcp)$/i.test(rawUrl) || !/\/mcp\/sse$/i.test(rawUrl);

  if (looksStreamable) {
    const streamableSession = await tryStreamableSession(serverId, rawUrl, apiKey, apiKeyHeader);
    if (streamableSession) {
      sessions.set(serverId, streamableSession);
      return streamableSession;
    }
    // streamable 失败：清理可能的半成品，继续走 SSE
    cleanupSession(serverId);
  }

  // 回退 SSE 模式（自建服务器）
  return await ensureSseSession(serverId);
}

// 处理 SSE 流里的 message 事件，匹配 pending 请求并 resolve
function handleSseMessage(session, dataStr) {
  let parsed;
  try {
    parsed = JSON.parse(dataStr);
  } catch (_) {
    return;
  }
  if (!parsed || parsed.jsonrpc !== '2.0' || parsed.id === undefined) return;

  const pending = session.pending.get(parsed.id);
  if (!pending) return;

  clearTimeout(pending.timer);
  session.pending.delete(parsed.id);
  pending.resolve(parseRpcResult(parsed));
}

// 清理 session：abort 流、reject 所有 pending、从 sessions 表移除
function cleanupSession(serverId) {
  const session = sessions.get(serverId);
  if (!session) return;

  try { session.abortController?.abort(); } catch (_) {}
  try { session.reader?.cancel?.(); } catch (_) {}

  for (const [id, pending] of session.pending) {
    clearTimeout(pending.timer);
    try { pending.reject(new Error('会话已关闭')); } catch (_) {}
  }
  session.pending.clear();
  sessions.delete(serverId);
}

// POST JSON-RPC 到 messageUrl，等 SSE 流里同 id 的响应
function rpcPostAndWait(session, serverId, rpcBody, timeout = MCP_TIMEOUT) {
  return new Promise((resolve, reject) => {
    if (!session.messageUrl) {
      reject(new Error('会话未就绪，无 messageUrl'));
      return;
    }

    const id = rpcBody.id;
    const timer = setTimeout(() => {
      session.pending.delete(id);
      // 超时后清理 session，让下次重连
      cleanupSession(serverId);
      reject(new Error('MCP 请求超时'));
    }, timeout);

    session.pending.set(id, { resolve, reject, timer });

    fetch(session.messageUrl, {
      method: 'POST',
      // SSE 模式：sessionId 已在 messageUrl 的 query 参数里，不需要通过 Mcp-Session-Id 头传递。
      // 传 null 避免发送 Mcp-Session-Id 头——该头不在服务器 CORS Allow-Headers 里，
      // 浏览器会因 OPTIONS 预检失败而拒绝 POST（curl 不做预检所以测不出这个问题）。
      headers: buildHeaders(null, session.apiKey, 'application/json, text/event-stream', session.apiKeyHeader),
      body: JSON.stringify(rpcBody)
    }).then((response) => {
      // POST 到 messages 端点正常返回 202 Accepted，响应体无 result
      // 真正的响应通过 SSE 流的 message 事件返回，由 handleSseMessage 处理
      if (!response.ok && response.status !== 202) {
        session.pending.delete(id);
        clearTimeout(timer);
        reject(new Error(`MCP POST 失败 (${response.status})`));
      }
      // 202 或其他 ok：不 resolve，等 SSE message 事件
    }).catch((err) => {
      session.pending.delete(id);
      clearTimeout(timer);
      reject(err);
    });
  });
}

// ═══════════════════════════════════════
// 【通用 RPC】ensureSession → 根据 transport 分流
//   streamable: POST 到 endpointUrl，从响应体直接读 JSON-RPC
//   sse:        POST 到 messageUrl，等 SSE 长连接的 message 事件
// ═══════════════════════════════════════

async function rpcCall(serverId, method, params, isRetry = false) {
  const server = findServer(serverId);
  if (!server) {
    toast('MCP 服务器不存在');
    return null;
  }

  const session = await ensureSession(serverId);
  if (!session || !session.ready) {
    if (!isRetry) {
      // 会话建立失败，清理后重试一次
      cleanupSession(serverId);
    }
    return null;
  }
  // SSE 模式必须有 messageUrl，streamable 模式用 endpointUrl
  if (session.transport === 'sse' && !session.messageUrl) {
    if (!isRetry) {
      cleanupSession(serverId);
    }
    return null;
  }

  try {
    const body = buildRpc(method, params);
    // 根据传输模式分流
    if (session.transport === 'streamable') {
      return await rpcCallStreamable(session, body);
    }
    return await rpcPostAndWait(session, serverId, body);
  } catch (error) {
    if (!isRetry) {
      // 流可能断开 / streamable 会话过期，清理后重试一次
      cleanupSession(serverId);
      return rpcCall(serverId, method, params, true);
    }
    const msg = String(error?.message || '');
    if (error.name === 'AbortError' || /超时/.test(msg)) {
      toast('MCP 请求超时（服务器没在 20 秒内响应）');
    } else if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
      // Failed to fetch 通常是 CORS 拦截或网络不通
      toast('MCP 连接失败：被浏览器拦截或网络不通（检查 CORS 是否放行当前网址）');
    } else if (msg) {
      toast(`MCP 请求出错：${msg.slice(0, 120)}`);
    } else {
      toast('MCP 请求出错（未知原因）');
    }
    return null;
  }
}

/* ── 导出函数 ── */

/**
 * 获取已启用的 MCP 服务器列表
 * @returns {Array<{id,name,url,enabled}>}
 */
export function getMcpServers() {
  const settings = getData('app_settings');
  const servers = settings?.mcpServers || [];
  return servers.filter(s => s.enabled);
}

/**
 * 获取指定服务器的工具列表（带开关状态）
 * @param {string} serverId
 * @returns {Promise<Array<{name,description,inputSchema,enabled,requireApproval,blockedByApproval}>>}
 *   失败时抛错（带可读原因），让调用方区分"真的没工具"和"连接失败"
 *   enabled:false 的工具仍会返回（让设置页能看到并重新启用），但不会进入 AI 上下文
 */
export async function listMcpTools(serverId) {
  const server = findServer(serverId);
  if (!server) {
    throw new Error('服务器还没保存，先填好地址点保存吧');
  }
  const rpc = await rpcCall(serverId, 'tools/list');
  if (!rpc) {
    // rpcCall 返回 null 表示连接或请求失败，具体原因已通过 toast 提示
    // 这里抛错让设置页 catch 能展示兜底文案，同时阻止后续逻辑
    throw new Error('MCP 连接失败，看上面那条提示的具体原因～');
  }
  if (!rpc.ok) {
    throw new Error(rpc.error?.message || '服务器拒绝了 tools/list 请求');
  }
  const toolSettings = getToolSettings(serverId);
  return attachToolStatus(rpc.result?.tools || [], toolSettings);
}

/**
 * 用草稿 server 对象拉取工具列表（编辑页新建/修改未保存时用）
 * 内部临时注册 draft，复用现有 ensureSession/rpcCall 全套逻辑，不造第二套
 * @param {object} draftServer - 完整 server 对象（id/url/apiKey 等）
 * @returns {Promise<Array>}
 */
export async function listMcpToolsWithDraft(draftServer) {
  if (!draftServer?.id) {
    throw new Error('服务器信息不完整');
  }
  // 注册 draft，让 findServer 能找到
  draftServers.set(draftServer.id, draftServer);
  // 清理可能存在的旧 session，确保用新 draft 重新建连
  cleanupSession(draftServer.id);
  try {
    return await listMcpTools(draftServer.id);
  } finally {
    // 拉取完成后清理 draft（已保存的 server 走正常 findServer 路径）
    // 但保留 session 缓存，避免立即重新建连
    draftServers.delete(draftServer.id);
  }
}

/**
 * 调用 MCP 工具（调用前二次校验 toolSettings，兜底防止绕过开关）
 * @param {string} serverId
 * @param {string} toolName
 * @param {object} params - 工具参数
 * @returns {Promise<{content:Array, isError:boolean, text:string, blocked?:boolean, blockedByApproval?:boolean}|null>}
 *   工具不存在 / enabled:false → 返回 { isError:true, blocked:true }
 *   requireApproval:true → 返回 { isError:true, blockedByApproval:true }（本轮不自动调用）
 */
export async function callMcpTool(serverId, toolName, params) {
  // 二次校验：从持久化数据读取工具状态，避免绕过 toolSettings
  // 不依赖网络，直接读 app_settings.mcpServers[serverId].tools + .toolSettings
  const tools = getPersistedTools(serverId);
  const toolMeta = tools.find((t) => t.name === toolName) || null;

  if (toolMeta && toolMeta.enabled === false) {
    return {
      content: [], isError: true, text: `工具 ${toolName} 已停用`,
      blocked: true
    };
  }
  if (toolMeta && toolMeta.requireApproval === true) {
    return {
      content: [], isError: true,
      text: `工具 ${toolName} 需要确认才能调用，本轮已阻止自动执行`,
      blockedByApproval: true
    };
  }

  const rpc = await rpcCall(serverId, 'tools/call', {
    name: toolName,
    arguments: params || {}
  });

  if (!rpc) return null;

  if (!rpc.ok) {
    toast(`MCP 工具调用失败：${rpc.error}`);
    return null;
  }

  const content = rpc.result?.content || [];
  const isError = rpc.result?.isError || false;
  const text = extractTextFromContent(content);

  if (isError) {
    toast(`MCP 工具返回错误：${text || '未知'}`);
  }

  return { content, isError, text };
}

/**
 * 获取所有可用工具的扁平列表（enabled:true 且 requireApproval:false）
 * 供 thread-ai 查找 toolName → serverId 映射
 * @returns {Promise<Array<{serverId,serverName,name,description,params}>>}
 */
export async function getUsableMcpTools() {
  const servers = getMcpServers();
  if (!servers.length) return [];

  const result = [];
  for (const server of servers) {
    // 从持久化数据读取，不依赖网络：app_settings.mcpServers[serverId].tools + .toolSettings
    const tools = getPersistedTools(server.id);
    const usable = tools.filter((t) => t.enabled !== false && t.requireApproval !== true);
    usable.forEach((tool) => {
      result.push({
        serverId: server.id,
        serverName: server.name || 'MCP',
        name: tool.name || '',
        description: tool.description || '',
        params: getToolParamNames(tool)
      });
    });
  }
  return result;
}

/**
 * 获取抽屉展示用的工具列表（所有 enabled 服务器下的全部工具，含需审批的）
 * 与 getUsableMcpTools 同一数据源（getMcpServers + getPersistedTools），
 * 但不过滤 requireApproval —— 抽屉要展示所有已接入工具，AI 侧才过滤需审批的。
 * 同步函数（不依赖网络），供 thread-sheets openMcpSheet 直接调用。
 * @returns {Array<{name,description,serverName,serverId,requireApproval,enabled}>}
 */
export function getMcpDrawerItems() {
  const servers = getMcpServers();
  if (!servers.length) return [];

  const result = [];
  for (const server of servers) {
    const tools = getPersistedTools(server.id);
    for (const tool of tools) {
      result.push({
        serverId: server.id,
        serverName: server.name || 'MCP',
        name: tool.name || '',
        description: tool.description || '',
        enabled: tool.enabled !== false,
        requireApproval: tool.requireApproval === true
      });
    }
  }
  return result;
}

/**
 * 按服务器分组返回（抽屉一级列表用）
 * 与设置页同一数据源（app_settings.mcpServers），不过滤 enabled:false 的服务器——
 * 抽屉要展示所有已配置服务器，开关状态由 server.enabled 体现。
 * 同一 server 只出现一次；同一 server 下同名工具去重。
 * @returns {Array<{id,name,url,enabled,tools:Array<{name,description,enabled,requireApproval}>,toolCount,enabledCount}>}
 */
export function getMcpServerGroups() {
  const settings = getData('app_settings');
  const servers = Array.isArray(settings?.mcpServers) ? settings.mcpServers : [];

  const result = [];
  const seenServerIds = new Set();

  for (const server of servers) {
    if (!server || !server.id) continue;
    // 去重：同一 server.id 只出现一次（修掉重复遍历导致的重复卡片）
    if (seenServerIds.has(server.id)) continue;
    seenServerIds.add(server.id);

    const toolSettings = getToolSettings(server.id);
    const rawTools = Array.isArray(server.tools) ? server.tools : [];

    // 同一 server 下同名工具去重（保留第一个）
    const seenToolNames = new Set();
    const tools = [];
    for (const raw of rawTools) {
      const toolName = raw?.name || '';
      if (!toolName || seenToolNames.has(toolName)) continue;
      seenToolNames.add(toolName);
      const cfg = toolSettings[toolName] || { enabled: true, requireApproval: false };
      tools.push({
        name: toolName,
        description: raw.description || '',
        enabled: cfg.enabled !== false,
        requireApproval: cfg.requireApproval === true
      });
    }

    result.push({
      id: server.id,
      name: server.name || server.url || server.id,
      url: server.url || '',
      enabled: server.enabled !== false,
      tools,
      toolCount: tools.length,
      enabledCount: tools.filter((t) => t.enabled).length
    });
  }
  return result;
}

/**
 * 切换某个 MCP 服务器的 enabled 状态，写回同一数据源 app_settings.mcpServers
 * 与设置页 toggleMcp 同一写入路径，保证抽屉和设置页数据一致。
 * @param {string} serverId
 * @param {boolean} enabled
 */
export function setMcpServerEnabled(serverId, enabled) {
  if (!serverId) return;
  const settings = getData('app_settings') || {};
  const servers = Array.isArray(settings.mcpServers) ? settings.mcpServers : [];
  const next = servers.map((s) => {
    if (!s || s.id !== serverId) return s;
    return { ...s, enabled: !!enabled, updatedAt: new Date().toISOString() };
  });
  setData('app_settings', { ...settings, mcpServers: next });
}

/**
 * 构建给 AI 的可用工具上下文（只包含 enabled:true 且 requireApproval:false 的工具）
 * 遍历所有已启用服务器，聚合工具说明，不写死工具名。
 * 任何失败都静默返回空串，不阻塞主聊天流程。
 * @returns {Promise<string>}
 */
export async function buildMcpToolsContext() {
  const tools = await getUsableMcpTools();
  if (!tools.length) return '';

  // 按 serverName 分组
  const groups = new Map();
  for (const t of tools) {
    if (!groups.has(t.serverName)) groups.set(t.serverName, []);
    groups.get(t.serverName).push(t);
  }

  const sections = [];
  for (const [serverName, list] of groups) {
    const lines = list.map((tool) => {
      const paramHint = tool.params.length ? `（参数：${tool.params.join('、')}）` : '';
      return `- ${tool.name}${paramHint}：${tool.description}`;
    });
    sections.push(`【${serverName} 工具】\n${lines.join('\n')}`);
  }

  return `可用工具列表（需要时调用，不需要时不调用；调用细节不进入最终回复）：\n${sections.join('\n\n')}`;
}

// 从工具 inputSchema 提取参数名（最多 8 个）
function getToolParamNames(tool) {
  const props = tool?.inputSchema?.properties || {};
  return Object.keys(props).slice(0, 8);
}

/**
 * 将 MCP 工具结果格式化为可注入上下文的字符串（单次结果格式化，向后兼容）
 * @param {string} serverId
 * @param {string} toolName
 * @param {object} result - callMcpTool 的返回值
 * @returns {string}
 */
export function buildMcpContext(serverId, toolName, result) {
  if (!result || !result.text) return '';

  const server = findServer(serverId);
  const serverName = server?.name || 'MCP';

  return `\n\n[MCP工具结果 - ${serverName}/${toolName}]\n${result.text}`;
}

/**
 * 清除指定服务器或全部会话缓存
 * @param {string} [serverId] - 不传则清除全部
 */
export function resetSession(serverId) {
  if (serverId) {
    cleanupSession(serverId);
  } else {
    for (const id of Array.from(sessions.keys())) {
      cleanupSession(id);
    }
  }
}

// 测试钩子：只暴露纯函数，供回归测试验证认证头拼装与 URL 归一化
// 不暴露任何含密钥/会话状态的对象
export const __testHooks = {
  buildHeaders,
  normalizeSseUrl,
  resolveMessageUrl
};

// depends: core/storage.js -> getData
