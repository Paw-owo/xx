// apps/settings/tts-settings.js
// TTS 语音合成设置页（真实可用版）
// 读写 app_settings.ttsGlobal，复用 core/tts.js 的 playTTS 试听，不另造配置结构
// imports:
//   from '../../core/ui.js': createIcon, showToast
//   from '../../core/storage.js': getData, setData
//   from '../../core/tts.js': playTTS, stopAll

import { createIcon, showToast } from '../../core/ui.js';
import { getData, setData } from '../../core/storage.js';
import { playTTS, stopAll } from '../../core/tts.js';

const STYLE_ID = 'tts-settings-style';
const SETTINGS_KEY = 'app_settings';

const PROVIDER_OPTIONS = [
  { value: 'browser', label: '浏览器自带', hint: '用系统语音，免配置免 key' },
  { value: 'openai', label: 'OpenAI 兼容', hint: 'tts-1 / tts-1-hd，需 endpoint + key' },
  { value: 'elevenlabs', label: 'ElevenLabs', hint: '需 endpoint + xi-api-key' },
  { value: 'azure', label: 'Azure TTS', hint: '需 endpoint + Ocp-Apim-Subscription-Key' },
  { value: 'custom', label: '自定义中转', hint: 'OpenAI 兼容格式，自定义 endpoint' }
];

const DEFAULT_TTS = {
  provider: 'browser',
  apiKey: '',
  endpoint: '',
  voice: '',
  model: '',
  modelList: []
};

let container = null;
let options = null;
let styleEl = null;
let browserVoices = [];

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  if (!styleEl) styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = `
    .tts-settings-host {
      padding: 4px 0 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .tts-settings-section {
      padding: 16px;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .tts-settings-section-title {
      margin: 0;
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.4;
    }
    .tts-settings-section-sub {
      margin: 0;
      color: var(--text-hint);
      font-size: var(--font-size-sm);
      line-height: 1.5;
    }
    .tts-settings-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .tts-settings-label {
      color: var(--text-secondary);
      font-size: var(--font-size-sm);
      font-weight: 500;
    }
    .tts-settings-input,
    .tts-settings-select {
      width: 100%;
      padding: 10px 12px;
      border-radius: var(--radius-md);
      border: 1px solid color-mix(in srgb, var(--text-hint) 20%, transparent);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-family: inherit;
      outline: none;
      transition: var(--motion);
    }
    .tts-settings-input:focus,
    .tts-settings-select:focus {
      border-color: var(--accent);
    }
    .tts-settings-select {
      appearance: none;
      -webkit-appearance: none;
      background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'><polyline points='6 9 12 15 18 9'/></svg>");
      background-repeat: no-repeat;
      background-position: right 12px center;
      padding-right: 32px;
    }
    .tts-settings-provider-grid {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .tts-settings-provider-card {
      padding: 12px 14px;
      border-radius: var(--radius-md);
      border: 1px solid color-mix(in srgb, var(--text-hint) 15%, transparent);
      background: var(--bg-secondary);
      cursor: pointer;
      transition: var(--motion);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .tts-settings-provider-card.active {
      border-color: var(--accent);
      background: var(--accent-light);
    }
    .tts-settings-provider-name {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
    }
    .tts-settings-provider-hint {
      color: var(--text-hint);
      font-size: var(--font-size-sm);
      line-height: 1.4;
    }
    .tts-settings-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .tts-settings-btn {
      flex: 1 1 auto;
      padding: 10px 16px;
      border-radius: var(--radius-md);
      border: none;
      background: var(--accent);
      color: var(--bg-card);
      font-size: var(--font-size-base);
      font-weight: 500;
      font-family: inherit;
      cursor: pointer;
      transition: var(--motion);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
    }
    .tts-settings-btn:active { transform: scale(0.98); }
    .tts-settings-btn.secondary {
      background: var(--bg-secondary);
      color: var(--text-primary);
      border: 1px solid color-mix(in srgb, var(--text-hint) 20%, transparent);
    }
    .tts-settings-back-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: var(--radius-md);
      background: var(--bg-card);
      color: var(--text-primary);
      border: 1px solid color-mix(in srgb, var(--text-hint) 15%, transparent);
      font-size: var(--font-size-sm);
      cursor: pointer;
    }
    .tts-settings-hint-box {
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      background: var(--bg-secondary);
      color: var(--text-hint);
      font-size: var(--font-size-sm);
      line-height: 1.5;
    }
  `;
  document.head.appendChild(styleEl);
}

