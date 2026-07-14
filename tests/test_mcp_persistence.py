#!/usr/bin/env python3
"""
MCP 工具持久化回归测试

验证 MCP 推荐模板添加 → 拉取工具 → 保存 → 离开 → 刷新 → 恢复 → AI 可用 全链路。

用法:
    python3 tests/test_mcp_persistence.py [URL]

默认 URL: https://paw.kiss.eoty.cn/
本地测试: python3 tests/test_mcp_persistence.py http://localhost:8000/

依赖: pip3 install playwright && python3 -m playwright install chromium
"""

import sys
import json
import time
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "https://paw.kiss.eoty.cn/"
TEMPLATE_NAME = "Context7"  # 免 key, CORS 开放


def click_text(page, text, container_selector="#app-layer"):
    """在容器内查找并点击指定文字的元素"""
    return page.evaluate("""([text, containerSel]) => {
        const container = document.querySelector(containerSel);
        if (!container) return false;
        const all = container.querySelectorAll('*');
        for (const el of all) {
            if (el.innerText && el.innerText.trim() === text && el.children.length === 0) {
                el.click();
                return true;
            }
        }
        return false;
    }""", [text, container_selector])


def get_ls(page):
    """读取 localStorage app_settings"""
    return page.evaluate("""() => {
        const raw = localStorage.getItem('app_settings');
        if (!raw) return { exists: false };
        const parsed = JSON.parse(raw);
        const servers = parsed.mcpServers || [];
        return {
            exists: true,
            serverCount: servers.length,
            servers: servers.map(s => ({
                id: s.id, name: s.name, enabled: s.enabled,
                toolsCount: Array.isArray(s.tools) ? s.tools.length : 0,
                toolNames: Array.isArray(s.tools) ? s.tools.map(t => t.name) : [],
                toolSettings: s.toolSettings || {}
            }))
        };
    }""")


def wait_for_tools(page, timeout=30):
    """等待工具卡片出现"""
    for i in range(timeout):
        time.sleep(1)
        cnt = page.evaluate("""() => {
            const panel = document.querySelector('.settings-mcp-panel:not(.hidden)');
            if (!panel) return -1;
            return panel.querySelectorAll('[class*="tool-card"]').length;
        }""")
        if cnt > 0:
            return cnt
    return 0


