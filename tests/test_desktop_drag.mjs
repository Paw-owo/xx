// tests/test_desktop_drag.mjs
// 回归测试：桌面拖拽统一控制器
// 运行：node tests/test_desktop_drag.mjs
//
// 覆盖本轮修复的真实根因（测试的是 core/desktop-drag.js 真实生产代码，不是副本）：
//   1. 边缘热区检测：只有真正进入左右边缘热区才判定方向，中间区域不翻页
//   2. 停留延迟 + 离开取消：进入热区需停留 dwell 才翻页；离开热区立即取消
//   3. 冷却：翻页后 cooldown 内不安排新翻页（防连跳 / 左右抖动）
//   4. 同方向去重：仍在等待同方向翻页时不重复计时
//   5. 页码边界：首末页不越界、不新建空白页
//   6. 点击抑制：拖拽结束后吃掉合成 click，防止误开下方/原位置 APP；
//      浏览器不合成 click 时 suppress 残留 → 下一次 pointerdown reset 清除
//   7. 统一清理：clear() 取消等待中的翻页定时器，无残留

let pass = 0;
let fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.log('  ✗ FAIL:', msg); }
}

const {
  edgeFlipDirection,
  clampPageIndex,
  createEdgeFlipScheduler,
  createClickSuppressor,
  DEFAULT_EDGE_HOTZONE,
  DEFAULT_EDGE_DWELL,
  DEFAULT_EDGE_COOLDOWN
} = (await import('../core/desktop-drag.js')).__testHooks;

// ═══════════════════════════════════════
// [组 1] edgeFlipDirection — 边缘热区检测
// ═══════════════════════════════════════
console.log('\n[组 1] edgeFlipDirection — 边缘热区检测');

{
  const W = 390; // 手机视口宽
  // 左热区：clientX <= 30
  assert(edgeFlipDirection(0, W) === -1, 'clientX=0 命中左热区 → -1');
  assert(edgeFlipDirection(DEFAULT_EDGE_HOTZONE, W) === -1, 'clientX=hotzone(30) 命中左热区边界 → -1');
  assert(edgeFlipDirection(DEFAULT_EDGE_HOTZONE + 1, W) === 0, 'clientX=hotzone+1(31) 已离开左热区 → 0');
  // 右热区：clientX >= W - 30
  assert(edgeFlipDirection(W, W) === 1, 'clientX=W 命中右热区 → +1');
  assert(edgeFlipDirection(W - DEFAULT_EDGE_HOTZONE, W) === 1, 'clientX=W-hotzone 命中右热区边界 → +1');
  assert(edgeFlipDirection(W - DEFAULT_EDGE_HOTZONE - 1, W) === 0, 'clientX=W-hotzone-1 已离开右热区 → 0');
  // 中间区域
  assert(edgeFlipDirection(W / 2, W) === 0, '视口中间 → 0（不翻页）');
  assert(edgeFlipDirection(100, W) === 0, 'clientX=100 在中间 → 0');
}

// 用例：视口宽为 0（初始化时）不能误判右热区
{
  assert(edgeFlipDirection(500, 0) === 0, 'viewportWidth=0 时不判右热区（防初始化误判）');
  assert(edgeFlipDirection(0, 0) === -1, 'viewportWidth=0 时左热区仍可判（clientX=0）');
}

// 用例：非法输入
{
  assert(edgeFlipDirection(NaN, 390) === 0, 'NaN clientX → 0');
  assert(edgeFlipDirection(undefined, 390) === 0, 'undefined clientX → 0');
}

// 用例：自定义 hotzone
{
  assert(edgeFlipDirection(50, 390, 60) === -1, 'hotzone=60 时 clientX=50 命中左热区');
  assert(edgeFlipDirection(50, 390, 30) === 0, 'hotzone=30 时 clientX=50 不在左热区');
}

// ═══════════════════════════════════════
// [组 2] clampPageIndex — 首末页不越界
// ═══════════════════════════════════════
console.log('\n[组 2] clampPageIndex — 首末页不越界、不新建空白页');

{
  const PAGES = 2; // 桌面固定两页
  assert(clampPageIndex(0, 1, PAGES) === 1, 'page0 +1 → page1（合法）');
  assert(clampPageIndex(1, -1, PAGES) === 0, 'page1 -1 → page0（合法）');
  // 越界：原地不动
  assert(clampPageIndex(0, -1, PAGES) === 0, 'page0 -1 → page0（首页不越界）');
  assert(clampPageIndex(1, 1, PAGES) === 1, 'page1 +1 → page1（末页不越界，不新建空白页）');
  // dir=0
  assert(clampPageIndex(1, 0, PAGES) === 1, 'dir=0 原地不动');
  // 单页桌面
  assert(clampPageIndex(0, 1, 1) === 0, '单页桌面 page0 +1 不越界');
  assert(clampPageIndex(0, -1, 1) === 0, '单页桌面 page0 -1 不越界');
}

