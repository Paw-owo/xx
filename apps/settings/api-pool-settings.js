// apps/settings/api-pool-settings.js
// API 轮换池设置页：付费/免费分组管理、接口增删改查、测试
// imports:
//   from '../../core/api.js': getPoolGroups, setPoolGroups, getApiPoolItems, addPoolEndpoint, updatePoolEndpoint, deletePoolEndpoint, testPoolEndpoint, testAllPoolEndpoints
//   from '../chat/sensory-ear.js': testEarEndpoint（耳朵接口走 Whisper STT，不能用 chat completions 测试）
//   from '../../core/ui.js': showToast, showConfirm
//   from '../../core/storage.js': generateId, getNow

import {
  getPoolGroups,
  setPoolGroups,
  getApiPoolItems,
  addPoolEndpoint,
  updatePoolEndpoint,
  deletePoolEndpoint,
  testPoolEndpoint,
  testAllPoolEndpoints,
  fetchModelList
} from '../../core/api.js';
import { testEarEndpoint } from '../chat/sensory-ear.js';
import { showToast, showConfirm } from '../../core/ui.js';
import { generateId } from '../../core/storage.js';

let container = null;
let options = null;
let styleEl = null;
let items = [];
let groups = {};
let testingAll = false;

const STYLE_ID = 'api-pool-settings-style';

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function injectStyle() {
  if (styleEl) styleEl.remove();
  styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = `
    .api-pool-host {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .api-pool-actions {
      display: flex;
      gap: 8px;
    }

    .api-pool-actions button {
      flex: 1;
      height: 40px;
      border-radius: 14px;
      background: var(--accent);
      color: var(--bubble-user-text);
      font-size: var(--font-size-small);
      font-weight: 600;
      transition: var(--motion);
    }

    .api-pool-actions button:active {
      transform: var(--press-scale);
    }

    .api-pool-actions button.secondary {
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .api-pool-group {
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .api-pool-group-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .api-pool-group-name {
      font-size: var(--font-size-title);
      font-weight: 600;
      color: var(--text-primary);
    }

    .api-pool-group-meta {
      font-size: var(--font-size-small);
      color: var(--text-secondary);
    }

    .api-pool-toggle {
      min-width: 48px;
      height: 28px;
      border-radius: 999px;
      background: var(--surface-muted);
      position: relative;
      transition: background 200ms ease;
      flex-shrink: 0;
    }

    .api-pool-toggle.on {
      background: var(--accent);
    }

    .api-pool-toggle::after {
      content: '';
      position: absolute;
      top: 3px;
      left: 3px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: transform 200ms ease;
    }

    .api-pool-toggle.on::after {
      transform: translateX(20px);
    }

    .api-pool-endpoint {
      border-radius: 14px;
      background: var(--surface-muted);
      padding: 10px 12px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .api-pool-endpoint-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .api-pool-endpoint-name {
      font-size: var(--font-size-base);
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      flex: 1;
      min-width: 0;
    }

    .api-pool-status {
      font-size: 11px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 999px;
      flex-shrink: 0;
    }

    .api-pool-status.ok {
      background: color-mix(in srgb, var(--color-success) 18%, transparent);
      color: var(--color-success);
    }

    .api-pool-status.error {
      background: color-mix(in srgb, var(--accent) 18%, transparent);
      color: var(--accent);
    }

    .api-pool-status.idle {
      background: var(--surface-muted);
      color: var(--text-secondary);
    }

    .api-pool-status.testing {
      background: color-mix(in srgb, var(--accent) 20%, transparent);
      color: var(--accent-dark);
    }

    .api-pool-endpoint-url {
      font-size: var(--font-size-small);
      color: var(--text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .api-pool-endpoint-model {
      font-size: var(--font-size-small);
      color: var(--text-secondary);
    }

    .api-pool-endpoint-error {
      font-size: var(--font-size-small);
      color: var(--accent);
      line-height: 1.4;
      word-break: break-word;
    }

    .api-pool-endpoint-actions {
      display: flex;
      gap: 6px;
      margin-top: 4px;
    }

    .api-pool-endpoint-actions button {
      height: 30px;
      padding: 0 10px;
      border-radius: 10px;
      background: var(--bg-card);
      color: var(--text-primary);
      font-size: 12px;
      transition: var(--motion);
    }

    .api-pool-endpoint-actions button:active {
      transform: var(--press-scale);
    }

    .api-pool-endpoint-actions button.danger {
      color: var(--accent);
    }

    .api-pool-empty {
      text-align: center;
      padding: 16px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
    }

    .api-pool-form-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 10px;
    }

    .api-pool-form-field label {
      font-size: var(--font-size-small);
      color: var(--text-secondary);
      font-weight: 600;
    }

    .api-pool-form-field input,
    .api-pool-form-field textarea {
      width: 100%;
      padding: 8px 10px;
      border-radius: 12px;
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-family: inherit;
      border: none;
      outline: none;
    }

    .api-pool-form-group {
      display: flex;
      gap: 8px;
      margin-bottom: 10px;
    }

    .api-pool-form-group button {
      flex: 1;
      height: 36px;
      border-radius: 12px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 500;
      transition: var(--motion);
    }

    .api-pool-form-group button.active {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .api-pool-fetch-btn {
      align-self: flex-start;
      padding: 8px 14px;
      border-radius: var(--radius-md);
      border: 1px solid var(--accent);
      background: var(--accent-light);
      color: var(--accent-dark);
      font-size: var(--font-size-sm);
      cursor: pointer;
    }
    .api-pool-fetch-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .api-pool-model-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 4px;
    }
    .api-pool-model-chip {
      padding: 5px 10px;
      border-radius: var(--radius-md);
      border: 1px solid var(--border-soft);
      background: var(--bg-secondary);
      color: var(--text-secondary);
      font-size: var(--font-size-sm);
      cursor: pointer;
    }
    .api-pool-model-chip.active {
      border-color: var(--accent);
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    /* ═══ 感官分类区 ═══ */
    .api-pool-sensory-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 4px;
    }

    .api-pool-sensory-title {
      padding: 6px 4px 0;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .api-pool-group-add {
      width: 100%;
      height: 38px;
      border-radius: 14px;
      background: var(--accent-light);
      color: var(--accent-dark);
      font-size: var(--font-size-small);
      font-weight: 600;
      transition: var(--motion);
    }

    .api-pool-group-add:active {
      transform: var(--press-scale);
    }

    .api-pool-group-locked {
      padding: 10px 12px;
      border-radius: 12px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }
  `;
  document.head.appendChild(styleEl);
}

