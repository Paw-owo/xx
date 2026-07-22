import { createChatIcon } from './icons.js';
// apps/chat/thread-render.js
// imports:
//   from '../../core/storage.js': getData
//   from '../../core/ui.js': showToast, showBottomSheet, hideBottomSheet
//   from './thread-actions.js': copyThreadMessage, quoteThreadMessage, editThreadMessage, deleteThreadMessage, regenerateThreadMessage, resendThreadMessage, playThreadTTS, stopThreadTTS, switchThreadVersion, getVersionInfo
//   from './thinking-chain.js': createThinkingCard, hasThinkingChain

import { getData } from '../../core/storage.js';
import { showToast, showBottomSheet, hideBottomSheet } from '../../core/ui.js';
import { createThinkingCard, hasThinkingChain } from './thinking-chain.js';
import { createSubAgentCard, isSubAgentCardMessage } from './sub-agent-card.js';
import { splitCodeBlocks } from './render-pure.js';
import { parseAskUserBlocks, stripAskUserBlocks } from './ask-user-pure.js';
import { createAskUserCard } from './ask-user-card.js';
import { sendThreadMessage } from './thread-actions.js';

import {
  copyThreadMessage,
  quoteThreadMessage,
  editThreadMessage,
  deleteThreadMessage,
  regenerateThreadMessage,
  resendThreadMessage,
  playThreadTTS,
  stopThreadTTS,
  switchThreadVersion,
  getVersionInfo
} from './thread-actions.js';

const RENDER_STYLE_ID = 'chat-thread-render-style';
const TIME_GAP_MS = 5 * 60 * 1000;

// ═══════════════════════════════════════
// 【全局语音播放管理器】同时只放一个
// ═══════════════════════════════════════

const voicePlayer = {
  currentCard: null,
  currentMessageId: '',

  play(card) {
    if (this.currentCard && this.currentCard !== card) {
      this.currentCard.dataset.playing = 'false';
    }
    this.currentCard = card;
    this.currentMessageId = card?.dataset?.messageId || '';
    if (card) card.dataset.playing = 'true';
  },

  pause() {
    if (this.currentCard) {
      this.currentCard.dataset.playing = 'false';
    }
  },

  stop() {
    if (this.currentCard) {
      this.currentCard.dataset.playing = 'false';
    }
    this.currentCard = null;
    this.currentMessageId = '';
  },

  // 卸载/重渲染时清理：释放对已移除 DOM 的引用，避免游离节点
  reset() {
    this.currentCard = null;
    this.currentMessageId = '';
  },

  isPlaying(messageId) {
    return this.currentMessageId === messageId && this.currentCard?.dataset?.playing === 'true';
  }
};

// 卸载时清理：释放 voicePlayer 对已移除 DOM 的引用，避免游离节点
export function resetVoicePlayer() {
  voicePlayer.reset();
}

// ═══════════════════════════════════════
// 【猫爪图标】粗线条圆头，走 --accent
// ═══════════════════════════════════════

function createPawIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `
    <ellipse cx="6.5" cy="9" rx="1.8" ry="2.4" transform="rotate(-15 6.5 9)"/>
    <ellipse cx="12" cy="7" rx="1.8" ry="2.6"/>
    <ellipse cx="17.5" cy="9" rx="1.8" ry="2.4" transform="rotate(15 17.5 9)"/>
    <ellipse cx="4" cy="13.5" rx="1.5" ry="2" transform="rotate(-20 4 13.5)"/>
    <ellipse cx="20" cy="13.5" rx="1.5" ry="2" transform="rotate(20 20 13.5)"/>
    <path d="M8 17.5c0-2.5 1.8-4.5 4-4.5s4 2 4 4.5c0 2-1.5 3.5-4 3.5s-4-1.5-4-3.5z"/>
  `;
  return svg;
}

// ═══════════════════════════════════════
// 【主渲染入口】绘制消息列表
// ═══════════════════════════════════════

export function renderThreadMessages(state, pageEl) {
  injectStyle();

  const list = pageEl.querySelector('#chat-thread-list');
  if (!list) return;

  const wasNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 140;
  const messages = getVisibleMessages(state);

  list.replaceChildren();

  if (!messages.length) {
    list.appendChild(createEmptyThread());
    renderQuotePreview(state, pageEl);
    return;
  }

  let lastTime = 0;
  messages.forEach((message, index) => {
    const currentTime = getMessageTimeValue(message);
    const shouldShowTime = index === 0 || (currentTime && lastTime && currentTime - lastTime >= TIME_GAP_MS);

    if (shouldShowTime) {
      list.appendChild(createTimeDivider(currentTime, lastTime));
    }

    list.appendChild(createMessageRow(state, message, pageEl));

    if (currentTime) lastTime = currentTime;
  });

  renderQuotePreview(state, pageEl);

  requestAnimationFrame(() => {
    if (wasNearBottom || messages.length <= 2) {
      list.scrollTop = list.scrollHeight;
    }
  });
}

// ═══════════════════════════════════════
// 【消息行】单条消息的完整结构
// ═══════════════════════════════════════

function createMessageRow(state, message, pageEl) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  const mode = state.displayMode || 'bubble';
  const row = el('article', `chat-message-row role-${role} mode-${mode}`);
  row.dataset.messageId = message.id || '';
  row.dataset.role = role;

  // 展示层兜底：解析 <ask_user> 块到 message.askUser，并从 content 剔除
  // （流式期已剥，这里兼容旧消息/非流式路径/DB 残留；剥后复制/引用自动干净）
  ensureAskUserParsed(message);

  const body = el('div', `chat-message-body role-${role}`);

  // 作者信息：头像 + 名字 + 思维链胶囊（如果有）
  const author = createMessageAuthor(state, message);

  if (role === 'assistant' && hasThinkingChain(message)) {
    const reasoning = createReasoningStack(state, message, mode);
    author.appendChild(reasoning);
  }

  body.append(
    author,
    createBubbleContent(state, message, pageEl),
    createMessageActions(state, message, pageEl)
  );
  row.appendChild(body);

  if (role === 'assistant' && mode === 'bubble' && !message.isPending && !message.isError) {
    const chunks = splitAIBubbleChunks(message);
    if (chunks.length > 1) {
      body.replaceChildren();
      chunks.forEach((chunkText, chunkIndex) => {
        const chunkBody = el('div', 'chat-message-body role-assistant');
        chunkBody.append(
          chunkIndex === 0 ? author : el('div', 'chat-message-author-placeholder'),
          createSingleBubbleChunk(state, message, chunkText, chunkIndex === 0, chunkIndex === chunks.length - 1),
          chunkIndex === 0 ? createMessageActions(state, message, pageEl) : el('div', 'chat-message-actions-placeholder')
        );
        row.appendChild(chunkBody);
      });

      const askCard = createAskUserCardForState(state, message);
      if (askCard) row.appendChild(askCard);

      const pager = createVersionPager(state, message, pageEl);
      if (pager) row.appendChild(pager);

      return row;
    }
  }

  // 单气泡路径：提问卡片贴在气泡下方
  const askCard = createAskUserCardForState(state, message);
  if (askCard) body.appendChild(askCard);

  // 版本翻页（AI 消息且有多个版本时显示）
  if (role === 'assistant') {
    const pager = createVersionPager(state, message, pageEl);
    if (pager) row.appendChild(pager);
  }

  return row;
}

// 解析 <ask_user> 块到 message.askUser，并从 content 剔除（展示层兜底，幂等）
// 必须用 r.content 覆盖 message.content，即使 askUser 为 null：
//   - 未闭合块：parseAskUserBlocks 已剥除开标签及之后的残片，避免协议标签泄漏进气泡
//   - JSON 失败闭合块：parseAskUserBlocks 故意保留原文，content 等于 raw（无副作用）
function ensureAskUserParsed(message) {
  if (!message) return;
  const content = String(message.content || '');
  if (!content || !/<ask_user\b/i.test(content)) return;
  // 已有 askUser 不重解析（避免覆盖流式期已写入的稳定态）
  if (message.askUser) {
    // 但 content 可能仍含未剥块（旧 DB 残留），用 strip 兜底
    const stripped = stripAskUserBlocks(content);
    if (stripped !== content) message.content = stripped;
    return;
  }
  const r = parseAskUserBlocks(content);
  // 始终用 r.content 覆盖：未闭合块已剥残片，闭合块已剥完整块
  if (r.content !== content) message.content = r.content;
  if (r.askUser) message.askUser = r.askUser;
}

// 构造提问卡片节点，附 onSubmit 回调（走现有 sendMessage 流程触发 AI 回复）
function createAskUserCardForState(state, message) {
  if (message.role !== 'assistant') return null;
  const askUser = message?.askUser;
  if (!askUser || !Array.isArray(askUser.questions) || !askUser.questions.length) return null;
  const threadId = state.mode === 'group' ? state.groupId : state.characterId;
  return createAskUserCard(message, {
    threadId,
    isStreaming: !!message.isStreaming,
    onSubmit: (answerText) => {
      // 答案作为一条明确的 user 消息发回，走现有 sendMessage 流程触发 AI 回复
      // 返回 Promise<boolean>：成功 true 让卡片落 submitted；失败 false 让卡片回滚允许重试
      return sendThreadMessage(state, answerText, { triggerAI: true }).then((msg) => {
        return !!msg;
      }).catch((e) => {
        console.warn('[ask_user] 提交答案发送失败', e);
        showToast('答案没发出去，再试一下');
        return false;
      });
    }
  });
}

