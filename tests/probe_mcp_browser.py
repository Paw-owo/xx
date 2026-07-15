"""
真实浏览器完整 MCP 链路验证。
在 https://paw.kiss.eoty.cn origin 下模拟 listMcpTools + callMcpTool 的完整流程：
  1. GET /mcp/sse 建 SSE 流
  2. POST initialize → 收到 initialize 响应
  3. POST tools/list → 收到工具列表（验证"测试连接"链路）
  4. POST tools/call → 调用工具（验证"聊天工具调用"链路）
只记录 URL/method/status/工具名，不记录任何凭据。
"""
import json
from playwright.sync_api import sync_playwright

PAGE_URL = "https://paw.kiss.eoty.cn/"
MCP_SSE_URL = "https://kiss.eoty.cn/mcp/sse"
DUMMY_KEY = "test-key"

PROBE_JS = r"""
async (args) => {
  const sseUrl = args.sseUrl;
  const dummyKey = args.dummyKey;
  const result = { steps: [], errors: [] };

  function log(step, data) {
    result.steps.push({ step, ...data });
  }

  let reader = null;
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let messageUrl = '';
  let sessionId = '';
  const pending = new Map();
  let nextId = 0;

  async function pump() {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';
        for (const block of blocks) {
          const lines = block.split('\n');
          let eventType = '';
          const dataLines = [];
          for (const line of lines) {
            if (line.startsWith('event:')) eventType = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
          }
          if (eventType === 'message' && dataLines.length) {
            const dataStr = dataLines.join('\n');
            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.id !== undefined && pending.has(parsed.id)) {
                const p = pending.get(parsed.id);
                pending.delete(parsed.id);
                p.resolve(parsed);
              }
            } catch (_) {}
          }
        }
      }
    } catch (e) { /* 流关闭 */ }
  }

  function rpcPostAndWait(rpcBody, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(rpcBody.id);
        reject(new Error('RPC 超时'));
      }, timeoutMs || 15000);
      pending.set(rpcBody.id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); }
      });
      // 复现修复后的 rpcPostAndWait：不发 Mcp-Session-Id 头
      fetch(messageUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'X-Phone-Token': dummyKey
        },
        body: JSON.stringify(rpcBody)
      }).catch((err) => {
        pending.delete(rpcBody.id);
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  try {
    // 步骤1: GET /mcp/sse
    const response = await fetch(sseUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'X-Phone-Token': dummyKey
      }
    });
    log('GET /mcp/sse', {
      status: response.status,
      contentType: response.headers.get('content-type'),
      type: response.type,
      ok: response.ok
    });
    if (!response.ok) {
      result.errors.push({ step: 'GET /mcp/sse', status: response.status });
      return result;
    }

    reader = response.body.getReader();

    // 步骤2: 等 endpoint 事件
    const endpointDeadline = Date.now() + 15000;
    while (Date.now() < endpointDeadline && !messageUrl) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';
      for (const block of blocks) {
        const lines = block.split('\n');
        let eventType = '';
        const dataLines = [];
        for (const line of lines) {
          if (line.startsWith('event:')) eventType = line.slice(6).trim();
          else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
        }
        if (eventType === 'endpoint' && dataLines.length) {
          const dataStr = dataLines.join('\n');
          try {
            const origin = new URL(sseUrl).origin;
            messageUrl = /^https?:\/\//i.test(dataStr) ? dataStr : (origin + (dataStr.startsWith('/') ? dataStr : '/' + dataStr));
            const sidMatch = messageUrl.match(/[?&]sessionId=([^&]+)/);
            if (sidMatch) sessionId = decodeURIComponent(sidMatch[1]);
          } catch (e) { messageUrl = dataStr; }
        }
      }
    }
    if (!messageUrl) {
      result.errors.push({ step: 'endpoint timeout' });
      return result;
    }
    log('endpoint', { resolvedUrl: messageUrl, hasSessionId: !!sessionId });

    // 启动后台 pump
    pump();

    // 步骤3: POST initialize
    const initBody = { jsonrpc: '2.0', id: ++nextId, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'ai-phone', version: '1.0.0' } } };
    const initResp = await rpcPostAndWait(initBody, 15000);
    log('initialize', {
      status: initResp?.error ? 'error' : 'ok',
      serverInfo: initResp?.result?.serverInfo?.name || null,
      error: initResp?.error || null
    });

    // 步骤4: POST tools/list（验证"测试连接"链路）
    const listBody = { jsonrpc: '2.0', id: ++nextId, method: 'tools/list', params: {} };
    const listResp = await rpcPostAndWait(listBody, 15000);
    const tools = listResp?.result?.tools || [];
    log('tools/list', {
      status: listResp?.error ? 'error' : 'ok',
      toolCount: tools.length,
      toolNames: tools.map(t => t.name),
      error: listResp?.error || null
    });

    // 步骤5: POST tools/call（验证"聊天工具调用"链路，调用 get_today_brief）
    if (tools.some(t => t.name === 'get_today_brief')) {
      const callBody = { jsonrpc: '2.0', id: ++nextId, method: 'tools/call', params: { name: 'get_today_brief', arguments: {} } };
      const callResp = await rpcPostAndWait(callBody, 15000);
      log('tools/call get_today_brief', {
        status: callResp?.error ? 'error' : 'ok',
        hasContent: !!callResp?.result?.content,
        isError: callResp?.result?.isError || false,
        error: callResp?.error || null
      });
    }

    try { reader.cancel(); } catch (_) {}
    result.success = true;
  } catch (e) {
    result.errors.push({ step: 'global', error: String(e), stack: e?.stack?.slice(0, 300) });
    try { reader?.cancel(); } catch (_) {}
  }
  return result;
}
"""

def main():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 420, "height": 800},
            ignore_https_errors=True
        )
        page = context.new_page()

        console_msgs = []
        page.on("console", lambda msg: console_msgs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: console_msgs.append(f"[pageerror] {err}"))

        print("=== goto https://paw.kiss.eoty.cn/ ===")
        page.goto(PAGE_URL, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(2000)

        print("=== 真实浏览器 MCP 完整链路验证 ===")
        probe_result = page.evaluate(PROBE_JS, {"sseUrl": MCP_SSE_URL, "dummyKey": DUMMY_KEY})
        probe_result['console'] = console_msgs
        probe_result['page_origin'] = page.evaluate("location.origin")

        browser.close()

    print(json.dumps(probe_result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
