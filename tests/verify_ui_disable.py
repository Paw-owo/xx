"""
真实浏览器 UI 验收：禁用（group toggle）endpoint 后角色下拉的表现。
所有操作走真实 UI（点击/输入），不直接写 localStorage/IndexedDB。
仅最后读取 IndexedDB / localStorage 做只读断言与证据采集。

注意：API 池 UI 没有"单个 endpoint 停用"按钮，只有分组级开关。
本脚本用分组开关作为唯一可用的"停用"机制来验收。
"""
import json
import sys
from playwright.sync_api import sync_playwright

URL = "http://localhost:8093/"
PASSWORD = "0326"
ENDPOINT_NAME = "禁用验收端点_请删除"
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


def read_groups(page):
    return page.evaluate("""
        () => {
            try { return JSON.parse(localStorage.getItem('app_api_pool_groups') || 'null'); }
            catch(e) { return null; }
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
    for _ in range(4):
        btn = page.query_selector('.settings-nav-btn')
        if not btn:
            break
        btn.dispatch_event('click')
        page.wait_for_timeout(600)
    page.wait_for_timeout(300)


def goto_api_pool(page):
    assert open_app(page, "设置"), "找不到设置图标"
    page.wait_for_timeout(900)
    nav = page.locator('button.settings-nav-item').filter(has_text="API 轮换池")
    nav.wait_for(timeout=5000)
    nav.dispatch_event('click')
    page.wait_for_timeout(900)
    page.wait_for_selector('.api-pool-host', timeout=5000)


def open_character_api_panel(page):
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
    return api_details.locator('.character-editor-panel')


def wait_dropdown_ready(page, api_panel):
    sel = api_panel.locator('select.input-card').first
    sel.wait_for(timeout=5000)
    for _ in range(20):
        opts = sel.evaluate("""(s) => Array.from(s.options).map(o => ({v:o.value, t:o.textContent, sel:o.selected}))""")
        if opts and not any('正在读取' in (o['t'] or '') for o in opts):
            break
        page.wait_for_timeout(250)
    return sel


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
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
        page.screenshot(path='/workspace/tests/_d_step0_desktop.png')

        # ---------- 1. 设置 → API 池，采集端点操作按钮 ----------
        log("=== 阶段1: API 池 UI 能力探测 ===")
        goto_api_pool(page)
        page.screenshot(path='/workspace/tests/_d_step1_pool_empty.png')

        # 先看分组开关是否存在（唯一停用机制）
        toggles = page.locator('.api-pool-toggle')
        log(f"分组级开关数量: {toggles.count()}")

        # ---------- 2. 新增付费 endpoint ----------
        log("新增付费 endpoint")
        page.locator('button:has-text("新增接口")').first.dispatch_event('click')
        page.wait_for_timeout(500)
        page.wait_for_selector('.settings-sheet', timeout=4000)
        fields = page.locator('.api-pool-form-field')
        fields.nth(0).locator('input').fill(ENDPOINT_NAME)
        fields.nth(1).locator('input').fill(ENDPOINT_URL)
        fields.nth(3).locator('input').fill(ENDPOINT_MODEL)
        page.wait_for_timeout(200)
        page.locator('.settings-sheet button:has-text("保存")').first.dispatch_event('click')
        page.wait_for_timeout(1200)

        pool = read_pool(page)
        created = [it for it in pool if it.get('name') == ENDPOINT_NAME]
        assert created, f"接口未保存到 api_pool，pool={pool}"
        ep_id = created[0]['id']
        log(f"已创建端点 id={ep_id} groupType={created[0].get('groupType')} status={created[0].get('status')}")

        # 采集该端点的操作按钮文案（证明无单端点停用）
        ep_card = page.locator(f'.api-pool-endpoint:has-text("{ENDPOINT_NAME}")').first
        action_texts = ep_card.locator('.api-pool-endpoint-actions button').evaluate_all(
            "els => els.map(e => e.textContent.trim())"
        )
        log(f"端点操作按钮文案: {action_texts}")
        page.screenshot(path='/workspace/tests/_d_step2_endpoint_actions.png')

        # ---------- 3. 角色编辑：关闭全局，选中端点，保存 ----------
        log("=== 阶段2: 角色选择该端点并保存 ===")
        back_to_desktop(page)
        api_panel = open_character_api_panel(page)
        sw = api_panel.locator('button.switch').first
        if sw.evaluate("el => el.classList.contains('active')"):
            sw.dispatch_event('click')
        page.wait_for_timeout(500)

        sel = wait_dropdown_ready(page, api_panel)
        opts = sel.evaluate("""(s) => Array.from(s.options).map(o => ({v:o.value, t:o.textContent, sel:o.selected}))""")
        log(f"选中前下拉选项: {json.dumps(opts, ensure_ascii=False)}")
        sel.select_option(ep_id)
        page.wait_for_timeout(300)
        log(f"选中后 select.value = {sel.evaluate('s => s.value')}")
        page.locator('.bottom-sheet button:has-text("保存")').first.dispatch_event('click')
        page.wait_for_timeout(1200)

        ch = read_character(page, CHAR_ID)
        saved_eid = ch.get('apiConfig', {}).get('endpointId') if ch else None
        log(f"保存后角色 apiConfig = {ch.get('apiConfig') if ch else None}")
        assert saved_eid == ep_id, f"角色 endpointId={saved_eid} != {ep_id}"
        page.screenshot(path='/workspace/tests/_d_step3_selected_saved.png')

        # ---------- 4. 回 API 池，停用付费组（唯一停用机制） ----------
        log("=== 阶段3: 停用付费组（分组开关） ===")
        back_to_desktop(page)
        goto_api_pool(page)
        # 付费组是第一个分组
        paid_toggle = page.locator('.api-pool-toggle').first
        was_on = paid_toggle.evaluate("el => el.classList.contains('on')")
        log(f"付费组开关初始 on={was_on}")
        if was_on:
            paid_toggle.dispatch_event('click')
            page.wait_for_timeout(600)
        groups_after = read_groups(page)
        log(f"停用后 groups(localStorage) = {json.dumps(groups_after, ensure_ascii=False)}")
        page.screenshot(path='/workspace/tests/_d_step4_group_disabled.png')

        # ---------- 5. 刷新，重进角色编辑，观察下拉 ----------
        log("=== 阶段4: 刷新后重进角色编辑，观察禁用表现 ===")
        page.reload(wait_until='networkidle', timeout=45000)
        page.wait_for_timeout(1200)
        unlock(page)
        page.wait_for_timeout(600)
        api_panel = open_character_api_panel(page)
        sel = wait_dropdown_ready(page, api_panel)
        opts = sel.evaluate("""(s) => Array.from(s.options).map(o => ({v:o.value, t:o.textContent, sel:o.selected}))""")
        log(f"禁用后下拉选项: {json.dumps(opts, ensure_ascii=False)}")
        sel_val = sel.evaluate("s => s.value")
        log(f"禁用后 select.value = {sel_val}")
        ch = read_character(page, CHAR_ID)
        log(f"禁用后 DB 中角色 apiConfig = {ch.get('apiConfig') if ch else None}")
        # 提示文本
        hint_text = api_panel.locator('.character-editor-hint').first.evaluate("el => el.textContent || ''") if api_panel.locator('.character-editor-hint').count() else ''
        log(f"禁用后提示文本: {hint_text}")
        page.screenshot(path='/workspace/tests/_d_step5_disabled_dropdown.png')

        # 断言：endpointId 保留 + 不静默切到别的端点
        assert sel_val == ep_id, f"endpointId 被静默改动: {sel_val} != {ep_id}"
        assert ch.get('apiConfig', {}).get('endpointId') == ep_id, "DB 中 endpointId 被静默抹掉"
        # 断言：当前选项明确标记分组已停用
        sel_opt = next((o for o in opts if o['v'] == ep_id), None)
        assert sel_opt and '所在分组已停用' in sel_opt['t'], f"选项未标记分组停用: {sel_opt}"
        assert sel_opt['sel'] is True, "分组停用项未被保持选中"
        # 断言：停用分组的其他 endpoint 不作为正常可选项出现（本测试只建了1个付费端点，所以可选项里不应出现它）
        normal_paid = [o for o in opts if o['v'] and o['v'] != ep_id and '付费' in o['t'] and '已停用' not in o['t'] and '不在池中' not in o['t']]
        assert not normal_paid, f"停用分组的端点仍作为正常可选项: {normal_paid}"
        # 断言：有自然不可用提示
        assert hint_text and '所在分组已停用' in hint_text and 'API 池' in hint_text, f"缺少自然提示: {hint_text}"
        log("断言通过：分组停用时 endpointId 保留 + 选项标记分组停用 + 自然提示 + 同组端点不作为正常可选项")

        # 关闭角色编辑返回
        page.locator('.bottom-sheet button:has-text("取消")').first.dispatch_event('click')
        page.wait_for_timeout(400)

        # ---------- 6. 恢复启用付费组，刷新重进 ----------
        log("=== 阶段5: 恢复启用付费组，刷新重进 ===")
        back_to_desktop(page)
        goto_api_pool(page)
        paid_toggle = page.locator('.api-pool-toggle').first
        is_on = paid_toggle.evaluate("el => el.classList.contains('on')")
        log(f"恢复前付费组开关 on={is_on}")
        if not is_on:
            paid_toggle.dispatch_event('click')
            page.wait_for_timeout(600)
        groups_restored = read_groups(page)
        log(f"恢复后 groups(localStorage) = {json.dumps(groups_restored, ensure_ascii=False)}")

        page.reload(wait_until='networkidle', timeout=45000)
        page.wait_for_timeout(1200)
        unlock(page)
        page.wait_for_timeout(600)
        api_panel = open_character_api_panel(page)
        sel = wait_dropdown_ready(page, api_panel)
        opts = sel.evaluate("""(s) => Array.from(s.options).map(o => ({v:o.value, t:o.textContent, sel:o.selected}))""")
        log(f"恢复后下拉选项: {json.dumps(opts, ensure_ascii=False)}")
        sel_val = sel.evaluate("s => s.value")
        log(f"恢复后 select.value = {sel_val}")
        ch = read_character(page, CHAR_ID)
        log(f"恢复后 DB 中角色 apiConfig = {ch.get('apiConfig') if ch else None}")
        hint_count = api_panel.locator('.character-editor-hint').count()
        log(f"恢复后提示节点数: {hint_count}")
        page.screenshot(path='/workspace/tests/_d_step6_restored_dropdown.png')

        # 断言：恢复后原 endpoint 自动回到普通可用显示 + 仍被选中
        restored_opt = next((o for o in opts if o['v'] == ep_id), None)
        assert restored_opt, f"恢复后端点选项消失: {opts}"
        assert '已停用' not in restored_opt['t'] and '分组已停用' not in restored_opt['t'], f"恢复后选项仍带停用标记: {restored_opt}"
        assert restored_opt['sel'] is True, "恢复后未被保持选中"
        assert sel_val == ep_id, f"恢复后 select.value 改变: {sel_val}"
        assert hint_count == 0, "恢复后仍残留不可用提示"
        # 未重新保存角色，DB 中 endpointId 应保持原值
        assert ch.get('apiConfig', {}).get('endpointId') == ep_id, "恢复后 DB endpointId 改变"
        log("断言通过：恢复启用后原端点自动恢复正常可用显示 + 仍被选中 + 无残留提示 + 无需重新保存")

        # ---------- 清理：恢复 useGlobal，删除端点 ----------
        log("=== 清理 ===")
        sw = api_panel.locator('button.switch').first
        if not sw.evaluate("el => el.classList.contains('active')"):
            sw.dispatch_event('click')
        page.wait_for_timeout(400)
        page.locator('.bottom-sheet button:has-text("保存")').first.dispatch_event('click')
        page.wait_for_timeout(800)
        back_to_desktop(page)
        goto_api_pool(page)
        del_btn = page.locator(f'.api-pool-endpoint:has-text("{ENDPOINT_NAME}") button:has-text("删除")').first
        del_btn.wait_for(timeout=5000)
        del_btn.dispatch_event('click')
        page.wait_for_timeout(500)
        page.locator('button.btn-primary:has-text("好呀")').first.dispatch_event('click')
        page.wait_for_timeout(1000)
        pool = read_pool(page)
        log(f"清理后 api_pool 端点数: {len(pool)}")

        browser.close()

    print("\n========== 验收证据 ==========")
    for e in evidence:
        print(e)


if __name__ == '__main__':
    main()