// ═══════════════════════════════════════
// 【版本翻页】AI 消息底部 < 1/3 > 胶囊
// ═══════════════════════════════════════

function createVersionPager(state, message, pageEl) {
  if (message.role !== 'assistant') return null;

  const info = getVersionInfo(state, message);
  if (!info) return null;

  const pager = el('div', 'chat-version-pager');

  const prevBtn = safeButton('chat-version-pager-btn', '上一个版本');
  prevBtn.appendChild(createLineIcon('chevron-left'));
  prevBtn.addEventListener('click', async () => {
    await switchThreadVersion(state, info.versionGroupId, 'prev');
    renderThreadMessages(state, pageEl);
  });

  const label = el('span', 'chat-version-pager-label', `${info.current} / ${info.total}`);

  const nextBtn = safeButton('chat-version-pager-btn', '下一个版本');
  nextBtn.appendChild(createLineIcon('chevron-right'));
  nextBtn.addEventListener('click', async () => {
    await switchThreadVersion(state, info.versionGroupId, 'next');
    renderThreadMessages(state, pageEl);
  });

  pager.append(prevBtn, label, nextBtn);
  return pager;
}

// ═══════════════════════════════════════
// 【拆段逻辑】AI消息按空行拆分气泡
// ═══════════════════════════════════════

function splitAIBubbleChunks(message) {
  const raw = String(message?.content || '').trim();
  if (!raw) return [raw || ''];

  if (raw.includes('```')) return [raw];

  const MAX_CHUNKS = 10;
  const MAX_CHARS = 18;

  let paragraphs = raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  if (paragraphs.length <= 1) {
    paragraphs = raw.split(/\n/).map((p) => p.trim()).filter(Boolean);
  }

  if (paragraphs.length <= 1) return [raw];

  const chunks = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= MAX_CHARS || chunks.length >= MAX_CHUNKS) {
      chunks.push(paragraph);
    } else {
      const subChunks = splitLongParagraph(paragraph, MAX_CHARS);
      chunks.push(...subChunks);
    }
    if (chunks.length >= MAX_CHUNKS) break;
  }

  return chunks.slice(0, MAX_CHUNKS);
}

function splitLongParagraph(text, maxChars) {
  const result = [];
  let remaining = text;

  while (remaining.length > maxChars && result.length < 9) {
    let cutAt = -1;

    const searchRange = remaining.slice(0, maxChars + 6);
    const puncMatches = [...searchRange.matchAll(/[。！？~…，、；：.!?,;:]/g)];

    for (let i = puncMatches.length - 1; i >= 0; i--) {
      const pos = puncMatches[i].index + 1;
      if (pos >= 6 && pos <= maxChars + 2) {
        cutAt = pos;
        break;
      }
    }

    if (cutAt < 6) {
      const spaceAt = remaining.lastIndexOf(' ', maxChars);
      cutAt = spaceAt >= 6 ? spaceAt + 1 : maxChars;
    }

    result.push(remaining.slice(0, cutAt).trim());
    remaining = remaining.slice(cutAt).trim();
  }

  if (remaining) result.push(remaining);
  return result;
}

function createSingleBubbleChunk(state, message, chunkText, isChunkHead, isChunkTail) {
  const role = message.role === 'user' ? 'user' : 'ai';
  const bubble = el('div', `chat-message-bubble role-${role}`);

  if (isChunkHead && message.quoteText) {
    bubble.append(createQuoteBlock(message.quoteText));
  }

  const content = el('div', 'chat-message-content');
  splitCodeBlocks(chunkText).forEach((part) => {
    content.appendChild(part.type === 'code' ? createCodeBlock(part) : createTextBlock(part.text));
  });
  bubble.appendChild(content);

  if (isChunkTail && message.editedAt) {
    bubble.append(el('div', 'chat-message-edited', '已编辑'));
  }

  return bubble;
}

// ───────────────────
// 时间分隔线
// ───────────────────

function createTimeDivider(currentTime, lastTime) {
  const wrap = el('div', 'chat-time-divider');
  const pill = el('span', 'chat-time-pill', formatTimeDividerText(currentTime, lastTime));
  wrap.appendChild(pill);
  return wrap;
}

// ═══════════════════════════════════════
// 【思维链】接入新版 thinking-card 组件
// ═══════════════════════════════════════

function createReasoningStack(state, message, mode = 'bubble') {
  const stack = el('section', `chat-reasoning-stack role-assistant mode-${mode}`);
  const target = getTargetInfo(state, message);
  const card = createThinkingCard(message, {
    roleName: target.name,
    messageId: message.id || ''
  });
  stack.appendChild(card);
  return stack;
}

// ═══════════════════════════════════════
// 【作者信息】头像和名称
// ═══════════════════════════════════════

function createMessageAuthor(state, message) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  const target = getTargetInfo(state, message);
  const author = el('div', `chat-message-author role-${role}`);

  const avatar = createMessageAvatar(target, role);
  const meta = el('div', 'chat-message-meta');
  meta.appendChild(el('div', 'chat-message-name', target.name));

  author.append(avatar, meta);
  return author;
}

function createMessageAvatar(target, role) {
  const avatar = el('span', `chat-message-avatar ${role === 'user' ? 'user' : 'ai'}`);

  if (target.avatar) {
    const img = document.createElement('img');
    img.src = target.avatar;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitial(target.name);
  }

  return avatar;
}

// ═══════════════════════════════════════
// 【气泡内容】消息气泡和内容类型
// ═══════════════════════════════════════

function createBubbleContent(state, message, pageEl) {
  const role = message.role === 'user' ? 'user' : 'ai';
  const bubble = el('div', `chat-message-bubble role-${role}`);
  if (message.type === 'sticker') bubble.classList.add('sticker-bubble');
  if (message.type === 'image') bubble.classList.add('image-bubble');
  if (isVoiceMessage(message)) bubble.classList.add('voice-bubble');
  if (message.isError) bubble.classList.add('error-bubble');
  if (isSubAgentCardMessage(message)) bubble.classList.add('sub-agent-bubble');

  if (message.quoteText) {
    bubble.append(createQuoteBlock(message.quoteText));
  }

  bubble.append(createMessageContent(state, message, pageEl));

  if (message.editedAt) {
    bubble.append(el('div', 'chat-message-edited', '已编辑'));
  }

  return bubble;
}

// ───────────────────
// 消息内容分发
// ───────────────────

function createMessageContent(state, message, pageEl) {
  const content = el('div', `chat-message-content ${message.type === 'sticker' ? 'sticker-content' : ''}`);

  // 错误消息优先处理
  if (message.isError) {
    content.appendChild(createErrorBubble(state, message, pageEl));
    return content;
  }

  if (message.isPending && !String(message.content || '').trim()) {
    content.appendChild(createPendingLoadingCard());
    return content;
  }

  if (isVoiceMessage(message)) {
    content.appendChild(createVoiceMessageCard(state, message));
    return content;
  }

  if (isSubAgentCardMessage(message)) {
    content.appendChild(createSubAgentCard(message));
    return content;
  }

  if (message.type === 'image') {
    // 兼容旧数据 imageBase64 单图 + 新数据 images 数组
    const imageList = Array.isArray(message.images) && message.images.length > 0
      ? message.images
      : (message.imageBase64 ? [message.imageBase64] : []);

    if (imageList.length > 0) {
      const frame = el('section', 'chat-message-image-frame');
      if (imageList.length > 1) {
        frame.classList.add('is-grid');
        frame.style.setProperty('--img-count', String(imageList.length));
      }

      imageList.forEach((src) => {
        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.className = 'chat-message-image';
        img.loading = 'lazy';
        frame.appendChild(img);
      });

      const caption = String(message.content || '').trim();
      content.appendChild(frame);
      if (caption && caption !== '[图片]' && !caption.startsWith('图片：')) {
        content.appendChild(createTextBlock(caption));
      }

      return content;
    }
    // 既无 images 也无 imageBase64，退化为纯文本展示 content
  }

  if (message.type === 'sticker') {
    content.appendChild(createStickerContent(message));
    return content;
  }

  if (message.type === 'dice') {
    content.appendChild(createDiceCard(message));
    return content;
  }

  if (message.type === 'rps') {
    content.appendChild(createRpsCard(message));
    return content;
  }

  if (message.type === 'transfer') {
    content.appendChild(createTransferCard(message));
    return content;
  }

  if (['gift', 'shop_item', 'shop-item', 'purchase', 'item'].includes(String(message.type || ''))) {
    content.appendChild(createShopCard(message));
    return content;
  }

  splitCodeBlocks(String(message.content || '').trim()).forEach((part) => {
    content.appendChild(part.type === 'code' ? createCodeBlock(part) : createTextBlock(part.text));
  });

  return content;
}

// ───────────────────
// AI 加载动画
// ───────────────────

