// tests/test_callapi_endpointid.mjs
// 本地单测：验证 callAPI 对 endpointId 的精确路由边界
// 运行：node tests/test_callapi_endpointid.mjs
// 无需真实 API key / 网络 / 浏览器；通过 __testHooks 注入可控 mock

import { callAPI, __testHooks } from '../core/api.js';

// ─── 最小 localStorage mock（api.js 的 getPoolGroups/getPoolLastSuccess/ensureApiPoolMigrated 依赖它）───
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => { _store.set(k, String(v)); },
  removeItem: (k) => { _store.delete(k); },
  clear: () => { _store.clear(); }
};

// ensureApiPoolMigrated 会读 app_api_pool_migrated；预先标记已迁移，避免走 IndexedDB
_store.set('app_api_pool_migrated', 'true');
// 默认 paid/free 组均启用
_store.set('app_api_pool_groups', JSON.stringify({
  paid: { id: 'paid', name: '付费组', type: 'paid', enabled: true },
  free: { id: 'free', name: '免费组', type: 'free', enabled: true }
}));
_store.set('app_api_pool_last_success', JSON.stringify({ paid: '', free: '' }));

// ─── mock 池数据：由每个用例覆盖 __testHooks.getApiPoolItems 返回值 ───

// 构造一个付费端点（单 key）
function paidEndpoint(id, { keys = ['key-A'], status = 'active', model = 'gpt-4o-mini' } = {}) {
  return {
    id, groupType: 'paid', groupName: '付费组',
    name: `端点-${id}`,
    endpoint: `https://example.test/${id}/v1`,
    provider: 'openai',
    keys,
    model,
    models: [model],
    source: '',
    status,
    lastSuccessAt: '', lastErrorAt: '', lastErrorMessage: '', lastLatencyMs: 0,
    createdAt: '', updatedAt: ''
  };
}

// 构造一个已禁用的端点
function disabledEndpoint(id) {
  return { ...paidEndpoint(id), status: 'disabled' };
}

// ─── 记录调用 ───
let calls = { requestOnce: [], markSuccess: [], markError: [], notifyRetry: 0, onError: [], onDone: [] };

function resetCalls() {
  calls = { requestOnce: [], markSuccess: [], markError: [], notifyRetry: 0, onError: [], onDone: [] };
}

// ─── 安装 mock ───
function installHooks({ poolItems, requestImpl }) {
  __testHooks.getApiPoolItems = async () => poolItems;
  __testHooks.markPoolSourceSuccess = async (source, latency) => { calls.markSuccess.push({ source, latency }); };
  __testHooks.markPoolSourceError = async (source, msg, latency) => { calls.markError.push({ source, msg }); };
  __testHooks.requestOnce = async (opts) => {
    calls.requestOnce.push({ poolId: opts.source.poolId, apiKey: opts.source.apiKey });
    return requestImpl(opts);
  };
  // notifyRetry 走 window.showToast，mock 掉避免报错
  globalThis.window = { showToast: () => { calls.notifyRetry++; } };
}

// 统一回调，供每个 callAPI 调用传入
const sharedCallbacks = {
  onError: (e) => { calls.onError.push(e); },
  onDone: (r) => { calls.onDone.push(r); }
};

function clearHooks() {
  __testHooks.getApiPoolItems = null;
  __testHooks.markPoolSourceSuccess = null;
  __testHooks.markPoolSourceError = null;
  __testHooks.requestOnce = null;
  delete globalThis.window;
  _store.clear();
  _store.set('app_api_pool_migrated', 'true');
  _store.set('app_api_pool_groups', JSON.stringify({
    paid: { id: 'paid', name: '付费组', type: 'paid', enabled: true },
    free: { id: 'free', name: '免费组', type: 'free', enabled: true }
  }));
  _store.set('app_api_pool_last_success', JSON.stringify({ paid: '', free: '' }));
}

// ─── 辅助：构造 HTTP 错误 ───
function httpError(status, msg) {
  const e = new Error(msg || `HTTP ${status}`);
  e.status = status;
  return e;
}

// ═══════════════════════════════════════
// 【测试用例】
// ═══════════════════════════════════════

let passCount = 0;
let failCount = 0;
const failures = [];

function assert(cond, msg) {
  if (cond) { passCount++; console.log(`  ✓ ${msg}`); }
  else { failCount++; failures.push(msg); console.log(`  ✗ ${msg}`); }
}

function assertEq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passCount++; console.log(`  ✓ ${msg}`); }
  else { failCount++; failures.push(`${msg} (期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)})`); console.log(`  ✗ ${msg} (期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)})`); }
}

