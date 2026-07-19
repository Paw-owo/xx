// apps/chat/thread.js
// imports:
//   from '../../core/storage.js': getData, setData, getDB, getByIndexDB
//   from '../../core/ui.js': showToast, hideBottomSheet
//   from '../../core/tts.js': stopAll
//   from './thread-render.js': renderThreadMessages
//   from './thread-actions.js': sendThreadMessage, stopThreadAIReply
//   from './thread-stickers.js': openStickerSheet, closeStickerSheet
//   from './thread-panels.js': openThreadToolsPanel, closeThreadPanels
//   from './thread-relationship.js': loadRelationshipState, getRelationshipLockLevel, getRelationshipStatusText, createRelationshipLockBar, openRelationshipLockSheet
//   from './thread-ai.js': checkThreadProactiveMessages
//   from './thread-settings.js': mountThreadSettings, unmountThreadSettings

import { getData, setData, getDB, getByIndexDB, compressImage } from '../../core/storage.js';
import { showToast, hideBottomSheet } from '../../core/ui.js';
import { createChatIcon } from './icons.js';
import { stopAll } from '../../core/tts.js';

import { renderThreadMessages, resetVoicePlayer } from './thread-render.js';
import { sendThreadMessage, stopThreadAIReply } from './thread-actions.js';
import { openStickerSheet, closeStickerSheet } from './thread-stickers.js';
import { openThreadToolsPanel, closeThreadPanels } from './thread-panels.js';
import {
  loadRelationshipState,
  getRelationshipLockLevel,
  getRelationshipStatusText,
  createRelationshipLockBar,
  openRelationshipLockSheet
} from './thread-relationship.js';
import { checkThreadProactiveMessages, abortActiveAIJobsForUnmount } from './thread-ai.js';
import { mountThreadSettings, unmountThreadSettings } from './thread-settings.js';
import {
  startRecording,
  stopRecording,
  cancelRecording,
  transcribeAudio,
  getRecorderState,
  MAX_RECORD_MS
} from './sensory-ear.js';

const STYLE_ID = 'chat-thread-style';
const PAGE_SIZE = 50;
const PROACTIVE_CHECK_INTERVAL = 10 * 60 * 1000;
const DRAFT_KEY = 'chat_draft_map';

// 壁纸变更监听取消句柄（mount 时注册，unmount 时移除）
let offWallpaperListener = null;

const state = {
  rootEl: null,
  appState: null,
  mounted: false,
  mode: 'private',
  characterId: '',
  groupId: '',
  character: null,
  group: null,
  messages: [],
  groupMessages: [],
  visibleCount: PAGE_SIZE,
  quotedMessageId: '',
  inputValue: '',
  searchOpen: false,
  searchValue: '',
  aiGenerating: false,
  stoppingAI: false,
  messageQueue: [],
  proactiveStartTimer: null,
  proactiveVisibleTimer: null,
  proactiveTimer: null,
  proactiveChecking: false,
  mountVersion: 0,
  relationshipLock: null,
  relationshipPunishment: null,
  activeTtsMessageId: '',
  activeTts: false,
  displayMode: 'bubble',
  reloadAndRender: null,
  renderOnly: null,
  wallpaperImage: '',
  wallpaperOpacity: 1,
  pendingImages: [],
  // 耳朵语音输入状态：'idle' | 'recording' | 'transcribing'
  earState: 'idle',
  earElapsedMs: 0
};

// ═══════════════════════════════════════
// 【草稿持久化】私聊按 characterId，群聊按 groupId，互不串扰
// ═══════════════════════════════════════

function loadDraftMap() {
  const saved = getData(DRAFT_KEY);
  return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
}

function saveDraftMap(map) {
  setData(DRAFT_KEY, map);
}

function getDraftKey() {
  if (state.mode === 'group') {
    const id = String(state.groupId || '').trim();
    return id ? `group:${id}` : '';
  }
  const id = String(state.characterId || '').trim();
  return id ? `private:${id}` : '';
}

function restoreDraft() {
  const key = getDraftKey();
  if (!key) {
    state.inputValue = '';
    return;
  }
  const map = loadDraftMap();
  state.inputValue = String(map[key] || '');
}

function persistDraft() {
  const key = getDraftKey();
  if (!key) return;
  const map = loadDraftMap();
  const text = String(state.inputValue || '');
  if (text) {
    map[key] = text;
  } else if (Object.prototype.hasOwnProperty.call(map, key)) {
    delete map[key];
  }
  saveDraftMap(map);
}

function clearDraft() {
  const key = getDraftKey();
  if (!key) return;
  const map = loadDraftMap();
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    delete map[key];
    saveDraftMap(map);
  }
}

export async function mountChatThread(containerEl, options = {}) {
  state.mountVersion += 1;
  state.rootEl = containerEl;
  state.appState = options.appState || null;
  state.mounted = true;
  state.mode = options.mode === 'group' ? 'group' : 'private';
  state.characterId = String(options.characterId || '').trim();
  state.groupId = String(options.groupId || '').trim();
  // 全局活动会话标识：供 chat-event-bridge / 未读递增判断“用户是否正在该会话”
  window.__chatActiveThread = { mode: state.mode, characterId: state.characterId, groupId: state.groupId };
  state.visibleCount = loadVisibleCount();
  state.quotedMessageId = '';
  state.inputValue = '';
  state.searchOpen = false;
  state.searchValue = '';
  state.aiGenerating = false;
  state.stoppingAI = false;
  state.messageQueue = [];
  state.pendingImages = [];
  state.proactiveChecking = false;
  state.relationshipLock = null;
  state.relationshipPunishment = null;
  state.activeTtsMessageId = '';
  state.activeTts = false;
  state.displayMode = resolveDisplayMode();
  state.reloadAndRender = reloadAndRender;
  state.renderOnly = () => { if (state.rootEl && state.mounted) render(); };
  state.wallpaperImage = '';
  state.wallpaperOpacity = 1;

  restoreDraft();

  injectStyle();

  await loadThreadData();
  await loadWallpaperCache();

  // 监听聊天壁纸变更（来自 thread-settings 上传/清除/改透明度），实时刷新背景
  offWallpaperListener = window.AppEvents?.on?.('chat-wallpaper-updated', (detail) => {
    if (!state.mounted) return;
    // 私聊会话只处理自己的角色，群聊只处理自己的群
    if (detail?.characterId && detail.characterId !== state.characterId) return;
    if (detail?.groupId && detail.groupId !== state.groupId) return;
    loadWallpaperCache().then(() => { if (state.mounted) render(); }).catch(() => {});
  });

  if (state.mode === 'private') {
    await loadRelationshipState(state);
  }

  render();
  startProactiveChecks();
}

