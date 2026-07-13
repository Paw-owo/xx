// apps/chat/thread-stickers.js
// imports:
//   from '../../core/storage.js': getData, setData, getAllDB, setDB, deleteDB, generateId, getNow
//   from '../../core/ui.js': showToast, showBottomSheet, hideBottomSheet
//   from './thread-actions.js': sendStickerMessage

import { getData, setData, getAllDB, setDB, deleteDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showBottomSheet, hideBottomSheet } from '../../core/ui.js';
import { sendStickerMessage } from './thread-actions.js';

// ═══════════════════════════════════════
// 【常量】
// ═══════════════════════════════════════

const MAX_FILE_SIZE = 500 * 1024;
const RECENT_KEY = 'sticker_recent_ids';
const MAX_RECENT = 30;
const STYLE_ID = 'thread-stickers-style';

// ═══════════════════════════════════════
// 【内部状态】与当前打开实例绑定，避免多实例共享/旧状态残留
// ═══════════════════════════════════════

let picker = null;

function createPicker(state, options) {
  return {
    activeState: state,
    activeOptions: options,
    currentTab: 'all',
    deleteMode: false,
    selectedIds: new Set(),
    allStickers: [],
    sheetEl: null
  };
}

function resetPicker() {
  picker = null;
}

// ═══════════════════════════════════════
// 【公开接口】打开和关闭
// ═══════════════════════════════════════

export function openStickerSheet(state, options = {}) {
  // 关闭旧实例，避免残留状态
  if (picker) closeStickerSheet();
  picker = createPicker(state, options);
  renderPicker(true);
}

export function closeStickerSheet() {
  hideBottomSheet();
  resetPicker();
}

// ═══════════════════════════════════════
// 【主渲染】构建整个抽屉
// ═══════════════════════════════════════

async function renderPicker(isNew = false) {
  ensureStyle();
  if (!picker) return;
  picker.allStickers = await loadStickers();

  if (!isNew) {
    refreshUI();
    return;
  }

  const sheet = el('div', 'ss-sheet');

  sheet.appendChild(createSearchBar());
  sheet.appendChild(createTabBar());
  sheet.appendChild(createGridArea());

  picker.sheetEl = sheet;
  showBottomSheet(sheet);
  renderDeleteBar();
}

function refreshUI() {
  if (!picker || !picker.sheetEl || !picker.sheetEl.isConnected) return;

  syncTabButtons();

  // 基于当前实例容器查询，避免多弹层时命中错误的 .ss-grid-area
  const area = picker.sheetEl.querySelector('.ss-grid-area');
  if (area) renderGridContent(area);

  renderDeleteBar();
}

// ═══════════════════════════════════════
// 【搜索栏】
// ═══════════════════════════════════════

function createSearchBar() {
  const wrap = el('div', 'ss-search');

  const icon = createSvgIcon([
    ['circle', { cx: '11', cy: '11', r: '6' }],
    ['path', { d: 'M15.5 15.5L20 20' }]
  ]);

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ss-search-input';
  input.placeholder = '搜索表情包';
  input.autocomplete = 'off';
  input.spellcheck = false;

  input.addEventListener('input', () => {
    if (!picker || !picker.sheetEl) return;
    // 基于当前实例容器查询
    const area = picker.sheetEl.querySelector('.ss-grid-area');
    if (area) renderGridContent(area);
  });

  wrap.append(icon, input);
  return wrap;
}

// ═══════════════════════════════════════
// 【标签栏】最近 / 删除 / 批量添加
// ═══════════════════════════════════════

function createTabBar() {
  const bar = el('div', 'ss-tab-bar');

  const recentBtn = createTabButton('最近', picker?.currentTab === 'recent');
  recentBtn.addEventListener('click', () => {
    if (!picker) return;
    picker.currentTab = picker.currentTab === 'recent' ? 'all' : 'recent';
    picker.deleteMode = false;
    picker.selectedIds = new Set();
    renderPicker(false);
  });

  const deleteBtn = createTabButton('删除', picker?.deleteMode);
  deleteBtn.addEventListener('click', () => {
    if (!picker) return;
    picker.currentTab = 'all';
    picker.deleteMode = !picker.deleteMode;
    picker.selectedIds = new Set();
    renderPicker(false);
  });

  const bulkBtn = createTabButton('批量添加', false);
  bulkBtn.addEventListener('click', () => openBulkPicker());

  bar.append(recentBtn, deleteBtn, bulkBtn);
  return bar;
}