function removeStyle() {
  if (styleEl) {
    styleEl.remove();
    styleEl = null;
  }
}

async function loadData() {
  groups = getPoolGroups();
  items = await getApiPoolItems();
}

function renderAll() {
  if (!container) return;
  container.replaceChildren();
  // 感官分类作为独立大区放在 paid/free 之后，眼睛复用分组编辑 UI，耳朵仅占位
  container.append(renderActions(), renderGroup('paid'), renderGroup('free'), renderSensorySection());
}

function renderActions() {
  const wrap = el('div', 'api-pool-actions');
  const addBtn = el('button', '', '新增接口');
  addBtn.addEventListener('click', () => openEditor(null));
  const testAllBtn = el('button', 'secondary', testingAll ? '测试中…' : '全部测试');
  testAllBtn.disabled = testingAll;
  testAllBtn.addEventListener('click', handleTestAll);
  wrap.append(addBtn, testAllBtn);
  return wrap;
}

function renderGroup(groupType) {
  const g = groups[groupType] || {};
  const groupItems = items.filter((item) => item.groupType === groupType);
  const isSensoryEye = groupType === 'sensory_eye';
  const isSensoryEar = groupType === 'sensory_ear';

  const wrap = el('div', 'api-pool-group');

  const header = el('div', 'api-pool-group-header');
  const info = el('div');
  const defaultName = groupType === 'paid' ? '付费组' : groupType === 'free' ? '免费组' : groupType === 'sensory_eye' ? '感官-眼睛' : '感官-耳朵';
  info.append(
    el('div', 'api-pool-group-name', g.name || defaultName),
    el('div', 'api-pool-group-meta', `${groupItems.length} 个接口 · ${g.enabled !== false ? '已启用' : '已关闭'}`)
  );
  const toggle = el('button', `api-pool-toggle ${g.enabled !== false ? 'on' : ''}`);
  toggle.addEventListener('click', () => {
    const next = getPoolGroups();
    next[groupType] = { ...next[groupType], enabled: !(g.enabled !== false) };
    setPoolGroups(next);
    groups = getPoolGroups();
    renderAll();
  });
  header.append(info, toggle);
  wrap.append(header);

  if (!groupItems.length) {
    let emptyText;
    if (groupType === 'paid') {
      emptyText = '还没有付费接口，测好后存进来吧';
    } else if (groupType === 'free') {
      emptyText = '还没有免费接口，加一个试试';
    } else if (isSensoryEye) {
      emptyText = '小眼睛需要什么：一个支持图片识别的接口。可以填 Gemini、Pollinations、OpenAI-compatible 中转站或任何公益接口。Model 名按你接口的实际模型填写。';
    } else {
      emptyText = '小耳朵需要什么：一个兼容 OpenAI Whisper 格式的语音转文字接口，填 baseURL+模型名+Key 就行。';
    }
    wrap.append(el('div', 'api-pool-empty', emptyText));
  } else {
    groupItems.forEach((item) => wrap.append(renderEndpoint(item)));
  }

  // 感官分组卡片内提供独立"新增接口"入口，锁定对应分组，不走顶部全局新增
  if (isSensoryEye) {
    const addBtn = el('button', 'api-pool-group-add', '新增眼睛接口');
    addBtn.addEventListener('click', () => openEditor(null, { lockGroup: 'sensory_eye' }));
    wrap.append(addBtn);
  } else if (isSensoryEar) {
    const addBtn = el('button', 'api-pool-group-add', '新增耳朵接口');
    addBtn.addEventListener('click', () => openEditor(null, { lockGroup: 'sensory_ear' }));
    wrap.append(addBtn);
  }

  return wrap;
}

