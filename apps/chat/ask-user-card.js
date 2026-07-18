// apps/chat/ask-user-card.js
// AI 主动提问卡片组件：<ask_user> 块渲染成贴在气泡下方的提问卡片
//
// 三态：
//   pending（未提交）：默认折叠 pill「询问 N 个问题 ›」→ 点开展开问卷
//   submitted（已提交）：只读 pill「已回答 · N/N 题 ✓」
// 状态持久化：localStorage key = chat_ask_user_state_<threadId>_<messageId>
//
// 提交后走 onSubmit(answerText) → 由 thread-render 调 sendThreadMessage 触发 AI 回复
// 已提交永久只读，不允许改答案（避免与已发送的 user 消息不一致）

import { getData, setData } from '../../core/storage.js';
import { formatAnswersAsUserMessage, countAnswered } from './ask-user-pure.js';

const ASK_USER_STYLE_ID = 'chat-ask-user-card-style';

// 对外入口：创建提问卡片节点（贴气泡下方）。无 askUser 返回 null。
// message: 含 askUser 字段的消息对象
// options: { threadId, onSubmit(answerText), isStreaming }
export function createAskUserCard(message, options = {}) {
  const askUser = message?.askUser;
  if (!askUser || !Array.isArray(askUser.questions) || !askUser.questions.length) return null;

  injectStyle();

  const threadId = String(options.threadId || '').trim();
  const messageId = String(message.id || '').trim();
  const storageKey = `chat_ask_user_state_${threadId}_${messageId}`;
  const onSubmit = typeof options.onSubmit === 'function' ? options.onSubmit : null;

  // 流式期间只渲染一个占位 pill（块还在变化，等闭合稳定后渲染完整卡片）
  if (options.isStreaming) {
    return createStreamingPill(askUser.questions.length);
  }

  const wrap = document.createElement('section');
  wrap.className = 'ask-user-wrap';

  const render = () => {
    wrap.innerHTML = '';
    const saved = loadState(storageKey);
    if (saved && saved.status === 'submitted') {
      wrap.appendChild(createReadonlyPill(askUser, saved));
      return;
    }
    // pending 态：默认折叠 pill
    wrap.appendChild(createPendingPill(askUser, storageKey, onSubmit, render));
  };

  render();
  return wrap;
}

// ───────────────────────────────────────
// 状态持久化
// ───────────────────────────────────────

function loadState(key) {
  if (!key) return null;
  const raw = getData(key);
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch (_) { return null; }
}

function saveState(key, state) {
  if (!key) return;
  setData(key, state);
}

// ───────────────────────────────────────
// 流式期占位 pill
// ───────────────────────────────────────

function createStreamingPill(count) {
  const pill = document.createElement('div');
  pill.className = 'ask-user-pill ask-user-pill-streaming';
  pill.appendChild(createQuestionIcon());
  const span = document.createElement('span');
  span.textContent = `准备提问 · ${count} 个问题`;
  pill.appendChild(span);
  return pill;
}

// ───────────────────────────────────────
// 已提交只读 pill「已回答 · N/N 题 ✓」
// ───────────────────────────────────────

function createReadonlyPill(askUser, saved) {
  const { answered, total } = countAnswered(askUser, saved.answers, saved.skipped);
  const pill = document.createElement('div');
  pill.className = 'ask-user-pill ask-user-pill-readonly';
  pill.appendChild(createQuestionIcon());
  const span = document.createElement('span');
  span.textContent = `已回答 · ${answered}/${total} 题 ✓`;
  pill.appendChild(span);
  return pill;
}

// ───────────────────────────────────────
// 未提交折叠 pill「询问 N 个问题 ›」
// ───────────────────────────────────────