// ─── 用例 1：endpointId 未命中 → 保持 groupTypes fallback ───
console.log('\n[用例 1] endpointId 未命中 poolItems → 走全局 paid/free fallback');
{
  resetCalls();
  const otherEndpoint = paidEndpoint('other-1', { keys: ['key-other'] });
  installHooks({
    poolItems: [otherEndpoint],
    requestImpl: async (opts) => ({ content: 'fallback-ok', thinking: '', latencyMs: 5 })
  });
  const result = await callAPI({
    messages: [{ role: 'user', content: 'hi' }],
    endpointId: 'nonexistent-id',
    groupTypes: ['paid'],
    ...sharedCallbacks
  });
  assertEq(result?.content, 'fallback-ok', '返回 fallback 结果');
  assert(calls.requestOnce.length === 1, '请求了 fallback 端点（非 endpointId）');
  assertEq(calls.requestOnce[0].poolId, 'other-1', '请求的是 other-1 而非 endpointId');
  assert(calls.markSuccess.length === 1, '标记成功一次');
  clearHooks();
}

// ─── 用例 2：endpointId 命中但 sources 为空（disabled）→ 不回退、只报一次错 ───
console.log('\n[用例 2] endpointId 命中但 sources 为空（disabled）→ 不回退、onError 一次');
{
  resetCalls();
  const target = disabledEndpoint('ep-disabled');
  const otherEndpoint = paidEndpoint('other-2', { keys: ['key-other'] });
  installHooks({
    poolItems: [target, otherEndpoint],
    requestImpl: async () => { throw new Error('不该被调用'); }
  });
  const result = await callAPI({
    messages: [{ role: 'user', content: 'hi' }],
    endpointId: 'ep-disabled',
    groupTypes: ['paid'],
    ...sharedCallbacks
  });
  assert(result === null, '返回 null');
  assert(calls.requestOnce.length === 0, '不请求任何端点（sources 为空）');
  assert(calls.onError.length === 1, '只收到一次 onError');
  assert(/不可用/.test(calls.onError[0]?.message || ''), '错误文案提示"不可用"');
  assert(calls.markError.length === 0, '不标记任何端点错误（没请求过）');
  clearHooks();
}

// ─── 用例 3：endpointId 命中、单 key 成功 ───
console.log('\n[用例 3] endpointId 命中、单 key 成功');
{
  resetCalls();
  const target = paidEndpoint('ep-ok', { keys: ['key-single'] });
  installHooks({
    poolItems: [target],
    requestImpl: async (opts) => ({ content: 'success', thinking: '', latencyMs: 10 })
  });
  const result = await callAPI({
    messages: [{ role: 'user', content: 'hi' }],
    endpointId: 'ep-ok',
    ...sharedCallbacks
  });
  assertEq(result?.content, 'success', '返回成功结果');
  assert(calls.requestOnce.length === 1, '只请求一次');
  assertEq(calls.requestOnce[0].poolId, 'ep-ok', '请求的是指定端点');
  assertEq(calls.requestOnce[0].apiKey, 'key-single', '使用该端点的 key');
  assert(calls.markSuccess.length === 1, '标记成功');
  assert(calls.onError.length === 0, '无错误');
  clearHooks();
}

// ─── 用例 4：endpointId 命中、多 key，第一 key 可重试错误 → 第二 key 成功 ───
console.log('\n[用例 4] endpointId 命中、多 key，第一 key 可重试(429) → 第二 key 成功');
{
  resetCalls();
  const target = paidEndpoint('ep-multi', { keys: ['key-1', 'key-2'] });
  let attempt = 0;
  installHooks({
    poolItems: [target],
    requestImpl: async (opts) => {
      attempt++;
      if (attempt === 1) throw httpError(429, 'HTTP 429｜rate limited');
      return { content: 'second-key-ok', thinking: '', latencyMs: 8 };
    }
  });
  const result = await callAPI({
    messages: [{ role: 'user', content: 'hi' }],
    endpointId: 'ep-multi',
    ...sharedCallbacks
  });
  assertEq(result?.content, 'second-key-ok', '第二 key 成功');
  assert(calls.requestOnce.length === 2, '请求两次（两个 key）');
  assertEq(calls.requestOnce[0].apiKey, 'key-1', '第一次用 key-1');
  assertEq(calls.requestOnce[1].apiKey, 'key-2', '第二次用 key-2');
  assert(calls.markError.length === 1, '第一 key 标记错误一次');
  assert(calls.markSuccess.length === 1, '第二 key 标记成功');
  assert(calls.onError.length === 0, '最终无 onError（成功了）');
  assert(calls.notifyRetry === 1, 'notifyRetry 调用一次（isUser=true）');
  // 只请求了指定端点，没碰别的
  assert(calls.requestOnce.every(c => c.poolId === 'ep-multi'), '所有请求都落在 ep-multi');
  clearHooks();
}