export function unmountChatThread() {
  state.mountVersion += 1;
  state.mounted = false;
  state.aiGenerating = false;
  state.stoppingAI = false;
  state.messageQueue = [];
  state.pendingImages = [];
  // 卸载时清理录音：避免离开会话后录音仍在进行、麦克风轨道泄漏
  try {
    if (getRecorderState() === 'recording') {
      cancelRecording();
    }
  } catch (_) {}
  state.earState = 'idle';
  state.earElapsedMs = 0;
  window.__chatActiveThread = null;

  // 移除壁纸变更监听，避免卸载后异步回写旧 state
  try { if (typeof offWallpaperListener === 'function') offWallpaperListener(); } catch (_) {}
  offWallpaperListener = null;

  // 卸载时清理 activeAIJobs：abort 进行中的 job + 标记 placeholder 停止
  // 避免 unmount 后 AI job 继续后台跑、activeAIJobs 积累旧 job
  try {
    abortActiveAIJobsForUnmount(state);
  } catch (_) {}

  stopAll();
  resetVoicePlayer();
  stopProactiveChecks();
  closeStickerSheet();
  closeThreadPanels();
  hideBottomSheet();

  if (state.rootEl) {
    state.rootEl.replaceChildren();
  }

  // 会话切出时把新消息批量推到 MCP 服务端（fire-and-forget，不阻塞 unmount）
  // 只推私聊会话；群聊暂不推
  // 在 state 清空前捕获数据，避免清空后读不到
  const pushCharacterId = state.characterId;
  const pushCharacterName = state.character?.name || '';
  const pushMessagesSnapshot = Array.isArray(state.messages) ? state.messages.slice() : [];

  state.rootEl = null;
  state.appState = null;
  state.character = null;
  state.group = null;
  state.messages = [];
  state.groupMessages = [];
  state.quotedMessageId = '';
  state.inputValue = '';
  state.searchOpen = false;
  state.searchValue = '';
  state.relationshipLock = null;
  state.relationshipPunishment = null;
  state.reloadAndRender = null;
  state.renderOnly = null;
  state.wallpaperImage = '';
  state.wallpaperOpacity = 1;

  // 动态 import push.js，避免静态循环依赖；push 模块不存在/失败时静默跳过
  if (pushCharacterId && pushMessagesSnapshot.length > 0) {
    import('../../core/push.js')
      .then((mod) => {
        if (mod && typeof mod.pushMessages === 'function') {
          return mod.pushMessages(pushCharacterId, pushCharacterName, pushMessagesSnapshot);
        }
      })
      .catch(() => {});
  }
}

function openSettingsPage() {
  const containerEl = state.rootEl;
  const savedAppState = state.appState;
  const savedCharacterId = state.characterId;
  const savedMode = state.mode;
  const savedGroupId = state.groupId;

  unmountChatThread();

  mountThreadSettings(containerEl, {
    characterId: savedCharacterId,
    appState: {
      goThread: () => {
        unmountThreadSettings();
        mountChatThread(containerEl, {
          appState: savedAppState,
          characterId: savedCharacterId,
          groupId: savedGroupId,
          mode: savedMode
        });
      }
    }
  });
}

async function loadThreadData() {
  state.displayMode = resolveDisplayMode();

  if (state.mode === 'group') {
    state.group = state.groupId ? await getDB('groups', state.groupId).catch(() => null) : null;
    state.groupMessages = normalizeList(await getByIndexDB('group_messages', 'groupId', state.groupId).catch(() => []))
      .sort(sortByTimestamp);
    state.messages = [];
    state.relationshipLock = null;
    state.relationshipPunishment = null;
    return;
  }

  state.character = state.characterId ? await getDB('characters', state.characterId).catch(() => null) : null;
  state.messages = normalizeList(await getByIndexDB('messages', 'characterId', state.characterId).catch(() => []))
    .sort(sortByTimestamp);
  state.groupMessages = [];
}

function loadVisibleCount() {
  const count = Number(getData(getVisibleCountKey()));
  if (!Number.isFinite(count) || count < 12) return PAGE_SIZE;
  return Math.floor(count);
}

function saveVisibleCount(count) {
  state.visibleCount = Math.max(12, Math.floor(Number(count) || PAGE_SIZE));
  setData(getVisibleCountKey(), state.visibleCount);
}

async function loadWallpaperCache() {
  state.wallpaperImage = '';
  state.wallpaperOpacity = 1;

  if (!state.characterId) {
    await loadDefaultWallpaperCache();
    return;
  }

  const blobKey = `app_bg_chat_${state.characterId}`;
  try {
    const record = await getDB('blobs', blobKey);
    if (!record) { await loadDefaultWallpaperCache(); return; }
    const image = record.value || record.image || '';
    if (!image) { await loadDefaultWallpaperCache(); return; }
    const opacityKey = `app_bg_chat_opacity_${state.characterId}`;
    const raw = Number(getData(opacityKey) ?? record.opacity ?? 100);
    state.wallpaperImage = image;
    state.wallpaperOpacity = Math.max(0, Math.min(100, raw)) / 100;
  } catch {
    await loadDefaultWallpaperCache();
  }
}

async function loadDefaultWallpaperCache() {
  try {
    const value = await window.AppImages?.readImageValue?.('app_bg_chat');
    if (!value) return;
    state.wallpaperImage = value;
    state.wallpaperOpacity = 1;
  } catch {
  }
}