function createTabButton(text, isActive) {
  const btn = el('button', `ss-tab-btn${isActive ? ' is-active' : ''}`, text);
  btn.type = 'button';
  return btn;
}

function syncTabButtons() {
  if (!picker || !picker.sheetEl) return;
  // 基于当前实例容器查询
  const btns = picker.sheetEl.querySelectorAll('.ss-tab-btn');
  if (btns[0]) btns[0].classList.toggle('is-active', picker.currentTab === 'recent');
  if (btns[1]) btns[1].classList.toggle('is-active', picker.deleteMode);
}

// ═══════════════════════════════════════
// 【网格区域】5列 + 首格+号
// ═══════════════════════════════════════

function createGridArea() {
  const area = el('div', 'ss-grid-area');
  renderGridContent(area);
  return area;
}

function renderGridContent(area) {
  if (!area || !picker) return;
  area.replaceChildren();

  const filtered = getFilteredStickers();

  // +号始终在第一格
  area.appendChild(createAddCell());

  filtered.forEach((sticker) => {
    area.appendChild(createStickerCell(sticker));
  });

  if (!filtered.length && picker.allStickers.length) {
    area.appendChild(el('div', 'ss-grid-hint', '没有找到匹配的表情包'));
  }

  if (!picker.allStickers.length) {
    area.appendChild(el('div', 'ss-grid-hint', '还没有表情包，点 + 上传吧'));
  }
}

// ───────────────────
// +号添加格
// ───────────────────

function createAddCell() {
  const cell = el('button', 'ss-cell ss-cell-add');
  cell.type = 'button';
  cell.setAttribute('aria-label', '添加表情包');

  const icon = createSvgIcon([
    ['path', { d: 'M12 5v14' }],
    ['path', { d: 'M5 12h14' }]
  ], 20);

  cell.appendChild(icon);
  cell.addEventListener('click', (event) => {
    event.stopPropagation();
    openSinglePicker();
  });

  return cell;
}

// ───────────────────
// 单个表情包格
// ───────────────────

function createStickerCell(sticker) {
  const cell = el('div', 'ss-cell');

  const img = document.createElement('img');
  img.src = sticker.imageBase64 || '';
  img.alt = sticker.description || sticker.name || '';
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    img.style.display = 'none';
    cell.classList.add('is-broken');
  });
  cell.appendChild(img);

  if (picker?.deleteMode) {
    cell.classList.add('is-deletable');
    const isChecked = picker.selectedIds.has(sticker.id);
    if (isChecked) cell.classList.add('is-selected');

    const check = el('div', `ss-cell-check${isChecked ? ' is-checked' : ''}`);
    check.appendChild(createSvgIcon([
      ['path', { d: 'M5 12.5l4 4L19 6.5' }]
    ], 11, '2.5'));
    cell.appendChild(check);

    cell.appendChild(el('div', 'ss-cell-overlay'));

    cell.addEventListener('click', (event) => {
      event.stopPropagation();
      if (!picker) return;
      if (picker.selectedIds.has(sticker.id)) {
        picker.selectedIds.delete(sticker.id);
      } else {
        picker.selectedIds.add(sticker.id);
      }
      renderPicker(false);
    });
  } else {
    cell.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!picker || !picker.activeState) return;

      // 保存到局部变量，防止 await 期间 picker 被重置
      const currentPicker = picker;
      trackRecent(sticker.id);
      hideBottomSheet();

      try {
        await sendStickerMessage(currentPicker.activeState, sticker.id);
      } catch (_) {
        showToast('发送失败');
      }

      currentPicker.activeOptions?.onRefresh?.();
      resetPicker();
    });
  }

  return cell;
}

// ═══════════════════════════════════════
// 【删除底栏】显示已选数量和删除按钮
// ═══════════════════════════════════════

