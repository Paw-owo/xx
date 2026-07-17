import { strict as assert } from 'node:assert';

class LocalStorageMock {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
  }

  get length() { return this.values.size; }
  key(index) { return [...this.values.keys()][index] ?? null; }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

globalThis.localStorage = new LocalStorageMock({
  app_theme: JSON.stringify('dark'),
  app_cloud_server: JSON.stringify({ endpoint: 'https://cloud.example' }),
  chat_alice_config: JSON.stringify({ proactive: true }),
  push_msg_watermark_alice: JSON.stringify(42),
  unrelated_key: JSON.stringify('keep me')
});

const { __testHooks } = await import('../core/storage-manager.js');

__testHooks.clearManagedLocalStorage({ skipCloudConfig: true });

assert.equal(localStorage.getItem('app_theme'), null, 'static managed keys are cleared');
assert.equal(localStorage.getItem('chat_alice_config'), null, 'dynamic chat keys are cleared');
assert.equal(localStorage.getItem('push_msg_watermark_alice'), null, 'dynamic watermark keys are cleared');
assert.notEqual(localStorage.getItem('app_cloud_server'), null, 'cloud config is preserved when requested');
assert.notEqual(localStorage.getItem('unrelated_key'), null, 'unmanaged application data is preserved');

__testHooks.clearManagedLocalStorage();
assert.equal(localStorage.getItem('app_cloud_server'), null, 'cloud config is cleared for a full overwrite');

console.log('✓ storage-manager overwrite cleanup tests passed');