function createPendingPill(askUser, storageKey, onSubmit, rerender) {
  const pill = document.createElement('button');
  pill.type = 'button';
  pill.className = 'ask-user-pill';
  pill.setAttribute('aria-label', `展开提问，共 ${askUser.questions.length} 个问题`);
  pill.appendChild(createQuestionIcon());

  const span = document.createElement('span');
  span.textContent = `询问 ${askUser.questions.length} 个问题`;
  pill.appendChild(span);

  const chev = createChevronIcon();
  chev.classList.add('ask-user-pill-chevron');
  pill.appendChild(chev);

  const saved = loadState(storageKey);
  let answers = (saved && saved.answers) || {};
  let skipped = (saved && saved.skipped) || [];

  pill.addEventListener('click', () => {
    openExpandedSheet(askUser, answers, skipped, (newAnswers, newSkipped) => {
      answers = newAnswers;
      skipped = newSkipped;
      saveState(storageKey, { status: 'pending', answers, skipped });
    }, () => {
      // 提交：先发送，成功后才落 submitted 态；失败返回 false 让 sheet 回滚允许重试
      const text = formatAnswersAsUserMessage(askUser, answers, skipped).trim();
      if (!text) {
        // 没有可发送内容（全跳过且无输入）：直接落 submitted，不触发 AI
        const state = { status: 'submitted', answers, skipped, submittedAt: Date.now() };
        saveState(storageKey, state);
        rerender();
        return Promise.resolve(true);
      }
      if (!onSubmit) {
        const state = { status: 'submitted', answers, skipped, submittedAt: Date.now() };
        saveState(storageKey, state);
        rerender();
        return Promise.resolve(true);
      }
      // 返回 Promise<boolean>：发送成功 true 落 submitted，失败 false 保留 pending 允许重试
      return Promise.resolve(onSubmit(text)).then((ok) => {
        if (ok === false) return false;
        const state = { status: 'submitted', answers, skipped, submittedAt: Date.now() };
        saveState(storageKey, state);
        rerender();
        return true;
      }).catch(() => false);
    });
  });

  return pill;
}

// ───────────────────────────────────────
// 展开态：用 bottom sheet 展示问卷（复用项目 sheet 交互形态）
// ───────────────────────────────────────

function openExpandedSheet(askUser, answers, skipped, onChange, onSubmit) {
  // 复用全局 hideBottomSheet/showBottomSheet 不一定可用，这里用自建轻量 sheet
  // 与 thinking-chain sheet 同样的形态：mask + 底部 sheet + handle + header
  const oldSheet = document.querySelector('.ask-user-sheet');
  if (oldSheet) oldSheet.remove();
  const oldMask = document.querySelector('.ask-user-sheet-mask');
  if (oldMask) oldMask.remove();

  const mask = document.createElement('div');
  mask.className = 'ask-user-sheet-mask';

  const sheet = document.createElement('section');
  sheet.className = 'ask-user-sheet';

  const handle = document.createElement('div');
  handle.className = 'ask-user-sheet-handle';
  sheet.appendChild(handle);

  const header = document.createElement('div');
  header.className = 'ask-user-sheet-header';
  const title = document.createElement('span');
  title.className = 'ask-user-sheet-title';
  title.textContent = `回答 ${askUser.questions.length} 个问题`;
  header.appendChild(title);
  const closeBtn = createIconBtn('close', '关闭');
  closeBtn.addEventListener('click', () => closeSheet());
  header.appendChild(closeBtn);
  sheet.appendChild(header);

  const body = document.createElement('div');
  body.className = 'ask-user-sheet-body';

  askUser.questions.forEach((q, qi) => {
    body.appendChild(createQuestionBlock(q, qi, answers, skipped, onChange));
  });

  sheet.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'ask-user-sheet-footer';
  const skipAll = document.createElement('button');
  skipAll.type = 'button';
  skipAll.className = 'ask-user-btn-secondary';
  skipAll.textContent = '全部跳过';
  skipAll.addEventListener('click', () => {
    askUser.questions.forEach((q) => {
      if (!skipped.includes(q.id)) skipped.push(q.id);
    });
    onChange(answers, skipped);
    closeSheet();
  });
  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'ask-user-btn-primary';
  submit.textContent = '提交回答';
  let submitting = false;
  submit.addEventListener('click', () => {
    if (submitting) return;
    submitting = true;
    submit.disabled = true;
    submit.textContent = '提交中…';
    // onSubmit 返回 Promise：成功后落 submitted 态并关 sheet；失败回滚允许重试
    const trySubmit = onSubmit();
    Promise.resolve(trySubmit).then((ok) => {
      if (ok === false) {
        // 失败：回滚按钮，保留 sheet 让用户重试
        submitting = false;
        submit.disabled = false;
        submit.textContent = '提交回答';
        return;
      }
      closeSheet();
    }).catch(() => {
      submitting = false;
      submit.disabled = false;
      submit.textContent = '提交回答';
    });
  });
  footer.append(skipAll, submit);
  sheet.appendChild(footer);

  document.body.append(mask, sheet);
  requestAnimationFrame(() => {
    mask.dataset.show = 'true';
    sheet.dataset.show = 'true';
  });

  const closeSheet = () => {
    mask.dataset.show = 'false';
    sheet.dataset.show = 'false';
    window.setTimeout(() => {
      mask.remove();
      sheet.remove();
    }, 280);
  };

  mask.addEventListener('click', closeSheet);

  // 下滑关闭
  let startY = 0, curY = 0, dragging = false;
  const onStart = (e) => { const t = e.touches ? e.touches[0] : e; startY = t.clientY; dragging = true; };
  const onMove = (e) => {
    if (!dragging) return;
    const t = e.touches ? e.touches[0] : e;
    curY = t.clientY - startY;
    if (curY > 0) { sheet.style.transform = `translateY(${curY}px)`; sheet.style.transition = 'none'; }
  };
  const onEnd = () => {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    if (curY > 80) closeSheet();
    else sheet.style.transform = '';
    curY = 0;
  };
  handle.addEventListener('touchstart', onStart, { passive: true });
  handle.addEventListener('touchmove', onMove, { passive: true });
  handle.addEventListener('touchend', onEnd);
}

