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

export function verifyRemoteImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      resolve(ok);
    };
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
