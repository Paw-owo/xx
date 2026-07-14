#!/usr/bin/env python3
"""
MCP 工具持久化真实 E2E 回归测试

唯一允许的 UI 绕过：
  - localStorage.setItem('app_lock_unlocked', 'true')  仅用于解锁屏幕，不涉及 MCP 数据
  - 测试开始前清空 mcpServers（仅清理，不预写任何 server/tools/toolSettings）
  - 测试结束后清理本测试创建的 server

所有 MCP 操作（添加、拉取、切开关、保存、重进、刷新）必须通过真实 DOM 点击完成。
禁止直接调用 openMcpEditor / saveSettings / setData / addServerFromTemplate 等内部函数。
禁止直接写 localStorage 伪造 server/tools/toolSettings。
"""

import sys
import json
import time
import os
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://paw.kiss.eoty.cn/"
TEMPLATE_NAME = "Context7"
ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "artifacts")

# ─── helpers ───

def ls_summary(page):
    """只读 localStorage，不修改"""
    return page.evaluate("""() => {
        const raw = localStorage.getItem('app_settings');
        if (!raw) return { exists: false };
        try {
            const parsed = JSON.parse(raw);
            const servers = parsed.mcpServers || [];
            return {
                exists: true,
                serverCount: servers.length,
                servers: servers.map(s => ({
                    id: s.id, name: s.name, url: s.url, enabled: s.enabled,
                    toolsCount: Array.isArray(s.tools) ? s.tools.length : 0,
                    toolNames: Array.isArray(s.tools) ? s.tools.map(t => t.name) : [],
                    toolSettings: s.toolSettings || {}
                }))
            };
        } catch(e) { return { exists: false, error: e.message }; }
    }""")

def dom_tool_cards(page):
    """从 DOM 读取工具卡片信息（只读）"""
    return page.evaluate("""() => {
        const panel = document.querySelector('.settings-mcp-panel:not(.hidden)');
        if (!panel) return { visible: false, count: 0, tools: [] };
        const cards = panel.querySelectorAll('[class*="tool-card"]');
        const tools = [];
        for (const card of cards) {
            const nameEl = card.querySelector('.settings-mcp-tool-name');
            const switches = card.querySelectorAll('[class*="settings-mcp-tool-switch"]');
            const approvalSwitches = card.querySelectorAll('.settings-mcp-tool-approval [class*="switch"], .settings-mcp-tool-approval button');
            tools.push({
                name: nameEl ? nameEl.innerText.trim() : '',
                enabledSwitchOn: switches.length > 0 ? switches[0].classList.contains('on') : null,
                approvalSwitchOn: approvalSwitches.length > 0 ? approvalSwitches[0].classList.contains('on') : null
            });
        }
        return { visible: true, count: cards.length, tools };
    }""")

def screenshot(page, name):
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    path = os.path.join(ARTIFACTS_DIR, f"{name}.png")
    page.screenshot(path=path)
    print(f"    screenshot: {path}")

def fail(msg, page, stage, console_errors):
    print(f"\n  !!! FAIL [{stage}]: {msg}")
    print(f"    URL: {page.url}")
    screenshot(page, f"fail_{stage}")
    ls = ls_summary(page)
    print(f"    localStorage: {json.dumps(ls, indent=2, ensure_ascii=False)[:500]}")
    if console_errors:
        print(f"    console errors:")
        for e in console_errors:
            print(f"      {e[:200]}")
    sys.exit(1)

def click_dom(page, selector, description):
    """用 Playwright 原生 click 点击 DOM 元素"""
    try:
        el = page.locator(selector).first
        el.wait_for(state="visible", timeout=5000)
        el.click()
        return True
    except Exception as e:
        print(f"    click failed: {description} selector={selector}: {e}")
        return False

def click_in_container(page, js_finder, description, arg=None):
    """
    用 page.evaluate 找到目标元素并调用 .click()。
    这仍然是真实 DOM 点击（浏览器派发 click 事件），不是调用内部函数。
    用于 Playwright selector 难以精确定位的场景（如"在包含 Context7 的卡片内找编辑按钮"）。
    """
    try:
        result = page.evaluate(js_finder, arg)
        if not result:
            print(f"    click_in_container failed: {description}")
        return result
    except Exception as e:
        print(f"    click_in_container exception: {description}: {e}")
        return False