function renderDeleteBar() {
  if (!picker || !picker.sheetEl) return;
  // 基于当前实例容器查询
  const sheet = picker.sheetEl;

  const old = sheet.querySelector('.ss-delete-bar');
  if (old) old.remove();

  if (!picker.deleteMode) return;

  const bar = el('div', 'ss-delete-bar');
  const count = picker.selectedIds.size;

  const delBtn = el('button', `ss-delete-btn${count ? '' : ' is-disabled'}`, count ? `删除 (${count})` : '删除');
  delBtn.type = 'button';
  delBtn.disabled = !count;

  delBtn.addEventListener('click', async () => {
    if (!picker || !picker.selectedIds.size) return;

    const ok = await showLocalConfirm(`确定删除 ${picker.selectedIds.size} 个表情包？`);
    if (!ok) return;

    // 删除期间 picker 可能被关闭，先保存待删 id 列表
    const idsToDelete = Array.from(picker.selectedIds);
    let deleted = 0;
    let failed = 0;

    for (const id of idsToDelete) {
      try {
        await deleteDB('stickers', id);
        deleted++;
      } catch (error) {
        failed++;
        console.warn('[thread-stickers] delete sticker failed', id, error);
      }
    }

    const recent = getRecentIds().filter((id) => !idsToDelete.includes(id));
    setData(RECENT_KEY, recent);

    if (failed > 0) {
      showToast(failed === idsToDelete.length ? '没删掉，再试一次' : `删了 ${deleted} 个，${failed} 个没删掉`);
    } else {
      showToast(`删掉了 ${deleted} 个`);
    }

    // picker 可能在 await 期间被关闭，仍存活才刷新
    if (picker) {
      picker.selectedIds = new Set();
      picker.allStickers = await loadStickers();
      renderPicker(true);
    }
  });

  bar.appendChild(delBtn);
  sheet.appendChild(bar);
}

// ═══════════════════════════════════════
// 【单张上传】选图 → 描述 → 保存
// ═══════════════════════════════════════

function openSinglePicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/webp';
  // 部分浏览器要求 input 挂载到 DOM 才能稳定触发 change；用最小可见度挂载，用后清理
  input.style.position = 'fixed';
  input.style.top = '-9999px';
  input.style.opacity = '0';
  document.body.appendChild(input);

  const cleanup = () => {
    input.value = '';
    if (input.parentNode) input.parentNode.removeChild(input);
  };

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) {
      cleanup();
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      showToast('图片太大了，换张小一点的');
      cleanup();
      return;
    }

    try {
      const base64 = await readFileAsBase64(file);
      cleanup();
      showUploadSheet(base64);
    } catch (_) {
      showToast('图片读取失败');
      cleanup();
    }
  });

  input.click();
}

function showUploadSheet(base64) {
  const sheet = el('div', 'ss-upload-sheet');

  const head = el('div', 'ss-upload-head');

  const backBtn = el('button', 'ss-upload-back');
  backBtn.type = 'button';
  backBtn.appendChild(createSvgIcon([['path', { d: 'm15 18-6-6 6-6' }]]));
  backBtn.addEventListener('click', () => renderPicker(true));

  head.append(backBtn, el('div', 'ss-upload-title', '添加表情包'));
  sheet.appendChild(head);

  const preview = el('div', 'ss-upload-preview');
  const img = document.createElement('img');
  img.src = base64;
  img.alt = '';
  preview.appendChild(img);
  sheet.appendChild(preview);

  const desc = document.createElement('input');
  desc.type = 'text';
  desc.className = 'ss-upload-desc';
  desc.placeholder = '描述一下，AI 会看懂它';
  desc.maxLength = 120;
  desc.autocomplete = 'off';
  sheet.appendChild(desc);

  const saveBtn = el('button', 'ss-upload-save', '保存');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', async () => {
    const now = getNow();
    await setDB('stickers', {
      id: generateId('sticker'),
      imageBase64: base64,
      description: desc.value.trim() || '',
      name: desc.value.trim() || '表情包',
      createdAt: now,
      updatedAt: now
    });

    showToast('上传好啦');
    if (picker) {
      picker.allStickers = await loadStickers();
      renderPicker(true);
    }
  });

  sheet.appendChild(saveBtn);
  showBottomSheet(sheet);
  requestAnimationFrame(() => desc.focus());
}