// 单题块
function createQuestionBlock(q, qi, answers, skipped, onChange) {
  const block = document.createElement('div');
  block.className = 'ask-user-question';
  block.dataset.qid = q.id;

  const head = document.createElement('div');
  head.className = 'ask-user-q-head';
  const num = document.createElement('span');
  num.className = 'ask-user-q-num';
  num.textContent = String(qi + 1);
  const text = document.createElement('span');
  text.className = 'ask-user-q-text';
  text.textContent = q.text;
  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.className = 'ask-user-skip';
  skipBtn.textContent = skipped.includes(q.id) ? '已跳过' : '跳过';
  skipBtn.addEventListener('click', () => {
    const idx = skipped.indexOf(q.id);
    if (idx >= 0) { skipped.splice(idx, 1); skipBtn.textContent = '跳过'; block.classList.remove('is-skipped'); }
    else { skipped.push(q.id); skipBtn.textContent = '已跳过'; block.classList.add('is-skipped'); }
    onChange(answers, skipped);
  });
  head.append(num, text, skipBtn);
  block.appendChild(head);

  if (!q.options || !q.options.length) {
    // 纯输入题
    const ta = document.createElement('textarea');
    ta.className = 'ask-user-input';
    ta.placeholder = '输入你的答案';
    ta.rows = 2;
    const ans = answers[q.id] || (answers[q.id] = { selected: [], input: '' });
    ta.value = ans.input || '';
    ta.addEventListener('input', () => { ans.input = ta.value; onChange(answers, skipped); });
    block.appendChild(ta);
    return block;
  }

  const optsWrap = document.createElement('div');
  optsWrap.className = 'ask-user-options';
  const ans = answers[q.id] || (answers[q.id] = { selected: [], input: '' });
  if (!Array.isArray(ans.selected)) ans.selected = [];

  q.options.forEach((opt) => {
    const optBtn = document.createElement('button');
    optBtn.type = 'button';
    optBtn.className = 'ask-user-option';
    optBtn.textContent = opt;
    const sync = () => {
      const sel = ans.selected.includes(opt);
      optBtn.classList.toggle('selected', sel);
    };
    sync();
    optBtn.addEventListener('click', () => {
      if (q.type === 'multi') {
        const idx = ans.selected.indexOf(opt);
        if (idx >= 0) ans.selected.splice(idx, 1);
        else ans.selected.push(opt);
      } else {
        ans.selected = [opt];
        // 单选高亮：清除同级其它 selected 样式
        optsWrap.querySelectorAll('.ask-user-option').forEach((b) => b.classList.remove('selected'));
        optBtn.classList.add('selected');
        onChange(answers, skipped);
        return;
      }
      sync();
      onChange(answers, skipped);
    });
    optsWrap.appendChild(optBtn);
  });
  block.appendChild(optsWrap);

  if (q.allow_input) {
    const ta = document.createElement('textarea');
    ta.className = 'ask-user-input';
    ta.placeholder = '或者，输入你的答案';
    ta.rows = 2;
    ta.value = ans.input || '';
    ta.addEventListener('input', () => { ans.input = ta.value; onChange(answers, skipped); });
    block.appendChild(ta);
  }

  return block;
}

