"""
真实浏览器 UI 验收：API 池新增 endpoint → 角色下拉可选 → 保存 → 刷新保留 → 删除后失效提示
所有操作走真实 UI（点击/输入），不直接写 localStorage/IndexedDB。
仅最后读取 IndexedDB 做只读断言。
"""
import json
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8093/"
PASSWORD = "0326"
ENDPOINT_NAME = "验收测试端点_请删除"
ENDPOINT_URL = "https://api.example.com/v1"
ENDPOINT_MODEL = "gpt-4o-mini"
CHAR_ID = "default_chuyi"

evidence = []


def log(msg):
    print(f"[STEP] {msg}", flush=True)
    evidence.append(msg)


def read_character(page, char_id):
    return page.evaluate("""
        async (id) => {
            return new Promise((resolve) => {
                const req = indexedDB.open('ai_phone_db');
                req.onsuccess = (e) => {
                    const db = e.target.result;
                    const tx = db.transaction('characters', 'readonly');
                    const r = tx.objectStore('characters').get(id);
                    r.onsuccess = () => resolve(r.result || null);
                    r.onerror = () => resolve(null);
                };
                req.onerror = () => resolve(null);
            });
        }
    """, char_id)


def read_pool(page):
    return page.evaluate("""
        async () => {
            return new Promise((resolve) => {
                const req = indexedDB.open('ai_phone_db');
                req.onsuccess = (e) => {
                    const db = e.target.result;
                    const tx = db.transaction('api_pool', 'readonly');
                    const r = tx.objectStore('api_pool').getAll();
                    r.onsuccess = () => resolve(r.result || []);
                    r.onerror = () => resolve([]);
                };
                req.onerror = () => resolve([]);
            });
        }
    """)


def unlock(page):
    lock = page.query_selector('#lock-screen')
    if not lock:
        return
    disp = lock.evaluate("el => getComputedStyle(el).display")
    if disp == 'none' or 'hidden' in disp:
        return
    for ch in PASSWORD:
        for k in page.query_selector_all('.lock-key'):
            if k.inner_text().strip() == ch:
                k.dispatch_event('click')
                page.wait_for_timeout(100)
                break
    page.wait_for_timeout(500)


def open_app(page, aria_label):
    btn = page.query_selector(f'button.desktop-icon[aria-label="{aria_label}"]')
    if not btn:
        return False
    btn.dispatch_event('click')
    return True


