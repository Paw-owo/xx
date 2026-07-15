// apps/chat/render-pure.js
// 消息内容拆分的纯函数模块：无 DOM、无 DB、无 API 副作用
// thread-render.js import 本模块，测试直接测真实生产代码

// 拆分文本为 text/code 片段数组
// 修复问题 A：展示层兜底清洗 think 标签残片（兼容历史消息 DB 中残留的 </think>）
// 修复问题 C：code.trim() 为空时不生成代码块组件，避免空 html 代码块带复制/下载/预览按钮
// 只剥标签本身，不动普通中文和代码内容；不改历史 DB
export function splitCodeBlocks(text) {
  const source = String(text || '').replace(/<\/?(?:think|thinking|think_summary|thinking_summary)\b[^>]*>/gi, '');
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
