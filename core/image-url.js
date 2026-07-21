export const PUBLIC_IMAGE_HOST = Object.freeze({
  name: 'Postimages',
  url: 'https://postimages.org/'
});

export function normalizeHttpImageUrl(value) {
  const input = String(value || '').trim();
  if (!input) return '';
  try {
    const parsed = new URL(input);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
  } catch {
    return '';
  }
}

const REMOTE_IMAGE_VERIFY_TIMEOUT = 9000;
const IMAGE_URL_DIALOG_STYLE_ID = 'image-url-dialog-style';

export function verifyRemoteImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    let timer = null;
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      image.onload = null;
      image.onerror = null;
      // 清掉 src，避免超时后浏览器继续保持半开的图片请求。
      try { image.src = ''; } catch (_) {}
      resolve(ok);
    };
    timer = setTimeout(() => finish(false), REMOTE_IMAGE_VERIFY_TIMEOUT);
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    image.src = url;
  });
}

export async function promptForRemoteImage(promptText = '粘贴图片 URL（http/https）') {
  const raw = await openImageUrlDialog(promptText);
  if (raw == null) return { cancelled: true, url: '', error: '' };
  const url = normalizeHttpImageUrl(raw);
  if (!url) return { cancelled: false, url: '', error: '请输入有效的 http/https 图片地址' };
  if (!await verifyRemoteImage(url)) {
    return { cancelled: false, url: '', error: '图片加载失败，请检查直链或外站访问限制' };
  }
  return { cancelled: false, url, error: '' };
}

function openImageUrlDialog(promptText) {
  if (typeof document === 'undefined') return Promise.resolve(null);
  ensureImageUrlDialogStyle();
  return new Promise((resolve) => {
    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeyDown);
      overlay.classList.remove('open');
      card.classList.remove('open');
      globalThis.setTimeout(() => overlay.remove(), 180);
      resolve(value);
    };
    const overlay = document.createElement('div');
    overlay.className = 'image-url-dialog-overlay';
    const card = document.createElement('section');
    card.className = 'image-url-dialog-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');

    const title = document.createElement('h3');
    title.className = 'image-url-dialog-title';
    title.textContent = '放一张远程图片';
    const desc = document.createElement('p');
    desc.className = 'image-url-dialog-desc';
    desc.textContent = String(promptText || '粘贴 http 或 https 图片直链，小手机会先轻轻检查一下。');
    const input = document.createElement('input');
    input.className = 'image-url-dialog-input';
    input.type = 'url';
    input.inputMode = 'url';
    input.placeholder = 'https://example.com/image.png';
    input.autocomplete = 'off';
    const error = document.createElement('p');
    error.className = 'image-url-dialog-error';
    error.setAttribute('aria-live', 'polite');

    const actions = document.createElement('div');
    actions.className = 'image-url-dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'image-url-dialog-btn ghost';
    cancel.textContent = '先不要';
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'image-url-dialog-btn primary';
    confirm.textContent = '用这张';
    actions.append(cancel, confirm);
    card.append(title, desc, input, error, actions);
    overlay.append(card);
    document.body.append(overlay);

    const submit = () => {
      const value = input.value.trim();
      if (!value) {
        error.textContent = '先贴一条图片地址哦';
        input.focus();
        return;
      }
      if (!normalizeHttpImageUrl(value)) {
        error.textContent = '只支持 http 或 https 开头的图片地址';
        input.focus();
        return;
      }
      close(value);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(null); }
      if (event.key === 'Enter') { event.preventDefault(); submit(); }
    };
    cancel.addEventListener('click', () => close(null));
    confirm.addEventListener('click', submit);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(null); });
    document.addEventListener('keydown', onKeyDown);
    const raf = typeof globalThis.requestAnimationFrame === 'function' ? globalThis.requestAnimationFrame : (fn) => globalThis.setTimeout(fn, 0);
    raf(() => {
      overlay.classList.add('open');
      card.classList.add('open');
      input.focus({ preventScroll: true });
    });
  });
}

function ensureImageUrlDialogStyle() {
  if (document.getElementById(IMAGE_URL_DIALOG_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = IMAGE_URL_DIALOG_STYLE_ID;
  style.textContent = `
    .image-url-dialog-overlay{position:fixed;top:var(--app-viewport-top,0px);right:0;bottom:auto;left:0;height:var(--app-viewport-height,100dvh);z-index:10030;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--bg-overlay);opacity:0;pointer-events:none;transition:opacity 180ms ease}
    .image-url-dialog-overlay.open{opacity:1;pointer-events:auto}
    .image-url-dialog-card{width:min(360px,calc(100vw - 48px));border-radius:var(--radius-lg);background:var(--bg-card);color:var(--text-primary);box-shadow:var(--shadow-lg);padding:20px;display:flex;flex-direction:column;gap:12px;transform:translateY(10px) scale(.98);opacity:0;transition:all 180ms ease;font-family:var(--font-main)}
    .image-url-dialog-card.open{transform:translateY(0) scale(1);opacity:1}
    .image-url-dialog-title{margin:0;color:var(--text-primary);font-size:var(--font-size-lg);line-height:1.4}
    .image-url-dialog-desc{margin:0;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.6}
    .image-url-dialog-input{width:100%;min-height:44px;border:none;border-radius:var(--radius-md);background:var(--surface-muted);color:var(--text-primary);padding:0 12px;font:inherit;font-size:var(--font-size-base)}
    .image-url-dialog-error{min-height:18px;margin:0;color:var(--color-danger);font-size:var(--font-size-small);line-height:1.5}
    .image-url-dialog-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:2px}
    .image-url-dialog-btn{min-height:42px;border-radius:var(--radius-md);font:inherit;font-weight:600;transition:var(--motion)}
    .image-url-dialog-btn:active{transform:var(--press-scale)}
    .image-url-dialog-btn.ghost{background:var(--surface-muted);color:var(--text-secondary)}
    .image-url-dialog-btn.primary{background:var(--accent);color:var(--bubble-user-text)}
  `;
  document.head.appendChild(style);
}
