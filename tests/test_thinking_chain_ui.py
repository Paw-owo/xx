#!/usr/bin/env python3
# tests/test_thinking_chain_ui.py
# 浏览器 UI 测试：验证 thinking 过程链系统的渲染
# 运行：python3 tests/test_thinking_chain_ui.py
# 需要先启动本地服务器：python3 -m http.server 8765

import sys
from playwright.sync_api import sync_playwright

passed = 0
failed = 0

def assert_cond(cond, msg):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✓ {msg}")
    else:
        failed += 1
        print(f"  ✗ {msg}")

TEST_URL = "http://localhost:8765/tests/thinking-chain-ui-test.html"

def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 420, "height": 800})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        page.goto(TEST_URL, wait_until="networkidle")
        page.wait_for_timeout(800)

        print("\n[UI 用例 1] 模式A：有动作节点 → 显示过程链")
        section = page.locator('[data-test-key="chain-mode"]')
        section.wait_for()
        preview_btn = section.locator('.chat-thinking-preview-btn')
        preview_btn.wait_for()
        assert_cond(preview_btn.count() > 0, "显示 thinking 预览按钮")

        tool_nodes = section.locator('.chat-thinking-preview-node')
        node_count = tool_nodes.count()
        assert_cond(node_count == 2, f"过程链显示 2 个节点（MCP + 记忆），实际: {node_count}")

        btn_text = preview_btn.text_content()
        assert_cond('<think' not in btn_text, "预览按钮文本无标签")
        assert_cond('正式' not in btn_text, "预览按钮文本无协议词")

        print("\n[UI 用例 2] 模式B：普通 thinking → 显示 thinking 按钮，无过程链节点")
        section = page.locator('[data-test-key="thinking-only"]')
        section.wait_for()
        preview_btn = section.locator('.chat-thinking-preview-btn')
        assert_cond(preview_btn.count() > 0, "显示 thinking 预览按钮")

        tool_nodes = section.locator('.chat-thinking-preview-node')
        node_count = tool_nodes.count()
        assert_cond(node_count == 0, f"无动作节点时过程链为空，实际: {node_count}")

        print("\n[UI 用例 3] 模式C：无 thinking → 不显示入口")
        section = page.locator('[data-test-key="no-thinking"]')
        section.wait_for()
        empty = section.locator('.test-empty')
        assert_cond(empty.count() > 0, "无 thinking 时不显示入口")
        preview_btn = section.locator('.chat-thinking-preview-btn')
        assert_cond(preview_btn.count() == 0, "无 thinking 预览按钮")

        print("\n[UI 用例 4] 模式D：含标签/协议泄漏 → 清洗后不显示标签")
        section = page.locator('[data-test-key="dirty-thinking"]')
        section.wait_for()
        preview_btn = section.locator('.chat-thinking-preview-btn')
        assert_cond(preview_btn.count() > 0, "有 thinking 文本时显示按钮")

        preview_btn.click()
        page.wait_for_timeout(400)

        sheet = page.locator('.chat-thinking-sheet')
        sheet.wait_for()
        assert_cond(sheet.is_visible(), "thinking sheet 打开")

        paragraph = sheet.locator('.chat-thinking-sheet-paragraph')
        para_text = paragraph.text_content()
        assert_cond('<think' not in para_text, "抽屉内容无 <think 标签")
        assert_cond('</think' not in para_text, "抽屉内容无 </think 标签")
        assert_cond('正式：' not in para_text, '抽屉内容无"正式："协议')
        assert_cond('正文：' not in para_text, '抽屉内容无"正文："协议')
        assert_cond('用户正在回应：' not in para_text, '抽屉内容无"用户正在回应："协议')

        page.locator('.chat-thinking-sheet-close').click()
        page.wait_for_timeout(400)

        print("\n[UI 用例 5] 模式E：竖排风险 → 抽屉不竖排")
        section = page.locator('[data-test-key="vertical-risk"]')
        section.wait_for()
        preview_btn = section.locator('.chat-thinking-preview-btn')
        preview_btn.click()
        page.wait_for_timeout(400)

        sheet = page.locator('.chat-thinking-sheet')
        sheet.wait_for()

        paragraph = sheet.locator('.chat-thinking-sheet-paragraph')
        para_text = paragraph.text_content()
        import re
        assert_cond(not re.search(r'\n{3,}', para_text), "抽屉内容无 3+ 连续换行（不竖排）")

        sheet_box = sheet.bounding_box()
        assert_cond(sheet_box and sheet_box['width'] > 200, f"抽屉有正常宽度（>200px），实际: {sheet_box['width'] if sheet_box else 'None'}")

        para_box = paragraph.bounding_box()
        assert_cond(para_box and para_box['width'] > 150, f"内容区有正常宽度（>150px），实际: {para_box['width'] if para_box else 'None'}")

        writing_mode = paragraph.evaluate("el => window.getComputedStyle(el).writingMode")
        assert_cond('vertical' not in writing_mode, f"writing-mode 不是竖排，实际: {writing_mode}")

        page.locator('.chat-thinking-sheet-close').click()
        page.wait_for_timeout(400)

        print("\n[UI 用例 6] 过程链节点点击 → 展开详情")
        section = page.locator('[data-test-key="chain-mode"]')
        tool_nodes = section.locator('.chat-thinking-preview-node')
        first_node = tool_nodes.first
        first_node.click()
        page.wait_for_timeout(400)

        sheet = page.locator('.chat-thinking-sheet')
        sheet.wait_for()
        assert_cond(sheet.is_visible(), "点击节点后 sheet 打开")

        sheet_text = sheet.text_content()
        assert_cond('apiKey' not in sheet_text, "节点详情不含 apiKey")
        assert_cond('arguments' not in sheet_text, "节点详情不含原始 arguments")
        assert_cond('header' not in sheet_text, "节点详情不含 header")

        page.locator('.chat-thinking-sheet-close').click()
        page.wait_for_timeout(400)

        print("\n[UI 用例 7] 过程链模式优先显示节点")
        section = page.locator('[data-test-key="chain-mode"]')
        preview_btn = section.locator('.chat-thinking-preview-btn')
        tool_nodes = section.locator('.chat-thinking-preview-node')
        assert_cond(preview_btn.count() > 0, "thinking 按钮显示")
        assert_cond(tool_nodes.count() > 0, "过程链节点显示")

        print("\n[UI 用例 8] 无控制台错误")
        assert_cond(len(console_errors) == 0, f"无控制台错误，实际: {len(console_errors)} 个")
        for e in console_errors:
            print(f"    错误: {e}")

        browser.close()

    print("\n══════════════════════════════════")
    print(f"通过: {passed}  失败: {failed}")
    if failed == 0:
        print("全部通过")
    else:
        print("有失败用例，请检查")

if __name__ == "__main__":
    try:
        run_tests()
        sys.exit(1 if failed > 0 else 0)
    except Exception as e:
        print(f"测试执行失败: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
