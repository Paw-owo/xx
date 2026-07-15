// core/desktop-drag.js
// 桌面拖拽纯逻辑：边缘翻页调度 + 页码边界 + 点击抑制
// 这些函数不依赖 DOM，方便回归测试。index.html 内联脚本通过 import 复用同一份实现，
// 保证测试覆盖的是真实生产代码，而不是一份复制粘贴的副本。
// imports: none

/* ── 常量（与 index.html 原内联值保持一致） ── */
export const DEFAULT_EDGE_HOTZONE = 30;   // 距左右边缘多少 px 进入热区
export const DEFAULT_EDGE_DWELL = 320;    // 在热区停留多久才翻页
export const DEFAULT_EDGE_COOLDOWN = 450; // 翻页后冷却，防连跳 / 左右抖动

/* ── 纯函数：根据 clientX 和视口宽计算翻页方向 ── */
// 返回 -1（向左翻）、+1（向右翻）、0（不在热区）
// viewportWidth 必须 > 0 才判定右热区，避免初始化时视口宽为 0 误判
export function edgeFlipDirection(clientX, viewportWidth, hotzone = DEFAULT_EDGE_HOTZONE) {
  if (typeof clientX !== 'number' || isNaN(clientX)) return 0;
  if (clientX <= hotzone) return -1;
  if (viewportWidth > 0 && clientX >= viewportWidth - hotzone) return 1;
  return 0;
}

/* ── 纯函数：页码边界，首末页不越界、不新建空白页 ── */
// 越界时返回 current（原地不动），合法时返回 current + dir
export function clampPageIndex(current, dir, pageCount) {
  const next = current + dir;
  if (next < 0 || next >= pageCount) return current;
  return next;
}

/* ── 边缘翻页调度器（带状态，可注入时间/定时器便于测试） ── */
// 行为契约：
//   1. 手指进入边缘热区并停留 dwell 毫秒后才翻页
//   2. 离开热区（dir=0）立即取消等待中的翻页
//   3. 同方向已在等待时不重复计时
//   4. 翻页发生后进入 cooldown 冷却，冷却期内不安排新翻页（防连跳/左右抖动）
//   5. 首末页越界由调用方通过 clampPageIndex 兜底
export function createEdgeFlipScheduler(opts = {}) {
  const hotzone = opts.hotzone ?? DEFAULT_EDGE_HOTZONE;
  const dwell = opts.dwell ?? DEFAULT_EDGE_DWELL;
  const cooldown = opts.cooldown ?? DEFAULT_EDGE_COOLDOWN;
  const now = opts.now ?? (() => Date.now());
  const sett = opts.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const clrt = opts.clearTimeout ?? ((id) => clearTimeout(id));

  const state = { timer: null, dir: 0, lastFlipAt: -Infinity };

  function clear() {
    if (state.timer) { clrt(state.timer); state.timer = null; }
    state.dir = 0;
  }

  // onFlip(dir) 在停留达标后被调用；调用方负责真正执行翻页（flipDesktopPage）
  function schedule(clientX, viewportWidth, onFlip) {
    const dir = edgeFlipDirection(clientX, viewportWidth, hotzone);
    if (dir === 0) { clear(); return; }
    // 同方向已在等待 → 不重复计时（避免每次 pointermove 都重置 dwell）
    if (state.timer && state.dir === dir) return;
    clear();
    // 冷却期内不安排新翻页
    if (now() - state.lastFlipAt < cooldown) return;
    state.dir = dir;
    state.timer = sett(() => {
      state.timer = null;
      state.lastFlipAt = now();
      if (typeof onFlip === 'function') onFlip(dir);
    }, dwell);
  }

  return { schedule, clear, state };
}

/* ── 点击抑制器 ── */
// 拖拽结束后置 suppress，由 document 捕获阶段 click 拦截并 consume（清除）。
// 不再用 120ms 定时器清 dragState（真机上合成 click 时序不可靠，会漏拦导致误开 APP）。
// 浏览器对大位移拖拽通常不再合成 click，此时 suppress 会残留 → 下一次 pointerdown 调 reset 清除。
export function createClickSuppressor() {
  let suppressed = false;
  return {
    suppress: () => { suppressed = true; },
    reset: () => { suppressed = false; },
    // consume：读取并清除。返回 true 表示本次 click 应被拦截
    consume: () => { const v = suppressed; suppressed = false; return v; },
    isSuppressed: () => suppressed
  };
}

/* ── 测试钩子（与 core/mcp.js 的 __testHooks 模式一致） ── */
export const __testHooks = {
  edgeFlipDirection,
  clampPageIndex,
  createEdgeFlipScheduler,
  createClickSuppressor,
  DEFAULT_EDGE_HOTZONE,
  DEFAULT_EDGE_DWELL,
  DEFAULT_EDGE_COOLDOWN
};