function createPendingLoadingCard() {
  const card = el('div', 'chat-pending-card');

  const dots = el('div', 'chat-pending-dots');
  dots.appendChild(el('span', 'chat-pending-dot'));
  dots.appendChild(el('span', 'chat-pending-dot'));
  dots.appendChild(el('span', 'chat-pending-dot'));

  const text = el('span', 'chat-pending-text', '正在想…');

  card.append(dots, text);
  return card;
}

// ───────────────────
// 错误气泡卡片（含重试按钮）
// ───────────────────

function createErrorBubble(state, message, pageEl) {
  const card = el('div', 'chat-error-card');

  const icon = el('div', 'chat-error-icon');
  icon.appendChild(createLineIcon('warning'));

  const text = el('div', 'chat-error-text', String(message.content || '出了点小状况'));

  const retryBtn = safeButton('chat-error-retry', '再试一次');
  retryBtn.append(createLineIcon('refresh'), el('span', '', '再试一次'));
  retryBtn.addEventListener('click', async () => {
    await regenerateThreadMessage(state, message.id);
    renderThreadMessages(state, pageEl);
  });

  card.append(icon, text, retryBtn);
  return card;
}

// ───────────────────
// 语音消息卡片（猫爪图标 + 全局播放管理 + 暂停/继续）
// ───────────────────

function createVoiceMessageCard(state, message) {
  const card = el('section', 'chat-voice-card');
  card.dataset.messageId = message.id || '';
  card.dataset.open = 'false';
  card.dataset.playing = voicePlayer.isPlaying(message.id) ? 'true' : 'false';

  const bar = safeButton('chat-voice-bar', '播放语音');

  const playIcon = el('span', 'chat-voice-play');
  playIcon.appendChild(createPawIcon());

  const waves = el('span', 'chat-voice-waves');
  for (let index = 0; index < 5; index += 1) {
    waves.appendChild(el('i', ''));
  }

  const meta = el('span', 'chat-voice-meta', getVoiceDurationText(message));
  const arrow = el('span', 'chat-voice-arrow');
  arrow.appendChild(createLineIcon('chevron'));

  bar.append(playIcon, waves, meta, arrow);

  const transcript = el('div', 'chat-voice-transcript');
  transcript.appendChild(createTextBlock(getVoiceTranscript(message) || '这条语音还没有文字内容。'));

  // 统一以 card.dataset.playing 为单一来源，不再用闭包 isPlaying 双轨
  bar.addEventListener('click', () => {
    if (card.dataset.playing === 'true') {
      card.dataset.playing = 'false';
      voicePlayer.pause();
      stopThreadTTS();
      return;
    }

    stopThreadTTS();
    voicePlayer.stop();

    voicePlayer.play(card);

    playThreadTTS(state, message).catch(() => {
      // 失败时无条件把这张卡片 UI 恢复到可点击状态，不能卡住
      card.dataset.playing = 'false';
      // 若 voicePlayer 仍指向本卡片才 stop；否则已被切走，不干扰新卡片
      if (voicePlayer.currentCard === card) {
        voicePlayer.stop();
      }
      showToast('语音播放失败');
    });
  });

  arrow.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = card.dataset.open === 'true';
    card.dataset.open = open ? 'false' : 'true';
  });

  card.append(bar, transcript);
  return card;
}

function isVoiceMessage(message) {
  const type = String(message?.type || '').toLowerCase();
  return type === 'voice' || type === 'tts' || message?.voice === true || message?.tts === true || Boolean(message?.audioBase64 || message?.voiceAudioBase64 || message?.ttsAudioBase64);
}

function getVoiceTranscript(message) {
  return String(message.transcript || message.voiceText || message.ttsText || message.content || '').trim();
}

function getVoiceDurationText(message) {
  const seconds = Number(message.duration || message.voiceDuration || message.ttsDuration || 0);
  if (Number.isFinite(seconds) && seconds > 0) return `${Math.max(1, Math.round(seconds))}"`;
  const text = getVoiceTranscript(message);
  const guessed = Math.max(1, Math.ceil(text.length / 5));
  return `${Math.min(60, guessed)}"`;
}

// ───────────────────
// 转账和商店小卡片
// ───────────────────

function createTransferCard(message) {
  const card = el('section', 'chat-mini-message-card transfer');
  const top = el('div', 'chat-mini-card-top');
  top.append(
    el('div', 'chat-mini-card-title', message.title || '小票据'),
    el('div', 'chat-mini-card-price', `￥${Number(message.transferAmount || message.amount || 0)}`)
  );

  const note = String(message.note || message.content || '').trim();
  card.append(top);
  if (note) card.appendChild(el('div', 'chat-mini-card-desc', note));
  return card;
}

function createShopCard(message) {
  const card = el('section', 'chat-mini-message-card shop');
  const image = pickImage(message.itemImage, message.imageBase64, message.image, message.cover, message.iconImage);

  if (image) {
    const cover = el('div', 'chat-mini-card-cover');
    const img = document.createElement('img');
    img.src = image;
    img.alt = '';
    cover.appendChild(img);
    card.appendChild(cover);
  }

  const body = el('div', 'chat-mini-card-body');
  body.append(
    el('div', 'chat-mini-card-title', message.itemName || message.title || message.name || '小礼物'),
    el('div', 'chat-mini-card-desc', message.itemDesc || message.description || message.content || 'TA 收到了一份小心意。')
  );

  const price = Number(message.itemPrice || message.price || 0);
  if (price > 0) {
    body.appendChild(el('div', 'chat-mini-card-price', `￥${price}`));
  }

  card.appendChild(body);
  return card;
}

// ───────────────────
// 表情包内容
// ───────────────────

function createStickerContent(message) {
  const wrap = el('section', 'chat-message-sticker-card');
  const image = pickImage(message.stickerImageBase64, message.imageBase64, message.image);
  const desc = String(message.stickerDescription || message.content || '').trim();

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.alt = desc || '';
    img.className = 'chat-message-sticker-image';
    wrap.appendChild(img);
  } else {
    wrap.appendChild(el('div', 'chat-message-sticker-placeholder', '表情包'));
  }

  return wrap;
}

// ───────────────────
// 骰子和石头剪刀布
// ───────────────────

function createDiceCard(message) {
  const value = normalizeDiceValue(message.diceValue || message.value || message.result);
  const sides = Number(message.diceSides || 6);
  const card = el('section', 'chat-game-card chat-dice-card');
  card.dataset.rolling = message.rolling ? 'true' : 'false';

  const icon = el('div', 'chat-game-icon dice');
  icon.appendChild(createDiceFace(value));

  const body = el('div', 'chat-game-body');
  body.append(
    el('div', 'chat-game-title', '骰子'),
    el('div', 'chat-game-result', value ? `摇到了 ${value} / ${sides}` : '正在摇骰子')
  );

  card.append(icon, body);
  return card;
}

function createDiceFace(value) {
  const face = el('div', `chat-dice-face value-${value || 0}`);
  const dotMap = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
  };

  for (let index = 1; index <= 9; index += 1) {
    face.appendChild(el('span', dotMap[value]?.includes(index) ? 'active' : ''));
  }

  return face;
}

function createRpsCard(message) {
  const choice = normalizeRpsChoice(message.rpsChoice || message.choice || message.result);
  const card = el('section', 'chat-game-card chat-rps-card');
  card.dataset.flipping = message.rolling ? 'true' : 'false';

  const icon = el('div', 'chat-game-icon rps');
  icon.appendChild(createRpsIcon(choice));

  const body = el('div', 'chat-game-body');
  body.append(
    el('div', 'chat-game-title', '石头剪刀布'),
    el('div', 'chat-game-result', choice ? `出了 ${getRpsLabel(choice)}` : '正在出手')
  );

  if (message.rpsOpponentChoice || message.rpsOutcome) {
    body.appendChild(el('div', 'chat-game-note', buildRpsNote(message)));
  }

  card.append(icon, body);
  return card;
}

function createRpsIcon(choice) {
  const wrap = el('div', `chat-rps-icon ${choice || 'unknown'}`);
  wrap.appendChild(createLineIcon(
    choice === 'rock'
      ? 'rps-rock'
      : choice === 'paper'
        ? 'rps-paper'
        : choice === 'scissors'
          ? 'rps-scissors'
          : 'rps'
  ));
  return wrap;
}

function buildRpsNote(message) {
  const opponent = normalizeRpsChoice(message.rpsOpponentChoice);
  const outcome = String(message.rpsOutcome || '').trim();

  const parts = [];
  if (opponent) parts.push(`对方：${getRpsLabel(opponent)}`);
  if (outcome) parts.push(getRpsOutcomeLabel(outcome));

  return parts.join(' · ');
}

// ───────────────────
// 文本和代码块
// ───────────────────

function createTextBlock(text) {
  const block = el('div', 'chat-message-text');
  block.textContent = text || '';
  return block;
}