// ═══════════════════════════════════════
// 【感官分类区】眼睛、耳朵均复用分组编辑 UI，配置结构一致
//   眼睛：支持图片识别的视觉接口
//   耳朵：兼容 OpenAI Whisper 格式的语音转文字接口
// ═══════════════════════════════════════

function renderSensorySection() {
  const section = el('div', 'api-pool-sensory-section');
  section.append(el('div', 'api-pool-sensory-title', '感官'));
  section.append(renderGroup('sensory_eye'));
  section.append(renderGroup('sensory_ear'));
  return section;
}

function renderEndpoint(item) {
  const wrap = el('div', 'api-pool-endpoint');

  const head = el('div', 'api-pool-endpoint-head');
  head.append(el('div', 'api-pool-endpoint-name', item.name || '未命名接口'));

  const status = el('span', `api-pool-status ${item.status === 'active' ? 'idle' : item.status === 'error' ? 'error' : 'idle'}`);
  if (item.status === 'active' && item.lastSuccessAt) status.className = 'api-pool-status ok';
  if (item.status === 'error') status.className = 'api-pool-status error';
  status.textContent = item.status === 'error' ? '异常' : (item.lastSuccessAt ? '正常' : '待测');
  head.append(status);
  wrap.append(head);

  if (item.endpoint) wrap.append(el('div', 'api-pool-endpoint-url', item.endpoint));
  const modelText = [item.model, ...(item.models || [])].filter(Boolean)[0] || '';
  if (modelText) wrap.append(el('div', 'api-pool-endpoint-model', `模型：${modelText}`));
  if (item.lastLatencyMs > 0) wrap.append(el('div', 'api-pool-endpoint-model', `延迟：${item.lastLatencyMs}ms`));
  if (item.lastErrorMessage) wrap.append(el('div', 'api-pool-endpoint-error', item.lastErrorMessage));

  const actions = el('div', 'api-pool-endpoint-actions');
  const testBtn = el('button', '', '测试');
  // 耳朵分组走 Whisper STT 测试（发静音音频测连通），不能用 chat completions 测试
  testBtn.addEventListener('click', () => {
    if (item.groupType === 'sensory_ear') {
      handleEarTest(item.id, testBtn, status);
    } else {
      handleTest(item.id, testBtn, status);
    }
  });
  const editBtn = el('button', '', '编辑');
  // 感官分组 endpoint 编辑时锁定对应分组，不在弹层里显示分组选择
  const editOptions = item.groupType === 'sensory_eye'
    ? { lockGroup: 'sensory_eye' }
    : item.groupType === 'sensory_ear'
      ? { lockGroup: 'sensory_ear' }
      : {};
  editBtn.addEventListener('click', () => openEditor(item, editOptions));
  const delBtn = el('button', 'danger', '删除');
  delBtn.addEventListener('click', () => handleDelete(item));
  actions.append(testBtn, editBtn, delBtn);
  wrap.append(actions);

  return wrap;
}

