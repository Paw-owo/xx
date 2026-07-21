export const PUBLIC_IMAGE_HOST = Object.freeze({
  name: 'Postimages',
  url: 'https://postimages.org/'
});

// 远程图片验证超时：目标服务器半开连接或很慢时，不能让 Promise 永远 pending。
// 9s 在「尽快失败」和「给慢图留时间」之间取折中，超时后返回失败，不抛到用户界面。
const VERIFY_REMOTE_IMAGE_TIMEOUT_MS = 9000;

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

export function verifyRemoteImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    let timer = null;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      // 解除回调引用，避免超时后晚到的 onload/onerror 仍触发
      image.onload = null;
      image.onerror = null;
      resolve(ok);
    };

    // 超时兜底：半开连接 / 极慢服务器情况下，onload/onerror 都不会触发，
    // 这里主动 finish(false) 让 Promise 落定，不抛异常给上层
    timer = setTimeout(() => finish(false), VERIFY_REMOTE_IMAGE_TIMEOUT_MS);

    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    image.src = url;
  });
}

export async function promptForRemoteImage(promptText = '粘贴图片 URL（http/https）') {
  const raw = window.prompt(promptText, '');
  if (raw == null) return { cancelled: true, url: '', error: '' };
  const url = normalizeHttpImageUrl(raw);
  if (!url) return { cancelled: false, url: '', error: '请输入有效的 http/https 图片地址' };
  if (!await verifyRemoteImage(url)) {
    return { cancelled: false, url: '', error: '图片加载失败，请检查直链或外站访问限制' };
  }
  return { cancelled: false, url, error: '' };
}
