// tests/test_ask_user.mjs
// <ask_user> 块解析纯函数测试
// 运行：node tests/test_ask_user.mjs

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗ FAIL:', msg); }
}
function assertHas(h, n, msg) { assert(String(h || '').includes(n), msg); }
function assertNo(h, n, msg) { assert(!String(h || '').includes(n), msg); }

const { parseAskUserBlocks, stripAskUserBlocks, normalizeAskUser, formatAnswersAsUserMessage, countAnswered } =
  await import('../apps/chat/ask-user-pure.js');

// ── 1. 合法块：剥除 + 解析 questions ──
console.log('\n[1] 合法 <ask_user> 块解析');
{
  const content = '这是正文回复。\n\n<ask_user>\n{"questions":[{"id":"q1","text":"给谁用？","type":"single","options":["A","B"],"allow_input":true},{"id":"q2","text":"哪个场景？","type":"multi","options":["场景1","场景2"],"allow_input":false}]}\n</ask_user>';
  const r = parseAskUserBlocks(content);
  assertNo(r.content, '<ask_user>', '正文剔除 ask_user 块');
  assertHas(r.content, '这是正文回复', '正文保留');
  assert(r.askUser && r.askUser.questions.length === 2, '解析出 2 个问题');
  assert(r.askUser.questions[0].id === 'q1', 'q1 id 正确');
  assert(r.askUser.questions[0].type === 'single', 'q1 type=single');
  assert(r.askUser.questions[0].allow_input === true, 'q1 allow_input=true');
  assert(Array.isArray(r.askUser.questions[0].options), 'q1 有 options');
  assert(r.askUser.questions[1].type === 'multi', 'q2 type=multi');
  assert(r.pending === false, '非 pending（已闭合）');
}

// ── 2. 未闭合块（流式期半个）：pending=true，开标签后不进 content ──
console.log('\n[2] 未闭合块（流式期）');
{
  const content = '正文前半。<ask_user>\n{"questions":[{"id":"q1","text":"半截';
  const r = parseAskUserBlocks(content);
  assert(r.pending === true, 'pending=true');
  assert(r.askUser === null, 'askUser=null（未闭合不解析）');
  assertHas(r.content, '正文前半', '开标签前正文保留');
  assertNo(r.content, '<ask_user>', '开标签及之后不进 content');
  assertNo(r.content, '半截', '半截 JSON 不泄漏');
}

// ── 3. JSON 解析失败：块保留原文，不崩 ──
console.log('\n[3] JSON 解析失败 → 原文保留');
{
  const content = '正文。<ask_user>这不是合法JSON</ask_user>';
  const r = parseAskUserBlocks(content);
  assert(r.askUser === null, 'askUser=null（解析失败）');
  assert(r.pending === false, '非 pending');
  assertHas(r.content, '<ask_user>', 'JSON 失败时块原文保留');
  assertHas(r.content, '这不是合法JSON', '失败块内容可见');
}

// ── 4. questions 缺失/空 → 原文保留 ──
console.log('\n[4] questions 字段缺失');
{
  const content = '正文。<ask_user>{"foo":"bar"}</ask_user>';
  const r = parseAskUserBlocks(content);
  assert(r.askUser === null, '无 questions → askUser=null');
  assertHas(r.content, '<ask_user>', '无效块原文保留');
}

// ── 5. 无块：原样返回 ──
console.log('\n[5] 无 ask_user 块');
{
  const content = '普通回复，没有提问。';
  const r = parseAskUserBlocks(content);
  assert(r.content === content, '原样返回');
  assert(r.askUser === null, 'askUser=null');
  assert(r.pending === false, '非 pending');
}

// ── 6. 纯输入题（无 options）──
console.log('\n[6] 纯输入题');
{
  const inner = '{"questions":[{"id":"q1","text":"说说你的想法","allow_input":true}]}';
  const a = normalizeAskUser(inner);
  assert(a.questions[0].options === null, '无 options → null');
  assert(a.questions[0].type === 'single', '无 options 时 type 默认 single');
}

// ── 7. 超过 4 个问题：截断到 4 ──
console.log('\n[7] 超长截断');
{
  const qs = [];
  for (let i = 1; i <= 6; i++) qs.push({ id: 'q' + i, text: '问题' + i });
  const a = normalizeAskUser(JSON.stringify({ questions: qs }));
  assert(a.questions.length === 4, '截断到 4 个问题');
}

// ── 8. stripAskUserBlocks：复制/发AI 兜底剥离 ──
console.log('\n[8] stripAskUserBlocks');
{
  const content = '正文\n<ask_user>{"questions":[]}</ask_user>\n后文';
  const stripped = stripAskUserBlocks(content);
  assertNo(stripped, '<ask_user>', '剥离干净');
  assertHas(stripped, '正文', '正文保留');
  assertHas(stripped, '后文', '后文保留');
  assert(stripAskUserBlocks('无块') === '无块', '无块原样');
}

// ── 9. formatAnswersAsUserMessage：组装用户答案文本 ──
console.log('\n[9] 答案组装');
{
  const askUser = { questions: [
    { id: 'q1', text: '给谁用？', type: 'single', options: ['A'], allow_input: true },
    { id: 'q2', text: '哪个场景？', type: 'multi', options: ['场景1','场景2'], allow_input: false },
    { id: 'q3', text: '补充', allow_input: true }
  ]};
  const answers = {
    q1: { selected: ['A'], input: '其实想要C' },
    q2: { selected: ['场景1','场景2'], input: '' },
    q3: { selected: [], input: '' }
  };
  const skipped = ['q3'];
  const text = formatAnswersAsUserMessage(askUser, answers, skipped);
  assertHas(text, 'Q1: 给谁用？', 'Q1 题目');
  assertHas(text, '→ A；其实想要C', 'Q1 答案（选项+输入）');
  assertHas(text, 'Q2: 哪个场景？', 'Q2 题目');
  assertHas(text, '→ 场景1、场景2', 'Q2 多选答案');
  assertHas(text, 'Q3: 补充', 'Q3 题目');
  assertHas(text, '→ [跳过]', 'Q3 跳过');
}

// ── 10. countAnswered：统计已答 ──
console.log('\n[10] countAnswered');
{
  const askUser = { questions: [{id:'q1',text:'a'},{id:'q2',text:'b'},{id:'q3',text:'c'}]};
  const answers = { q1: {selected:['x'],input:''}, q2: {selected:[],input:'自由文本'} };
  const skipped = ['q3'];
  const c = countAnswered(askUser, answers, skipped);
  assert(c.answered === 3, `3/3 全答/跳过 (实际 ${c.answered})`);
  assert(c.total === 3, 'total=3');
}

// ── 11. 多块：取第一个有效，剥所有 ──
console.log('\n[11] 多块处理');
{
  const content = '前文<ask_user>{"questions":[{"id":"q1","text":"第一题"}]}</ask_user>中间<ask_user>{"questions":[{"id":"q2","text":"第二题"}]}</ask_user>后文';
  const r = parseAskUserBlocks(content);
  assert(r.askUser.questions[0].id === 'q1', '取第一个有效块');
  assertNo(r.content, '<ask_user>', '所有块都剥除');
  assertHas(r.content, '前文', '前文保留');
  assertHas(r.content, '中间', '中间保留');
  assertHas(r.content, '后文', '后文保留');
}

console.log('\n══════════════════════════════');
console.log(`通过: ${pass}  失败: ${fail}`);
if (fail) process.exit(1);
console.log('全部通过');