function render() {
  if (!state.rootEl || !state.mounted) return;

  const page = el('section', `chat-page chat-thread-page mode-${state.displayMode}`);
  page.dataset.locked = getRelationshipLockLevel(state) ? 'true' : 'false';
  page.dataset.aiGenerating = isAIWorking() ? 'true' : 'false';

  if (state.wallpaperImage) {
    const bg = el('div', 'chat-thread-wallpaper');
    // 转义 base64 中的引号，避免 background-image 解析失败导致静默空白
    bg.style.backgroundImage = `url("${String(state.wallpaperImage).replace(/"/g, '\\"')}")`;
    bg.style.opacity = String(state.wallpaperOpacity);
    page.append(bg);
  }

  page.append(createHeader());

  if (state.searchOpen) {
    page.append(createSearchCard());
  }

  page.append(createMessageArea(), createInputBar());
  state.rootEl.replaceChildren(page);

  renderThreadMessages(state, page);
  renderLoadMoreButton(page);
}

async function reloadAndRender() {
  await loadThreadData();
  await loadWallpaperCache();

  if (state.mode === 'private') {
    await loadRelationshipState(state);
  }

  render();
}

function createHeader() {
  const header = el('header', 'chat-thread-header');

  const back = iconButton('back', '返回');
  back.addEventListener('click', () => {
    stopAll();
    state.appState?.goList?.({ tab: state.mode === 'group' ? 'group' : 'private' });
  });

  const title = el('button', 'chat-thread-title-wrap');
  title.type = 'button';
  title.append(
    createAvatar(getTargetAvatar(), getTargetName()),
    createTitleText()
  );
  title.addEventListener('click', () => openSettingsPage());

  const actions = el('div', 'chat-thread-header-actions');

  if (state.mode === 'private') {
    const memory = iconButton('memory', '记忆');
    memory.addEventListener('click', () => {
      state.appState?.openMemory?.(state.characterId, {
        fromRoute: state.appState?.getRoute?.()
      });
    });
    actions.append(memory);
  }

  const search = iconButton('search', '搜索');
  search.classList.toggle('is-active', state.searchOpen);
  search.addEventListener('click', () => {
    state.searchOpen = !state.searchOpen;
    if (!state.searchOpen) state.searchValue = '';
    render();
  });

  const settings = iconButton('settings', '设置');
  settings.addEventListener('click', () => openSettingsPage());

  actions.append(search, settings);
  header.append(back, title, actions);
  return header;
}

function createTitleText() {
  const wrap = el('div', 'chat-thread-title-text');
  wrap.append(
    el('div', 'chat-thread-name', getTargetName()),
    el('div', 'chat-thread-status', getStatusText())
  );
  return wrap;
}

function createSearchCard() {
  const wrap = el('section', 'chat-thread-search-card');

  const input = document.createElement('input');
  input.className = 'chat-thread-search-input';
  input.type = 'text';
  input.value = state.searchValue || '';
  input.placeholder = '搜聊天内容';
  input.autocomplete = 'off';
  input.setAttribute('spellcheck', 'false');

  input.addEventListener('input', () => {
    state.searchValue = input.value.trim();
    refreshMessageAreaOnly();
  });


  const close = iconButton('close', '关闭搜索');
  close.addEventListener('click', () => {
    state.searchOpen = false;
    state.searchValue = '';
    blurActiveInput();
    render();
  });

  wrap.append(input, close);

  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  return wrap;
}

function refreshMessageAreaOnly() {
  const page = state.rootEl?.querySelector?.('.chat-thread-page');
  if (!page) {
    render();
    return;
  }

  const oldArea = page.querySelector('.chat-thread-area');
  if (!oldArea) {
    render();
    return;
  }

  const nextArea = createMessageArea();
  oldArea.replaceWith(nextArea);
  renderThreadMessages(state, page);
  renderLoadMoreButton(page);
}

function createMessageArea() {
  const area = el('main', 'chat-thread-area');
  const list = el('div', 'chat-thread-list');
  list.id = 'chat-thread-list';

  area.addEventListener('pointerdown', handleBlankAreaPointerDown);
  area.append(list);
  return area;
}

function renderLoadMoreButton(page) {
  const list = page.querySelector('#chat-thread-list');
  if (!list) return;

  const old = list.querySelector('.chat-load-more-wrap');
  if (old) old.remove();

  const all = getAllCurrentMessages();
  if (state.searchValue || all.length <= state.visibleCount) return;

  const hidden = all.length - state.visibleCount;
  const wrap = el('div', 'chat-load-more-wrap');
  const btn = el('button', 'chat-load-more-btn', `还有 ${hidden} 条旧消息`);
  btn.type = 'button';
  btn.addEventListener('click', () => {
    saveVisibleCount(state.visibleCount + PAGE_SIZE);
    render();
  });
  wrap.append(btn);
  list.prepend(wrap);
}

function createInputBar() {
  const bar = el('footer', 'chat-thread-input-bar');

  if (getRelationshipLockLevel(state)) {
    bar.classList.add('is-relationship-locked');
    bar.append(createRelationshipLockBar(state, { onRefresh: reloadAndRender }));
    return bar;
  }

  const tools = iconButton('add', '工具');
  tools.addEventListener('click', () => openThreadToolsPanel(state, {
    onPickImages: () => pickPendingImages()
  }));

  const input = document.createElement('textarea');
  input.className = 'chat-thread-input';
  input.rows = 1;
  input.value = state.inputValue || '';
  input.placeholder = isAIWorking()
    ? 'TA 正在回复，发的话会排队等 TA'
    : '慢慢说';
  input.disabled = state.stoppingAI;
  input.autocomplete = 'off';
  input.autocapitalize = 'off';
  input.autocorrect = 'off';
  input.spellcheck = false;
  input.enterKeyHint = 'send';

  input.addEventListener('input', () => {
    state.inputValue = input.value;
    persistDraft();
    autoResize(input);
    updateSendButtonState(send, input);
  });


  input.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      await handleSend(input);
    }
  });

  const sticker = iconButton('smile', '表情包');
  sticker.addEventListener('click', () => openStickerSheet(state, { onRefresh: reloadAndRender }));

  // 麦克风按钮（语音输入）：发送按钮左边，点击开始/停止录音
  const mic = el('button', 'chat-thread-mic');
  mic.type = 'button';
  mic.setAttribute('aria-label', '语音输入');
  mic.append(createChatIcon('mic', 20));
  mic.addEventListener('click', () => handleMicClick(input, mic, send));
  updateMicButtonState(mic);

  const send = el('button', 'chat-thread-send');
  send.type = 'button';

  if (isAIWorking()) {
    send.classList.add('is-ai-working');
    send.append(createChatIcon('stop', 16));
    send.setAttribute('aria-label', '停止回复');
    send.disabled = state.stoppingAI;
    send.addEventListener('click', () => handleStopAI());
  } else {
    send.append(createChatIcon('send', 16));
    send.setAttribute('aria-label', '发送');
    send.addEventListener('click', () => handleSend(input));
    updateSendButtonState(send, input);
  }

  // 录音中：禁用发送按钮，防止误操作
  if (state.earState === 'recording' || state.earState === 'transcribing') {
    send.disabled = true;
  }

  // 待发送图片预览栏（跨整行，放在输入区上方）
  const pendingWrap = renderPendingImages();
  // 录音状态栏（跨整行，放在输入区上方，与图片预览栏并列）
  const recordingWrap = renderRecordingBar(input, mic, send);
  bar.append(pendingWrap, recordingWrap, tools, input, sticker, mic, send);
  if (state.pendingImages.length > 0) bar.classList.add('has-pending-images');
  if (state.earState !== 'idle') bar.classList.add('has-recording');
  requestAnimationFrame(() => autoResize(input));
  return bar;
}

