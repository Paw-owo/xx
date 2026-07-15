// apps/chat/render-pure.js
// 消息内容拆分的纯函数模块：无 DOM、无 DB、无 API 副作用
// thread-render.js import 本模块，测试直接测真实生产代码

// 检测文本是否包含 MCP 工具调用 JSON 片段（完整或残片）
// mcp_tool_call 是内部控制协议字符串，不可能出现在自然对话中
// 一旦命中，该文本段是工具协议残片，不得渲染为正文气泡
export function containsMcpToolCallFragment(text) {
  if (!text || typeof text !== 'string') return false;
  // 完整关键词
  if (/mcp_tool_call/.test(text)) return true;
  // 截断前缀：{"type":"mcp_to（流式截断，关键词未补全）
  if (/\{\s*"type"\s*:\s*"mcp_to/.test(text)) return true;
  return false;
}

// 从文本中剥离 MCP 工具调用 JSON 片段（完整 JSON 对象 + 残片）
// 用于展示层兜底：即使流式累积器漏拦，splitCodeBlocks 也不会把工具 JSON 切成正文
// 通过花括号深度追踪匹配完整 JSON 对象，正确处理嵌套 arguments
function stripMcpToolCallJson(text) {
  if (!text || typeof text !== 'string') return text;
  let result = text;
  let changed = true;
  let iterations = 0;

  while (changed && iterations < 20) {
    changed = false;
    iterations++;

    // 优先查找完整关键词 mcp_tool_call
    const idx = result.indexOf('mcp_tool_call');
    if (idx !== -1) {
      // 向前找最近的 {
      const braceStart = result.lastIndexOf('{', idx);
      if (braceStart === -1) {
        // 无 { 包裹，按行剥离含 mcp_tool_call 的行
        result = result.replace(/^[^\n]*mcp_tool_call[^\n]*$/gm, '');
        changed = true;
        continue;
      }
      // 向后追踪花括号深度找匹配的 }
      let depth = 0;
      let braceEnd = -1;
      for (let i = braceStart; i < result.length; i++) {
        if (result[i] === '{') depth++;
        else if (result[i] === '}') {
          depth--;
          if (depth === 0) { braceEnd = i; break; }
        }
      }
      if (braceEnd !== -1) {
        // 完整 JSON 对象：移除从 { 到 }
        result = result.slice(0, braceStart) + result.slice(braceEnd + 1);
      } else {
        // 无匹配 }（截断）：移除从 { 到末尾
        result = result.slice(0, braceStart);
      }
      changed = true;
      continue;
    }

    // 检查截断前缀 {"type":"mcp_to
    const truncMatch = result.match(/\{\s*"type"\s*:\s*"mcp_to/);
    if (truncMatch) {
      // 截断残片：移除从 { 到末尾（流式截断无闭合 }）
      const braceStart = result.lastIndexOf('{', truncMatch.index);
      const cutAt = braceStart !== -1 ? braceStart : truncMatch.index;
      result = result.slice(0, cutAt);
      changed = true;
      continue;
    }
  }

  return result;
}

// 拆分文本为 text/code 片段数组
// 修复问题 A：展示层兜底清洗 think 标签残片（兼容历史消息 DB 中残留的 </think>）
// 修复问题 C：code.trim() 为空时不生成代码块组件，避免空 html 代码块带复制/下载/预览按钮
// 修复 BUG1：剥离 MCP 工具调用 JSON 片段，不让协议残片被拆成正文气泡
// 只剥标签本身，不动普通中文和代码内容；不改历史 DB
export function splitCodeBlocks(text) {
  let source = String(text || '').replace(/<\/?(?:think|thinking|think_summary|thinking_summary)\b[^>]*>/gi, '');
  // 展示层兜底：剥离工具调用 JSON（完整 + 残片），防止泄漏进正文气泡
  source = stripMcpToolCallJson(source);
  const result = [];
  const reg = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = reg.exec(source))) {
    const prev = source.slice(lastIndex, match.index);
    if (prev) result.push({ type: 'text', text: prev });

    // 修复问题 C：code.trim() 为空时不生成代码块组件
    const code = match[2] || '';
    if (code.trim()) {
      result.push({
        type: 'code',
        lang: match[1] || 'code',
        code
      });
    }
    // 空代码块：丢弃，前后文本自然衔接，不生成任何组件

    lastIndex = reg.lastIndex;
  }

  const tail = source.slice(lastIndex);
  if (tail) result.push({ type: 'text', text: tail });
  if (!result.length) result.push({ type: 'text', text: source });

  return result;
}
