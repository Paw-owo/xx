// apps/chat/thinking-pure.js
// thinking 文本处理的纯函数模块：无 DOM、无 DB、无 API 副作用
// thread-ai.js 和 thinking-chain.js 共享同一份实现，消除 sanitizer 漂移
// 测试直接 import 本模块，测的是真实生产代码，不是镜像

// 流式 thinking 标签解析：返回 { content, thinking, thinkingSummary, tailBuffer }
// 关键边界规则（修复 P0 标签泄漏）：
//  - 完整 <think>/<thinking>/<think_summary> 标签：text 进 thinking/summary，标签本身不进 content
//  - 孤儿 </think>/</thinking>/</think_summary>（无对应开标签）：标签本身丢弃，不进 content/thinking
//  - 末尾未完成的标签前缀（如 '<thi' / '</think' / '<think_sum'）：作为 tailBuffer 返回，
//    由调用方继续累积到下一 chunk，绝不能回到本次 content（否则流式期临时泄漏）
//  - <think_summary> 必须先于 <think> 处理，避免前缀碰撞
export function parseStreamThinkTags(text) {
  let content = String(text || '');
  let thinking = '';
  let thinkingSummary = '';

  // 末尾不完整的标签前缀缓冲：只匹配可能是 think 标签开头的尾巴，绝不回到本次 content
  // 必须匹配 < 或 </ 后跟 think/thinking 的部分前缀（如 <thi / </thin / <think_sum）
  // 单独的 < 不算标签前缀，避免误剥普通文本
  // 用函数判断而非复杂正则，更可维护
  const extractTailBuffer = (str) => {
    // 从末尾往前找，看是否有 < 或 </ 开头的 think 相关前缀
    const lower = str.toLowerCase();
    // 可能的完整标签名前缀（按长度降序，长前缀优先）
    const prefixes = ['thinking_summary', 'think_summary', 'thinking', 'think'];
    for (const prefix of prefixes) {
      // 检查 </prefix 的部分前缀（如 </thin 匹配 </thinking 的部分）
      for (let len = prefix.length; len >= 1; len--) {
        const partial = prefix.slice(0, len);
        // 开标签前缀：<partial
        const openTail = '<' + partial;
        if (lower.endsWith(openTail)) {
          return str.slice(str.length - openTail.length);
        }
        // 闭标签前缀：</partial
        const closeTail = '</' + partial;
        if (lower.endsWith(closeTail)) {
          return str.slice(str.length - closeTail.length);
        }
      }
    }
    return '';
  };
  const tailBuffer = extractTailBuffer(content);
  if (tailBuffer) {
    content = content.slice(0, content.length - tailBuffer.length);
  }

  // 提取成对标签：长前缀优先，避免 <think 误匹配 <think_summary
  // 注意：孤儿闭合标签剥离必须在成对提取之后，否则会先剥掉成对标签的闭标签
  const extractTag = (src, openTag, closeTag) => {
    let out = { content: src, text: '' };
    const open = src.indexOf(openTag);
    if (open < 0) return out;
    const tagEnd = src.indexOf('>', open);
    if (tagEnd < 0) return out; // 开标签未完整，留到下一 chunk
    const close = src.indexOf(closeTag, tagEnd + 1);
    if (close >= 0) {
      out.text = src.slice(tagEnd + 1, close).trim();
      out.content = (src.slice(0, open) + src.slice(close + closeTag.length)).trim();
    } else {
      // 未闭合：开标签后全部归入 thinking/summary，正文只保留开标签前
      out.text = src.slice(tagEnd + 1).trim();
      out.content = src.slice(0, open).trim();
    }
    return out;
  };

  const s1 = extractTag(content, '<think_summary', '</think_summary>');
  if (s1.text) { thinkingSummary = s1.text; content = s1.content; }

  const s2 = extractTag(content, '<thinking_summary', '</thinking_summary>');
  if (s2.text) { thinkingSummary = thinkingSummary ? thinkingSummary + s2.text : s2.text; content = s2.content; }

  // <think> 和 <thinking>：用 \b 边界避免误匹配 <think_summary
  const thinkMatch = content.match(/<think\b[^>]*>/i);
  if (thinkMatch) {
    const openIdx = thinkMatch.index;
    const tagEnd = openIdx + thinkMatch[0].length;
    const closeIdx = content.indexOf('</think>', tagEnd);
    if (closeIdx >= 0) {
      const t = content.slice(tagEnd, closeIdx).trim();
      thinking = thinking ? thinking + '\n' + t : t;
      content = (content.slice(0, openIdx) + content.slice(closeIdx + 8)).trim();
    } else {
      const t = content.slice(tagEnd).trim();
      thinking = thinking ? thinking + '\n' + t : t;
      content = content.slice(0, openIdx).trim();
    }
  }

  const thinkingMatch = content.match(/<thinking\b[^>]*>/i);
  if (thinkingMatch) {
    const openIdx = thinkingMatch.index;
    const tagEnd = openIdx + thinkingMatch[0].length;
    const closeIdx = content.indexOf('</thinking>', tagEnd);
    if (closeIdx >= 0) {
      const t = content.slice(tagEnd, closeIdx).trim();
      thinking = thinking ? thinking + '\n' + t : t;
      content = (content.slice(0, openIdx) + content.slice(closeIdx + 11)).trim();
    } else {
      const t = content.slice(tagEnd).trim();
      thinking = thinking ? thinking + '\n' + t : t;
      content = content.slice(0, openIdx).trim();
    }
  }

  // 成对标签提取后，剩余的孤儿闭合标签（无对应开标签）是协议残片，剥离掉
  // 必须在成对提取之后执行，否则会先剥掉成对标签的闭标签导致提取失败
  content = content.replace(/<\/(?:think|thinking|think_summary|thinking_summary)>/gi, '');

  // tailBuffer 不回 content，由调用方累积到下一 chunk
  return { content, thinking, thinkingSummary, tailBuffer };
}