// ═══════════════════════════════════════
// 【耳朵语音输入】麦克风按钮 + 录音状态机
//   idle：点击 → 开始录音
//   recording：点击麦克风 → 停止并转 STT；点取消 → 丢弃不转
//   transcribing：按钮禁用，等 STT 完成
//   STT 成功 → 文字追加到输入框末尾（不覆盖现有文字），光标放末尾
//   STT 失败 → toast 提示，不填入内容
// ═══════════════════════════════════════

function updateMicButtonState(micBtn) {
  if (!micBtn) return;
  micBtn.classList.remove('is-recording', 'is-transcribing');
  if (state.earState === 'recording') {
    micBtn.classList.add('is-recording');
    micBtn.setAttribute('aria-label', '停止录音');
  } else if (state.earState === 'transcribing') {
    micBtn.classList.add('is-transcribing');
    micBtn.disabled = true;
    micBtn.setAttribute('aria-label', '转换中');
  } else {
    micBtn.disabled = false;
    micBtn.setAttribute('aria-label', '语音输入');
  }
}

// 录音状态栏：录音中显示计时 + 取消按钮；转换中显示"转换中..."
function renderRecordingBar(input, micBtn, sendBtn) {
  const wrap = el('div', 'chat-recording-bar');
  if (state.earState === 'idle') return wrap;

  if (state.earState === 'recording') {
    wrap.classList.add('is-recording');
    // 录音脉冲圆点
    const dot = el('span', 'chat-recording-dot');
    // 计时文本
    const timer = el('span', 'chat-recording-timer', formatRecordMs(state.earElapsedMs));
    // 取消按钮
    const cancelBtn = el('button', 'chat-recording-cancel');
    cancelBtn.type = 'button';
    cancelBtn.setAttribute('aria-label', '取消录音');
    cancelBtn.append(createChatIcon('close', 14));
    cancelBtn.addEventListener('click', () => handleCancelRecording(input, micBtn, sendBtn));
    wrap.append(dot, timer, cancelBtn);
  } else if (state.earState === 'transcribing') {
    wrap.classList.add('is-transcribing');
    const spinner = el('span', 'chat-recording-spinner');
    const text = el('span', 'chat-recording-timer', '转换中…');
    wrap.append(spinner, text);
  }
  return wrap;
}

function formatRecordMs(ms) {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  // 60 秒上限显示
  const displaySec = Math.min(s, 59);
  return `${String(m).padStart(1, '0')}:${String(displaySec).padStart(2, '0')}`;
}

// 麦克风点击：idle→开始录音；recording→停止转 STT；transcribing→忽略
async function handleMicClick(input, micBtn, sendBtn) {
  if (state.earState === 'transcribing') return;

  if (state.earState === 'recording') {
    // 停止并转 STT
    await handleStopAndTranscribe(input, micBtn, sendBtn);
    return;
  }

  // 开始录音
  const result = await startRecording({
    onAutoStop: () => handleStopAndTranscribe(input, micBtn, sendBtn),
    onTick: (ms) => {
      state.earElapsedMs = ms;
      // 只更新计时文本，不触发整体 render（避免 textarea 失焦）
      const timerEl = document.querySelector('.chat-recording-timer');
      if (timerEl) timerEl.textContent = formatRecordMs(ms);
    }
  });

  if (!result.ok) {
    const msg = reasonToStartToast(result.reason);
    if (msg) showToast(msg);
    return;
  }

  state.earState = 'recording';
  state.earElapsedMs = 0;
  render();
}

// 停止录音并转 STT
async function handleStopAndTranscribe(input, micBtn, sendBtn) {
  if (getRecorderState() !== 'recording') return;

  // 先切 transcribing 状态，让 UI 立即反馈
  state.earState = 'transcribing';
  updateMicButtonState(micBtn);
  if (sendBtn) sendBtn.disabled = true;
  // 更新录音栏显示
  const bar = document.querySelector('.chat-recording-bar');
  if (bar) {
    bar.classList.remove('is-recording');
    bar.classList.add('is-transcribing');
    bar.innerHTML = '';
    const spinner = el('span', 'chat-recording-spinner');
    const text = el('span', 'chat-recording-timer', '转换中…');
    bar.append(spinner, text);
  }

  const stopResult = await stopRecording();
  if (!stopResult.ok || stopResult.cancelled || !stopResult.blob) {
    state.earState = 'idle';
    state.earElapsedMs = 0;
    render();
    return;
  }

  // 调 STT
  const sttResult = await transcribeAudio(stopResult.blob);
  state.earState = 'idle';
  state.earElapsedMs = 0;

  if (sttResult.ok && sttResult.text) {
    // 文字追加到输入框末尾（不覆盖现有文字），光标放末尾
    const existing = String(input.value || '');
    const newText = sttResult.text;
    const sep = existing && !existing.endsWith(' ') ? ' ' : '';
    input.value = existing + sep + newText;
    state.inputValue = input.value;
    persistDraft();
    autoResize(input);
    updateSendButtonState(sendBtn, input);
    // 光标放末尾并聚焦
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  } else {
    // 失败：toast 提示，不填入内容
    showToast(sttResult.message || '没听清，再试一次');
  }
  render();
}