function createCodeBlock(part) {
  const wrap = el('section', 'chat-message-code');
  const lang = normalizeCodeLang(part.lang);
  const code = String(part.code || '');

  const top = el('div', 'chat-message-code-top');

  const meta = el('div', 'chat-message-code-meta');
  meta.append(
    createLineIcon('code'),
    el('span', 'chat-message-code-lang', lang)
  );

  const actions = el('div', 'chat-message-code-actions');
  actions.append(
    createCodeActionButton('复制', 'copy', () => copyCode(code)),
    createCodeActionButton('下载', 'download', () => downloadCodeFile(code, lang))
  );

  if (isHtmlCode(lang, code)) {
    actions.append(createCodeActionButton('预览', 'eye', () => previewHtmlCode(code)));
  }

  top.append(meta, actions);

  const pre = document.createElement('pre');
  pre.className = 'chat-message-code-pre';
  pre.textContent = code;

  const shouldCollapse = code.split('\n').length > 6 || code.length > 520;
  if (shouldCollapse) wrap.dataset.collapsed = 'true';

  wrap.append(top, pre);

  if (shouldCollapse) {
    const toggle = safeButton('chat-message-code-toggle', '展开代码');
    toggle.textContent = '展开全部';
    toggle.addEventListener('click', () => {
      const collapsed = wrap.dataset.collapsed === 'true';
      wrap.dataset.collapsed = collapsed ? 'false' : 'true';
      toggle.textContent = collapsed ? '收起' : '展开全部';
    });
    wrap.appendChild(toggle);
  }

  return wrap;
}

function createCodeActionButton(text, icon, onClick) {
  const btn = safeButton('chat-message-code-action', text);
  btn.append(createLineIcon(icon), el('span', '', text));
  btn.addEventListener('click', onClick);
  return btn;
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(String(code || ''));
    showToast('代码复制好啦');
  } catch (_) {
    showToast('复制失败');
  }
}

function downloadCodeFile(code, lang) {
  const filename = `chat-code-${formatFileTime()}.${getCodeExtension(lang, code)}`;
  const blob = new Blob([String(code || '')], { type: getCodeMime(lang, code) });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  showToast('代码文件已下载');
}

// ───────────────────
// HTML 全屏预览
// ───────────────────

function previewHtmlCode(code) {
  const overlay = el('div', 'chat-html-preview-overlay');
  const header = el('div', 'chat-html-preview-header');
  const title = el('span', 'chat-html-preview-title-text', 'HTML 预览');

  const closeBtn = safeButton('chat-html-preview-close-btn', '关闭预览');
  closeBtn.appendChild(createLineIcon('x'));

  header.append(title, closeBtn);

  const frame = document.createElement('iframe');
  frame.className = 'chat-html-preview-frame';
  // 静态 HTML 预览不授予脚本、表单或同源权限，避免外部提交和代码执行。
  frame.setAttribute('sandbox', '');
  frame.setAttribute('frameborder', '0');
  frame.srcdoc = String(code || '');

  overlay.append(header, frame);
  document.body.appendChild(overlay);

  // 只关闭一次，避免 transitionend 与 setTimeout 重复清理、多次触发叠加
  let closed = false;
  const closeFn = () => {
    if (closed) return;
    closed = true;
    overlay.classList.remove('open');
    overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    window.setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 300);
    document.removeEventListener('keydown', escHandler);
  };

  const escHandler = (event) => {
    if (event.key === 'Escape') { event.preventDefault(); closeFn(); }
  };

  closeBtn.addEventListener('click', closeFn);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) closeFn(); });
  document.addEventListener('keydown', escHandler);

  requestAnimationFrame(() => overlay.classList.add('open'));
}

function createQuoteBlock(text) {
  return el('section', 'chat-message-quote', String(text || ''));
}

// ═══════════════════════════════════════
// 【操作栏】消息操作按钮和菜单
// ═══════════════════════════════════════

function createMessageActions(state, message, pageEl) {
  const actions = el('div', 'chat-message-actions');

  actions.append(createTokenChip(message));

  if (message.role === 'user') {
    actions.append(
      smallAction('refresh', '重新发送', async () => {
        await resendThreadMessage(state, message.id);
        renderThreadMessages(state, pageEl);
      })
    );
  }

  actions.append(
    smallAction('quote', '引用', () => {
      quoteThreadMessage(state, message.id);
      renderQuotePreview(state, pageEl);
    }),
    smallAction('more', '更多', () => openMessageActionSheet(state, message, pageEl))
  );

  return actions;
}

function createTokenChip(message) {
  const chip = el('span', 'chat-message-token-chip');
  chip.textContent = `${estimateMessageTokens(message)}t`;
  return chip;
}

function openMessageActionSheet(state, message, pageEl) {
  const sheet = el('div', 'chat-action-sheet');
  const title = el('div', 'chat-action-sheet-title', '这句话要怎么处理');
  const list = el('div', 'chat-action-sheet-list');

  list.append(
    sheetButton('复制', 'copy', async () => {
      await copyThreadMessage(message);
      hideBottomSheet();
    }),
    sheetButton('引用', 'quote', () => {
      quoteThreadMessage(state, message.id);
      renderQuotePreview(state, pageEl);
      hideBottomSheet();
    })
  );

  if (canEditMessage(message)) {
    list.append(sheetButton('编辑', 'edit', () => {
      hideBottomSheet();
      openEditSheet(state, message, pageEl);
    }));
  }

  list.append(sheetButton('删除', 'trash', async () => {
    hideBottomSheet();
    await deleteThreadMessage(state, message.id);
    renderThreadMessages(state, pageEl);
  }));

  if (message.role === 'assistant') {
    list.append(
      sheetButton('重新生成', 'refresh', async () => {
        hideBottomSheet();
        await regenerateThreadMessage(state, message.id);
        renderThreadMessages(state, pageEl);
      }),
      sheetButton('朗读', 'volume', async () => {
        hideBottomSheet();
        await playThreadTTS(state, message);
      }),
      sheetButton('停止朗读', 'stop', () => {
        stopThreadTTS();
        hideBottomSheet();
      })
    );
  }

  if (message.role === 'user') {
    list.append(sheetButton('重新发送', 'refresh', async () => {
      hideBottomSheet();
      await resendThreadMessage(state, message.id);
      renderThreadMessages(state, pageEl);
    }));
  }

  sheet.append(title, list);
  showBottomSheet(sheet);
}

function canEditMessage(message) {
  return ['text', 'voice', 'tts', 'sticker'].includes(String(message?.type || 'text')) && Boolean(String(message?.content || message?.stickerDescription || message?.transcript || '').trim());
}

function openEditSheet(state, message, pageEl) {
  if (!canEditMessage(message)) {
    showToast('这条不适合编辑');
    return;
  }

  const sheet = el('div', 'chat-edit-sheet');
  const title = el('div', 'chat-action-sheet-title', message.type === 'sticker' ? '改一下表情包描述' : '改一下这句话');

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-edit-textarea';
  textarea.value = String(message.type === 'sticker' ? message.stickerDescription || message.content || '' : message.content || message.transcript || '');
  textarea.rows = 6;
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocorrect', 'off');
  textarea.setAttribute('spellcheck', 'false');

  const actions = el('div', 'chat-edit-actions');

  const cancel = safeButton('chat-edit-btn ghost', '取消');
  cancel.textContent = '取消';
  cancel.addEventListener('click', () => hideBottomSheet());

  const save = safeButton('chat-edit-btn primary', '保存');
  save.textContent = '保存';
  save.addEventListener('click', async () => {
    const value = textarea.value.trim();
    if (!value) {
      showToast('内容不能为空');
      return;
    }

    await editThreadMessage(state, message.id, value);
    hideBottomSheet();
    renderThreadMessages(state, pageEl);
  });

  actions.append(cancel, save);
  sheet.append(title, textarea, actions);
  showBottomSheet(sheet);

  requestAnimationFrame(() => textarea.focus());
}

function sheetButton(text, icon, onClick) {
  const btn = safeButton('chat-action-sheet-item', text);
  btn.append(createLineIcon(icon), el('span', '', text));
  btn.addEventListener('click', onClick);
  return btn;
}

// ═══════════════════════════════════════
// 【引用预览】输入框上方的引用条
// ═══════════════════════════════════════

function renderQuotePreview(state, pageEl) {
  const inputBar = pageEl.querySelector('.chat-thread-input-bar');
  if (!inputBar) return;

  const old = pageEl.querySelector('.chat-quote-preview');
  if (old) old.remove();

  if (!state.quotedMessageId) return;

  const message = getVisibleMessages(state).find((item) => item.id === state.quotedMessageId);
  const text = message ? getPreviewText(message) : '已引用一条消息';

  const preview = el('section', 'chat-quote-preview');
  preview.append(
    createLineIcon('quote'),
    el('div', 'chat-quote-preview-text', text),
    createQuoteCancelButton(state, pageEl)
  );

  // insertBefore 前判断 parentNode 是否存在，避免空节点报错
  if (inputBar.parentNode) {
    inputBar.parentNode.insertBefore(preview, inputBar);
  }
}

function createQuoteCancelButton(state, pageEl) {
  const btn = safeButton('chat-quote-preview-close', '取消引用');
  btn.appendChild(createLineIcon('x'));
  btn.addEventListener('click', () => {
    state.quotedMessageId = '';
    renderQuotePreview(state, pageEl);
  });
  return btn;
}

// ───────────────────
// 空状态
// ───────────────────

