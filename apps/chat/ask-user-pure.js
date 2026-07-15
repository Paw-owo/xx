// apps/chat/ask-user-pure.js
// <ask_user> 标记块的纯函数解析模块（无 DOM 依赖，可被流式期/展示期/复制/发AI 复用）
//
// 协议格式（AI 输出末尾追加）：
//   <ask_user>
//   { "questions": [ { id, text, type:'single'|'multi', options?, allow_input? } ] }
//   </ask_user>
//
// 设计要点：
//   - parseAskUserBlocks：流式期和展示期统一入口，剥块 + 返回 askUser + pending 标记
//   - 未闭合（流式期半个块）→ pending=true，开标签之后不进 content，等闭合再解析
//   - JSON 解析失败 → 块保留在 content 原文显示（不崩），console.warn
//   - stripAskUserBlocks：复制/引用/发AI 兜底剥离（万一 content 仍含块）

const OPEN_RE = /<ask_user\b[^>]*>/i;
const BLOCK_RE = /<ask_user\b[^>]*>([\s\S]*?)<\/ask_user\s*>/gi;
const BLOCK_STRIP_RE = /<ask_user\b[^>]*>[\s\S]*?<\/ask_user\s*>/gi;

// 解析 content 里的 <ask_user> 块
// 返回 { content, askUser, pending }
//   content: 剥除（成功）或保留（JSON 失败）块后的正文
//   askUser: { questions:[...] } | null
//   pending: true 表示有未闭合块（流式期），调用方不应把 content 当最终态
export function parseAskUserBlocks(text) {
  const raw = String(text || '');
  if (!OPEN_RE.test(raw)) {
    return { content: raw, askUser: null, pending: false };
  }

  // 先从所有已闭合块里取第一个有效 askUser
  // 注意：BLOCK_RE 带 g 标志，.test() 会残留 lastIndex 导致跨调用状态污染，
  //       所以"是否存在闭合块"直接在 while 循环里记录，不再单独 .test()
  let askUser = null;
  let hadClosedBlock = false;
  const extractRe = new RegExp(BLOCK_RE.source, 'gi');
  let m;
  while ((m = extractRe.exec(raw)) !== null) {
    hadClosedBlock = true;
    if (!askUser) {
      const parsed = normalizeAskUser(m[1]);
      if (parsed) askUser = parsed;
    }
  }

  // 剥除所有已闭合块
  let stripped = raw.replace(BLOCK_STRIP_RE, '');

  // 检查是否还有未闭合开标签
  const openMatch = stripped.match(OPEN_RE);
  let pending = false;
  if (openMatch) {
    // 未闭合：开标签及之后暂不进 content（避免流式期残片泄漏）
    stripped = stripped.slice(0, openMatch.index);
    pending = true;
  }
  stripped = stripped.replace(/\n{3,}/g, '\n\n').trim();

  // JSON 解析失败（有闭合块但 askUser 为 null）且非 pending：
  // 按需求"把 <ask_user> 块作为普通文本显示"——保留原文不剥
  if (!askUser && hadClosedBlock && !pending) {
    return { content: raw, askUser: null, pending: false };
  }

  return { content: stripped, askUser, pending };
}

// 规范化 + 校验 AI 输出的 questions JSON
// 返回 { questions:[...] } | null（null 表示格式无效，调用方按原文显示）
export function normalizeAskUser(inner) {
  let data;
  try {
    data = JSON.parse(inner);
  } catch (e) {
    console.warn('[ask_user] JSON 解析失败，块将作为普通文本显示', e);
    return null;
  }
  if (!data || !Array.isArray(data.questions) || data.questions.length === 0) {
    console.warn('[ask_user] questions 字段缺失或为空，块将作为普通文本显示');
    return null;
  }
  const questions = data.questions
    .filter((q) => q && q.id !== undefined && q.id !== null && String(q.text || '').trim())
    .slice(0, 4)
    .map((q) => ({
      id: String(q.id),
      text: String(q.text || '').trim(),
      type: q.type === 'multi' ? 'multi' : 'single',
      options: Array.isArray(q.options) ? q.options.map((o) => String(o)).filter(Boolean) : null,
      allow_input: q.allow_input === true
    }));
  if (!questions.length) {
    console.warn('[ask_user] 没有有效的 question 项，块将作为普通文本显示');
    return null;
  }
  return { questions };
}

// 兜底剥离（复制/引用/发AI 用）：移除所有 ask_user 块，保留正文
export function stripAskUserBlocks(text) {
  const s = String(text || '');
  if (!OPEN_RE.test(s)) return s;
  return s.replace(BLOCK_STRIP_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

// 把用户答案组装成可读的 user 消息文本
// askUser: { questions } ; answers: { qId: { selected:[], input:'' } } ; skipped: [qId]
export function formatAnswersAsUserMessage(askUser, answers, skipped) {
  if (!askUser || !Array.isArray(askUser.questions)) return '';
  const skippedList = Array.isArray(skipped) ? skipped : [];
  const lines = [];
  askUser.questions.forEach((q, i) => {
    const num = i + 1;
    const isSkipped = skippedList.includes(q.id);
    const ans = answers && answers[q.id];
    if (isSkipped || !ans) {
      lines.push(`Q${num}: ${q.text}\n→ [跳过]`);
      return;
    }
    const selected = Array.isArray(ans.selected) ? ans.selected.filter(Boolean) : [];
    const input = String(ans.input || '').trim();
    const parts = [];
    if (selected.length) parts.push(selected.join('、'));
    if (input) parts.push(input);
    const answerStr = parts.join('；') || '[跳过]';
    lines.push(`Q${num}: ${q.text}\n→ ${answerStr}`);
  });
  return lines.join('\n\n');
}

// 统计已答/已跳过数量（用于只读 pill 显示 N/N）
export function countAnswered(askUser, answers, skipped) {
  if (!askUser || !Array.isArray(askUser.questions)) return { answered: 0, total: 0 };
  const skippedList = Array.isArray(skipped) ? skipped : [];
  let answered = 0;
  askUser.questions.forEach((q) => {
    const ans = answers && answers[q.id];
    const hasSel = ans && Array.isArray(ans.selected) && ans.selected.filter(Boolean).length > 0;
    const hasInput = ans && String(ans.input || '').trim();
    if (skippedList.includes(q.id) || hasSel || hasInput) answered += 1;
  });
  return { answered, total: askUser.questions.length };
}