// 取消录音：丢弃音频，不调 STT
async function handleCancelRecording(input, micBtn, sendBtn) {
  if (getRecorderState() !== 'recording') {
    state.earState = 'idle';
    state.earElapsedMs = 0;
    render();
    return;
  }
  await cancelRecording();
  state.earState = 'idle';
  state.earElapsedMs = 0;
  render();
}

// 录音启动失败 → 可爱提示
function reasonToStartToast(reason) {
  switch (reason) {
    case 'permission_denied':
      return '没拿到麦克风权限，去浏览器设置里允许一下哦';
    case 'no_device':
      return '没找到麦克风设备';
    case 'not_supported':
      return '当前浏览器不支持录音';
    case 'busy':
      return '还在录音中，先停一下再试';
    default:
      return '录音没启动成功，再试一次';
  }
}

// 发送按钮高亮：有文字或有待发图片时高亮，否则半透明
function updateSendButtonState(sendBtn, input) {
  if (!sendBtn || sendBtn.classList.contains('is-ai-working')) return;
  const hasText = String(input?.value || '').trim().length > 0;
  const hasImages = state.pendingImages.length > 0;
  sendBtn.classList.toggle('has-content', hasText || hasImages);
}

// 渲染待发送图片预览栏
function renderPendingImages() {
  const wrap = el('div', 'chat-pending-images');
  if (state.pendingImages.length === 0) return wrap;

  state.pendingImages.forEach((src, index) => {
    const cell = el('div', 'chat-pending-image');
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    cell.appendChild(img);

    const removeBtn = el('button', 'chat-pending-image-remove');
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', '移除图片');
    removeBtn.append(createChatIcon('close', 12));
    removeBtn.addEventListener('click', () => {
      state.pendingImages.splice(index, 1);
      render();
    });
    cell.appendChild(removeBtn);

    wrap.appendChild(cell);
  });

  return wrap;
}

// 选图：input type=file multiple，逐张压缩成 base64，单张压缩后 < 2MB
async function pickPendingImages() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  // 不能用 display:none：部分 iOS/Android WebView 对 display:none 的 input.click() 不触发文件选择器
  // 改用绝对定位 + 透明度 0 + 1px 尺寸，保持在 DOM 里但不可见，click 能正常触发
  input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';

  return new Promise((resolve) => {
    input.addEventListener('change', async () => {
      const files = Array.from(input.files || []);
      if (files.length === 0) { resolve(); return; }

      for (const file of files) {
        try {
          const compressed = await compressImage(file, 1920, 0.85);
          // 限制单张压缩后 < 2MB（base64 字符串长度近似 4/3 × 字节数）
          if (compressed.length > 2 * 1024 * 1024) {
            showToast('图片太大啦');
            continue;
          }
          state.pendingImages.push(compressed);
        } catch (err) {
          console.warn('[chat-thread] compress image failed', err);
          showToast('这张图处理不了');
        }
      }
      render();
      resolve();
    });
    document.body.appendChild(input);
    input.click();
    // 清理 DOM 节点
    setTimeout(() => { input.remove(); }, 1000);
  });
}

async function handleSend(input) {
  const text = String(input.value || '').trim();
  const images = state.pendingImages.slice();
  // 无文字且无图片：不发送
  if (!text && images.length === 0) return;

  if (getRelationshipLockLevel(state)) {
    openRelationshipLockSheet(state, { onRefresh: reloadAndRender });
    return;
  }

  // AI 正在回复：消息排队，不打断
  if (isAIWorking()) {
    state.inputValue = '';
    input.value = '';
    state.pendingImages = [];
    autoResize(input);
    clearDraft();

    try {
      let saveMessageOnly = null;
      let sendImageTextMessage = null;
      try {
        const mod = await import('./thread-actions.js');
        saveMessageOnly = mod?.saveMessageOnly;
        sendImageTextMessage = mod?.sendImageTextMessage;
      } catch (importErr) {
        // 动态 import 失败不静默吞掉，留 warn 便于排查；UI 仍可恢复
        console.warn('[chat-thread] dynamic import thread-actions failed (queue branch):', importErr?.message || importErr);
      }

      if (images.length > 0 && typeof sendImageTextMessage === 'function') {
        await sendImageTextMessage(state, { text, images, quoteMessageId: state.quotedMessageId });
      } else if (typeof saveMessageOnly === 'function') {
        await saveMessageOnly(state, text, {
          quoteMessageId: state.quotedMessageId
        });
      } else {
        await sendThreadMessage(state, text, { triggerAI: false });
      }

      state.quotedMessageId = '';
      state.messageQueue.push(text || '[图片]');
      render();
      showToast('排队中，等 TA 回完就接着');
    } catch (error) {
      console.error('[chat-thread] queue message failed', error);
      showToast('发送没成功');
      // 失败时恢复输入内容与图片，UI 可恢复
      state.inputValue = text;
      input.value = text;
      state.pendingImages = images;
      autoResize(input);
      render();
    }
    return;
  }

  // 正常发送
  state.inputValue = '';
  input.value = '';
  state.pendingImages = [];
  autoResize(input);
  blurActiveInput();
  clearDraft();

  // 并发互斥：在 saveMessageOnly 之前同步置 aiGenerating=true，
  // 避免 await saveMessageOnly 期间用户再次回车进入第二条「正常发送」路径，
  // 导致两个并发 AI job 互相 abort + aiGenerating 被前驱 job 的 finally 提前清零。
  // 失败分支（saveMessageOnly 抛错）在 catch 里复位。
  state.aiGenerating = true;
  render();

  try {
    let saveMessageOnly = null;
    let sendImageTextMessage = null;
    try {
      const mod = await import('./thread-actions.js');
      saveMessageOnly = mod?.saveMessageOnly;
      sendImageTextMessage = mod?.sendImageTextMessage;
    } catch (importErr) {
      // 动态 import 失败不静默吞掉，留 warn 便于排查；UI 仍可恢复
      console.warn('[chat-thread] dynamic import thread-actions failed (send branch):', importErr?.message || importErr);
    }

    if (images.length > 0 && typeof sendImageTextMessage === 'function') {
      await sendImageTextMessage(state, { text, images, quoteMessageId: state.quotedMessageId });
    } else if (typeof saveMessageOnly === 'function') {
      await saveMessageOnly(state, text, {
        quoteMessageId: state.quotedMessageId
      });
    } else {
      await sendThreadMessage(state, text, { triggerAI: false });
    }

    state.quotedMessageId = '';
    render();
  } catch (error) {
    console.error('[chat-thread] save user message failed', error);
    showToast('发送没成功');
    // 失败时恢复输入内容、图片与状态，UI 可恢复
    state.aiGenerating = false;
    state.inputValue = text;
    input.value = text;
    state.pendingImages = images;
    autoResize(input);
    render();
    return;
  }

  try {
    await sendThreadMessage(state, '', { triggerAI: true, skipSave: true });
  } catch (error) {
    console.error('[chat-thread] AI reply failed', error);
    showToast('TA 刚刚走神了');
  } finally {
    state.aiGenerating = false;

    // 处理排队消息：用稳定消费模式，成功一条才移除一条，期间新进入队列的消息不被覆盖
    while (state.mounted && state.messageQueue.length > 0) {
      // 取队列首条作为本轮目标（不预先清空，避免 sendThreadMessage 抛错时丢消息）
      state.aiGenerating = true;
      render();
      try {
        await sendThreadMessage(state, '', { triggerAI: true, skipSave: true });
        // 成功后才移除已消费的那一条；期间新 push 的消息保留在队列里下一轮处理
        state.messageQueue.shift();
      } catch (error) {
        console.error('[chat-thread] queued AI reply failed', error);
        showToast('TA 刚刚走神了');
        // 失败时保留队列，不再继续消费，避免丢消息；用户可手动停止或重试
        break;
      } finally {
        state.aiGenerating = false;
      }
    }

    render();
  }
}

