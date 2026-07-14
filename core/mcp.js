// core/mcp.js
// MCP 客户端：支持 MCP SSE 传输模式
// 流程：GET /mcp/sse 建流 → 解析 endpoint → POST /mcp/messages?sessionId=xxx 发 JSON-RPC → 从 SSE 流读响应
// imports: getData from './storage.js'

import { getData } from './storage.js';

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

function findServer(serverId) {
  const settings = getData('app_settings');
  const servers = settings?.mcpServers || [];
  return servers.find(s => s.id === serverId) || null;
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
// 【请求头】支持 apiKey 认证，不写死 token
// ═══════════════════════════════════════

function buildHeaders(sessionId, apiKey, accept) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (accept) headers['Accept'] = accept;
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
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
//   { ready, sseUrl, messageUrl, sessionId, apiKey, abortController, reader, pending: Map<id, {resolve, reject, timer}> }
// ═══════════════════════════════════════

async function ensureSession(serverId) {
  const cached = sessions.get(serverId);
  if (cached && cached.ready) return cached;

  const server = findServer(serverId);
  if (!server) return null;

  const sseUrl = normalizeSseUrl(server.url);
  if (!sseUrl) return null;
  const apiKey = server.apiKey || '';

  const session = {
    ready: false,
    sseUrl,
    messageUrl: '',
    sessionId: '',
    apiKey,
    abortController: null,
    reader: null,
    pending: new Map()
  };

  try {
    // 建立 SSE 流：用 fetch GET + ReadableStream 手动解析（避免 EventSource 不支持自定义头）
    const controller = new AbortController();
    session.abortController = controller;

    const response = await fetch(sseUrl, {
      method: 'GET',
      headers: buildHeaders(null, apiKey, 'text/event-stream'),
      signal: controller.signal
    });

    if (!response.ok) {
      toast(`MCP SSE 连接失败 (${response.status})`);
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
            // 流正常结束但未拿到 endpoint
            if (!session.messageUrl) {
              reject(new Error('SSE 流关闭，未收到 endpoint'));
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

    session.ready = true;
    sessions.set(serverId, session);
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
      headers: buildHeaders(session.sessionId, session.apiKey, 'application/json, text/event-stream'),
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
// 【通用 RPC】ensureSession → POST messageUrl → 等 SSE 响应
// ═══════════════════════════════════════

async function rpcCall(serverId, method, params, isRetry = false) {
  const server = findServer(serverId);
  if (!server) {
    toast('MCP 服务器不存在');
    return null;
  }

  const session = await ensureSession(serverId);
  if (!session || !session.ready || !session.messageUrl) {
    if (!isRetry) {
      // 会话建立失败，清理后重试一次
      cleanupSession(serverId);
    }
    return null;
  }

  try {
    const body = buildRpc(method, params);
    return await rpcPostAndWait(session, serverId, body);
  } catch (error) {
    if (!isRetry) {
      // 流可能断开，清理后重试一次
      cleanupSession(serverId);
      return rpcCall(serverId, method, params, true);
    }
    if (error.name === 'AbortError' || /超时/.test(error.message || '')) {
      toast('MCP 请求超时');
    } else if (error.message?.includes('Failed to fetch')) {
      toast('MCP 连接失败，请检查服务器地址或 CORS 配置');
    } else {
      toast('MCP 请求出错');
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
 * 获取指定服务器的工具列表
 * @param {string} serverId
 * @returns {Promise<Array<{name,description,inputSchema}>>}
 */
export async function listMcpTools(serverId) {
  const rpc = await rpcCall(serverId, 'tools/list');
  if (!rpc || !rpc.ok) return [];
  return rpc.result?.tools || [];
}

/**
 * 调用 MCP 工具
 * @param {string} serverId
 * @param {string} toolName
 * @param {object} params - 工具参数
 * @returns {Promise<{content:Array, isError:boolean, text:string}|null>}
 */
export async function callMcpTool(serverId, toolName, params) {
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
 * 将 MCP 工具结果格式化为可注入上下文的字符串
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

// depends: core/storage.js -> getData