function removeStyle() {
  if (styleEl && styleEl.parentNode) {
    styleEl.parentNode.removeChild(styleEl);
  }
  styleEl = null;
}

// 读取当前 TTS 配置（合并默认值）
function readTtsConfig() {
  const settings = getData(SETTINGS_KEY) || {};
  const ttsGlobal = settings.ttsGlobal || {};
  return { ...DEFAULT_TTS, ...ttsGlobal };
}

// 写入 TTS 配置到 app_settings.ttsGlobal
function writeTtsConfig(config) {
  const settings = getData(SETTINGS_KEY) || {};
  settings.ttsGlobal = config;
  setData(SETTINGS_KEY, settings);
  window.dispatchEvent(new CustomEvent('app-settings-updated'));
}

// 读取浏览器可用音色
function loadBrowserVoices() {
  if (!('speechSynthesis' in window)) return [];
  try {
    browserVoices = window.speechSynthesis.getVoices() || [];
  } catch (_) {
    browserVoices = [];
  }
  return browserVoices;
}

// 把配置里的 provider 规范成 UI 用的 provider
// core/tts.js 里 provider 为空 + 无 endpoint 时回退浏览器，UI 用 'browser' 表示
function normalizeProviderForUi(config) {
  const p = String(config.provider || '').toLowerCase();
  if (p === 'openai' || p === 'elevenlabs' || p === 'azure' || p === 'custom') return p;
  return 'browser';
}

function renderBackButton() {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'tts-settings-back-btn';
  btn.appendChild(createIcon('back', 16));
  const label = document.createElement('span');
  label.textContent = '返回';
  btn.appendChild(label);
  btn.addEventListener('click', () => {
    if (options && typeof options.onBack === 'function') options.onBack();
  });
  return btn;
}

// 渲染提供方选择卡片
function renderProviderSection(config, onChange) {
  const section = document.createElement('div');
  section.className = 'tts-settings-section';

  const title = document.createElement('h3');
  title.className = 'tts-settings-section-title';
  title.textContent = '提供方';
  const sub = document.createElement('p');
  sub.className = 'tts-settings-section-sub';
  sub.textContent = '选一个语音来源，浏览器自带免配置';

  section.append(title, sub);

  const grid = document.createElement('div');
  grid.className = 'tts-settings-provider-grid';

  const currentProvider = normalizeProviderForUi(config);

  PROVIDER_OPTIONS.forEach((opt) => {
    const card = document.createElement('div');
    card.className = `tts-settings-provider-card ${opt.value === currentProvider ? 'active' : ''}`;

    const name = document.createElement('div');
    name.className = 'tts-settings-provider-name';
    name.textContent = opt.label;

    const hint = document.createElement('div');
    hint.className = 'tts-settings-provider-hint';
    hint.textContent = opt.hint;

    card.append(name, hint);
    card.addEventListener('click', () => {
      // browser → 清空 endpoint/apiKey，core/tts.js 自动回退 Web Speech
      if (opt.value === 'browser') {
        onChange({ provider: 'browser', apiKey: '', endpoint: '', voice: '' });
      } else {
        onChange({ provider: opt.value });
      }
    });
    grid.appendChild(card);
  });

  section.appendChild(grid);
  return section;
}