// ═══════════════════════════════════════
// [组 3] createEdgeFlipScheduler — 停留延迟 + 离开取消
// ═══════════════════════════════════════
console.log('\n[组 3] createEdgeFlipScheduler — 停留延迟 / 离开取消');

// 用 fake timer 控制时间
function makeFakeClock() {
  let t = 1000;
  const pending = new Map(); // id -> { fn, fireAt }
  let nextId = 1;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
      // 触发所有已到期的定时器
      for (const [id, job] of pending) {
        if (job.fireAt <= t) {
          pending.delete(id);
          job.fn();
        }
      }
    },
    setTimeout: (fn, ms) => { const id = nextId++; pending.set(id, { fn, fireAt: t + ms }); return id; },
    clearTimeout: (id) => { pending.delete(id); },
    pendingCount: () => pending.size
  };
}

// 用例：进入热区停留 dwell 后翻页
{
  const clock = makeFakeClock();
  const flipped = [];
  const s = createEdgeFlipScheduler({ now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  s.schedule(0, 390, (dir) => flipped.push(dir)); // 左热区
  assert(flipped.length === 0, '进入热区后未到 dwell 不翻页');
  assert(clock.pendingCount() === 1, '已安排一个翻页定时器');
  clock.advance(DEFAULT_EDGE_DWELL - 1);
  assert(flipped.length === 0, '差 1ms 到 dwell 仍不翻页');
  clock.advance(1);
  assert(flipped.length === 1 && flipped[0] === -1, '停留满 dwell 后翻页，方向 -1');
  assert(clock.pendingCount() === 0, '翻页后定时器已清空');
}

// 用例：进入热区后离开 → 立即取消，不翻页
{
  const clock = makeFakeClock();
  const flipped = [];
  const s = createEdgeFlipScheduler({ now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  s.schedule(0, 390, (dir) => flipped.push(dir)); // 左热区
  clock.advance(DEFAULT_EDGE_DWELL - 50); // 未到 dwell
  s.schedule(200, 390, (dir) => flipped.push(dir)); // 移到中间，离开热区
  assert(flipped.length === 0, '离开热区未翻页');
  assert(clock.pendingCount() === 0, '离开热区后定时器已取消');
  clock.advance(DEFAULT_EDGE_DWELL + 100);
  assert(flipped.length === 0, '继续推进时间也不翻页（已取消）');
}

// ═══════════════════════════════════════
// [组 4] createEdgeFlipScheduler — 冷却防连跳
// ═══════════════════════════════════════
console.log('\n[组 4] createEdgeFlipScheduler — 冷却防连跳 / 左右抖动');

// 用例：翻页后冷却期内不再安排新翻页
{
  const clock = makeFakeClock();
  const flipped = [];
  const s = createEdgeFlipScheduler({ now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  s.schedule(0, 390, (dir) => flipped.push(dir));
  clock.advance(DEFAULT_EDGE_DWELL); // 翻页
  assert(flipped.length === 1, '第一次翻页发生');
  // 手指仍在左热区，冷却期内再次 schedule
  s.schedule(0, 390, (dir) => flipped.push(dir));
  assert(clock.pendingCount() === 0, '冷却期内不安排新定时器');
  clock.advance(DEFAULT_EDGE_DWELL);
  assert(flipped.length === 1, '冷却期内即使停留 dwell 也不翻页');
  // 冷却结束后再 schedule
  clock.advance(DEFAULT_EDGE_COOLDOWN - DEFAULT_EDGE_DWELL + 1); // 推过冷却
  s.schedule(0, 390, (dir) => flipped.push(dir));
  assert(clock.pendingCount() === 1, '冷却结束后可安排新定时器');
  clock.advance(DEFAULT_EDGE_DWELL);
  assert(flipped.length === 2, '冷却结束后停留 dwell 翻页');
}

// 用例：左右抖动 — 左翻页后立刻移到右热区，冷却内不翻
{
  const clock = makeFakeClock();
  const flipped = [];
  const s = createEdgeFlipScheduler({ now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  s.schedule(0, 390, (dir) => flipped.push(dir));
  clock.advance(DEFAULT_EDGE_DWELL); // 左翻页
  assert(flipped[0] === -1, '左翻页');
  s.schedule(389, 390, (dir) => flipped.push(dir)); // 立刻移到右热区
  assert(clock.pendingCount() === 0, '冷却内右热区不安排定时器（防抖动）');
  clock.advance(DEFAULT_EDGE_DWELL);
  assert(flipped.length === 1, '冷却内右热区不翻页');
}

// ═══════════════════════════════════════
// [组 5] createEdgeFlipScheduler — 同方向去重 + clear 统一清理
// ═══════════════════════════════════════
console.log('\n[组 5] createEdgeFlipScheduler — 同方向去重 / clear 统一清理');

// 用例：仍在等待同方向翻页时，重复 schedule 不重置 dwell
{
  const clock = makeFakeClock();
  const flipped = [];
  const s = createEdgeFlipScheduler({ now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  s.schedule(0, 390, (dir) => flipped.push(dir));
  clock.advance(100); // 走了 100ms
  s.schedule(0, 390, (dir) => flipped.push(dir)); // 同方向再次 schedule
  assert(clock.pendingCount() === 1, '同方向重复 schedule 不新增定时器');
  // 若被重置，则需再 dwell 才翻；这里只走了 100ms 后再走 dwell-100 应翻页
  clock.advance(DEFAULT_EDGE_DWELL - 100);
  assert(flipped.length === 1, '同方向去重：dwell 从首次进入算起，未被重置');
}

// 用例：clear() 取消等待中的翻页（统一清理）
{
  const clock = makeFakeClock();
  const flipped = [];
  const s = createEdgeFlipScheduler({ now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  s.schedule(0, 390, (dir) => flipped.push(dir));
  assert(clock.pendingCount() === 1, '安排了定时器');
  s.clear();
  assert(clock.pendingCount() === 0, 'clear() 后定时器已取消');
  assert(s.state.dir === 0, 'clear() 后 dir 归零');
  clock.advance(DEFAULT_EDGE_DWELL + 1000);
  assert(flipped.length === 0, 'clear() 后推进时间也不翻页（无残留）');
}

// 用例：clear() 无定时器时也安全（幂等）
{
  const clock = makeFakeClock();
  const s = createEdgeFlipScheduler({ now: clock.now, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  s.clear(); // 未安排过
  s.clear(); // 重复 clear
  assert(s.state.timer === null && s.state.dir === 0, '重复 clear() 安全无异常');
}

// ═══════════════════════════════════════
// [组 6] createClickSuppressor — 点击抑制状态机
// ═══════════════════════════════════════
console.log('\n[组 6] createClickSuppressor — 点击抑制（防误开 APP）');

// 用例：初始不抑制
{
  const cs = createClickSuppressor();
  assert(cs.isSuppressed() === false, '初始未抑制');
  assert(cs.consume() === false, '初始 consume 返回 false（不拦截）');
}

// 用例：拖拽结束 suppress → click consume 拦截并清除
{
  const cs = createClickSuppressor();
  cs.suppress();
  assert(cs.isSuppressed() === true, 'suppress 后处于抑制态');
  assert(cs.consume() === true, 'consume 返回 true（拦截本次 click）');
  assert(cs.isSuppressed() === false, 'consume 后已清除');
  assert(cs.consume() === false, '第二次 consume 返回 false（只吃第一个 click）');
}

// 用例：浏览器不合成 click 时 suppress 残留 → pointerdown reset 清除
// 这是"卡在游戏厅"根因的真机修复：大位移拖拽不触发 click，suppress 残留会误吃下次真实点击
{
  const cs = createClickSuppressor();
  cs.suppress(); // 拖拽结束
  // 浏览器未合成 click（大位移），suppress 残留
  assert(cs.isSuppressed() === true, '未合成 click 时 suppress 残留');
  cs.reset(); // 下一次 pointerdown
  assert(cs.isSuppressed() === false, 'pointerdown reset 后清除');
  assert(cs.consume() === false, 'reset 后真实 click 不被误吃');
}

// 用例：拖拽结束 → 合成 click 被吃 → 后续真实 click 正常
{
  const cs = createClickSuppressor();
  cs.suppress();
  const click1 = cs.consume(); // 拖拽后的合成 click
  const click2 = cs.consume(); // 用户随后的真实点击
  assert(click1 === true && click2 === false, '只吃拖拽后第一个 click，后续真实点击正常');
}

// ═══════════════════════════════════════
// [组 7] 默认常量与产品配置一致
// ═══════════════════════════════════════
console.log('\n[组 7] 默认常量与产品配置一致');

{
  assert(DEFAULT_EDGE_HOTZONE === 30, '默认热区 30px');
  assert(DEFAULT_EDGE_DWELL === 320, '默认停留 320ms');
  assert(DEFAULT_EDGE_COOLDOWN === 450, '默认冷却 450ms');
}

// ═══════════════════════════════════════
console.log(`\n═══ 桌面拖拽回归测试：${pass} 通过 / ${fail} 失败 ═══`);
if (fail > 0) process.exit(1);