// 统一 thinking 文本清洗：剥 <think>/<thinking> 标签、协议文本、压缩多余换行（防竖排）
// 只在明确标签/协议边界判断，不粗暴删普通中文
// thread-ai.js 的 sanitizeThinkingText 和 thinking-chain.js 的 sanitizeDisplayText
// 都委托到本函数，消除两份漂移 copy
//
// 内部工具名泄漏修复：resolve-library-id / mcp_tool_call 等 → 剥离
// 注意：不再把英文原始推理整体替换为占位文案。Round 7 起，气泡只显示 pill 不显示
// thinking 文本，过程链 sheet 需要展示真实 reasoning_content（中/英都原样透传），
// 真实内容为空时由上层（hasThinkingChain / buildSteps）决定不显示该步骤，绝不编内容。
export function sanitizeThinkingText(text) {
  let out = String(text || '');
  // 剥残留的 think/thinking 标签（含未闭合）
  out = out.replace(/<\/?think(?:ing)?(?:_summary)?\b[^>]*>/gi, '');
  // 剥常见协议字段泄漏（如 "正式"、"正文"、"用户正在回应" 等行首协议标记）
  out = out.replace(/^[\s>]*(正式|正文|用户正在回应|assistant|user|system)\s*[:：]\s*/gim, '');
  // 剥内部工具名 / 协议关键词（中英文都剥，绝不暴露中间层）
  out = out.replace(/resolve-library-id|get-library-docs|mcp_tool_call|search_[a-z_]+/gi, '');
  // 修复问题 B/F：合并异常单字/单词换行，恢复连续中文可读段落
  // reasoning_content 流式时若残留 token 间 \n，会把"你 / 在 / 要求"拆成竖排
  out = mergeTokenNewlines(out);
  // 压缩 3+ 连续换行为 2 个，防竖排；保留段落感
  out = out.replace(/\n{3,}/g, '\n\n');
  // 行首尾多余空白
  out = out.split('\n').map((line) => line.trim()).join('\n').trim();
  return out;
}

// 合并 token 级换行：把"CJK 短词\nCJK 短词\n..."恢复成连续段落
// 只合并"看起来是 token 拆分"的换行，保留真正的段落分隔
export function mergeTokenNewlines(text) {
  const lines = String(text || '').split('\n');
  if (lines.length <= 1) return text;
  // 判断一行是否像"被拆分的 token"：短（<=8 字）、无段落终止标点、非空
  const isTokenLike = (line) => {
    const s = line.trim();
    if (!s) return false;
    if (s.length > 8) return false;
    // 含 markdown 结构符或代码块的行不算 token
    if (/^[-*+]\s|^\d+\.|^[>#]|```/.test(s)) return false;
    // 以段落终止标点结尾的不算 token（是真段落结束）
    if (/[。！？!?.；;]$/.test(s)) return false;
    return true;
  };
  const merged = [];
  let buffer = '';
  for (const line of lines) {
    if (isTokenLike(line)) {
      // token 行：拼到 buffer（不加换行）
      buffer += line.trim();
    } else {
      // 非 token 行：先 flush buffer，再推入当前行
      if (buffer) { merged.push(buffer); buffer = ''; }
      merged.push(line);
    }
  }
  if (buffer) merged.push(buffer);
  return merged.join('\n');
}

// 人称转换：把模型视角的"用户/这位玩家/对方"转成"你"，把"你应该"转成"我会"
// 注意：调用顺序必须是先 sanitizeThinkingText（剥协议前缀"用户正在回应:"）再 cleanPerspectiveText
// 顺序反了会让 sanitizer 的"用户正在回应"正则失配，导致协议词泄漏
export function cleanPerspectiveText(text, userName = '你') {
  return String(text || '')
    .replace(/用户/g, userName)
    .replace(/这位玩家/g, userName)
    .replace(/对方/g, userName)
    .replace(/你(应该)/g, '我会')
    .replace(/你(需要)/g, '我会')
    .replace(/你(要)/g, '我会')
    .replace(/你(必须)/g, '我会')
    .replace(/请(你)/g, '我会')
    .trim();
}

// 摘要：截断长文本，末尾加省略号
export function summarizeText(text, max = 60) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}