// 渲染云端配置字段（provider 非 browser 时显示）
function renderCloudConfigSection(config, onChange) {
  const provider = normalizeProviderForUi(config);
  if (provider === 'browser') return null;

  const section = document.createElement('div');
  section.className = 'tts-settings-section';

  const title = document.createElement('h3');
  title.className = 'tts-settings-section-title';
  title.textContent = '云端配置';
  const sub = document.createElement('p');
  sub.className = 'tts-settings-section-sub';
  sub.textContent = '填好地址和密钥才能用云端语音';
  section.append(title, sub);

  // endpoint
  const endpointRow = document.createElement('div');
  endpointRow.className = 'tts-settings-row';
  const endpointLabel = document.createElement('span');
  endpointLabel.className = 'tts-settings-label';
  endpointLabel.textContent = '服务器地址';
  const endpointInput = document.createElement('input');
  endpointInput.className = 'tts-settings-input';
  endpointInput.type = 'text';
  endpointInput.value = config.endpoint || '';
  endpointInput.placeholder = 'https://api.example.com';
  endpointInput.addEventListener('change', () => {
    onChange({ endpoint: endpointInput.value.trim() });
  });
  endpointRow.append(endpointLabel, endpointInput);

  // apiKey
  const apiKeyRow = document.createElement('div');
  apiKeyRow.className = 'tts-settings-row';
  const apiKeyLabel = document.createElement('span');
  apiKeyLabel.className = 'tts-settings-label';
  apiKeyLabel.textContent = 'API Key';
  const apiKeyInput = document.createElement('input');
  apiKeyInput.className = 'tts-settings-input';
  apiKeyInput.type = 'password';
  apiKeyInput.value = config.apiKey || '';
  apiKeyInput.placeholder = '只存在本地，不会导出';
  apiKeyInput.addEventListener('change', () => {
    onChange({ apiKey: apiKeyInput.value.trim() });
  });
  apiKeyRow.append(apiKeyLabel, apiKeyInput);

  section.append(endpointRow, apiKeyRow);
  return section;
}

// 渲染音色选择
function renderVoiceSection(config, onChange) {
  const section = document.createElement('div');
  section.className = 'tts-settings-section';

  const title = document.createElement('h3');
  title.className = 'tts-settings-section-title';
  title.textContent = '音色';
  const sub = document.createElement('p');
  sub.className = 'tts-settings-section-sub';
  sub.textContent = '选一个喜欢的声音';
  section.append(title, sub);

  const provider = normalizeProviderForUi(config);

  if (provider === 'browser') {
    // 浏览器音色列表
    if (!browserVoices.length) {
      loadBrowserVoices();
    }

    const row = document.createElement('div');
    row.className = 'tts-settings-row';
    const label = document.createElement('span');
    label.className = 'tts-settings-label';
    label.textContent = '浏览器音色';
    const select = document.createElement('select');
    select.className = 'tts-settings-select';

    if (!browserVoices.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '当前浏览器没有可用音色';
      select.appendChild(opt);
    } else {
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = '默认音色';
      select.appendChild(defaultOpt);
      browserVoices.forEach((v) => {
        const opt = document.createElement('option');
        opt.value = v.name || v.voiceURI || '';
        opt.textContent = `${v.name || '未命名'} ${v.lang ? '(' + v.lang + ')' : ''}`;
        select.appendChild(opt);
      });
      select.value = config.voice || '';
    }

    select.addEventListener('change', () => {
      onChange({ voice: select.value });
    });

    row.append(label, select);
    section.appendChild(row);

    // 提示音色可能异步加载
    if (!browserVoices.length) {
      const hint = document.createElement('div');
      hint.className = 'tts-settings-hint-box';
      hint.textContent = '浏览器音色有时要等一会儿才加载出来，过几秒回来重进也能看到';
      section.appendChild(hint);
    }
  } else {
    // 云端音色：手填音色名/ID
    const row = document.createElement('div');
    row.className = 'tts-settings-row';
    const label = document.createElement('span');
    label.className = 'tts-settings-label';
    label.textContent = provider === 'elevenlabs' ? '音色 ID (voice_id)' : '音色名';
    const input = document.createElement('input');
    input.className = 'tts-settings-input';
    input.type = 'text';
    input.value = config.voice || '';
    if (provider === 'openai') {
      input.placeholder = 'alloy / echo / fable / onyx / nova / shimmer';
    } else if (provider === 'azure') {
      input.placeholder = 'zh-CN-XiaoxiaoNeural';
    } else {
      input.placeholder = '填音色 ID 或名称';
    }
    input.addEventListener('change', () => {
      onChange({ voice: input.value.trim() });
    });
    row.append(label, input);
    section.appendChild(row);

    // model（openai/elevenlabs 有 model 概念）
    if (provider === 'openai' || provider === 'elevenlabs') {
      const modelRow = document.createElement('div');
      modelRow.className = 'tts-settings-row';
      const modelLabel = document.createElement('span');
      modelLabel.className = 'tts-settings-label';
      modelLabel.textContent = '模型';
      const modelInput = document.createElement('input');
      modelInput.className = 'tts-settings-input';
      modelInput.type = 'text';
      modelInput.value = config.model || '';
      modelInput.placeholder = provider === 'openai' ? 'tts-1 / tts-1-hd' : 'eleven_multilingual_v2';
      modelInput.addEventListener('change', () => {
        onChange({ model: modelInput.value.trim() });
      });
      modelRow.append(modelLabel, modelInput);
      section.appendChild(modelRow);
    }
  }

  return section;
}

