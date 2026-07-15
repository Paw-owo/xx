"""
Verify test prerequisites on the live site https://paw.kiss.eoty.cn/
Only reads state — does NOT write localStorage, does NOT call internal functions.
Unlocks lock screen via UI keyboard clicks (password 0326) if present.
"""
import json
from playwright.sync_api import sync_playwright

URL = "https://paw.kiss.eoty.cn/"
PASSWORD = "0326"


def unlock(page):
    """Unlock via UI keyboard clicks if lock screen present."""
    lock = page.query_selector('#lock-screen')
    if not lock:
        return "no lock screen"
    disp = lock.evaluate("el => getComputedStyle(el).display")
    if disp == 'none' or 'hidden' in disp:
        return "lock hidden"
    for ch in PASSWORD:
        keys = page.query_selector_all('.lock-key')
        clicked = False
        for k in keys:
            txt = k.inner_text().strip()
            if txt == ch:
                k.dispatch_event('click')
                page.wait_for_timeout(120)
                clicked = True
                break
        if not clicked:
            return f"could not find key {ch}"
    page.wait_for_timeout(600)
    return "unlocked via UI"


def main():
    results = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        page.goto(URL, wait_until='networkidle', timeout=45000)
        page.wait_for_timeout(1500)

        results['lock_state'] = unlock(page)
        page.wait_for_timeout(800)

        characters = page.evaluate("""
            async () => {
                return new Promise((resolve) => {
                    const req = indexedDB.open('ai_phone_db');
                    req.onsuccess = (e) => {
                        const db = e.target.result;
                        if (!db.objectStoreNames.contains('characters')) { resolve([]); return; }
                        const tx = db.transaction('characters', 'readonly');
                        const store = tx.objectStore('characters');
                        const r = store.getAll();
                        r.onsuccess = () => resolve(r.result || []);
                        r.onerror = () => resolve([]);
                    };
                    req.onerror = () => resolve([]);
                });
            }
        """)
        results['characters'] = [
            {'id': c.get('id'), 'name': c.get('name'),
             'apiConfig': c.get('apiConfig')}
            for c in (characters or [])
        ]

        pool_items = page.evaluate("""
            async () => {
                return new Promise((resolve) => {
                    const req = indexedDB.open('ai_phone_db');
                    req.onsuccess = (e) => {
                        const db = e.target.result;
                        if (!db.objectStoreNames.contains('api_pool')) { resolve([]); return; }
                        const tx = db.transaction('api_pool', 'readonly');
                        const store = tx.objectStore('api_pool');
                        const r = store.getAll();
                        r.onsuccess = () => resolve(r.result || []);
                        r.onerror = () => resolve([]);
                    };
                    req.onerror = () => resolve([]);
                });
            }
        """)
        results['api_pool'] = [
            {'id': p.get('id'), 'name': p.get('name'),
             'endpoint': p.get('endpoint'),
             'groupType': p.get('groupType'),
             'status': p.get('status'),
             'hasKey': bool(p.get('apiKey')),
             'model': p.get('model')}
            for p in (pool_items or [])
        ]

        app_settings = page.evaluate("""
            () => {
                try {
                    const raw = localStorage.getItem('app_settings');
                    if (!raw) return null;
                    const s = JSON.parse(raw);
                    return {
                        defaultApiEndpointId: s.defaultApiEndpointId || '',
                        defaultModel: s.defaultModel || '',
                        apiEndpointsCount: Array.isArray(s.apiEndpoints) ? s.apiEndpoints.length : 0,
                        apiEndpoints: Array.isArray(s.apiEndpoints) ? s.apiEndpoints.map(e => ({
                            id: e.id, name: e.name, endpoint: e.endpoint, hasKey: !!e.apiKey
                        })) : [],
                        mcpServers: Array.isArray(s.mcpServers) ? s.mcpServers.map(m => ({
                            id: m.id, name: m.name, url: m.url, enabled: m.enabled,
                            tools: Array.isArray(m.tools) ? m.tools.length : 0
                        })) : []
                    };
                } catch (e) { return {error: String(e)}; }
            }
        """)
        results['app_settings'] = app_settings

        mcp_detail = page.evaluate("""
            () => {
                try {
                    const raw = localStorage.getItem('app_settings');
                    if (!raw) return [];
                    const s = JSON.parse(raw);
                    if (!Array.isArray(s.mcpServers)) return [];
                    const out = [];
                    for (const m of s.mcpServers) {
                        const tools = Array.isArray(m.tools) ? m.tools.map(t => ({
                            name: t.name, enabled: t.enabled, requireApproval: t.requireApproval
                        })) : [];
                        out.push({server: m.name, enabled: m.enabled, tools});
                    }
                    return out;
                } catch (e) { return []; }
            }
        """)
        results['mcp_detail'] = mcp_detail

        page.screenshot(path='/workspace/tests/_desktop_state.png', full_page=False)
        results['screenshot'] = '/workspace/tests/_desktop_state.png'

        browser.close()

    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