// ─── 用例 5：endpointId 命中、多 key，第一 key 不可重试错误 → 不试第二 key ───
console.log('\n[用例 5] endpointId 命中、多 key，第一 key 不可重试(400) → 不试第二 key');
{
  resetCalls();
  const target = paidEndpoint('ep-multi2', { keys: ['key-1', 'key-2'] });
  const otherEndpoint = paidEndpoint('other-3', { keys: ['key-other'] });
  installHooks({
    poolItems: [target, otherEndpoint],
    requestImpl: async (opts) => {
      if (opts.source.poolId === 'ep-multi2') throw httpError(400, 'HTTP 400｜bad request');
      throw new Error('不该请求 other-3');
    }
  });
  const result = await callAPI({
    messages: [{ role: 'user', content: 'hi' }],
    endpointId: 'ep-multi2',
    ...sharedCallbacks
  });
  assert(result === null, '返回 null');
  assert(calls.requestOnce.length === 1, '只请求一次（不试第二 key）');
  assertEq(calls.requestOnce[0].poolId, 'ep-multi2', '请求的是指定端点');
  assert(calls.onError.length === 1, '只收到一次 onError');
  assert(calls.markError.length === 1, '标记错误一次');
  // 关键：没有回退到 other-3
  assert(!calls.requestOnce.some(c => c.poolId === 'other-3'), '不回退到 other-3');
  clearHooks();
}

// ─── 用例 6：endpointId 命中，AbortSignal 已中止 → 不尝试、不回退 ───
console.log('\n[用例 6] endpointId 命中，AbortSignal 已中止 → 不尝试后续 key、不回退');
{
  resetCalls();
  const target = paidEndpoint('ep-abort', { keys: ['key-1', 'key-2'] });
  const otherEndpoint = paidEndpoint('other-4', { keys: ['key-other'] });
  const controller = new AbortController();
  controller.abort();
  installHooks({
    poolItems: [target, otherEndpoint],
    requestImpl: async () => { throw new Error('不该被调用（已 abort）'); }
  });
  const result = await callAPI({
    messages: [{ role: 'user', content: 'hi' }],
    endpointId: 'ep-abort',
    signal: controller.signal,
    ...sharedCallbacks
  });
  assert(result === null, '返回 null');
  assert(calls.requestOnce.length === 0, '不请求任何 key（循环前 abort 检查）');
  assert(calls.onError.length === 1, '收到一次 onError（已取消）');
  assert(/取消/.test(calls.onError[0]?.message || ''), '错误文案提示"取消"');
  assert(!calls.requestOnce.some(c => c.poolId === 'other-4'), '不回退到 other-4');
  clearHooks();
}

// ─── 用例 6b：endpointId 命中，首 key 抛 abort → 不尝试第二 key ───
console.log('\n[用例 6b] endpointId 命中，首 key 请求中 abort → 不尝试第二 key');
{
  resetCalls();
  const target = paidEndpoint('ep-abort2', { keys: ['key-1', 'key-2'] });
  const controller = new AbortController();
  let attempt = 0;
  installHooks({
    poolItems: [target],
    requestImpl: async (opts) => {
      attempt++;
      // 首次请求时 abort
      controller.abort();
      const e = new Error('The user aborted a request');
      e.name = 'AbortError';
      throw e;
    }
  });
  const result = await callAPI({
    messages: [{ role: 'user', content: 'hi' }],
    endpointId: 'ep-abort2',
    signal: controller.signal,
    ...sharedCallbacks
  });
  assert(result === null, '返回 null');
  assert(calls.requestOnce.length === 1, '只请求一次（abort 后不试第二 key）');
  assert(calls.onError.length === 1, '收到一次 onError');
  assert(/取消/.test(calls.onError[0]?.message || ''), '错误文案提示"取消"');
  clearHooks();
}

// ═══════════════════════════════════════
// 【汇总】
// ═══════════════════════════════════════

console.log('\n══════════════════════════');
console.log(`通过: ${passCount}  失败: ${failCount}`);
if (failCount > 0) {
  console.log('失败项:');
  failures.forEach(f => console.log('  - ' + f));
  process.exit(1);
} else {
  console.log('全部通过');
  process.exit(0);
}
