// One visual-viewport source for every app, sheet, dialog, and editable control.

const EDITABLE_SELECTOR = 'input:not([type="hidden"]), textarea, select, [contenteditable]:not([contenteditable="false"])';
let initialized = false;
let frame = 0;

export function initViewportManager() {
  if (initialized) return;
  initialized = true;

  const viewport = window.visualViewport;
  const requestUpdate = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(updateViewport);
  };

  viewport?.addEventListener('resize', requestUpdate, { passive: true });
  viewport?.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate, { passive: true });
  window.addEventListener('orientationchange', requestUpdate, { passive: true });
  document.addEventListener('focusin', (event) => {
    if (!event.target?.matches?.(EDITABLE_SELECTOR)) return;
    requestUpdate();
    requestAnimationFrame(() => revealFocusedControl(event.target));
  });

  updateViewport();
}

function updateViewport() {
  frame = 0;
  const root = document.documentElement;
  const viewport = window.visualViewport;
  const layoutHeight = window.innerHeight || root.clientHeight || 0;
  const height = viewport?.height || layoutHeight;
  const top = viewport?.offsetTop || 0;
  const keyboardInset = Math.max(0, layoutHeight - height - top);

  root.style.setProperty('--app-viewport-top', `${Math.round(top)}px`);
  root.style.setProperty('--app-viewport-height', `${Math.round(height)}px`);
  root.style.setProperty('--app-keyboard-inset', `${Math.round(keyboardInset)}px`);
  root.classList.toggle('keyboard-visible', keyboardInset > 0 && isEditable(document.activeElement));

  if (isEditable(document.activeElement)) revealFocusedControl(document.activeElement);
}

function revealFocusedControl(element) {
  if (!element?.isConnected) return;
  const viewport = window.visualViewport;
  const top = (viewport?.offsetTop || 0) + 12;
  const bottom = (viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) - 12;
  const rect = element.getBoundingClientRect();
  let delta = 0;
  if (rect.bottom > bottom) delta = rect.bottom - bottom;
  else if (rect.top < top) delta = rect.top - top;
  if (Math.abs(delta) > 1) findScrollableParent(element)?.scrollBy({ top: delta, behavior: 'auto' });
}

function findScrollableParent(element) {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement;
}

function isEditable(element) {
  return Boolean(element?.matches?.(EDITABLE_SELECTOR));
}
