// core/abort-utils.js
// 统一 AbortSignal.timeout 兼容层：支持旧浏览器 fallback，并在 finally 调 cleanup 清计时器/监听器。

export function createTimeoutSignal(timeoutMs, externalSignal = null) {
  const ms = Math.max(0, Number(timeoutMs) || 0);
  const nativeTimeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
    ? AbortSignal.timeout(ms)
    : null;
  const controller = new AbortController();
  let timedOut = false;
  let cleaned = false;
  let timer = null;

  const abortAsTimeout = () => {
    timedOut = true;
    try { controller.abort('timeout'); } catch (_) {}
  };
  const abortAsExternal = () => {
    try { controller.abort('external'); } catch (_) {}
  };

  if (nativeTimeout) {
    if (nativeTimeout.aborted) abortAsTimeout();
    else nativeTimeout.addEventListener('abort', abortAsTimeout, { once: true });
  } else {
    timer = setTimeout(abortAsTimeout, ms);
  }

  if (externalSignal) {
    if (externalSignal.aborted) abortAsExternal();
    else externalSignal.addEventListener('abort', abortAsExternal, { once: true });
  }

  return {
    signal: controller.signal,
    get timedOut() { return timedOut; },
    cleanup() {
      if (cleaned) return;
      cleaned = true;
      if (timer) clearTimeout(timer);
      if (nativeTimeout) nativeTimeout.removeEventListener('abort', abortAsTimeout);
      if (externalSignal) externalSignal.removeEventListener('abort', abortAsExternal);
    }
  };
}