def main():
    results = []

    def check(name, condition):
        status = "PASS" if condition else "FAIL"
        results.append((name, condition))
        print(f"  [{status}] {name}")
        return condition

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 420, "height": 900})
        page = ctx.new_page()

        console_errors = []
        page.on("pageerror", lambda err: console_errors.append(str(err)))

        print(f"\n=== MCP 持久化回归测试 ===")
        print(f"URL: {URL}\n")

        # 1. 打开页面
        page.goto(URL, wait_until="networkidle", timeout=30000)
        time.sleep(1)
        page.evaluate("localStorage.setItem('app_lock_unlocked', 'true')")
        page.reload(wait_until="networkidle", timeout=30000)
        time.sleep(1)

        # 2. 清空 MCP 配置
        page.evaluate("""() => {
            const raw = localStorage.getItem('app_settings');
            if (raw) { const s = JSON.parse(raw); s.mcpServers = []; localStorage.setItem('app_settings', JSON.stringify(s)); }
        }""")

        # 3. 进入设置 → MCP
        page.evaluate("window.openApp('settings')")
        time.sleep(2)
        click_text(page, "MCP 工具箱")
        time.sleep(2)

        # 4. 点击模板添加
        print("--- 添加模板 ---")
        page.evaluate("""([templateName]) => {
            const appLayer = document.getElementById('app-layer');
            const cards = appLayer.querySelectorAll('.settings-mcp-recommended-card');
            for (const card of cards) {
                const nameEl = card.querySelector('.settings-mcp-recommended-name');
                if (nameEl && nameEl.innerText.includes(templateName)) {
                    card.querySelector('button').click(); return;
                }
            }
        }""", [TEMPLATE_NAME])
        time.sleep(2)
        check("编辑器打开", page.evaluate("() => !!document.querySelector('.bottom-sheet:not(.hidden)')"))

        # 5. 切工具 tab + 拉取
        print("--- 拉取工具 ---")
        page.evaluate("""() => {
            const sheet = document.querySelector('.bottom-sheet:not(.hidden)');
            const tabs = sheet.querySelectorAll('.settings-segment button, [class*="segment"] button');
            for (const tab of tabs) { if (tab.innerText.trim().includes('工具')) { tab.click(); return; } }
        }""")
        time.sleep(1)
        page.evaluate("""() => {
            const panel = document.querySelector('.settings-mcp-panel:not(.hidden)');
            const btns = panel.querySelectorAll('button');
            for (const btn of btns) {
                if (btn.innerText.includes('拉取工具') || btn.innerText.includes('重新拉取')) { btn.click(); return; }
            }
        }""")
        tool_count = wait_for_tools(page)
        check("工具拉取成功", tool_count > 0)

        # 6. 切换一个工具开关
        print("--- 切换工具开关 ---")
        page.evaluate("""() => {
            const panel = document.querySelector('.settings-mcp-panel:not(.hidden)');
            const cards = panel.querySelectorAll('[class*="tool-card"]');
            if (cards.length > 0) {
                const toggles = cards[0].querySelectorAll('[class*="switch"]');
                if (toggles.length > 0) toggles[0].click();
            }
        }""")
        time.sleep(1)

        # 7. 保存
        print("--- 保存 ---")
        page.evaluate("""() => {
            const sheet = document.querySelector('.bottom-sheet:not(.hidden)');
            const btns = sheet.querySelectorAll('button');
            for (const btn of btns) {
                if (btn.innerText.trim() === '保存' || btn.innerText.trim() === '添加') { btn.click(); return; }
            }
        }""")
        time.sleep(3)

        toast = page.evaluate("""() => Array.from(document.querySelectorAll('.toast, [class*="toast"]')).map(t => t.innerText.trim()).filter(t => t)""")
        check("保存无报错", "未找到" not in str(toast) and "异常" not in str(toast))

        # 8. 验证 localStorage
        print("--- 验证 localStorage ---")
        ls = get_ls(page)
        check("localStorage 有 server", ls['serverCount'] == 1)
        check("server.tools 已持久化", ls['servers'][0]['toolsCount'] > 0)
        check("toolSettings 有数据", len(ls['servers'][0]['toolSettings']) > 0)

        # 9. 重新打开编辑器，不拉取，验证工具显示
        print("--- 重新打开编辑器 ---")
        page.evaluate("""() => {
            const appLayer = document.getElementById('app-layer');
            const allEls = appLayer.querySelectorAll('*');
            for (const el of allEls) {
                if (el.innerText && el.innerText.trim() === '编辑') {
                    let parent = el;
                    for (let i = 0; i < 10; i++) {
                        parent = parent.parentElement;
                        if (!parent) break;
                        if (parent.innerText && parent.innerText.includes('Context7')) { el.click(); return; }
                    }
                }
            }
        }""")
        time.sleep(2)
        page.evaluate("""() => {
            const sheet = document.querySelector('.bottom-sheet:not(.hidden)');
            if (!sheet) return false;
            const tabs = sheet.querySelectorAll('.settings-segment button, [class*="segment"] button');
            for (const tab of tabs) { if (tab.innerText.trim().includes('工具')) { tab.click(); return; } }
        }""")
        time.sleep(1)
        tools_visible = page.evaluate("""() => {
            const panel = document.querySelector('.settings-mcp-panel:not(.hidden)');
            if (!panel) return 0;
            return panel.querySelectorAll('[class*="tool-card"]').length;
        }""")
        check("重新打开后工具自动显示（不拉取）", tools_visible > 0)

        # 10. 刷新页面后验证
        print("--- 刷新页面后验证 ---")
        page.reload(wait_until="networkidle", timeout=30000)
        time.sleep(2)
        page.evaluate("localStorage.setItem('app_lock_unlocked', 'true')")
        page.reload(wait_until="networkidle", timeout=30000)
        time.sleep(2)

        ls2 = get_ls(page)
        check("刷新后 localStorage 保持", ls2['serverCount'] == 1 and ls2['servers'][0]['toolsCount'] > 0)

        # 重新进入 MCP 并打开编辑器
        page.evaluate("window.openApp('settings')")
        time.sleep(2)
        click_text(page, "MCP 工具箱")
        time.sleep(2)
        page.evaluate("""() => {
            const appLayer = document.getElementById('app-layer');
            const allEls = appLayer.querySelectorAll('*');
            for (const el of allEls) {
                if (el.innerText && el.innerText.trim() === '编辑') {
                    let parent = el;
                    for (let i = 0; i < 10; i++) {
                        parent = parent.parentElement;
                        if (!parent) break;
                        if (parent.innerText && parent.innerText.includes('Context7')) { el.click(); return; }
                    }
                }
            }
        }""")
        time.sleep(2)
        page.evaluate("""() => {
            const sheet = document.querySelector('.bottom-sheet:not(.hidden)');
            if (!sheet) return false;
            const tabs = sheet.querySelectorAll('.settings-segment button, [class*="segment"] button');
            for (const tab of tabs) { if (tab.innerText.trim().includes('工具')) { tab.click(); return; } }
        }""")
        time.sleep(1)
        tools_after_reload = page.evaluate("""() => {
            const panel = document.querySelector('.settings-mcp-panel:not(.hidden)');
            if (!panel) return 0;
            return panel.querySelectorAll('[class*="tool-card"]').length;
        }""")
        check("刷新后工具仍显示", tools_after_reload > 0)

        # 11. AI 可用性
        print("--- AI 可用性 ---")
        page.evaluate("""() => {
            const raw = localStorage.getItem('app_settings');
            const s = JSON.parse(raw);
            if (s.mcpServers[0]) s.mcpServers[0].enabled = true;
            localStorage.setItem('app_settings', JSON.stringify(s));
        }""")
        ai_result = page.evaluate("""async () => {
            try {
                const mcp = await import('/core/mcp.js');
                const usable = await mcp.getUsableMcpTools();
                return { count: usable.length, tools: usable.map(t => t.name) };
            } catch(e) { return { error: e.message }; }
        }""")
        check("AI 能读到已保存工具", ai_result.get('count', 0) > 0)

        # 12. 控制台错误
        check("无页面 JS 错误", len(console_errors) == 0)

        browser.close()

    # 总结
    print(f"\n{'='*50}")
    passed = sum(1 for _, c in results if c)
    total = len(results)
    print(f"结果: {passed}/{total} PASS")
    print(f"{'='*50}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