function createEmptyThread() {
  const empty = el('section', 'chat-empty');
  empty.append(
    el('div', 'chat-empty-illust'),
    el('div', 'chat-empty-title', '这里还安安静静的'),
    el('div', 'chat-empty-desc', '先递一句话过去，TA 会接住你。')
  );
  return empty;
}

// ═══════════════════════════════════════
// 【数据工具】消息过滤、目标信息、用户档案
// ═══════════════════════════════════════

function getVisibleMessages(state) {
  const list = state.mode === 'group' ? state.groupMessages : state.messages;
  const q = String(state.searchValue || '').trim().toLowerCase();
  const source = q ? list : list.slice(Math.max(0, list.length - state.visibleCount));

  // 过滤掉 archived 版本（只显示 active 或无版本组的）
  const filtered = source.filter((message) => {
    if (message.versionStatus === 'archived') return false;
    return true;
  });

  if (!q) return filtered;

  return filtered.filter((message) => {
    return [
      message.content,
      message.transcript,
      message.voiceText,
      message.ttsText,
      message.stickerDescription,
      message.quoteText,
      message.thinking,
      message.itemName,
      message.itemDesc,
      message.title,
      message.description
    ].some((item) => String(item || '').toLowerCase().includes(q));
  });
}

function getTargetInfo(state, message) {
  if (message.role === 'user') {
    const user = getUserProfile();
    return {
      name: user.name || user.nickname || '我',
      avatar: pickImage(user.avatar, user.avatarUrl, user.imageBase64, user.image, user.iconImage, user.photo)
    };
  }

  if (state.mode === 'group') {
    return {
      name: message.characterName || message.name || 'TA',
      avatar: pickImage(
        message.characterAvatar,
        message.avatar,
        message.avatarUrl,
        message.imageBase64,
        message.iconImage,
        state.group?.avatar,
        state.group?.avatarUrl,
        state.group?.imageBase64,
        state.group?.iconImage
      )
    };
  }

  return {
    name: state.character?.name || message.characterName || 'TA',
    avatar: pickImage(
      message.characterAvatar,
      state.character?.avatar,
      state.character?.avatarUrl,
      state.character?.imageBase64,
      state.character?.iconImage,
      state.character?.image
    )
  };
}

function getUserProfile() {
  const settings = getData('app_settings') || {};
  const appUser = getData('app_user') || {};
  const profiles = getData('user_profiles') || [];
  const legacyProfiles = getData('app_user_profiles') || [];
  const activeId = getData('active_user_profile_id') || settings.activeUserProfileId || '';

  const list = Array.isArray(profiles) && profiles.length
    ? profiles
    : Array.isArray(legacyProfiles)
      ? legacyProfiles
      : [];

  if (list.length) {
    const active = list.find((item) => item.id === activeId) || list.find((item) => item.isDefault) || list[0];
    return {
      ...appUser,
      ...active
    };
  }

  const user = settings.user || appUser || {};
  return user && typeof user === 'object' ? user : {};
}

// ═══════════════════════════════════════
// 【通用工具】图片选择、代码分割、估算token
// ═══════════════════════════════════════

function pickImage(...values) {
  for (const value of values) {
    if (!value) continue;
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      const nested = pickImage(value.value, value.source, value.image, value.imageBase64, value.avatar, value.avatarUrl, value.iconImage, value.url, value.src, value.data);
      if (nested) return nested;
    }
  }
  return '';
}

// splitCodeBlocks 已提取到 ./render-pure.js，本文件通过 import 使用

function getPreviewText(message) {
  if (!message) return '';
  if (message.type === 'image') return '[图片]';
  if (message.type === 'sticker') return `[表情包] ${message.stickerDescription || message.content || ''}`.trim();
  if (message.type === 'transfer') return `[转账 ${Number(message.transferAmount || 0)}]`;
  if (['gift', 'shop_item', 'shop-item', 'purchase', 'item'].includes(String(message.type || ''))) {
    return `[小卡片] ${message.itemName || message.title || message.name || message.content || ''}`.trim();
  }
  if (isVoiceMessage(message)) return `[语音] ${getVoiceTranscript(message)}`.trim();
  if (message.type === 'dice') return `[骰子 ${normalizeDiceValue(message.diceValue || message.value || message.result) || ''}]`;
  if (message.type === 'rps') return `[石头剪刀布 ${getRpsLabel(normalizeRpsChoice(message.rpsChoice || message.choice || message.result))}]`;
  if (isSubAgentCardMessage(message)) return `[任务总结] ${message.content || message.title || ''}`.trim();

  const text = stripAskUserBlocks(String(message.content || '')).trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function estimateMessageTokens(message) {
  const text = [
    message.content || '',
    message.transcript || '',
    message.voiceText || '',
    message.ttsText || '',
    message.quoteText || '',
    message.thinking || '',
    message.stickerDescription || '',
    normalizeToolCallsForTokens(message.toolCalls).map((tool) => normalizeToolValue(tool)).join(' ')
  ].join('\n');

  return estimateTokens(text);
}

function estimateTokens(text) {
  const value = String(text || '');
  if (!value.trim()) return 0;

  const cjk = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const latinWords = (value.replace(/[\u3400-\u9fff]/g, ' ').match(/[a-zA-Z0-9_]+/g) || []).length;
  const punctuation = (value.match(/[^\s\u3400-\u9fffa-zA-Z0-9_]/g) || []).length;
  const spaces = (value.match(/\s+/g) || []).length;

  return Math.max(
    Math.ceil(cjk * 1.05 + latinWords * 1.25 + punctuation * 0.45 + spaces * 0.15),
    value.trim() ? 1 : 0
  );
}

function normalizeDiceValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number < 1 || number > 6) return 0;
  return Math.floor(number);
}

function normalizeRpsChoice(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['rock', 'stone', '石头'].includes(text)) return 'rock';
  if (['paper', '布'].includes(text)) return 'paper';
  if (['scissors', 'scissor', '剪刀'].includes(text)) return 'scissors';
  return '';
}

function getRpsLabel(choice) {
  if (choice === 'rock') return '石头';
  if (choice === 'paper') return '布';
  if (choice === 'scissors') return '剪刀';
  return '未知';
}

function getRpsOutcomeLabel(outcome) {
  if (outcome === 'win') return '赢了';
  if (outcome === 'lose') return '输了';
  if (outcome === 'draw') return '平局';
  return outcome;
}

function normalizeToolCallsForTokens(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return [];
}

function normalizeToolValue(value) {
  if (typeof value === 'string') return value.trim();

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_) {
      return '';
    }
  }

  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeCodeLang(lang) {
  const value = String(lang || 'code').trim().toLowerCase();
  return value || 'code';
}

function isHtmlCode(lang, code) {
  const value = normalizeCodeLang(lang);
  if (['html', 'htm'].includes(value)) return true;
  return /<!doctype html|<html[\s>]|<body[\s>]|<div[\s>]|<script[\s>]/i.test(String(code || ''));
}

function getCodeExtension(lang, code) {
  const value = normalizeCodeLang(lang);
  const map = {
    html: 'html', htm: 'html', css: 'css', js: 'js',
    javascript: 'js', json: 'json', md: 'md', markdown: 'md',
    txt: 'txt', python: 'py', py: 'py', typescript: 'ts', ts: 'ts'
  };

  if (map[value]) return map[value];
  if (isHtmlCode(value, code)) return 'html';
  return 'txt';
}

function getCodeMime(lang, code) {
  const ext = getCodeExtension(lang, code);
  const map = {
    html: 'text/html;charset=utf-8', css: 'text/css;charset=utf-8',
    js: 'text/javascript;charset=utf-8', json: 'application/json;charset=utf-8',
    md: 'text/markdown;charset=utf-8', py: 'text/x-python;charset=utf-8',
    ts: 'text/typescript;charset=utf-8', txt: 'text/plain;charset=utf-8'
  };

  return map[ext] || 'text/plain;charset=utf-8';
}

function formatFileTime() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