// 耳朵接口测试：发静音音频验证连通，只测连通不测识别质量
async function handleEarTest(id, btn, statusEl) {
  const originalText = btn.textContent;
  btn.textContent = '测试中…';
  btn.disabled = true;
  statusEl.className = 'api-pool-status testing';
  statusEl.textContent = '测试中';
  try {
    const result = await testEarEndpoint(id);
    if (result.ok) {
      statusEl.className = 'api-pool-status ok';
      statusEl.textContent = '正常';
      showToast(`${result.latencyMs}ms 连接正常`);
    } else {
      statusEl.className = 'api-pool-status error';
      statusEl.textContent = '异常';
      showToast(result.message || '测试失败');
    }
  } catch (err) {
    statusEl.className = 'api-pool-status error';
    statusEl.textContent = '异常';
    showToast(String(err?.message || '测试出错'));
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

async function handleTest(id, btn, statusEl) {
  const originalText = btn.textContent;
  btn.textContent = '测试中…';
  btn.disabled = true;
  statusEl.className = 'api-pool-status testing';
  statusEl.textContent = '测试中';
  try {
    const result = await testPoolEndpoint(id);
    if (result.ok) {
      showToast(`${result.latencyMs}ms 连接正常`);
    } else {
      showToast(result.message || '测试失败');
    }
  } catch (err) {
    showToast(String(err?.message || '测试出错'));
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
    await loadData();
    renderAll();
  }
}

async function handleTestAll() {
  if (testingAll) return;
  testingAll = true;
  renderAll();
  try {
    const results = await testAllPoolEndpoints();
    const okCount = results.filter((r) => r.ok).length;
    showToast(`测试完成：${okCount}/${results.length} 正常`);
  } catch (err) {
    showToast(String(err?.message || '批量测试出错'));
  } finally {
    testingAll = false;
    await loadData();
    renderAll();
  }
}

async function handleDelete(item) {
  const ok = await showConfirm(`删除「${item.name || '未命名接口'}」？`);
  if (!ok) return;
  await deletePoolEndpoint(item.id);
  showToast('已删除');
  await loadData();
  renderAll();
  options?.onRefresh?.();
}

function openEditor(item, options = {}) {
  const isEdit = !!item;
  const lockGroup = options.lockGroup || '';
  const overlay = el('div', 'settings-sheet-overlay');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:50;display:flex;align-items:flex-end;justify-content:center;background:var(--bg-overlay);';

  const sheet = el('div', 'settings-sheet');
  sheet.style.cssText = 'width:min(100%,460px);max-height:min(80dvh, calc(var(--app-viewport-height, 100dvh) - 24px));overflow-y:auto;border-radius:var(--radius-lg) var(--radius-lg) 0 0;background:var(--bg-card);padding:16px;display:flex;flex-direction:column;gap:10px;';

  sheet.append(el('div', 'settings-group-title', isEdit ? '编辑接口' : '新增接口'));

  const nameField = createField('接口名称', item?.name || '', '未命名接口');
  const urlField = createField('API 地址', item?.endpoint || '', 'https://api.example.com/v1');
  const keyField = createField('API Key（可留空）', (item?.keys || []).join('\n'), '多个 Key 换行分隔', true);

  // 接口类型：决定拉模型/测试的鉴权方式与请求格式；不写死供应商，仅作格式分类
  const providerWrap = el('div', 'api-pool-form-field');
  providerWrap.append(el('label', '', '接口类型'));
  const providerSelect = el('select');
  providerSelect.style.cssText = 'width:100%;padding:8px 10px;border-radius:var(--radius-md);border:1px solid var(--border-soft);background:var(--bg-secondary);color:var(--text-primary);';
  [
    ['openai', '通用中转 / OpenAI 格式'],
    ['anthropic', 'Claude / Anthropic 格式'],
    ['gemini', 'Gemini 格式'],
    ['ollama', '本地 Ollama']
  ].forEach(([val, text]) => {
    const opt = el('option');
    opt.value = val;
    opt.textContent = text;
    providerSelect.append(opt);
  });
  providerSelect.value = item?.provider || 'openai';
  providerWrap.append(providerSelect);

  const modelPlaceholder = lockGroup === 'sensory_eye'
    ? '从下拉选或手输模型名'
    : lockGroup === 'sensory_ear'
      ? '例如 whisper-1 或中转站支持的语音模型名'
      : '例如 gpt-4o-mini';
  const modelField = createField('主模型', item?.model || '', modelPlaceholder);

  // 感官分组专属：模型输入框同时支持"下拉分组全部模型"和"手动输入覆盖"
  // 用 datalist 实现：input.list 指向 datalist，options 从该 endpoint 的 models 数组取
  // paid/free 分组保持现有 chip 选择 UI 不变，只在感官分组加 datalist
  if (lockGroup === 'sensory_eye' || lockGroup === 'sensory_ear') {
    const listId = 'sensory-model-list-' + Math.random().toString(36).slice(2, 8);
    modelField.input.setAttribute('list', listId);
    const datalist = el('datalist');
    datalist.id = listId;
    // 从该 endpoint 的 models 数组填充下拉选项；拉取模型后也会更新
    const fillDatalist = (models) => {
      datalist.innerHTML = '';
      (Array.isArray(models) ? models : []).forEach((m) => {
        if (!m) return;
        const opt = el('option');
        opt.value = m;
        datalist.append(opt);
      });
    };
    fillDatalist(item?.models);
    modelField.wrap.append(datalist);
    // 暴露更新函数给 fetchBtn 回调，拉取成功后刷新下拉
    modelField.refreshDatalist = fillDatalist;
  }

  // 拉取模型区域：用当前表单的地址+key+类型真实请求模型列表，成功展示可选、失败给提示且不清空手填
  let draftModels = Array.isArray(item?.models) ? item.models : [];
  const modelArea = el('div', 'api-pool-model-area');

  function renderModelPicker() {
    modelArea.innerHTML = '';
    const title = el('div', 'api-pool-group-meta', '模型列表');
    modelArea.append(title);
    if (!draftModels.length) {
      modelArea.append(el('div', 'settings-free-note', '还没拉到模型，可以直接手填模型名保存'));
      return;
    }
    const current = modelField.input.value.trim();
    const list = el('div', 'api-pool-model-list');
    draftModels.forEach((m) => {
      const chip = el('button', `api-pool-model-chip ${m === current ? 'active' : ''}`);
      chip.type = 'button';
      chip.textContent = m;
      chip.addEventListener('click', () => {
        modelField.input.value = m;
        renderModelPicker();
        showToast(`已选择：${m}`);
      });
      list.append(chip);
    });
    modelArea.append(list);
  }

  const fetchBtn = el('button', 'api-pool-fetch-btn', '拉取模型');
  fetchBtn.type = 'button';
  fetchBtn.addEventListener('click', async () => {
    const endpointValue = urlField.input.value.trim();
    const providerValue = providerSelect.value;
    const key = keyField.input.value.trim().split('\n').map((k) => k.trim()).filter(Boolean)[0] || '';

    if (!endpointValue) { showToast('先填接口地址哦'); return; }

    showToast('正在拉取模型...');
    fetchBtn.disabled = true;
    try {
      const models = await fetchModelList({ endpoint: endpointValue, apiKey: key, provider: providerValue });
      if (!models.length) {
        showToast('没找到模型，可以手填模型名保存');
        return;
      }
      draftModels = models;
      renderModelPicker();
      // 眼睛分组：同步刷新模型下拉选项，让用户能从下拉里选到刚拉到的模型
      if (typeof modelField.refreshDatalist === 'function') {
        modelField.refreshDatalist(models);
      }
      showToast(`拉到 ${models.length} 个模型啦`);
    } catch (err) {
      showToast(formatPoolEditorError(err));
    } finally {
      fetchBtn.disabled = false;
    }
  });

  renderModelPicker();

  // 分组选择：lockGroup 时锁定该分组（眼睛入口新增/编辑时锁定 sensory_eye），不渲染切换按钮
  // 否则保留原 paid/free 切换 UI，现有 paid/free 分组行为完全不变
  let selectedGroup = lockGroup || item?.groupType || 'paid';
  const groupWrap = el('div');
  groupWrap.append(el('label', 'api-pool-group-meta', '分组'));
  if (lockGroup) {
    // 只读标签：显示锁定分组名，不可切换
    const lockLabel = el('div', 'api-pool-group-locked', groups[lockGroup]?.name || lockGroup);
    groupWrap.append(lockLabel);
  } else {
    const groupBtns = el('div', 'api-pool-form-group');
    const paidBtn = el('button', selectedGroup === 'paid' ? 'active' : '', groups.paid?.name || '付费组');
    const freeBtn = el('button', selectedGroup === 'free' ? 'active' : '', groups.free?.name || '免费组');
    paidBtn.addEventListener('click', () => { selectedGroup = 'paid'; paidBtn.classList.add('active'); freeBtn.classList.remove('active'); });
    freeBtn.addEventListener('click', () => { selectedGroup = 'free'; freeBtn.classList.add('active'); paidBtn.classList.remove('active'); });
    groupBtns.append(paidBtn, freeBtn);
    groupWrap.append(groupBtns);
  }

  sheet.append(nameField.wrap, urlField.wrap, keyField.wrap, providerWrap, modelField.wrap, fetchBtn, modelArea, groupWrap);

  const btnRow = el('div', 'api-pool-actions');
  const cancelBtn = el('button', 'secondary', '取消');
  cancelBtn.addEventListener('click', () => overlay.remove());
  const saveBtn = el('button', '', '保存');
  saveBtn.addEventListener('click', async () => {
    const name = nameField.input.value.trim() || '未命名接口';
    const endpoint = urlField.input.value.trim();
    const keyText = keyField.input.value.trim();
    const keys = keyText ? keyText.split('\n').map((k) => k.trim()).filter(Boolean) : [];
    const model = modelField.input.value.trim();
    const provider = providerSelect.value;

    if (!endpoint) { showToast('请填 API 地址'); return; }

    const payload = {
      groupType: selectedGroup,
      // 按 selectedGroup 从分组元数据取名字，兼容 paid/free/sensory_eye/sensory_ear
      groupName: groups[selectedGroup]?.name || selectedGroup,
      name,
      endpoint,
      provider,
      keys,
      model,
      models: draftModels,
      source: item?.source || '',
      status: 'active'
    };

    // 眼睛分组专属：存 requestFormat 字段，供 ai-sensory-eye.js 判断请求格式
    // provider → requestFormat 映射：gemini→'gemini'，其余（openai/anthropic/ollama）→'openai'
    // paid/free 不加此字段，保持现有行为完全不变
    if (selectedGroup === 'sensory_eye') {
      payload.requestFormat = provider === 'gemini' ? 'gemini' : 'openai';
    }

    try {
      if (isEdit) {
        await updatePoolEndpoint(item.id, payload);
      } else {
        payload.id = generateId('pool');
        await addPoolEndpoint(payload);
      }
      showToast('已保存');
      overlay.remove();
      await loadData();
      renderAll();
      options?.onRefresh?.();
    } catch (err) {
      if (err?.code === 'DUPLICATE') {
        showToast('它已经在轮换池里啦，换个地址或去编辑已有的');
        return;
      }
      showToast(String(err?.message || '保存失败'));
    }
  });
  btnRow.append(cancelBtn, saveBtn);
  sheet.append(btnRow);

  overlay.append(sheet);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.append(overlay);
}

// 本地错误格式化：把网络/HTTP 错误翻成可爱提示，不泄漏 key
function formatPoolEditorError(err) {
  const msg = String(err?.message || '');
  if (/Failed to fetch|NetworkError|load failed/i.test(msg)) {
    return '连不上接口地址，检查地址或网络哦';
  }
  if (/401|unauthorized|invalid.*key/i.test(msg)) {
    return 'Key 不对或没权限拉模型，可以手填模型名继续';
  }
  return msg ? `拉取失败：${msg}` : '拉取失败，可以手填模型名继续';
}

function createField(label, value, placeholder, isTextarea) {
  const wrap = el('div', 'api-pool-form-field');
  wrap.append(el('label', '', label));
  const input = isTextarea ? el('textarea') : el('input');
  if (!isTextarea) input.type = 'text';
  input.value = value || '';
  input.placeholder = placeholder || '';
  if (isTextarea) input.rows = 2;
  wrap.append(input);
  return { wrap, input };
}

export async function mount(host, opts = {}) {
  container = host;
  options = opts;
  injectStyle();
  await loadData();
  renderAll();
}

export function unmount() {
  container = null;
  options = null;
  items = [];
  groups = {};
  testingAll = false;
  removeStyle();
}

export async function renderApiPoolSettings(opts = {}) {
  const host = el('div', 'api-pool-host settings-page');
  await mount(host, opts);
  return host;
}