// ═══════════════════════════════════════
// 【批量上传】多选图片一次性保存
// ═══════════════════════════════════════

function openBulkPicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/webp';
  input.multiple = true;
  // 部分浏览器要求 input 挂载到 DOM 才能稳定触发 change；用最小可见度挂载，用后清理
  input.style.position = 'fixed';
  input.style.top = '-9999px';
  input.style.opacity = '0';
  document.body.appendChild(input);

  const cleanup = () => {
    input.value = '';
    if (input.parentNode) input.parentNode.removeChild(input);
  };

  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    if (!files.length) {
      cleanup();
      return;
    }

    const valid = files.filter((f) => f.size <= MAX_FILE_SIZE);
    if (valid.length < files.length) {
      showToast(`${files.length - valid.length} 张太大，已跳过`);
    }
    if (!valid.length) {
      cleanup();
      return;
    }

    showToast(`正在保存 ${valid.length} 张...`);

    let saved = 0;
    let failed = 0;
    for (const file of valid) {
      try {
        const base64 = await readFileAsBase64(file);
        const now = getNow();
        await setDB('stickers', {
          id: generateId('sticker'),
          imageBase64: base64,
          description: '',
          name: file.name || '表情包',
          createdAt: now,
          updatedAt: now
        });
        saved++;
      } catch (error) {
        failed++;
        console.warn('[thread-stickers] bulk save sticker failed', file.name, error);
      }
    }

    cleanup();

    if (failed > 0) {
      showToast(saved > 0 ? `保存了 ${saved} 个，${failed} 个失败` : '保存失败了，再试一次');
    } else {
      showToast(`保存了 ${saved} 个`);
    }

    if (picker) {
      picker.allStickers = await loadStickers();
      renderPicker(true);
    }
  });

  input.click();
}

// ═══════════════════════════════════════
// 【筛选】搜索词 + 最近tab
// ═══════════════════════════════════════

function getFilteredStickers() {
  if (!picker) return [];
  let list = [...picker.allStickers];

  if (picker.currentTab === 'recent') {
    const recentIds = getRecentIds();
    const map = new Map(list.map((s) => [s.id, s]));
    list = recentIds.map((id) => map.get(id)).filter(Boolean);
  }

  // 基于当前实例容器查询搜索框
  const input = picker.sheetEl?.querySelector('.ss-search-input');
  const query = (input?.value || '').trim().toLowerCase();

  if (query) {
    list = list.filter((s) => {
      const text = String(s.description || s.name || '').toLowerCase();
      return text.includes(query);
    });
  }

  return list;
}

// ═══════════════════════════════════════
// 【最近记录】
// ═══════════════════════════════════════

function getRecentIds() {
  const raw = getData(RECENT_KEY);
  return Array.isArray(raw) ? raw : [];
}

function trackRecent(stickerId) {
  if (!stickerId) return;
  const recent = getRecentIds().filter((id) => id !== stickerId);
  recent.unshift(stickerId);
  setData(RECENT_KEY, recent.slice(0, MAX_RECENT));
}

// ═══════════════════════════════════════
// 【数据】加载全部表情包
// ═══════════════════════════════════════

async function loadStickers() {
  const list = await getAllDB('stickers').catch(() => []);
  return (Array.isArray(list) ? list.filter(Boolean) : [])
    .sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')));
}

// ═══════════════════════════════════════
// 【文件读取】File → base64
// ═══════════════════════════════════════

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════
// 【确认弹窗】删除前二次确认
// ═══════════════════════════════════════

function showLocalConfirm(message) {
  return new Promise((resolve) => {
    const backdrop = el('div', 'ss-confirm-backdrop');

    const card = el('div', 'ss-confirm-card');
    card.append(el('div', 'ss-confirm-text', message));

    const actions = el('div', 'ss-confirm-actions');

    // 只关闭一次：resolved 标志防止 ESC / overlay / 按钮重复触发
    let resolved = false;
    const close = (value) => {
      if (resolved) return;
      resolved = true;
      backdrop.classList.remove('is-open');
      document.removeEventListener('keydown', onKeydown);
      window.setTimeout(() => {
        if (backdrop.parentNode) backdrop.remove();
      }, 220);
      resolve(value);
    };

    const cancel = el('button', 'ss-confirm-cancel', '取消');
    cancel.type = 'button';
    cancel.addEventListener('click', () => close(false));

    const ok = el('button', 'ss-confirm-ok', '确定删除');
    ok.type = 'button';
    ok.addEventListener('click', () => close(true));

    // ESC 关闭
    const onKeydown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(false);
      }
    };

    // overlay 点击关闭（点击 backdrop 空白处，不点 card）
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop) close(false);
    });

    document.addEventListener('keydown', onKeydown);

    actions.append(cancel, ok);
    card.appendChild(actions);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    requestAnimationFrame(() => backdrop.classList.add('is-open'));
  });
}