async function handleStopAI() {
  if (state.stoppingAI) return;

  state.stoppingAI = true;
  state.messageQueue = [];
  render();

  try {
    await stopThreadAIReply(state, { message: '我先停在这里了。' });
  } catch (error) {
    console.error('[chat-thread] stop failed', error);
  } finally {
    state.stoppingAI = false;
    state.aiGenerating = false;
    await reloadAndRender();
  }
}

function isAIWorking() {
  if (state.aiGenerating || state.stoppingAI) return true;
  return getAllCurrentMessages().some((item) => item?.role === 'assistant' && item?.isPending);
}

function startProactiveChecks() {
  stopProactiveChecks();
  if (state.mode === 'group') return;

  const context = getProactiveContext();
  state.proactiveStartTimer = window.setTimeout(() => {
    state.proactiveStartTimer = null;
    if (isCurrentProactiveContext(context)) runProactiveCheck();
  }, 3000);
  state.proactiveTimer = window.setInterval(runProactiveCheck, PROACTIVE_CHECK_INTERVAL);

  document.addEventListener('visibilitychange', handleProactiveVisible);
  window.addEventListener('focus', handleProactiveVisible);
}

function stopProactiveChecks() {
  if (state.proactiveStartTimer) {
    window.clearTimeout(state.proactiveStartTimer);
    state.proactiveStartTimer = null;
  }
  if (state.proactiveVisibleTimer) {
    window.clearTimeout(state.proactiveVisibleTimer);
    state.proactiveVisibleTimer = null;
  }
  if (state.proactiveTimer) {
    window.clearInterval(state.proactiveTimer);
    state.proactiveTimer = null;
  }

  document.removeEventListener('visibilitychange', handleProactiveVisible);
  window.removeEventListener('focus', handleProactiveVisible);
}

function handleProactiveVisible() {
  if (!state.mounted || state.mode === 'group') return;
  if (state.proactiveVisibleTimer) window.clearTimeout(state.proactiveVisibleTimer);
  const context = getProactiveContext();
  state.proactiveVisibleTimer = window.setTimeout(() => {
    state.proactiveVisibleTimer = null;
    if (isCurrentProactiveContext(context)) runProactiveCheck();
  }, 3000);
}

function getProactiveContext() {
  return {
    mountVersion: state.mountVersion,
    mode: state.mode,
    characterId: state.characterId,
    groupId: state.groupId
  };
}

function isCurrentProactiveContext(context) {
  return Boolean(state.mounted && context &&
    context.mountVersion === state.mountVersion &&
    context.mode === state.mode &&
    context.characterId === state.characterId &&
    context.groupId === state.groupId);
}

async function runProactiveCheck() {
  if (!state.mounted || state.mode === 'group') return;
  if (getRelationshipLockLevel(state) || state.proactiveChecking || isAIWorking()) return;

  state.proactiveChecking = true;

  try {
    const message = await checkThreadProactiveMessages(state, { incrementUnread: false });
    if (message) {
      await reloadAndRender();
    }
  } catch (error) {
    console.error('[chat-thread] proactive check failed', error);
  } finally {
    state.proactiveChecking = false;
  }
}

function getStatusText() {
  if (isAIWorking()) {
    if (state.messageQueue.length > 0) {
      return `正在回复（还有 ${state.messageQueue.length} 条排队）`;
    }
    return '正在输入';
  }

  if (state.mode === 'group') {
    return `${normalizeList(state.group?.memberIds).length} 个成员`;
  }

  const locked = getRelationshipStatusText(state);
  if (locked) return locked;

  const last = state.messages[state.messages.length - 1];
  if (!last) return '还没有聊天记录';

  const time = new Date(last.timestamp || last.createdAt || 0).getTime();
  if (!time) return '在线';

  const diff = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;

  if (diff < minute) return '刚刚在线';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < 24 * hour) return `${Math.floor(diff / hour)}小时前`;
  return '今天来过';
}

function handleBlankAreaPointerDown(event) {
  const target = event.target;
  if (!(target instanceof Element)) return;

  if (target.closest(
    'button, input, textarea, select, a, [role="button"], .chat-message-row, .chat-thread-input-bar, .bottom-sheet, .sheet-overlay'
  )) {
    return;
  }

  blurActiveInput();
}

