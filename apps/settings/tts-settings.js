// apps/settings/tts-settings.js
// TTS 语音合成设置页（骨架占位）
// 后续在此文件实现 provider/voice/model/apiKey 等配置项
// imports:
//   from '../../core/ui.js': createIcon

import { createIcon } from '../../core/ui.js';

const STYLE_ID = 'tts-settings-style';

let container = null;
let options = null;
let styleEl = null;

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  if (!styleEl) styleEl = document.createElement('style');
  styleEl.id = STYLE_ID;
  styleEl.textContent = `
    .tts-settings-host {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .tts-settings-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 48px 24px;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      color: var(--text-secondary);
      text-align: center;
    }
    .tts-settings-placeholder-icon {
      opacity: 0.6;
    }
    .tts-settings-placeholder-text {
      font-size: var(--font-size-base);
      line-height: 1.6;
    }
    .tts-settings-placeholder-sub {
      font-size: var(--font-size-sm);
      color: var(--text-tertiary);
    }
    .tts-settings-back-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: var(--radius-md);
      background: var(--bg-card);
      color: var(--text-primary);
      border: 1px solid var(--border-subtle);
      font-size: var(--font-size-sm);
      cursor: pointer;
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

function renderPlaceholder() {
  const wrap = document.createElement('div');
  wrap.className = 'tts-settings-placeholder';

  const iconWrap = document.createElement('div');
  iconWrap.className = 'tts-settings-placeholder-icon';
  iconWrap.appendChild(createIcon('settings', 32));

  const text = document.createElement('div');
  text.className = 'tts-settings-placeholder-text';
  text.textContent = 'TTS 设置 - 敬请期待 ⌯\'ᵕ\'⌯';

  const sub = document.createElement('div');
  sub.className = 'tts-settings-placeholder-sub';
  sub.textContent = '语音合成配置正在路上，先去别处逛逛吧';

  wrap.append(iconWrap, text, sub);
  return wrap;
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

export function mountTtsSettings(containerEl, opts = {}) {
  container = containerEl;
  options = opts;

  if (!container) return;
  injectStyle();

  container.innerHTML = '';
  const host = document.createElement('div');
  host.className = 'tts-settings-host';
  host.append(renderBackButton(), renderPlaceholder());
  container.appendChild(host);
}

export function mount(containerEl, opts = {}) {
  return mountTtsSettings(containerEl, opts);
}

export function unmount() {
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