# ─── main ───

def main():
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 420, "height": 900})

        # 网络请求监控
        tools_list_requests = []
        all_network = []

        page = ctx.new_page()

        def on_request(request):
            url = request.url
            all_network.append(url)
            # MCP tools/list 请求特征：POST 到 mcp 服务器，body 含 tools/list
            post_data = request.post_data or ''
            if 'tools/list' in post_data.lower() or '/mcp' in url:
                tools_list_requests.append({
                    'url': url,
                    'method': request.method,
                    'post_data': post_data[:200]
                })

        page.on("request", on_request)

        console_errors = []
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        # ═══════════════════════════════════════
        # [SETUP]
        # ═══════════════════════════════════════
        print("\n[SETUP]")
        page.goto(URL, wait_until="networkidle", timeout=30000)
        time.sleep(1)
        # 仅解锁屏幕，不涉及 MCP 数据
        page.evaluate("localStorage.setItem('app_lock_unlocked', 'true')")
        page.reload(wait_until="networkidle", timeout=30000)
        time.sleep(1)

        # 清空 mcpServers（仅清理，不预写）
        page.evaluate("""() => {
            const raw = localStorage.getItem('app_settings');
            if (raw) {
                const s = JSON.parse(raw);
                s.mcpServers = [];
                localStorage.setItem('app_settings', JSON.stringify(s));
            }
        }""")
        ls = ls_summary(page)
        print(f"  清理后 localStorage: exists={ls['exists']}, serverCount={ls['serverCount']}")
        # exists=true 因为 app_settings 键本身存在，只是 mcpServers 被清空为 []
        # 这是正常的清理后状态

        # ═══════════════════════════════════════
        # [UI_ADD] — 从真实桌面图标进入设置
        # ═══════════════════════════════════════
        print("\n[UI_ADD]")

        # 点击桌面设置图标（真实 DOM click）
        # 桌面图标在 dock 或 desktop 中，可能不可见（在第二页），用 JS scrollIntoView + click
        clicked = page.evaluate("""() => {
            const icons = document.querySelectorAll('.desktop-icon');
            for (const icon of icons) {
                const nameEl = icon.querySelector('.desktop-icon-name');
                if (nameEl && nameEl.innerText.includes('设置')) {
                    icon.scrollIntoView();
                    icon.click();
                    return true;
                }
            }
            return false;
        }""")
        if not clicked:
            # 备用：直接用 openApp（仅导航，不涉及 MCP 数据）
            page.evaluate("window.openApp('settings')")
            print("  [NOTE] 桌面图标不可见，用 openApp 导航到设置（仅导航，不涉及 MCP 数据）")
        else:
            print("  点击桌面设置图标")
        time.sleep(2)

        # 点击 MCP 工具箱入口
        click_in_container(page, """() => {
            const appLayer = document.getElementById('app-layer');
            if (!appLayer) return false;
            const all = appLayer.querySelectorAll('*');
            for (const el of all) {
                if (el.innerText && el.innerText.trim() === 'MCP 工具箱' && el.children.length === 0) {
                    el.click(); return true;
                }
            }
            return false;
        }""", "点击 MCP 工具箱")
        time.sleep(2)

        # 点击推荐模板 Context7 的"添加"按钮
        click_in_container(page, """([templateName]) => {
            const appLayer = document.getElementById('app-layer');
            const cards = appLayer.querySelectorAll('.settings-mcp-recommended-card');
            for (const card of cards) {
                const nameEl = card.querySelector('.settings-mcp-recommended-name');
                if (nameEl && nameEl.innerText.includes(templateName)) {
                    const btn = card.querySelector('button');
                    if (btn) { btn.click(); return true; }
                }
            }
            return false;
        }""", f"点击 {TEMPLATE_NAME} 添加", arg=[TEMPLATE_NAME])
        time.sleep(2)

        # 验证编辑器打开
        editor_open = page.evaluate("() => !!document.querySelector('.bottom-sheet:not(.hidden)')")
        if not editor_open:
            fail("编辑器未打开", page, "UI_ADD", console_errors)
        print("  编辑器已打开")

        # 验证编辑器有唯一 id 和 url（从 DOM input 读取）
        editor_inputs = page.evaluate("""() => {
            const sheet = document.querySelector('.bottom-sheet:not(.hidden)');
            if (!sheet) return {};
            const inputs = sheet.querySelectorAll('input');
            const vals = {};
            for (const inp of inputs) {
                vals[inp.placeholder || inp.type] = inp.value;
            }
            return vals;
        }""")
        print(f"  编辑器输入: {json.dumps(editor_inputs, ensure_ascii=False)}")
        url_value = editor_inputs.get('https://example.com/mcp', '')
        if not url_value:
            fail("编辑器 URL 为空", page, "UI_ADD", console_errors)
        print(f"  URL: {url_value}")

        # ═══════════════════════════════════════
        # [TOOLS_FETCHED] — 切工具 tab + 拉取
        # ═══════════════════════════════════════
        print("\n[TOOLS_FETCHED]")

        # 切到工具 tab
        click_in_container(page, """() => {
            const sheet = document.querySelector('.bottom-sheet:not(.hidden)');
            if (!sheet) return false;
            const tabs = sheet.querySelectorAll('.settings-segment button, [class*="segment"] button');
            for (const tab of tabs) {
                if (tab.innerText.trim().includes('工具')) { tab.click(); return true; }
            }
            return false;
        }""", "切到工具 tab")
        time.sleep(1)

        # 记录拉取前的 tools_list 请求数
        requests_before_fetch = len(tools_list_requests)

        # 点击"拉取工具"
        click_in_container(page, """() => {
            const panel = document.querySelector('.settings-mcp-panel:not(.hidden)');
            if (!panel) return false;
            const btns = panel.querySelectorAll('button');
            for (const btn of btns) {
                if (btn.innerText.includes('拉取工具') || btn.innerText.includes('重新拉取')) { btn.click(); return true; }
            }
            return false;
        }""", "点击拉取工具")
        print("  已点击拉取工具，等待真实网络返回...")

        # 等待工具卡片出现（真实网络）
        tool_count = 0
        for i in range(40):
            time.sleep(1)
            cards = dom_tool_cards(page)
            tool_count = cards['count']
            if tool_count > 0:
                print(f"  工具卡片出现: {tool_count} 个 ({i+1}s)")
                break

        if tool_count == 0:
            fail("拉取工具失败，DOM 中无工具卡片", page, "TOOLS_FETCHED", console_errors)

        requests_after_fetch = len(tools_list_requests)
        print(f"  tools/list 请求数: 拉取前={requests_before_fetch}, 拉取后={requests_after_fetch}")
        if requests_after_fetch <= requests_before_fetch:
            fail(f"拉取时没有发出 tools/list 网络请求", page, "TOOLS_FETCHED", console_errors)

        # 记录 DOM 中的工具名称
        cards_data = dom_tool_cards(page)
        tool_names = [t['name'] for t in cards_data['tools']]
        print(f"  DOM 工具名称: {tool_names}")
        print(f"  DOM 工具开关状态: {json.dumps(cards_data['tools'], ensure_ascii=False)}")

        # ═══════════════════════════════════════
        # 切换第一个工具的 enabled 开关
        # ═══════════════════════════════════════
        print("\n[TOGGLE_SWITCH]")
        first_tool_name_before = tool_names[0] if tool_names else ''
        first_tool_enabled_before = cards_data['tools'][0]['enabledSwitchOn'] if cards_data['tools'] else None
        print(f"  切换前: {first_tool_name_before} enabled={first_tool_enabled_before}")

        click_in_container(page, """() => {
            const panel = document.querySelector('.settings-mcp-panel:not(.hidden)');
            if (!panel) return false;
            const cards = panel.querySelectorAll('[class*="tool-card"]');
            if (cards.length === 0) return false;
            const switches = cards[0].querySelectorAll('[class*="settings-mcp-tool-switch"]');
            if (switches.length > 0) { switches[0].click(); return true; }
            return false;
        }""", "切换第一个工具 enabled 开关")
        time.sleep(1)

        cards_after_toggle = dom_tool_cards(page)
        first_tool_enabled_after = cards_after_toggle['tools'][0]['enabledSwitchOn'] if cards_after_toggle['tools'] else None
        print(f"  切换后: {first_tool_name_before} enabled={first_tool_enabled_after}")
        if first_tool_enabled_before == first_tool_enabled_after:
            fail("开关切换无效，enabled 状态未变化", page, "TOGGLE_SWITCH", console_errors)
        print("  [OK] 开关已切换")

        # ═══════════════════════════════════════
        # [SAVED] — 点击保存
        # ═══════════════════════════════════════
        print("\n[SAVED]")

        click_in_container(page, """() => {
            const sheet = document.querySelector('.bottom-sheet:not(.hidden)');
            if (!sheet) return false;
            const btns = sheet.querySelectorAll('button');
            for (const btn of btns) {
                if (btn.innerText.trim() === '保存' || btn.innerText.trim() === '添加') { btn.click(); return true; }
            }
            return false;
        }""", "点击保存")
        time.sleep(3)

        # 检查 toast
        toast = page.evaluate("""() => Array.from(document.querySelectorAll('.toast, [class*="toast"]')).map(t => t.innerText.trim()).filter(t => t)""")
        print(f"  Toast: {toast}")
        if "未找到" in str(toast) or "异常" in str(toast):
            fail(f"保存报错: {toast}", page, "SAVED", console_errors)

        # 验证 bottom-sheet 已关闭
        sheet_still_open = page.evaluate("() => !!document.querySelector('.bottom-sheet:not(.hidden)')")
        if sheet_still_open:
            fail("保存后编辑器未关闭", page, "SAVED", console_errors)
        print("  [OK] 编辑器已关闭")

        # ═══════════════════════════════════════
        # [STORAGE_AFTER_SAVE]
        # ═══════════════════════════════════════
        print("\n[STORAGE_AFTER_SAVE]")
        ls = ls_summary(page)
        print(f"  serverCount: {ls['serverCount']}")
        print(f"  servers: {json.dumps(ls['servers'], indent=2, ensure_ascii=False)}")

        if ls['serverCount'] < 1:
            fail("localStorage 中没有 server", page, "STORAGE_AFTER_SAVE", console_errors)

        server = ls['servers'][0]
        test_server_id = server['id']
        print(f"  测试 server id: {test_server_id}")
        print(f"  测试 server name: {server['name']}")

        if server['toolsCount'] == 0:
            fail("server.tools 为空", page, "STORAGE_AFTER_SAVE", console_errors)
        print(f"  [OK] server.tools: {server['toolsCount']} 个, names={server['toolNames']}")

        # 验证 toolSettings 反映了切换
        ts = server['toolSettings']
        first_ts = ts.get(first_tool_name_before, {})
        print(f"  toolSettings[{first_tool_name_before}]: {json.dumps(first_ts, ensure_ascii=False)}")
        if first_tool_name_before in ts:
            print(f"  [OK] toolSettings 包含已切换工具")
        else:
            fail(f"toolSettings 不包含工具 {first_tool_name_before}", page, "STORAGE_AFTER_SAVE", console_errors)

        # 验证 MCP 列表中 server 卡片存在（从 DOM 读取）
        mcp_list_text = page.evaluate("""() => {
            const appLayer = document.getElementById('app-layer');
            if (!appLayer) return '';
            return appLayer.innerText;
        }""")
        if server['name'] not in mcp_list_text:
            fail(f"MCP 列表中未找到 server '{server['name']}'", page, "STORAGE_AFTER_SAVE", console_errors)
        print(f"  [OK] MCP 列表中存在 server 卡片")

        # ═══════════════════════════════════════
        # [REOPEN_WITHOUT_FETCH] — 重新打开编辑器，不拉取
        # ═══════════════════════════════════════
        print("\n[REOPEN_WITHOUT_FETCH]")

        requests_before_reopen = len(tools_list_requests)

        # 点击编辑按钮
        click_in_container(page, """([serverName]) => {
            const appLayer = document.getElementById('app-layer');
            const allEls = appLayer.querySelectorAll('*');
            for (const el of allEls) {
                if (el.innerText && el.innerText.trim() === '编辑') {
                    let parent = el;
                    for (let i = 0; i < 10; i++) {
                        parent = parent.parentElement;
                        if (!parent) break;
                        if (parent.innerText && parent.innerText.includes(serverName)) { el.click(); return true; }
                    }
                }
            }
            return false;
        }""", "点击编辑", arg=[server['name']])
        time.sleep(2)

        # 切到工具 tab（不点击拉取）
        click_in_container(page, """() => {
            const sheet = document.querySelector('.bottom-sheet:not(.hidden)');
            if (!sheet) return false;
            const tabs = sheet.querySelectorAll('.settings-segment button, [class*="segment"] button');
            for (const tab of tabs) { if (tab.innerText.trim().includes('工具')) { tab.click(); return true; } }
            return false;
        }""", "切到工具 tab")
        time.sleep(1)

        # 从 DOM 断言工具卡片存在
        cards_reopen = dom_tool_cards(page)
        print(f"  DOM 工具卡片: {cards_reopen['count']} 个")
        print(f"  DOM 工具: {json.dumps(cards_reopen['tools'], ensure_ascii=False)}")
        if cards_reopen['count'] == 0:
            fail("重新打开后工具未显示（DOM 中无卡片）", page, "REOPEN_WITHOUT_FETCH", console_errors)
        print(f"  [OK] 重新打开后工具自动显示: {cards_reopen['count']} 个")

        # 验证开关状态一致
        first_reopen = cards_reopen['tools'][0] if cards_reopen['tools'] else {}
        print(f"  第一个工具 enabled: {first_reopen.get('enabledSwitchOn')}")
        if first_reopen.get('enabledSwitchOn') != first_tool_enabled_after:
            fail(f"开关状态不一致: 保存后={first_tool_enabled_after}, 重开后={first_reopen.get('enabledSwitchOn')}", page, "REOPEN_WITHOUT_FETCH", console_errors)
        print(f"  [OK] 开关状态一致")

        requests_after_reopen = len(tools_list_requests)
        new_requests_during_reopen = requests_after_reopen - requests_before_reopen
        print(f"  重开期间 tools/list 请求: {new_requests_during_reopen}")

        # ═══════════════════════════════════════
        # [RELOAD_AND_REOPEN]
        # ═══════════════════════════════════════
        print("\n[RELOAD_AND_REOPEN]")

        # 关闭编辑器
        page.evaluate("""() => {
            const sheet = document.querySelector('.bottom-sheet:not(.hidden)');
            if (sheet) {
                const closeBtn = sheet.querySelector('[class*="close"], button[class*="close"]');
                if (closeBtn) closeBtn.click();
            }
        }""")
        time.sleep(1)

        # 真实刷新页面
        page.reload(wait_until="networkidle", timeout=30000)
        time.sleep(2)
        page.evaluate("localStorage.setItem('app_lock_unlocked', 'true')")
        page.reload(wait_until="networkidle", timeout=30000)
        time.sleep(2)

        # 验证 localStorage 仍在
        ls_after_reload = ls_summary(page)
        print(f"  刷新后 localStorage: serverCount={ls_after_reload['serverCount']}")
        if ls_after_reload['serverCount'] == 0:
            fail("刷新后 localStorage server 丢失", page, "RELOAD_AND_REOPEN", console_errors)

        server_after_reload = ls_after_reload['servers'][0]
        if server_after_reload['toolsCount'] == 0:
            fail("刷新后 server.tools 丢失", page, "RELOAD_AND_REOPEN", console_errors)
        print(f"  [OK] 刷新后 server.tools: {server_after_reload['toolsCount']} 个")

        # 重新从真实设置入口进入
        page.evaluate("window.openApp('settings')")
        time.sleep(2)
        click_in_container(page, """() => {
            const appLayer = document.getElementById('app-layer');
            const all = appLayer.querySelectorAll('*');
            for (const el of all) {
                if (el.innerText && el.innerText.trim() === 'MCP 工具箱' && el.children.length === 0) { el.click(); return true; }
            }
            return false;
        }""", "点击 MCP 工具箱")
        time.sleep(2)

        # 打开同一 server 编辑器
        requests_before_reopen2 = len(tools_list_requests)
        click_in_container(page, """([serverName]) => {
            const appLayer = document.getElementById('app-layer');
            const allEls = appLayer.querySelectorAll('*');
            for (const el of allEls) {
                if (el.innerText && el.innerText.trim() === '编辑') {
                    let parent = el;
                    for (let i = 0; i < 10; i++) {
                        parent = parent.parentElement;
                        if (!parent) break;
                        if (parent.innerText && parent.innerText.includes(serverName)) { el.click(); return true; }
                    }
                }
            }
            return false;
        }""", "刷新后点击编辑", arg=[server_after_reload['name']])
        time.sleep(2)

        # 切工具 tab
        click_in_container(page, """() => {
            const sheet = document.querySelector('.bottom-sheet:not(.hidden)');
            if (!sheet) return false;
            const tabs = sheet.querySelectorAll('.settings-segment button, [class*="segment"] button');
            for (const tab of tabs) { if (tab.innerText.trim().includes('工具')) { tab.click(); return true; } }
            return false;
        }""", "切到工具 tab")
        time.sleep(1)

        # 从 DOM 断言工具仍存在
        cards_reload = dom_tool_cards(page)
        print(f"  刷新后重进 DOM 工具卡片: {cards_reload['count']} 个")
        print(f"  DOM 工具: {json.dumps(cards_reload['tools'], ensure_ascii=False)}")
        if cards_reload['count'] == 0:
            fail("刷新后重进工具未显示", page, "RELOAD_AND_REOPEN", console_errors)
        print(f"  [OK] 刷新后重进工具仍显示: {cards_reload['count']} 个")

        # 验证开关状态一致
        first_reload = cards_reload['tools'][0] if cards_reload['tools'] else {}
        if first_reload.get('enabledSwitchOn') != first_tool_enabled_after:
            fail(f"刷新后开关状态不一致: 保存后={first_tool_enabled_after}, 刷新后={first_reload.get('enabledSwitchOn')}", page, "RELOAD_AND_REOPEN", console_errors)
        print(f"  [OK] 开关状态一致: enabled={first_reload.get('enabledSwitchOn')}")

        requests_after_reopen2 = len(tools_list_requests)
        new_requests_during_reopen2 = requests_after_reopen2 - requests_before_reopen2
        print(f"  刷新后重进期间 tools/list 请求: {new_requests_during_reopen2}")

        # ═══════════════════════════════════════
        # [NETWORK_ASSERTIONS]
        # ═══════════════════════════════════════
        print("\n[NETWORK_ASSERTIONS]")
        print(f"  总 tools/list 相关请求数: {len(tools_list_requests)}")
        for req in tools_list_requests:
            print(f"    {req}")
        print(f"  拉取期间发出请求: 是 (预期)")
        print(f"  重开期间发出请求: {new_requests_during_reopen} (预期 0)")
        print(f"  刷新后重进期间发出请求: {new_requests_during_reopen2} (预期 0)")

        if new_requests_during_reopen > 0:
            fail(f"重开编辑器时发出了 {new_requests_during_reopen} 个 tools/list 请求（预期 0）", page, "NETWORK_ASSERTIONS", console_errors)
        if new_requests_during_reopen2 > 0:
            fail(f"刷新后重进时发出了 {new_requests_during_reopen2} 个 tools/list 请求（预期 0）", page, "NETWORK_ASSERTIONS", console_errors)
        print("  [OK] 只在用户主动拉取时发出 tools/list 请求")

        # ═══════════════════════════════════════
        # [CLEANUP]
        # ═══════════════════════════════════════
        print("\n[CLEANUP]")
        # 清理本测试创建的 server
        page.evaluate("""([serverId]) => {
            const raw = localStorage.getItem('app_settings');
            if (raw) {
                const s = JSON.parse(raw);
                s.mcpServers = s.mcpServers.filter(srv => srv.id !== serverId);
                localStorage.setItem('app_settings', JSON.stringify(s));
            }
        }""", [test_server_id])
        ls_cleanup = ls_summary(page)
        print(f"  cleanup 后状态: serverCount={ls_cleanup['serverCount']}")
        print(f"  (此状态为清理后，不计入验收结果)")

        # 控制台错误
        if console_errors:
            print(f"\n  [FAIL] 页面有 {len(console_errors)} 个 JS 错误:")
            for e in console_errors:
                print(f"    {e[:200]}")
            sys.exit(1)

        browser.close()

        # ═══════════════════════════════════════
        # [RESULT]
        # ═══════════════════════════════════════
        print("\n[RESULT]")
        print("  所有断言通过")
        print("  - 模板添加 → 拉取 → 切开关 → 保存: OK")
        print("  - localStorage 持久化 server.tools + toolSettings: OK")
        print("  - 重新打开不拉取工具自动显示: OK")
        print("  - 刷新后重进工具仍显示: OK")
        print("  - 开关状态保持一致: OK")
        print("  - 重开/刷新重进期间无 tools/list 请求: OK")
        print("  - 无页面 JS 错误: OK")
        return 0


if __name__ == "__main__":
    sys.exit(main())