function getMessageTimeValue(message) {
  if (!message?.timestamp) return 0;
  const time = new Date(message.timestamp).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatTimeDividerText(currentTime, lastTime) {
  if (!currentTime) return '刚刚';

  if (!lastTime) {
    const date = new Date(currentTime);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (sameDay) return `今天 ${formatClock(date)}`;
    if (date.toDateString() === yesterday.toDateString()) return `昨天 ${formatClock(date)}`;
    return `${date.getMonth() + 1}月${date.getDate()}日 ${formatClock(date)}`;
  }

  const diff = Math.max(0, currentTime - lastTime);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `过了 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `过了 ${hours} 小时`;
  const days = Math.floor(hours / 24);
  return `过了 ${days} 天`;
}

function formatClock(date) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ═══════════════════════════════════════
// 【DOM工具】按钮、图标、元素创建
// ═══════════════════════════════════════

function smallAction(iconName, label, onClick) {
  const btn = safeButton('chat-message-action-btn', label);
  btn.appendChild(createLineIcon(iconName));
  btn.addEventListener('click', onClick);
  return btn;
}

function safeButton(className, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  if (label) btn.setAttribute('aria-label', label);

  btn.addEventListener('touchstart', (event) => {
    event.stopPropagation();
  }, { passive: true });

  btn.addEventListener('touchmove', (event) => {
    event.stopPropagation();
  }, { passive: true });

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  return btn;
}

function createLineIcon(name) {
  return createChatIcon(name, 15);
}

function getInitial(name) {
  const text = String(name || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : 'A';
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【样式注入】聊天渲染组件样式
// ═══════════════════════════════════════

function injectStyle() {
  const oldStyle = document.getElementById(RENDER_STYLE_ID);
  if (oldStyle) oldStyle.remove();

  const style = document.createElement('style');
  style.id = RENDER_STYLE_ID;
  style.textContent = `
    .chat-empty{margin:auto;max-width:260px;min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;padding:24px;border-radius:28px;background:color-mix(in srgb,var(--bg-card) 82%,transparent);border:1px dashed color-mix(in srgb,var(--border-soft) 72%,transparent);color:var(--text-secondary);text-align:center;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
    .chat-empty-illust{width:82px;height:58px;border-radius:24px 24px 18px 18px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent-light) 62%,var(--bg-card)),color-mix(in srgb,var(--decor-blue) 44%,var(--bg-card)));position:relative}
    .chat-empty-illust::before{content:'';position:absolute;left:16px;right:16px;top:18px;height:1px;background:color-mix(in srgb,var(--accent-dark) 34%,transparent);box-shadow:0 10px 0 color-mix(in srgb,var(--accent-dark) 20%,transparent)}
    .chat-empty-illust::after{content:'';position:absolute;right:-8px;top:-8px;width:22px;height:22px;border-radius:999px;background:color-mix(in srgb,var(--decor-yellow) 58%,var(--bg-card))}
    .chat-empty-title{color:var(--text-primary);font-weight:600}
    .chat-empty-desc{font-size:13px;color:var(--text-secondary)}

    /* ── 时间分隔线 ── */

    .chat-time-divider {
      width: 100%;
      display: flex;
      justify-content: center;
      margin: 10px 0 6px;
      pointer-events: none;
    }

    .chat-time-pill {
      max-width: 80%;
      padding: 6px 11px;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-hint);
      font-size: 11px;
      line-height: 1.35;
      white-space: nowrap;
    }

    /* ── 消息行基础 ── */

    .chat-message-row {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;
      animation: chatMessageIn 200ms ease both;
      overscroll-behavior: contain;
    }

    .chat-message-row.role-user {
      align-items: flex-end;
    }

    .chat-message-row.role-assistant {
      align-items: flex-start;
    }

    .chat-message-body {
      max-width: min(82%, 620px);
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      touch-action: pan-y;
    }

    .chat-message-body.role-user {
      align-items: flex-end;
    }

    .chat-message-body.role-assistant {
      align-items: flex-start;
    }

    .chat-message-actions-placeholder {
      min-height: 0;
    }

    .chat-message-author-placeholder {
      min-height: 26px;
    }

    /* ── 对话模式 ── */

    .chat-message-row.mode-dialog {
      gap: 4px;
      margin: 2px 0 12px;
    }

    .chat-message-row.mode-dialog .chat-message-body {
      width: auto;
      max-width: min(78%, 620px);
    }

    .chat-message-row.mode-dialog.role-user .chat-message-body {
      align-items: flex-end;
    }

    .chat-message-row.mode-dialog.role-assistant .chat-message-body {
      align-items: flex-start;
    }

    /* ── 作者头像和名字 ── */

    .chat-message-author {
      max-width: 100%;
      width: fit-content;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      flex-wrap: wrap;
    }

    .chat-message-author.role-user {
      flex-direction: row-reverse;
      text-align: right;
    }

    .chat-message-author.role-assistant {
      flex-direction: row;
      text-align: left;
    }

    .chat-message-avatar {
      width: 26px;
      height: 26px;
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-primary);
      font-size: 11px;
      font-weight: 600;
    }

    .chat-message-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .chat-message-meta {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .chat-message-name {
      max-width: 120px;
      color: var(--text-primary);
      font-size: 11px;
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    /* ── 气泡 ── */

    .chat-message-bubble {
      min-width: 0;
      max-width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px 12px;
      border-radius: 20px;
      overflow: hidden;
    }

    .chat-message-bubble.role-user {
      background: var(--bubble-user-bg);
      color: var(--bubble-user-text);
      align-items: flex-start;
    }

    .chat-message-bubble.role-ai {
      background: var(--bubble-ai-bg);
      color: var(--bubble-ai-text);
      align-items: flex-start;
    }

    .chat-message-bubble.error-bubble {
      background: var(--bubble-ai-bg);
      color: var(--bubble-ai-text);
    }

    .chat-message-bubble.sticker-bubble,
    .chat-message-bubble.image-bubble {
      padding: 6px;
      background: var(--bg-card);
      color: var(--text-primary);
    }

    .chat-message-bubble.voice-bubble {
      min-width: 168px;
    }

    /* ── 对话模式气泡透明 ── */

    .chat-message-row.mode-dialog .chat-message-bubble {
      width: auto;
      max-width: 100%;
      padding: 0;
      border-radius: 0;
      background: transparent;
      color: var(--text-primary);
      overflow: visible;
    }

    .chat-message-row.mode-dialog.role-user .chat-message-bubble {
      margin-right: 0;
    }

    .chat-message-row.mode-dialog.role-assistant .chat-message-bubble {
      margin-left: 0;
    }

    .chat-message-row.mode-dialog .chat-message-bubble.sticker-bubble,
    .chat-message-row.mode-dialog .chat-message-bubble.image-bubble {
      padding: 0;
      background: transparent;
    }

    /* ── 错误气泡卡片 ── */

    .chat-error-card {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 2px 0;
      flex-wrap: wrap;
    }

    .chat-error-icon {
      width: 26px;
      height: 26px;
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--accent);
    }

    .chat-error-icon svg {
      width: 14px;
      height: 14px;
    }

    .chat-error-text {
      flex: 1;
      min-width: 0;
      font-size: var(--font-size-small);
      line-height: 1.5;
      color: var(--text-secondary);
    }

    .chat-error-retry {
      min-height: 30px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 12px;
      border: none;
      outline: none;
      border-radius: 999px;
      background: var(--accent);
      color: var(--bubble-user-text);
      font: inherit;
      font-size: 12px;
      font-weight: 600;
      transition: all 200ms ease;
      touch-action: manipulation;
    }

    .chat-error-retry:active {
      transform: scale(0.95);
    }

    .chat-error-retry svg {
      width: 13px;
      height: 13px;
    }

    /* ── 版本翻页胶囊 ── */

    .chat-version-pager {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-top: 2px;
      padding: 2px 4px;
      border-radius: 999px;
      background: var(--surface-muted);
    }

    .chat-version-pager-btn {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      outline: none;
      border-radius: 999px;
      background: transparent;
      color: var(--text-secondary);
      transition: all 200ms ease;
      touch-action: manipulation;
    }

    .chat-version-pager-btn:active {
      transform: scale(0.9);
      background: var(--bg-card);
    }

    .chat-version-pager-btn svg {
      width: 13px;
      height: 13px;
    }

    .chat-version-pager-label {
      min-width: 32px;
      text-align: center;
      color: var(--text-hint);
      font-size: 11px;
      font-weight: 600;
      white-space: nowrap;
    }

    /* ── 内容区域 ── */

    .chat-message-content {
      width: 100%;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .chat-message-row.mode-dialog .chat-message-content {
      width: auto;
      max-width: 100%;
    }

    .chat-message-row.mode-dialog.role-user .chat-message-content {
      align-items: flex-end;
    }

    .chat-message-row.mode-dialog.role-assistant .chat-message-content {
      align-items: flex-start;
    }

    .chat-message-text {
      width: 100%;
      font-size: var(--font-size-base);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .chat-message-row.mode-dialog .chat-message-text {
      width: auto;
      max-width: min(100%, 540px);
      color: var(--text-primary);
      font-size: var(--font-size-base);
      line-height: 1.72;
      text-align: left;
    }

    .chat-message-content.sticker-content {
      width: auto;
      line-height: 1;
      white-space: normal;
    }

    .chat-message-edited {
      color: var(--text-hint);
      font-size: 11px;
      line-height: 1.3;
    }

    .chat-message-row.mode-dialog .chat-message-edited {
      opacity: 0.72;
    }

    /* ── 图片 ── */

    .chat-message-image-frame {
      width: min(58vw, 220px);
      max-height: 280px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: var(--surface-muted);
    }

    .chat-message-image {
      display: block;
      width: 100%;
      max-height: 280px;
      object-fit: contain;
      border-radius: 16px;
    }

    /* 多图网格：2 张 2 列，3+ 张 3 列，最多 3 列 */
    .chat-message-image-frame.is-grid {
      width: min(72vw, 280px);
      max-height: none;
      display: grid;
      grid-template-columns: repeat(min(3, var(--img-count, 3)), 1fr);
      gap: 4px;
      padding: 4px;
    }

    .chat-message-image-frame.is-grid .chat-message-image {
      width: 100%;
      height: 100%;
      aspect-ratio: 1 / 1;
      max-height: none;
      object-fit: cover;
      border-radius: 10px;
    }

    /* ── 表情包 ── */

    .chat-message-sticker-card {
      width: 112px;
      max-width: 112px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }

    .chat-message-sticker-image {
      width: 88px;
      height: 88px;
      display: block;
      object-fit: contain;
      border-radius: 16px;
      background: var(--surface-muted);
    }

    .chat-message-sticker-placeholder {
      width: 88px;
      height: 88px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      border-radius: 16px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.5;
      text-align: center;
    }

    /* ── 引用、代码、游戏卡片 ── */

    .chat-message-quote,
    .chat-message-code,
    .chat-game-card,
    .chat-mini-message-card,
    .chat-voice-card {
      border-radius: 16px;
      background: var(--surface-muted);
    }

    .chat-message-quote {
      width: 100%;
      padding: 8px 10px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.5;
      word-break: break-word;
    }

    .chat-message-row.mode-dialog .chat-message-quote {
      width: auto;
      max-width: min(100%, 460px);
      padding: 8px 10px;
      opacity: 0.82;
    }

    /* ── 语音卡片 ── */

    .chat-voice-card {
      width: min(100%, 240px);
      overflow: hidden;
      color: var(--text-primary);
    }

    .chat-message-row.mode-dialog .chat-voice-card {
      width: min(100%, 280px);
    }

    .chat-voice-bar {
      width: 100%;
      min-height: 44px;
      display: grid;
      grid-template-columns: auto 1fr auto auto;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      transition: all 200ms ease;
      touch-action: manipulation;
    }

    .chat-voice-bar:active {
      transform: scale(0.98);
    }

    .chat-voice-play {
      width: 26px;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--accent);
    }

    .chat-voice-waves {
      min-width: 68px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
    }

    .chat-voice-waves i {
      width: 3px;
      height: 10px;
      display: block;
      border-radius: 999px;
      background: currentColor;
      opacity: 0.42;
      transform-origin: center;
      animation: chatVoiceWave 900ms ease-in-out infinite;
    }

    .chat-voice-waves i:nth-child(2) { height: 16px; animation-delay: 100ms; }
    .chat-voice-waves i:nth-child(3) { height: 22px; animation-delay: 200ms; }
    .chat-voice-waves i:nth-child(4) { height: 14px; animation-delay: 300ms; }
    .chat-voice-waves i:nth-child(5) { height: 18px; animation-delay: 400ms; }

    .chat-voice-card[data-playing="false"] .chat-voice-waves i {
      animation-play-state: paused;
    }

    .chat-voice-meta {
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.35;
      white-space: nowrap;
    }

    .chat-voice-arrow {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--text-hint);
      transition: all 200ms ease;
    }

    .chat-voice-card[data-open="true"] .chat-voice-arrow {
      transform: rotate(90deg);
    }

    .chat-voice-transcript {
      max-height: 0;
      overflow: hidden;
      opacity: 0;
      transition: all 200ms ease;
    }

    .chat-voice-card[data-open="true"] .chat-voice-transcript {
      max-height: 220px;
      opacity: 1;
      overflow-y: auto;
      padding: 0 12px 12px;
    }

    .chat-voice-transcript .chat-message-text {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.65;
    }

    /* ── 思维链容器（样式由 thinking-chain.js 自管） ── */

    .chat-reasoning-stack {
      width: auto;
      max-width: 240px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      flex: 0 0 auto;
    }

    .chat-reasoning-stack.role-user {
      align-self: flex-end;
    }

    .chat-reasoning-stack.role-assistant {
      align-self: flex-start;
    }

    .chat-reasoning-stack.mode-dialog {
      max-width: 220px;
    }

    /* ── 代码块卡片 ── */

    .chat-message-code {
      width: min(80vw, 520px);
      overflow: hidden;
      padding: 0;
      border-radius: 22px;
      background: var(--surface-muted);
    }

    .chat-message-code-top {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      padding: 10px 16px 4px;
    }

    .chat-message-code-meta {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .chat-message-code-meta svg {
      color: var(--accent);
      opacity: 0.6;
    }

    .chat-message-code-actions {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .chat-message-code-lang {
      color: var(--text-secondary);
      font-size: 11px;
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      opacity: 0.55;
    }

    .chat-message-code-action {
      min-height: 24px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 0 8px;
      border: none;
      outline: none;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-secondary);
      font-size: 11px;
      transition: all 200ms ease;
    }

    .chat-message-code-action:active {
      transform: scale(0.96);
    }

    .chat-message-code-pre {
      max-height: none;
      overflow: auto;
      margin: 0;
      padding: 4px 16px 16px;
      color: var(--text-primary);
      font-family: "JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.85;
      white-space: pre-wrap;
      word-break: break-word;
      tab-size: 2;
      -webkit-overflow-scrolling: touch;
    }

    .chat-message-code[data-collapsed="true"] .chat-message-code-pre {
      max-height: 88px;
      overflow: hidden;
    }

    .chat-message-code-toggle {
      display: block;
      width: calc(100% - 32px);
      margin: 0 16px 12px;
      min-height: 30px;
      border: none;
      outline: none;
      border-radius: 12px;
      background: var(--bg-card);
      color: var(--text-secondary);
      font: inherit;
      font-size: 12px;
      text-align: center;
      transition: all 200ms ease;
    }

    .chat-message-code-toggle:active {
      transform: scale(0.96);
    }

    /* ── AI 加载动画 ── */

    .chat-pending-card {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 2px 0;
    }

    .chat-pending-dots {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .chat-pending-dot {
      width: 6px;
      height: 6px;
      border-radius: 999px;
      background: currentColor;
      opacity: 0.2;
      animation: chatPendingBounce 1.2s ease-in-out infinite;
    }

    .chat-pending-dot:nth-child(2) {
      animation-delay: 0.15s;
    }

    .chat-pending-dot:nth-child(3) {
      animation-delay: 0.3s;
    }

    .chat-pending-text {
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.35;
      animation: chatPendingTextFade 4.2s ease-in-out infinite;
    }

    /* ── 游戏卡片 ── */

    .chat-game-card,
    .chat-mini-message-card {
      width: min(100%, 260px);
      min-width: 180px;
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr);
      align-items: center;
      gap: 10px;
      padding: 10px;
      color: var(--text-primary);
      overflow: hidden;
    }

    .chat-game-icon {
      width: 48px;
      height: 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: var(--bg-card);
      color: var(--accent);
    }

    .chat-game-title,
    .chat-mini-card-title {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.35;
      color: var(--text-primary);
      word-break: break-word;
    }

    .chat-game-result,
    .chat-game-note,
    .chat-mini-card-desc {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.45;
      word-break: break-word;
    }

    .chat-game-note {
      color: var(--text-hint);
      font-size: 11px;
    }

    .chat-mini-message-card.transfer {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }

    .chat-mini-card-top {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
    }

    .chat-mini-card-cover {
      width: 48px;
      height: 48px;
      overflow: hidden;
      border-radius: 14px;
      background: var(--bg-card);
    }

    .chat-mini-card-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .chat-mini-card-body {
      min-width: 0;
    }

    .chat-mini-card-price {
      color: var(--accent);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.35;
      white-space: nowrap;
    }

    .chat-dice-face {
      width: 32px;
      height: 32px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(3, 1fr);
      gap: 3px;
      padding: 4px;
      border-radius: 10px;
      background: var(--bg-card);
    }

    .chat-dice-face span {
      width: 5px;
      height: 5px;
      align-self: center;
      justify-self: center;
      border-radius: 999px;
      background: transparent;
    }

    .chat-dice-face span.active {
      background: currentColor;
    }

    .chat-dice-card[data-rolling="true"] .chat-dice-face {
      animation: chatDiceShake 680ms ease both;
    }

    .chat-rps-icon {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .chat-rps-icon svg {
      width: 28px;
      height: 28px;
    }

    .chat-rps-card[data-flipping="true"] .chat-rps-icon {
      animation: chatRpsFlip 620ms ease both;
    }

    /* ── 操作栏按钮 ── */

    .chat-message-actions {
      max-width: 100%;
      display: flex;
      flex-wrap: nowrap;
      gap: 5px;
      opacity: 0.62;
      overflow: hidden;
      transition: all 200ms ease;
      touch-action: manipulation;
    }

    .chat-message-body:hover .chat-message-actions {
      opacity: 1;
    }

    .chat-message-body.role-user .chat-message-actions {
      justify-content: flex-end;
    }

    .chat-message-body.role-assistant .chat-message-actions {
      justify-content: flex-start;
    }

    .chat-message-row.mode-dialog .chat-message-actions {
      margin-top: 1px;
      opacity: 0.55;
    }

    .chat-message-row.mode-dialog.role-user .chat-message-actions {
      margin-right: 0;
    }

    .chat-message-row.mode-dialog.role-assistant .chat-message-actions {
      margin-left: 0;
    }

    .chat-message-row.mode-dialog .chat-message-body:hover .chat-message-actions {
      opacity: 0.9;
    }

    .chat-message-action-btn {
      min-height: 24px;
      min-width: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      border: none;
      outline: none;
      border-radius: 12px;
      padding: 0 7px;
      background: var(--bg-card);
      color: var(--text-secondary);
      font: inherit;
      font-size: 11px;
      transition: all 200ms ease;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
    }

    .chat-message-action-btn:active {
      transform: scale(0.92);
    }

    .chat-message-row.mode-dialog .chat-message-action-btn {
      min-height: 22px;
      min-width: 22px;
      padding: 0 6px;
      background: transparent;
    }

    .chat-message-token-chip {
      min-height: 22px;
      min-width: 22px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      padding: 0 6px;
      background: transparent;
      color: var(--text-hint);
      font: inherit;
      font-size: 10px;
      white-space: nowrap;
      transition: all 200ms ease;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
    }

    .chat-message-row.mode-dialog .chat-message-token-chip {
      min-height: 20px;
      min-width: 20px;
      padding: 0 5px;
    }

    /* ── 弹出菜单按钮 ── */

    .chat-action-sheet,
    .chat-edit-sheet {
      padding: 4px 0 8px;
    }

    .chat-action-sheet-title {
      margin: 0 0 14px;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-action-sheet-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .chat-action-sheet-item {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: none;
      outline: none;
      border-radius: 16px;
      padding: 0 14px;
      background: var(--surface-muted);
      color: var(--text-primary);
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      transition: all 200ms ease;
    }

    .chat-action-sheet-item:active {
      transform: scale(0.95);
    }

    /* ── 编辑弹窗按钮 ── */

    .chat-edit-textarea {
      width: 100%;
      min-height: 130px;
      padding: 12px 14px;
      border-radius: 16px;
      border: none;
      outline: none;
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: 16px;
      line-height: 1.6;
      resize: none;
    }

    .chat-edit-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-top: 12px;
    }

    .chat-edit-btn {
      min-height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: none;
      outline: none;
      border-radius: 16px;
      padding: 0 14px;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      transition: all 200ms ease;
      touch-action: manipulation;
    }

    .chat-edit-btn:active {
      transform: scale(0.95);
    }

    .chat-edit-btn.primary {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-edit-btn.ghost {
      background: var(--surface-muted);
      color: var(--text-secondary);
    }

    /* ── 引用预览条 ── */

    .chat-quote-preview {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 8px;
      margin: 0 20px 6px;
      padding: 8px 12px;
      border-radius: 16px;
      background: var(--bg-card);
      color: var(--text-secondary);
      animation: chatMessageIn 180ms ease both;
    }

    .chat-quote-preview-text {
      min-width: 0;
      font-size: 12px;
      line-height: 1.4;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-quote-preview-close {
      width: 26px;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      outline: none;
      border-radius: 999px;
      color: var(--text-hint);
      background: var(--surface-muted);
    }

    /* ── HTML 全屏预览 ── */

    .chat-html-preview-overlay {
      position: fixed;
      inset: 0;
      z-index: 10030;
      display: flex;
      flex-direction: column;
      background: var(--bg-primary);
      opacity: 0;
      transition: opacity 200ms ease;
      pointer-events: none;
    }

    .chat-html-preview-overlay.open {
      opacity: 1;
      pointer-events: auto;
    }

    .chat-html-preview-header {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 20px 10px;
      background: var(--bg-primary);
      z-index: 1;
    }

    .chat-html-preview-title-text {
      color: var(--text-primary);
      font-size: 17px;
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-html-preview-close-btn {
      width: 40px;
      height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: none;
      outline: none;
      border-radius: 14px;
      background: var(--bg-card);
      color: var(--text-primary);
      transition: all 200ms ease;
    }

    .chat-html-preview-close-btn:active {
      transform: scale(0.92);
    }

    .chat-html-preview-frame {
      flex: 1;
      width: 100%;
      min-height: 0;
      border-radius: 0;
      background: var(--bg-card);
    }

    /* ── 动画 ── */

    @keyframes chatMessageIn {
      from {
        opacity: 0;
        transform: translateY(5px) scale(0.995);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes chatPendingBounce {
      0%, 100% {
        opacity: 0.2;
        transform: scale(0.85);
      }
      50% {
        opacity: 0.8;
        transform: scale(1.15);
      }
    }

    @keyframes chatPendingTextFade {
      0%   { opacity: 0.6; }
      30%  { opacity: 0.6; }
      33%  { opacity: 0; }
      36%  { opacity: 0; }
      39%  { opacity: 0.8; }
      66%  { opacity: 0.8; }
      69%  { opacity: 0; }
      72%  { opacity: 0; }
      75%  { opacity: 0.6; }
      100% { opacity: 0.6; }
    }

    @keyframes chatVoiceWave {
      0%, 100% {
        opacity: 0.34;
        transform: scaleY(0.72);
      }
      50% {
        opacity: 0.9;
        transform: scaleY(1.08);
      }
    }

    @keyframes chatDiceShake {
      0% { transform: rotate(0deg) scale(0.96); }
      18% { transform: rotate(18deg) translateY(-2px); }
      36% { transform: rotate(-16deg) translateY(2px); }
      54% { transform: rotate(12deg) translateY(-1px); }
      72% { transform: rotate(-8deg); }
      100% { transform: rotate(0deg) scale(1); }
    }

    @keyframes chatRpsFlip {
      0% { transform: rotate(0deg) scale(0.96); }
      45% { transform: rotate(3deg) scale(1.03); }
      100% { transform: rotate(0deg) scale(1); }
    }

    /* ── 响应式 ── */

    @media (max-width: 520px) {
      .chat-message-body {
        max-width: 90%;
        width: auto;
      }

      .chat-message-row.mode-dialog .chat-message-body {
        max-width: 80%;
      }

      .chat-reasoning-stack {
        max-width: 210px;
      }

      .chat-message-name {
        max-width: 96px;
      }

      .chat-message-bubble {
        padding: 9px 11px;
      }

      .chat-message-row.mode-dialog .chat-message-bubble {
        padding: 0;
      }

      .chat-message-row.mode-dialog.role-user .chat-message-bubble,
      .chat-message-row.mode-dialog.role-user .chat-message-actions {
        margin-right: 0;
      }

      .chat-message-row.mode-dialog.role-assistant .chat-message-bubble,
      .chat-message-row.mode-dialog.role-assistant .chat-message-actions {
        margin-left: 0;
      }

      .chat-reasoning-stack.role-user {
        margin-right: 0;
      }

      .chat-reasoning-stack.role-assistant {
        margin-left: 0;
      }

      .chat-message-image-frame {
        width: min(64vw, 200px);
        max-height: 240px;
      }

      .chat-message-image {
        max-height: 240px;
      }

      .chat-message-image-frame.is-grid {
        width: min(80vw, 240px);
      }

      .chat-message-sticker-card {
        width: 100px;
        max-width: 100px;
      }

      .chat-message-sticker-image,
      .chat-message-sticker-placeholder {
        width: 78px;
        height: 78px;
      }

      .chat-voice-card {
        width: min(100%, 220px);
      }

      .chat-voice-waves {
        min-width: 52px;
      }

      .chat-action-sheet-list {
        grid-template-columns: 1fr;
      }

      .chat-message-code {
        width: min(92vw, 420px);
      }

      .chat-message-code-top {
        align-items: flex-start;
        flex-direction: column;
      }

      .chat-message-code-actions {
        justify-content: flex-start;
      }

      .chat-message-actions {
        gap: 4px;
      }

      .chat-message-action-btn {
        min-height: 22px;
        min-width: 22px;
        padding: 0 6px;
        font-size: 10px;
      }

      .chat-message-row.mode-dialog .chat-message-action-btn {
        min-height: 20px;
        min-width: 20px;
        padding: 0 5px;
      }
    }

    /* 修复：对话模式下语音/骰子/猜拳卡片间距适配 */
    .chat-message-row.mode-dialog .chat-voice-card,
    .chat-message-row.mode-dialog .chat-dice-card,
    .chat-message-row.mode-dialog .chat-rps-card {
      margin-top: 4px;
      margin-bottom: 4px;
    }

    .chat-message-row.mode-dialog.role-user .chat-voice-card,
    .chat-message-row.mode-dialog.role-user .chat-dice-card,
    .chat-message-row.mode-dialog.role-user .chat-rps-card {
      margin-right: 0;
    }

    .chat-message-row.mode-dialog.role-assistant .chat-voice-card,
    .chat-message-row.mode-dialog.role-assistant .chat-dice-card,
    .chat-message-row.mode-dialog.role-assistant .chat-rps-card {
      margin-left: 0;
    }

    @media (max-width: 520px) {
      .chat-message-row.mode-dialog.role-user .chat-voice-card,
      .chat-message-row.mode-dialog.role-user .chat-dice-card,
      .chat-message-row.mode-dialog.role-user .chat-rps-card {
        margin-right: 0;
      }

      .chat-message-row.mode-dialog.role-assistant .chat-voice-card,
      .chat-message-row.mode-dialog.role-assistant .chat-dice-card,
      .chat-message-row.mode-dialog.role-assistant .chat-rps-card {
        margin-left: 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .chat-message-row,
      .chat-quote-preview,
      .chat-dice-card[data-rolling="true"] .chat-dice-face,
      .chat-rps-card[data-flipping="true"] .chat-rps-icon,
      .chat-voice-waves i,
      .chat-pending-dot,
      .chat-pending-text,
      .chat-html-preview-overlay {
        animation: none;
        transition: none;
      }
    }
  `;

  document.head.appendChild(style);
}
