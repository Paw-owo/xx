// tests/test_anonymous_fallback_privacy.mjs
// 验证匿名公益接口兜底必须由用户显式开启，且不绕过 paid/free 分组开关。

import { callAPI, silentRequest, __testHooks } from '../core/api.js';

const _store = new Map();
globalThis.localStorage = {
  getItem: (key) => (_store.has(key) ? _store.get(key) : null),
  setItem: (key, value) => { _store.set(key, String(value)); },
  removeItem: (key) => { _store.delete(key); },
  clear: () => { _store.clear(); }
};

globalThis.window = { showToast: () => {} };

function setJson(key, value) {
  _store.set(key, JSON.stringify(value));
}

function resetStorage({ anonymous = false, groups = null } = {}) {
  _store.clear();
  _store.set('app_api_pool_migrated', 'true');
  setJson('app_api_pool_last_success', { paid: '', free: '' });
  setJson('app_api_pool_groups', groups || {
    paid: { id: 'paid', name: '付费组', type: 'paid', enabled: true },
    free: { id: 'free', name: '免费组', type: 'free', enabled: true }
  });
  setJson('app_settings', { anonymousFallbackEnabled: anonymous, apiEndpoints: [] });
}

function installEmptyPool() {
  __testHooks.getApiPoolItems = async () => [];
  __testHooks.markPoolSourceSuccess = async () => {};
  __testHooks.markPoolSourceError = async () => {};
}

function installPool(items, calls) {
  __testHooks.getApiPoolItems = async () => items;
  __testHooks.requestOnce = async (opts) => {
    calls.push(opts.source);
    return { content: 'pool-ok', thinking: '', latencyMs: 1 };
  };
  __testHooks.markPoolSourceSuccess = async () => {};
  __testHooks.markPoolSourceError = async () => {};
}

function clearHooks() {
  __testHooks.requestOnce = null;
  __testHooks.getApiPoolItems = null;
  __testHooks.markPoolSourceSuccess = null;
  __testHooks.markPoolSourceError = null;
}

function paidEndpoint() {
  return {
    id: 'paid-1', groupType: 'paid', name: '我的接口', endpoint: 'https://mine.example/v1',
    provider: 'openai', keys: ['key'], model: 'gpt-4o-mini', models: ['gpt-4o-mini'],
    status: 'active', lastSuccessAt: '', lastErrorAt: '', lastErrorMessage: '', lastLatencyMs: 0
  };
}

let failures = 0;
function assert(condition, message) {
  if (condition) console.log(`  ✓ ${message}`);
  else { failures += 1; console.log(`  ✗ ${message}`); }
}

const originalFetch = globalThis.fetch;
let fetchCalls = [];
globalThis.fetch = async (url) => {
  fetchCalls.push(String(url));
  return new Response(JSON.stringify({ choices: [{ message: { content: 'anon-ok' } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
};

console.log('\n[1] 默认关闭：无自定义接口时不请求匿名源');
resetStorage({ anonymous: false });
installEmptyPool();
fetchCalls = [];
let errors = [];
const closedResult = await callAPI({ messages: [{ role: 'user', content: 'hi' }], onError: (error) => errors.push(error) });
assert(closedResult === null, '返回正常无接口结果');
assert(fetchCalls.length === 0, '没有请求 LLM7 / OVHcloud 等匿名源');
assert(/匿名公益接口兜底/.test(errors[0]?.message || ''), '错误提示引导去设置或开启公益兜底');

console.log('\n[2] paid/free 分组关闭：不绕过分组开关请求匿名源');
resetStorage({
  anonymous: true,
  groups: {
    paid: { id: 'paid', name: '付费组', type: 'paid', enabled: false },
    free: { id: 'free', name: '免费组', type: 'free', enabled: false }
  }
});
installEmptyPool();
fetchCalls = [];
const disabledResult = await callAPI({ messages: [{ role: 'user', content: 'hi' }] });
assert(disabledResult === null, '分组关闭时返回无接口结果');
assert(fetchCalls.length === 0, '即使匿名开关已开，也不绕过关闭的 free 分组');

console.log('\n[3] 显式开启：无其他可用接口时才请求匿名源');
resetStorage({ anonymous: true });
installEmptyPool();
fetchCalls = [];
const anonResult = await callAPI({ messages: [{ role: 'user', content: 'hi' }] });
assert(anonResult?.content === 'anon-ok', '匿名兜底开启后可返回匿名源结果');
assert(fetchCalls.some((url) => /llm7|ovh/i.test(url)), '确实进入匿名公益源候选');

console.log('\n[4] 有自定义接口：优先使用用户配置，不优先走匿名源');
resetStorage({ anonymous: true });
fetchCalls = [];
const poolCalls = [];
installPool([paidEndpoint()], poolCalls);
const poolResult = await callAPI({ messages: [{ role: 'user', content: 'hi' }] });
assert(poolResult?.content === 'pool-ok', '自定义轮换池接口优先返回');
assert(poolCalls.length === 1 && poolCalls[0].poolId === 'paid-1', '调用的是用户自定义接口');
assert(fetchCalls.length === 0, '未提前请求匿名源');

console.log('\n[5] silentRequest 同样遵守默认关闭');
resetStorage({ anonymous: false });
installEmptyPool();
fetchCalls = [];
const silentResult = await silentRequest([{ role: 'user', content: 'hi' }]);
assert(silentResult === '', '静默请求在无接口时返回空内容');
assert(fetchCalls.length === 0, '静默请求没有请求匿名源');

clearHooks();
if (originalFetch) globalThis.fetch = originalFetch;
else delete globalThis.fetch;

if (failures) {
  console.error(`anonymous fallback privacy tests failed: ${failures}`);
  process.exit(1);
}
console.log('anonymous fallback privacy tests passed');