def back_to_desktop(page):
    """点设置返回按钮直到回到桌面（按钮消失）。apiPool→home→desktop。"""
    for _ in range(4):
        btn = page.query_selector('.settings-nav-btn')
        if not btn:
            break
        btn.dispatch_event('click')
        page.wait_for_timeout(600)
    page.wait_for_timeout(300)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        # 启动竞态：with_server 探针通过后 http.server 偶发首连 ERR_EMPTY_RESPONSE，重试
        last_err = None
        for _ in range(5):
            try:
                page.goto(URL, wait_until='networkidle', timeout=30000)
                last_err = None
                break
            except Exception as e:
                last_err = e
                page.wait_for_timeout(800)
        if last_err:
            raise last_err
        page.wait_for_timeout(1200)
        unlock(page)
        page.wait_for_timeout(600)
        page.screenshot(path='/workspace/tests/_v_step0_desktop.png')

        # ---------- 1. 设置 → API 轮换池 ----------
        log("打开设置 app")
        assert open_app(page, "设置"), "找不到设置图标"
        page.wait_for_timeout(900)

        log("进入 API 轮换池")
        nav = page.locator('button.settings-nav-item').filter(has_text="API 轮换池")
        nav.wait_for(timeout=5000)
        nav.dispatch_event('click')
        page.wait_for_timeout(900)
        page.wait_for_selector('.api-pool-host', timeout=5000)
        page.screenshot(path='/workspace/tests/_v_step1_pool_empty.png')

        # ---------- 2. 新增接口 ----------
        log("点击新增接口")
        page.locator('button:has-text("新增接口")').first.dispatch_event('click')
        page.wait_for_timeout(500)
        page.wait_for_selector('.settings-sheet', timeout=4000)

        log("填写新增接口表单")
        # 字段顺序：名称 / URL / Key(textarea) / 模型
        fields = page.locator('.api-pool-form-field')
        fields.nth(0).locator('input').fill(ENDPOINT_NAME)
        fields.nth(1).locator('input').fill(ENDPOINT_URL)
        # key 留空
        fields.nth(3).locator('input').fill(ENDPOINT_MODEL)
        page.wait_for_timeout(200)
        page.screenshot(path='/workspace/tests/_v_step2_form_filled.png')

        log("保存接口")
        page.locator('.settings-sheet button:has-text("保存")').first.dispatch_event('click')
        page.wait_for_timeout(1200)
        page.screenshot(path='/workspace/tests/_v_step3_pool_after_add.png')

        pool = read_pool(page)
        created = [it for it in pool if it.get('name') == ENDPOINT_NAME]
        assert created, f"接口未保存到 api_pool，pool={pool}"
        ep_id = created[0]['id']
        log(f"已创建端点 id={ep_id} name={created[0]['name']} groupType={created[0].get('groupType')} status={created[0].get('status')}")
        assert created[0].get('groupType') == 'paid', "分组应为 paid"

        # ---------- 4. 返回桌面 ----------
        log("返回桌面")
        back_to_desktop(page)

        # ---------- 5. 角色编辑 → 关闭全局 ----------
        log("打开角色 app")
        assert open_app(page, "角色"), "找不到角色图标"
        page.wait_for_timeout(900)

        log("点击初一角色卡打开编辑器")
        page.locator('.character-card').first.dispatch_event('click')
        page.wait_for_timeout(700)
        page.wait_for_selector('.bottom-sheet', timeout=5000)

        log("展开 API 配置")
        api_details = page.locator('details:has(summary:has-text("API 配置"))')
        api_details.wait_for(timeout=5000)
        # 打开 details
        if not api_details.evaluate("el => el.open"):
            api_details.locator('summary').dispatch_event('click')
        page.wait_for_timeout(400)

        log("关闭'使用全局配置'")
        api_panel = api_details.locator('.character-editor-panel')
        sw = api_panel.locator('button.switch').first
        # 初始应为 active（useGlobal !== false）
        is_active = sw.evaluate("el => el.classList.contains('active')")
        log(f"使用全局开关初始 active={is_active}")
        if is_active:
            sw.dispatch_event('click')
        page.wait_for_timeout(500)

        # ---------- 6. 等待下拉异步加载，确认新端点出现 ----------
        log("等待端点下拉异步加载")
        sel = api_panel.locator('select.input-card').first
        sel.wait_for(timeout=5000)
        # 轮询直到下拉不再是“正在读取”且包含目标 option
        found_option = False
        for _ in range(20):
            opts = sel.evaluate("""(s) => Array.from(s.options).map(o => ({v:o.value, t:o.textContent, sel:o.selected}))""")
            if opts and not any('正在读取' in (o['t'] or '') for o in opts):
                if any(o['v'] == ep_id for o in opts):
                    found_option = True
                    break
            page.wait_for_timeout(250)

        opts = sel.evaluate("""(s) => Array.from(s.options).map(o => ({v:o.value, t:o.textContent, sel:o.selected}))""")
        log(f"下拉选项: {json.dumps(opts, ensure_ascii=False)}")
        assert found_option, f"新端点未出现在角色下拉，options={opts}"
        page.screenshot(path='/workspace/tests/_v_step4_dropdown_has_endpoint.png')

        # ---------- 7. 选中并保存 ----------
        log("选中该端点")
        sel.select_option(ep_id)
        page.wait_for_timeout(300)
        sel_val = sel.evaluate("s => s.value")
        log(f"选中后 select.value = {sel_val}")
        assert sel_val == ep_id, "select.value 未等于端点 id"

        log("保存角色")
        page.locator('.bottom-sheet button:has-text("保存")').first.dispatch_event('click')
        page.wait_for_timeout(1200)
        page.screenshot(path='/workspace/tests/_v_step5_saved.png')

        # ---------- 8. 只读断言：apiConfig.endpointId === ep_id ----------
        ch = read_character(page, CHAR_ID)
        saved_eid = ch.get('apiConfig', {}).get('endpointId') if ch else None
        log(f"保存后角色 apiConfig = {ch.get('apiConfig') if ch else None}")
        assert saved_eid == ep_id, f"角色 endpointId={saved_eid} 不等于池端点 id={ep_id}"
        log("断言通过：角色 endpointId 等于 api_pool 真实端点 id")

        # ---------- 9. 刷新页面 ----------
        log("刷新页面")
        page.reload(wait_until='networkidle', timeout=45000)
        page.wait_for_timeout(1200)
        unlock(page)
        page.wait_for_timeout(600)

        # ---------- 10. 重进角色编辑，确认仍选中 ----------
        log("重进角色 app 验证刷新后保留")
        assert open_app(page, "角色")
        page.wait_for_timeout(900)
        page.locator('.character-card').first.dispatch_event('click')
        page.wait_for_timeout(700)
        page.wait_for_selector('.bottom-sheet', timeout=5000)
        api_details = page.locator('details:has(summary:has-text("API 配置"))')
        api_details.wait_for(timeout=5000)
        if not api_details.evaluate("el => el.open"):
            api_details.locator('summary').dispatch_event('click')
        page.wait_for_timeout(400)
        api_panel = api_details.locator('.character-editor-panel')
        sel = api_panel.locator('select.input-card').first
        sel.wait_for(timeout=5000)
        for _ in range(20):
            opts = sel.evaluate("""(s) => Array.from(s.options).map(o => ({v:o.value, t:o.textContent, sel:o.selected}))""")
            if opts and not any('正在读取' in (o['t'] or '') for o in opts):
                break
            page.wait_for_timeout(250)
        opts = sel.evaluate("""(s) => Array.from(s.options).map(o => ({v:o.value, t:o.textContent, sel:o.selected}))""")
        log(f"刷新后下拉选项: {json.dumps(opts, ensure_ascii=False)}")
        sel_val = sel.evaluate("s => s.value")
        log(f"刷新后 select.value = {sel_val}")
        assert sel_val == ep_id, f"刷新后 select.value={sel_val} 不等于端点 id={ep_id}"
        ch = read_character(page, CHAR_ID)
        assert ch.get('apiConfig', {}).get('endpointId') == ep_id, "刷新后 DB 中 endpointId 丢失"
        log("断言通过：刷新后 endpointId 保留")
        page.screenshot(path='/workspace/tests/_v_step6_after_refresh.png')

        # 关闭角色编辑，返回桌面
        page.locator('.bottom-sheet button:has-text("取消")').first.dispatch_event('click')
        page.wait_for_timeout(400)

        # ---------- 11. 删除该端点 ----------
        log("返回桌面，进设置→API 池，删除端点")
        back_to_desktop(page)
        assert open_app(page, "设置")
        page.wait_for_timeout(800)
        page.locator('button.settings-nav-item').filter(has_text="API 轮换池").dispatch_event('click')
        page.wait_for_timeout(800)
        page.wait_for_selector('.api-pool-host', timeout=5000)

        del_btn = page.locator(f'.api-pool-endpoint:has-text("{ENDPOINT_NAME}") button:has-text("删除")').first
        del_btn.wait_for(timeout=5000)
        del_btn.dispatch_event('click')
        page.wait_for_timeout(500)
        # 确认对话框：好呀
        page.locator('button.btn-primary:has-text("好呀")').first.dispatch_event('click')
        page.wait_for_timeout(1000)
        pool = read_pool(page)
        assert not any(it.get('name') == ENDPOINT_NAME for it in pool), "端点未被删除"
        log("端点已从 api_pool 删除")

        # ---------- 12. 重进角色编辑，确认失效提示 + endpointId 保留 ----------
        log("重进角色编辑验证失效提示与 endpointId 保留")
        back_to_desktop(page)
        assert open_app(page, "角色")
        page.wait_for_timeout(800)
        page.locator('.character-card').first.dispatch_event('click')
        page.wait_for_timeout(700)
        page.wait_for_selector('.bottom-sheet', timeout=5000)
        api_details = page.locator('details:has(summary:has-text("API 配置"))')
        api_details.wait_for(timeout=5000)
        if not api_details.evaluate("el => el.open"):
            api_details.locator('summary').dispatch_event('click')
        page.wait_for_timeout(400)
        api_panel = api_details.locator('.character-editor-panel')
        sel = api_panel.locator('select.input-card').first
        sel.wait_for(timeout=5000)
        for _ in range(20):
            opts = sel.evaluate("""(s) => Array.from(s.options).map(o => ({v:o.value, t:o.textContent, sel:o.selected}))""")
            if opts and not any('正在读取' in (o['t'] or '') for o in opts):
                break
            page.wait_for_timeout(250)
        opts = sel.evaluate("""(s) => Array.from(s.options).map(o => ({v:o.value, t:o.textContent, sel:o.selected}))""")
        log(f"删除后下拉选项: {json.dumps(opts, ensure_ascii=False)}")
        sel_val = sel.evaluate("s => s.value")
        log(f"删除后 select.value = {sel_val}")

        stale_shown = any('不在池中' in (o['t'] or '') or '已禁用' in (o['t'] or '') or '不可用' in (o['t'] or '') for o in opts)
        assert stale_shown, f"未显示失效提示，options={opts}"
        # endpointId 应被保留（select.value 仍等于原 ep_id，未静默切到别的端点）
        assert sel_val == ep_id, f"endpointId 被静默改动：{sel_val} != {ep_id}"
        ch = read_character(page, CHAR_ID)
        assert ch.get('apiConfig', {}).get('endpointId') == ep_id, "DB 中 endpointId 被静默抹掉"
        log("断言通过：失效提示显示 + endpointId 保留未静默切换")
        page.screenshot(path='/workspace/tests/_v_step7_stale_warning.png')

        # 清理：把角色 endpointId 清掉，恢复 useGlobal，避免污染
        log("清理：恢复角色 useGlobal=true")
        sw = api_panel.locator('button.switch').first
        if not sw.evaluate("el => el.classList.contains('active')"):
            sw.dispatch_event('click')
        page.wait_for_timeout(400)
        page.locator('.bottom-sheet button:has-text("保存")').first.dispatch_event('click')
        page.wait_for_timeout(800)

        browser.close()

    print("\n========== 验收证据 ==========")
    for e in evidence:
        print(e)
    print("\n全部断言通过 ✅")


if __name__ == '__main__':
    main()
