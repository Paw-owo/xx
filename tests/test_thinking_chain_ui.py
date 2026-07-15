#!/usr/bin/env python3
# tests/test_thinking_chain_ui.py
# 浏览器 UI 测试：验证 thinking 过程链系统的渲染（折叠卡片式链式步骤）
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

        print("\n[UI 用例 1] 模式A：有动作节点 → 显示折叠卡片，展开后有步骤")
        section = page.locator('[data-test-key="chain-mode"]')
        section.wait_for()
        header = section.locator('.chat-thinking-header')
        header.wait_for()
        assert_cond(header.count() > 0, "显示思考过程标题栏")

        # 标题栏默认收起
        steps_container = section.locator('.chat-thinking-steps')
        expanded_state = steps_container.get_attribute('data-expanded')
        assert_cond(expanded_state == 'false', "步骤容器默认收起")

        # 点击展开
        header.click()
        page.wait_for_timeout(400)
        expanded_state = steps_container.get_attribute('data-expanded')
        assert_cond(expanded_state == 'true', "点击标题栏后步骤容器展开")

        # 步骤数：thinking + MCP + 记忆 = 3 步
        steps = section.locator('.chat-thinking-step-wrap')
        step_count = steps.count()
        assert_cond(step_count == 3, f"展开后显示 3 个步骤（thinking + MCP + 记忆），实际: {step_count}")

        # 标题文本无标签/协议词泄漏
        header_text = header.text_content()
        assert_cond('<think' not in header_text, "标题栏文本无标签")
        assert_cond('正式' not in header_text, "标题栏文本无协议词")

        print("\n[UI 用例 2] 模式B：普通 thinking → 显示卡片，展开后 1 步")
        section = page.locator('[data-test-key="thinking-only"]')
        section.wait_for()
        header = section.locator('.chat-thinking-header')
        assert_cond(header.count() > 0, "显示思考过程标题栏")

        header.click()
        page.wait_for_timeout(400)
        steps = section.locator('.chat-thinking-step-wrap')
        step_count = steps.count()
        assert_cond(step_count == 1, f"普通 thinking 展开后 1 步，实际: {step_count}")

        print("\n[UI 用例 3] 模式C：无 thinking → 不显示入口")
        section = page.locator('[data-test-key="no-thinking"]')
        section.wait_for()
        empty = section.locator('.test-empty')
        assert_cond(empty.count() > 0, "无 thinking 时不显示入口")
        header = section.locator('.chat-thinking-header')
        assert_cond(header.count() == 0, "无思考过程标题栏")

        print("\n[UI 用例 4] 模式D：含标签/协议泄漏 → 清洗后不显示标签")
        section = page.locator('[data-test-key="dirty-thinking"]')
        section.wait_for()
        header = section.locator('.chat-thinking-header')
        assert_cond(header.count() > 0, "有 thinking 文本时显示卡片")

        header.click()
        page.wait_for_timeout(400)

        # 展开步骤详情看清洗后的内容
        first_step = section.locator('.chat-thinking-step').first
        first_step.click()
        page.wait_for_timeout(400)

        detail_text = section.locator('.chat-thinking-step-detail-text').first.text_content()
        assert_cond('<think' not in detail_text, "详情内容无 <think 标签")
        assert_cond('</think' not in detail_text, "详情内容无 </think 标签")
        assert_cond('正式：' not in detail_text, '详情内容无"正式："协议')
        assert_cond('正文：' not in detail_text, '详情内容无"正文："协议')
        assert_cond('用户正在回应：' not in detail_text, '详情内容无"用户正在回应："协议')

        print("\n[UI 用例 5] 模式E：竖排风险 → 详情不竖排")
        section = page.locator('[data-test-key="vertical-risk"]')
        section.wait_for()
        header = section.locator('.chat-thinking-header')
        header.click()
        page.wait_for_timeout(400)
        first_step = section.locator('.chat-thinking-step').first
        first_step.click()
        page.wait_for_timeout(400)

        detail_text = section.locator('.chat-thinking-step-detail-text').first.text_content()
        import re
        assert_cond(not re.search(r'\n{3,}', detail_text), "详情内容无 3+ 连续换行（不竖排）")

        detail_el = section.locator('.chat-thinking-step-detail-text').first
        detail_box = detail_el.bounding_box()
        assert_cond(detail_box and detail_box['width'] > 150, f"详情区有正常宽度（>150px），实际: {detail_box['width'] if detail_box else 'None'}")

        writing_mode = detail_el.evaluate("el => window.getComputedStyle(el).writingMode")
        assert_cond('vertical' not in writing_mode, f"writing-mode 不是竖排，实际: {writing_mode}")

        print("\n[UI 用例 6] 步骤点击 → 展开详情")
        section = page.locator('[data-test-key="chain-mode"]')
        header = section.locator('.chat-thinking-header')
        header.click()
        page.wait_for_timeout(400)

        steps = section.locator('.chat-thinking-step-wrap')
        # 点第二个步骤（MCP 工具）
        second_step_row = steps.nth(1).locator('.chat-thinking-step')
        second_step_row.click()
        page.wait_for_timeout(400)

        detail_state = steps.nth(1).locator('.chat-thinking-step-detail').get_attribute('data-expanded')
        assert_cond(detail_state == 'true', "点击步骤后详情展开")

        detail_text = steps.nth(1).locator('.chat-thinking-step-detail-text').text_content()
        assert_cond('apiKey' not in detail_text, "节点详情不含 apiKey")
        assert_cond('header' not in detail_text, "节点详情不含 header")

        print("\n[UI 用例 7] 状态标记：done 圆点打勾")
        section = page.locator('[data-test-key="chain-mode"]')
        dots = section.locator('.chat-thinking-step-dot[data-status="done"]')
        assert_cond(dots.count() > 0, "已完成步骤圆点为 done 状态")

        print("\n[UI 用例 8] 图标为 SVG（非 emoji）")
        svgs = section.locator('.chat-thinking-step-icon svg')
        assert_cond(svgs.count() > 0, "步骤图标是 SVG 元素")
        header_svgs = section.locator('.chat-thinking-header-icon svg')
        assert_cond(header_svgs.count() > 0, "标题栏图标是 SVG 元素")

        print("\n[UI 用例 9] 无控制台错误")
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