// 渲染试听 + 保存按钮
function renderActionsSection(config) {
  const section = document.createElement('div');
  section.className = 'tts-settings-section';

  const actions = document.createElement('div');
  actions.className = 'tts-settings-actions';

  // 试听按钮
  const previewBtn = document.createElement('button');
  previewBtn.type = 'button';
  previewBtn.className = 'tts-settings-btn secondary';
  previewBtn.appendChild(createIcon('play', 16));
  const previewLabel = document.createElement('span');
  previewLabel.textContent = '试听一句';
  previewBtn.appendChild(previewLabel);

  previewBtn.addEventListener('click', () => {
    stopAll();
    // 构建试听用的 configOverride：browser 时不传 endpoint/apiKey，让 core/tts.js 走 Web Speech
    const provider = normalizeProviderForUi(config);
    const override = {
      provider: provider === 'browser' ? 'custom' : config.provider,
      voice: config.voice || '',
      apiKey: provider === 'browser' ? '' : config.apiKey,
      endpoint: provider === 'browser' ? '' : config.endpoint,
      model: config.model || ''
    };
    playTTS('你好呀，这是声音屋的试听小句子～', override);
    showToast('正在试听...');
  });

  // 停止按钮
  const stopBtn = document.createElement('button');
  stopBtn.type = 'button';
  stopBtn.className = 'tts-settings-btn secondary';
  stopBtn.appendChild(createIcon('close', 16));
  const stopLabel = document.createElement('span');
  stopLabel.textContent = '停止';
  stopBtn.appendChild(stopLabel);
  stopBtn.addEventListener('click', () => {
    stopAll();
  });

  actions.append(previewBtn, stopBtn);
  section.appendChild(actions);
  return section;
}

function renderContent() {
  const host = document.createElement('div');
  host.className = 'tts-settings-host';

  let config = readTtsConfig();

  const updateConfig = (patch) => {
    config = { ...config, ...patch };
    writeTtsConfig(config);
    // 重新渲染整个内容区，让 provider 切换时字段联动
    const newContent = renderContent();
    host.replaceWith(newContent);
    return newContent;
  };

  host.append(renderBackButton());

  // 总开关说明
  const infoSection = document.createElement('div');
  infoSection.className = 'tts-settings-section';
  const infoTitle = document.createElement('h3');
  infoTitle.className = 'tts-settings-section-title';
  infoTitle.textContent = '声音小屋';
  const infoSub = document.createElement('p');
  infoSub.className = 'tts-settings-section-sub';
  infoSub.textContent = '配置 AI 说话的声音。浏览器自带免配置，云端需要填地址和 key。保存后立即生效。';
  infoSection.append(infoTitle, infoSub);
  host.appendChild(infoSection);

  host.appendChild(renderProviderSection(config, updateConfig));

  const cloudSection = renderCloudConfigSection(config, updateConfig);
  if (cloudSection) host.appendChild(cloudSection);

  host.appendChild(renderVoiceSection(config, updateConfig));
  host.appendChild(renderActionsSection(config));

  return host;
}

export function mountTtsSettings(containerEl, opts = {}) {
  container = containerEl;
  options = opts;

  if (!container) return;
  injectStyle();

  // 浏览器音色异步加载，提前监听
  if ('speechSynthesis' in window) {
    loadBrowserVoices();
    try {
      window.speechSynthesis.onvoiceschanged = () => {
        loadBrowserVoices();
      };
    } catch (_) { /* silent */ }
  }

  container.innerHTML = '';
  const host = renderContent();
  container.appendChild(host);
}

export function mount(containerEl, opts = {}) {
  return mountTtsSettings(containerEl, opts);
}

export function unmount() {
  stopAll();
  if ('speechSynthesis' in window) {
    try { window.speechSynthesis.onvoiceschanged = null; } catch (_) { /* silent */ }
  }
  if (container) container.innerHTML = '';
  container = null;
  options = null;
  removeStyle();
}

export async function renderTtsSettings(opts = {}) {
  const host = document.createElement('div');
  host.className = 'tts-settings-host settings-page';
  mountTtsSettings(host, opts);
  return host;
}