// ───────────────────────────────────────
// 图标（线条 SVG，无 emoji）
// ───────────────────────────────────────

function createQuestionIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1 .9-1 1.7');
  svg.appendChild(p);
  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '12');
  c.setAttribute('cy', '16.5');
  c.setAttribute('r', '0.8');
  c.setAttribute('fill', 'currentColor');
  c.setAttribute('stroke', 'none');
  svg.appendChild(c);
  return svg;
}

function createChevronIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M9 6l6 6-6 6');
  svg.appendChild(p);
  return svg;
}

function createIconBtn(kind, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ask-user-icon-btn';
  btn.setAttribute('aria-label', label);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', kind === 'close' ? 'M6 6l12 12M18 6L6 18' : 'M15 6l-6 6 6 6');
  svg.appendChild(p);
  btn.appendChild(svg);
  return btn;
}

// ───────────────────────────────────────
// 样式注入（全走 CSS 变量，跟随主题）
// ───────────────────────────────────────

function injectStyle() {
  if (document.getElementById(ASK_USER_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = ASK_USER_STYLE_ID;
  style.textContent = `
    .ask-user-wrap{width:100%;display:flex;flex-direction:column;gap:8px;margin-top:8px}

    .ask-user-pill{
      display:inline-flex;align-items:center;gap:6px;
      width:fit-content;padding:6px 12px 6px 8px;
      border:1px solid var(--accent-light);
      border-radius:999px;
      background:color-mix(in srgb, var(--accent-light) 36%, var(--bg-card));
      color:var(--text-secondary);
      font:inherit;font-size:12px;font-weight:600;
      cursor:pointer;user-select:none;
      transition:all 200ms ease;touch-action:manipulation;
    }
    .ask-user-pill:hover{background:var(--accent-light)}
    .ask-user-pill:active{transform:scale(0.96)}
    .ask-user-pill svg{flex:0 0 auto;color:var(--accent-dark)}
    .ask-user-pill-chevron{color:var(--text-hint);margin-left:2px}

    .ask-user-pill-readonly{cursor:default;opacity:0.85}
    .ask-user-pill-readonly:active{transform:none}
    .ask-user-pill-readonly svg{color:var(--accent)}

    .ask-user-pill-streaming{cursor:default;opacity:0.7}
    .ask-user-pill-streaming:active{transform:none}

    /* ===== Sheet ===== */
    .ask-user-sheet-mask{
      position:fixed;inset:0;z-index:10042;
      background:var(--bg-overlay);opacity:0;pointer-events:none;
      transition:opacity 200ms ease;
    }
    .ask-user-sheet-mask[data-show="true"]{opacity:1;pointer-events:auto}

    .ask-user-sheet{
      position:fixed;left:0;right:0;bottom:0;z-index:10043;
      width:100vw;height:75vh;display:flex;flex-direction:column;
      border-radius:28px 28px 0 0;background:var(--bg-card);
      transform:translateY(108%);
      transition:transform 280ms cubic-bezier(0.34,1.56,0.64,1);
      overflow:hidden;
    }
    .ask-user-sheet[data-show="true"]{transform:translateY(0)}

    .ask-user-sheet-handle{
      width:36px;height:4px;flex:0 0 auto;margin:10px auto 0;
      border-radius:999px;background:var(--accent-light);cursor:grab;
    }
    .ask-user-sheet-header{
      flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;
      padding:14px 20px 12px;
    }
    .ask-user-sheet-title{
      font-size:16px;font-weight:700;color:var(--text-primary);
    }
    .ask-user-icon-btn{
      width:32px;height:32px;flex:0 0 auto;border:none;border-radius:999px;
      background:color-mix(in srgb, var(--accent-light) 36%, var(--bg-card));
      color:var(--text-secondary);cursor:pointer;
      display:flex;align-items:center;justify-content:center;
      transition:all 180ms ease;touch-action:manipulation;
    }
    .ask-user-icon-btn:hover{background:var(--accent-light)}
    .ask-user-icon-btn:active{transform:scale(0.94)}
    .ask-user-icon-btn svg{width:16px;height:16px}

    .ask-user-sheet-body{
      flex:1;min-height:0;overflow-y:auto;
      padding:4px 20px 12px;-webkit-overflow-scrolling:touch;
    }

    .ask-user-question{
      padding:14px 0;border-bottom:1px solid var(--accent-light);
    }
    .ask-user-question:last-child{border-bottom:none}
    .ask-user-question.is-skipped{opacity:0.5}

    .ask-user-q-head{
      display:flex;align-items:flex-start;gap:8px;margin-bottom:10px;
    }
    .ask-user-q-num{
      flex:0 0 auto;width:20px;height:20px;border-radius:999px;
      background:var(--accent);color:var(--bg-card);
      font-size:11px;font-weight:700;
      display:flex;align-items:center;justify-content:center;
    }
    .ask-user-q-text{
      flex:1;min-width:0;font-size:14px;line-height:1.5;
      color:var(--text-primary);word-break:break-word;
    }
    .ask-user-skip{
      flex:0 0 auto;border:none;background:transparent;
      font:inherit;font-size:11px;color:var(--text-hint);
      cursor:pointer;padding:2px 6px;touch-action:manipulation;
    }
    .ask-user-skip:active{color:var(--text-secondary)}

    .ask-user-options{display:flex;flex-direction:column;gap:8px}

    .ask-user-option{
      width:100%;text-align:left;padding:10px 14px;
      border:1.5px solid var(--accent-light);
      border-radius:14px;background:var(--bg-card);
      color:var(--text-primary);font:inherit;font-size:13px;
      cursor:pointer;transition:all 180ms ease;touch-action:manipulation;
    }
    .ask-user-option:active{transform:scale(0.98)}
    .ask-user-option.selected{
      background:var(--accent);border-color:var(--accent);color:var(--bg-card);
      font-weight:600;
    }

    .ask-user-input{
      width:100%;margin-top:10px;padding:10px 12px;
      border:1.5px solid var(--accent-light);border-radius:14px;
      background:var(--bg-card);color:var(--text-primary);
      font:inherit;font-size:13px;line-height:1.5;resize:vertical;
      min-height:44px;box-sizing:border-box;
    }
    .ask-user-input:focus{outline:none;border-color:var(--accent)}
    .ask-user-input::placeholder{color:var(--text-hint)}

    .ask-user-sheet-footer{
      flex:0 0 auto;display:flex;gap:10px;align-items:center;
      padding:12px 20px calc(20px + env(safe-area-inset-bottom));
      border-top:1px solid var(--accent-light);
    }
    .ask-user-btn-secondary{
      flex:0 0 auto;border:none;background:transparent;
      color:var(--text-hint);font:inherit;font-size:13px;
      cursor:pointer;padding:10px 14px;touch-action:manipulation;
    }
    .ask-user-btn-secondary:active{color:var(--text-secondary)}
    .ask-user-btn-primary{
      flex:1;padding:12px 18px;border:none;border-radius:999px;
      background:var(--accent);color:var(--bg-card);
      font:inherit;font-size:14px;font-weight:700;
      cursor:pointer;transition:all 180ms ease;touch-action:manipulation;
    }
    .ask-user-btn-primary:active{transform:scale(0.97)}

    @media(prefers-reduced-motion:reduce){
      .ask-user-pill,.ask-user-sheet-mask,.ask-user-sheet,.ask-user-icon-btn{transition:none}
    }
  `;
  document.head.appendChild(style);
}