// ═══════════════════════════════════════
// 【SVG图标工具】统一创建SVG图标
// ═══════════════════════════════════════

function createSvgIcon(paths, size = 15, strokeWidth = '1.5') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', strokeWidth);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  paths.forEach(([tag, attrs]) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
    svg.appendChild(node);
  });

  return svg;
}

// ═══════════════════════════════════════
// 【DOM工具】
// ═══════════════════════════════════════

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【样式】微信风格表情包抽屉
// ═══════════════════════════════════════

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* ── 主容器 ── */

    .ss-sheet {
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: min(52vh, 400px);
    }

    /* ── 搜索栏 ── */

    .ss-search {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 8px;
      height: 36px;
      padding: 0 12px;
      border-radius: 14px;
      background: var(--surface-muted);
      color: var(--text-hint);
      flex-shrink: 0;
    }

    .ss-search-input {
      width: 100%;
      height: 100%;
      background: transparent;
      color: var(--text-primary);
      font: inherit;
      font-size: 14px;
      line-height: 1;
      padding: 0;
      outline: none;
    }

    .ss-search-input::placeholder {
      color: var(--text-hint);
    }

    /* ── 标签栏 ── */

    .ss-tab-bar {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    .ss-tab-btn {
      height: 30px;
      padding: 0 14px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 12px;
      font-weight: 500;
      transition: all 180ms ease;
      white-space: nowrap;
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
    }

    .ss-tab-btn:active {
      transform: scale(0.95);
    }

    .ss-tab-btn.is-active {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    /* ── 网格区域（5列，上下滑动） ── */

    .ss-grid-area {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 8px;
      align-content: start;
      padding: 2px 0 4px;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }

    /* ── 单个格子（正方形，圆角，柔和阴影） ── */

    .ss-cell {
      aspect-ratio: 1 / 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
      cursor: pointer;
      transition: all 160ms ease;
      position: relative;
      -webkit-tap-highlight-color: transparent;
    }

    .ss-cell:active {
      transform: scale(0.92);
    }

    .ss-cell img {
      width: 78%;
      height: 78%;
      object-fit: contain;
      pointer-events: none;
    }

    .ss-cell.is-broken {
      background: var(--surface-muted);
    }

    .ss-cell.is-broken::after {
      content: 'x';
      font-size: 14px;
      color: var(--text-hint);
      opacity: 0.4;
    }

    /* ── + 号添加格 ── */

    .ss-cell-add {
      background: var(--surface-muted);
      box-shadow: none;
      color: var(--text-secondary);
      opacity: 0.5;
      transition: all 160ms ease;
    }

    .ss-cell-add:active {
      opacity: 0.8;
      transform: scale(0.92);
    }

    .ss-cell-add svg {
      pointer-events: none;
    }

    /* ── 删除模式 ── */

    .ss-cell.is-deletable {
      cursor: pointer;
    }

    .ss-cell-overlay {
      position: absolute;
      inset: 0;
      border-radius: 16px;
      background: transparent;
      pointer-events: none;
      transition: background 160ms ease;
    }

    .ss-cell.is-selected .ss-cell-overlay {
      background: color-mix(in srgb, var(--accent) 14%, transparent);
    }

    .ss-cell-check {
      position: absolute;
      top: 4px;
      left: 4px;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      color: var(--text-hint);
      z-index: 2;
      opacity: 0.5;
      transition: all 160ms ease;
    }

    .ss-cell-check.is-checked {
      background: var(--accent);
      color: var(--bubble-user-text);
      opacity: 1;
    }

    /* ── 删除底栏 ── */

    .ss-delete-bar {
      display: flex;
      justify-content: center;
      padding-top: 4px;
      flex-shrink: 0;
    }

    .ss-delete-btn {
      min-height: 36px;
      padding: 0 28px;
      border-radius: 999px;
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      transition: all 160ms ease;
    }

    .ss-delete-btn:active {
      transform: scale(0.96);
    }

    .ss-delete-btn.is-disabled {
      opacity: 0.35;
      pointer-events: none;
    }

    /* ── 提示文字 ── */

    .ss-grid-hint {
      grid-column: 1 / -1;
      text-align: center;
      padding: 40px 0;
      color: var(--text-hint);
      font-size: 13px;
    }

    /* ── 上传页 ── */

    .ss-upload-sheet {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 200px;
    }

    .ss-upload-head {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .ss-upload-back {
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 12px;
      background: var(--surface-muted);
      color: var(--text-primary);
      padding: 0;
      transition: all 160ms ease;
      flex-shrink: 0;
    }

    .ss-upload-back:active {
      transform: scale(0.92);
    }

    .ss-upload-title {
      color: var(--text-primary);
      font-size: 17px;
      font-weight: 600;
      line-height: 1.35;
    }

    .ss-upload-preview {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px 0;
    }

    .ss-upload-preview img {
      max-width: 160px;
      max-height: 160px;
      border-radius: 18px;
      box-shadow: var(--shadow-card);
      object-fit: contain;
    }

    .ss-upload-desc {
      width: 100%;
      height: 42px;
      padding: 0 14px;
      border-radius: 14px;
      background: var(--surface-muted);
      color: var(--text-primary);
      font: inherit;
      font-size: 14px;
      line-height: 42px;
      outline: none;
    }

    .ss-upload-desc::placeholder {
      color: var(--text-hint);
    }

    .ss-upload-save {
      min-height: 42px;
      border-radius: 16px;
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      transition: all 160ms ease;
    }

    .ss-upload-save:active {
      transform: scale(0.96);
    }

    /* ── 确认弹窗 ── */

    .ss-confirm-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10030;
      display: flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--bg-primary) 60%, transparent);
      backdrop-filter: blur(6px);
      opacity: 0;
      pointer-events: none;
      transition: opacity 200ms ease;
      padding: 24px;
    }

    .ss-confirm-backdrop.is-open {
      opacity: 1;
      pointer-events: auto;
    }

    .ss-confirm-card {
      width: min(280px, calc(100vw - 48px));
      padding: 22px 20px 18px;
      border-radius: 24px;
      background: var(--bg-card);
      box-shadow: var(--shadow-float);
      transform: scale(0.95) translateY(8px);
      transition: transform 200ms ease;
    }

    .ss-confirm-backdrop.is-open .ss-confirm-card {
      transform: scale(1) translateY(0);
    }

    .ss-confirm-text {
      color: var(--text-primary);
      font-size: 15px;
      line-height: 1.6;
      text-align: center;
      margin-bottom: 20px;
    }

    .ss-confirm-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .ss-confirm-cancel,
    .ss-confirm-ok {
      min-height: 38px;
      border-radius: 999px;
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      transition: all 160ms ease;
    }

    .ss-confirm-cancel {
      background: var(--surface-muted);
      color: var(--text-secondary);
    }

    .ss-confirm-ok {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .ss-confirm-cancel:active,
    .ss-confirm-ok:active {
      transform: scale(0.96);
    }

    /* ── 响应式 ── */

    @media (max-width: 380px) {
      .ss-grid-area {
        gap: 6px;
      }

      .ss-tab-btn {
        height: 28px;
        padding: 0 10px;
        font-size: 11px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ss-cell,
      .ss-tab-btn,
      .ss-delete-btn,
      .ss-upload-back,
      .ss-upload-save,
      .ss-confirm-backdrop,
      .ss-confirm-card,
      .ss-confirm-cancel,
      .ss-confirm-ok {
        transition: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/storage.js(getData,setData,getAllDB,setDB,deleteDB,generateId,getNow)；../../core/ui.js(showToast,showBottomSheet,hideBottomSheet)；./thread-actions.js(sendStickerMessage)