function blurActiveInput() {
  const active = document.activeElement;
  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement
  ) {
    active.blur();
  }
}

function isInputFocused() {
  const active = document.activeElement;
  return Boolean(
    state.rootEl &&
    active instanceof Element &&
    state.rootEl.contains(active) &&
    (
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement ||
      active instanceof HTMLSelectElement
    )
  );
}

function getAllCurrentMessages() {
  return state.mode === 'group' ? state.groupMessages : state.messages;
}

function getTargetName() {
  return state.mode === 'group' ? state.group?.name || '群聊' : state.character?.name || '聊天';
}

function getTargetAvatar() {
  return state.mode === 'group' ? state.group?.avatar || '' : state.character?.avatar || '';
}

function createAvatar(src, name) {
  const avatar = el('span', 'chat-thread-avatar');

  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    avatar.append(img);
  } else {
    avatar.textContent = getInitial(name);
  }

  return avatar;
}

function resolveDisplayMode() {
  const settings = getData('app_settings') || {};
  return settings.bubbleMode === 'dialog' ? 'dialog' : 'bubble';
}

function getVisibleCountKey() {
  if (state.mode === 'group') return `chat_group_${state.groupId}_visible_count`;
  return state.characterId ? `chat_${state.characterId}_visible_count` : 'chat_visible_count_default';
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(132, textarea.scrollHeight)}px`;
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function sortByTimestamp(a, b) {
  return String(a?.timestamp || a?.createdAt || '').localeCompare(String(b?.timestamp || b?.createdAt || ''));
}

function iconButton(iconName, label) {
  const button = el('button', 'chat-icon-btn');
  button.type = 'button';
  button.setAttribute('aria-label', label || iconName);
  button.append(createChatIcon(iconName, 18));
  return button;
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

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .chat-thread-page{
      position:relative;
      height:100%;
      max-height:100%;
      display:flex;
      flex-direction:column;
      overflow:hidden;
      background:
        radial-gradient(circle at 16% 12%, color-mix(in srgb, var(--accent-light) 28%, transparent) 0 2px, transparent 3px),
        linear-gradient(180deg, var(--bg-primary), color-mix(in srgb, var(--bg-primary) 86%, var(--decor-blue)));
      background-size:28px 28px, 100% 100%;
      color:var(--text-primary);
      transition:height 200ms ease, max-height 200ms ease;
    }

    .chat-thread-wallpaper{
      position:absolute;
      inset:0;
      z-index:0;
      background-size:cover;
      background-position:center;
      background-repeat:no-repeat;
      pointer-events:none;
      filter:saturate(.9);
    }

    .chat-thread-page > :not(.chat-thread-wallpaper){
      position:relative;
      z-index:1;
    }

    .chat-thread-header{
      flex:0 0 auto;
      min-height:62px;
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      align-items:center;
      gap:12px;
      padding:12px 20px 10px;
      border-bottom:1px solid color-mix(in srgb, var(--border-soft) 52%, transparent);
      background:color-mix(in srgb, var(--bg-card) 78%, transparent);
      backdrop-filter:blur(18px);
      z-index:3;
    }

    .chat-icon-btn, .chat-thread-send{
      width:44px;
      height:44px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      transition:all 200ms ease;
    }

    .chat-icon-btn:active, .chat-thread-send:active{
      transform:scale(.96);
    }

    .chat-icon-btn.is-active{
      color:var(--accent);
    }

    .chat-thread-title-wrap{
      min-width:0;
      display:inline-flex;
      align-items:center;
      gap:10px;
      background:transparent;
      color:inherit;
      text-align:left;
    }

    .chat-thread-avatar{
      width:38px;
      height:38px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
      border-radius:999px;
      background:var(--bg-card);
      font-size:14px;
      font-weight:600;
      flex:0 0 auto;
    }

    .chat-thread-avatar img{
      width:100%;
      height:100%;
      object-fit:cover;
    }

    .chat-thread-title-text{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:2px;
    }

    .chat-thread-name{
      color:var(--text-primary);
      font-size:17px;
      font-weight:600;
      line-height:1.35;
    }

    .chat-thread-status{
      color:var(--text-secondary);
      font-size:12px;
      line-height:1.35;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .chat-thread-header-actions{
      display:flex;
      align-items:center;
      justify-content:flex-end;
      gap:8px;
    }

    .chat-thread-search-card{
      flex:0 0 auto;
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      gap:8px;
      padding:0 20px 12px;
    }

    .chat-thread-search-input{
      width:100%;
      min-height:44px;
      padding:0 12px;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      font-size:16px;
      line-height:1.6;
    }

    .chat-thread-area{
      flex:1 1 auto;
      min-height:0;
      overflow:hidden;
      padding:0 20px 12px;
    }

    .chat-thread-list{
      height:100%;
      overflow-y:auto;
      overflow-x:hidden;
      display:flex;
      flex-direction:column;
      gap:10px;
      padding-bottom:18px;
      -webkit-overflow-scrolling:touch;
      overscroll-behavior:contain;
    }

    .chat-thread-input-bar{
      flex:0 0 auto;
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto auto auto;
      align-items:end;
      gap:8px;
      padding:12px 20px calc(14px + env(safe-area-inset-bottom));
      background:color-mix(in srgb, var(--bg-primary) 90%, transparent);
      backdrop-filter:blur(18px);
      z-index:3;
    }

    .chat-thread-input-bar.is-relationship-locked{
      display:block;
    }

    /* 待发送图片预览栏：跨整行，放在输入框上方 */
    .chat-pending-images{
      grid-column:1 / -1;
      display:flex;
      gap:8px;
      padding:8px 2px 4px;
      overflow-x:auto;
      overflow-y:hidden;
      scrollbar-width:none;
      -webkit-overflow-scrolling:touch;
    }
    .chat-pending-images::-webkit-scrollbar{display:none}
    .chat-pending-image{
      position:relative;
      flex:0 0 auto;
      width:64px;
      height:64px;
      border-radius:12px;
      overflow:hidden;
      background:var(--surface-muted);
    }
    .chat-pending-image img{
      width:100%;
      height:100%;
      object-fit:cover;
      display:block;
    }
    .chat-pending-image-remove{
      position:absolute;
      top:2px;
      right:2px;
      width:20px;
      height:20px;
      display:flex;
      align-items:center;
      justify-content:center;
      border:none;
      border-radius:50%;
      background:var(--bg-overlay);
      color:var(--bubble-user-text);
      cursor:pointer;
      padding:0;
      -webkit-tap-highlight-color:transparent;
    }
    .chat-pending-image-remove:active{transform:scale(0.9)}
    .chat-pending-image-remove svg{width:12px;height:12px}
    .chat-thread-input-bar.has-pending-images{
      grid-template-rows:auto 1fr;
    }
    .chat-thread-send.has-content{
      opacity:1;
    }
    .chat-thread-send:not(.has-content):not(.is-ai-working){
      opacity:0.5;
    }

    .chat-thread-input{
      width:100%;
      min-height:44px;
      resize:none;
      padding:10px 12px;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      font-size:16px;
      line-height:1.6;
      -webkit-appearance:none;
      appearance:none;
    }

    .chat-thread-input:disabled{
      opacity:.75;
    }

    .chat-thread-send{
      background:var(--accent);
      color:var(--bubble-user-text);
    }

    .chat-thread-send.is-ai-working{
      animation:chatThreadPulse 1100ms ease-in-out infinite;
    }

    /* 麦克风按钮：线条风，颜色走 CSS 变量 */
    .chat-thread-mic{
      flex:0 0 auto;
      width:36px;
      height:36px;
      border:none;
      border-radius:50%;
      background:transparent;
      color:var(--text-secondary);
      display:flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
      -webkit-tap-highlight-color:transparent;
      transition:color var(--duration-fast) var(--ease-out),background var(--duration-fast) var(--ease-out);
    }
    .chat-thread-mic:active{transform:scale(0.92)}
    .chat-thread-mic svg{width:20px;height:20px}
    .chat-thread-mic.is-recording{
      color:var(--text-on-primary);
      background:var(--color-danger);
      animation:chatMicPulse 1100ms ease-in-out infinite;
    }
    .chat-thread-mic.is-transcribing{
      opacity:var(--opacity-disabled);
      cursor:not-allowed;
    }
    @keyframes chatMicPulse{
      0%,100%{transform:scale(1);}
      50%{transform:scale(1.06);}
    }

    /* 录音状态栏：跨整行，放在输入框上方（与图片预览栏并列） */
    .chat-recording-bar{
      grid-column:1 / -1;
      display:flex;
      align-items:center;
      gap:8px;
      padding:6px 4px 2px;
      font-size:12px;
      color:var(--text-secondary);
      min-height:0;
    }
    .chat-recording-bar.is-recording{
      color:var(--color-danger);
    }
    .chat-recording-bar.is-transcribing{
      color:var(--text-secondary);
    }
    .chat-recording-dot{
      width:8px;
      height:8px;
      border-radius:50%;
      background:var(--color-danger);
      flex:0 0 auto;
      animation:chatRecDot 900ms ease-in-out infinite;
    }
    @keyframes chatRecDot{
      0%,100%{opacity:1;transform:scale(1)}
      50%{opacity:.4;transform:scale(0.7)}
    }
    .chat-recording-timer{
      font-variant-numeric:tabular-nums;
      flex:0 0 auto;
      font-weight:600;
    }
    .chat-recording-cancel{
      margin-left:auto;
      width:28px;
      height:28px;
      border:none;
      border-radius:50%;
      background:var(--surface-muted);
      color:var(--text-secondary);
      display:flex;
      align-items:center;
      justify-content:center;
      cursor:pointer;
      -webkit-tap-highlight-color:transparent;
      flex:0 0 auto;
    }
    .chat-recording-cancel:active{transform:scale(0.9)}
    .chat-recording-cancel svg{width:14px;height:14px}
    .chat-recording-spinner{
      width:14px;
      height:14px;
      border:2px solid var(--surface-muted);
      border-top-color:var(--accent);
      border-radius:50%;
      flex:0 0 auto;
      animation:chatRecSpin 800ms linear infinite;
    }
    @keyframes chatRecSpin{to{transform:rotate(360deg)}}
    .chat-thread-input-bar.has-recording{
      grid-template-rows:auto 1fr;
    }

    .chat-load-more-wrap{
      display:flex;
      justify-content:center;
      padding:4px 0 8px;
    }

    .chat-load-more-btn{
      min-height:34px;
      padding:0 14px;
      border-radius:999px;
      background:var(--bg-card);
      color:var(--text-secondary);
      font:inherit;
      font-size:12px;
      transition:all 200ms ease;
    }

    .chat-load-more-btn:active{
      transform:scale(.96);
    }

    @keyframes chatThreadPulse{
      0%, 100%{ transform:scale(1); opacity:1 }
      50%{ transform:scale(.97); opacity:.82 }
    }

    @media(max-width:680px){
      .chat-thread-header, .chat-thread-search-card, .chat-thread-area, .chat-thread-input-bar{
        padding-left:20px;
        padding-right:20px;
      }
    }

    @media(max-width:430px){
      .chat-thread-avatar{ width:34px; height:34px }
      .chat-thread-status{ max-width:128px }
    }

    @media(prefers-reduced-motion:reduce){
      .chat-thread-page, .chat-icon-btn, .chat-thread-send, .chat-load-more-btn{
        animation:none;
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：handleSend 的 finally 块从 if 改成 while 循环，每次循环清空 messageQueue 再触发 AI 回复，确保排队消息全部处理完。
// 依赖：../../core/storage.js(getData,setData,getDB,getByIndexDB)；../../core/ui.js(createIcon,showToast,hideBottomSheet)；../../core/tts.js(stopAll)；./thread-render.js(renderThreadMessages)；./thread-actions.js(sendThreadMessage,stopThreadAIReply)；./thread-stickers.js(openStickerSheet,closeStickerSheet)；./thread-panels.js(openThreadToolsPanel,closeThreadPanels)；./thread-relationship.js(loadRelationshipState,getRelationshipLockLevel,getRelationshipStatusText,createRelationshipLockBar,openRelationshipLockSheet)；./thread-ai.js(checkThreadProactiveMessages)；./thread-settings.js(mountThreadSettings,unmountThreadSettings)
