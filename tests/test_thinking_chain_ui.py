#!/usr/bin/env python3
# tests/test_thinking_chain_ui.py
# 浏览器 UI 测试：验证 thinking 步骤卡片系统的渲染
# 运行：python3 tests/test_thinking_chain_ui.py
# 需要先启动本地服务器：python3 -m http.server 8765

import sys
import re
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

def expand_card(page, section):
    """点击 header 展开步骤容器"""
    header = section.locator('.chat-thinking-header')
    header.click()
    page.wait_for_timeout(400)

def expand_step(page, step):
    """点击步骤行展开详情"""
    row = step.locator('.chat-thinking-step-row')
    row.click()
    page.wait_for_timeout(400)

def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 420, "height": 800})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        page.goto(TEST_URL, wait_until="networkidle")
        page.wait_for_timeout(800)

        # ── 用例 1：模式A 有动作节点 → 显示步骤卡片，3 步 ──
        print("\n[UI 用例 1] 模式A：有动作节点 → 显示步骤卡片")
        section = page.locator('[data-test-key="chain-mode"]')
        section.wait_for()
        header = section.locator('.chat-thinking-header')
        header.wait_for()
        assert_cond(header.count() > 0, "显示思考过程 header")

        steps = section.locator('.chat-thinking-step')
        step_count = steps.count()
        assert_cond(step_count == 3, f"显示 3 个步骤（thinking + MCP + 记忆），实际: {step_count}")

        header_text = header.text_content()
        assert_cond('思考过程' in header_text, f"header 文本含'思考过程'，实际: {header_text}")
        assert_cond('3步' in header_text, f"header 文本含'3步'，实际: {header_text}")

        # ── 用例 2：模式B 普通 thinking → header + 1 步 ──
        print("\n[UI 用例 2] 模式B：普通 thinking → 1 个步骤")
        section = page.locator('[data-test-key="thinking-only"]')
        section.wait_for()
        header = section.locator('.chat-thinking-header')
        assert_cond(header.count() > 0, "显示思考过程 header")

        steps = section.locator('.chat-thinking-step')
        step_count = steps.count()
        assert_cond(step_count == 1, f"普通 thinking 显示 1 个步骤，实际: {step_count}")

        header_text = header.text_content()
        assert_cond('1步' in header_text, f"header 文本含'1步'，实际: {header_text}")

        # ── 用例 3：模式C 无 thinking → 不显示入口 ──
        print("\n[UI 用例 3] 模式C：无 thinking → 不显示入口")
        section = page.locator('[data-test-key="no-thinking"]')
        section.wait_for()
        empty = section.locator('.test-empty')
        assert_cond(empty.count() > 0, "无 thinking 时不显示入口")
        header = section.locator('.chat-thinking-header')
        assert_cond(header.count() == 0, "无 thinking header")

        # ── 用例 4：模式D 含标签/协议泄漏 → 清洗后不显示 ──
        print("\n[UI 用例 4] 模式D：含标签/协议泄漏 → 清洗后不显示")
        section = page.locator('[data-test-key="dirty-thinking"]')
        section.wait_for()
        header = section.locator('.chat-thinking-header')
        assert_cond(header.count() > 0, "有 thinking 文本时显示 header")

        header_text = header.text_content()
        assert_cond('<think' not in header_text, "header 文本无 <think 标签")
        assert_cond('正式' not in header_text, "header 文本无协议词")

        expand_card(page, section)

        first_step = section.locator('.chat-thinking-step').first
        expand_step(page, first_step)

        detail_text = first_step.locator('.chat-thinking-step-detail-text').text_content()
        assert_cond('<think' not in detail_text, "详情内容无 <think 标签")
        assert_cond('</think' not in detail_text, "详情内容无 </think 标签")
        assert_cond('正式：' not in detail_text, '详情内容无"正式："协议')
        assert_cond('正文：' not in detail_text, '详情内容无"正文："协议')
        assert_cond('用户正在回应：' not in detail_text, '详情内容无"用户正在回应："协议')

        # ── 用例 5：模式E 竖排风险 → 详情不竖排 ──
        print("\n[UI 用例 5] 模式E：竖排风险 → 详情不竖排")
        section = page.locator('[data-test-key="vertical-risk"]')
        section.wait_for()
        header = section.locator('.chat-thinking-header')
        expand_card(page, section)

        first_step = section.locator('.chat-thinking-step').first
        expand_step(page, first_step)

        detail_el = first_step.locator('.chat-thinking-step-detail-text')
        detail_text = detail_el.text_content()
        assert_cond(not re.search(r'\n{3,}', detail_text), "详情内容无 3+ 连续换行（不竖排）")

        detail_box = detail_el.bounding_box()
        assert_cond(detail_box and detail_box['width'] > 150,
                    f"详情区有正常宽度（>150px），实际: {detail_box['width'] if detail_box else 'None'}")

        writing_mode = detail_el.evaluate("el => window.getComputedStyle(el).writingMode")
        assert_cond('vertical' not in writing_mode, f"writing-mode 不是竖排，实际: {writing_mode}")

        # ── 用例 6：步骤点击 → 展开详情，不含原始字段 ──
        print("\n[UI 用例 6] 步骤点击 → 展开详情，不含原始字段")
        section = page.locator('[data-test-key="chain-mode"]')
        header = section.locator('.chat-thinking-header')
        # 如果还没展开，先展开
        if header.get_attribute('data-expanded') != 'true':
            expand_card(page, section)

        steps = section.locator('.chat-thinking-step')
        # 点击第二个步骤（MCP 工具）
        mcp_step = steps.nth(1)
        expand_step(page, mcp_step)

        detail_text = mcp_step.locator('.chat-thinking-step-detail-text').text_content()
        assert_cond('apiKey' not in detail_text, "MCP 步骤详情不含 apiKey")
        assert_cond('arguments' not in detail_text, "MCP 步骤详情不含原始 arguments")
        assert_cond('header' not in detail_text, "MCP 步骤详情不含 header")

        # ── 用例 7：步骤标签显示（MCP / 记忆） ──
        print("\n[UI 用例 7] 步骤卡片标签显示")
        section = page.locator('[data-test-key="chain-mode"]')
        steps = section.locator('.chat-thinking-step')

        # 第一个步骤（thinking）无标签
        thinking_step = steps.nth(0)
        thinking_tag = thinking_step.locator('.chat-thinking-step-tag')
        assert_cond(thinking_tag.count() == 0, "thinking 步骤无标签")

        # 第二个步骤（MCP）有 MCP 标签
        mcp_step = steps.nth(1)
        mcp_tag = mcp_step.locator('.chat-thinking-step-tag')
        assert_cond(mcp_tag.count() > 0, "MCP 步骤有标签")
        mcp_tag_text = mcp_tag.text_content()
        assert_cond('MCP' in mcp_tag_text, f"MCP 步骤标签含'MCP'，实际: {mcp_tag_text}")

        # 第三个步骤（记忆）有 记忆 标签
        memory_step = steps.nth(2)
        memory_tag = memory_step.locator('.chat-thinking-step-tag')
        assert_cond(memory_tag.count() > 0, "记忆步骤有标签")
        memory_tag_text = memory_tag.text_content()
        assert_cond('记忆' in memory_tag_text, f"记忆步骤标签含'记忆'，实际: {memory_tag_text}")

        # ── 用例 8：header 点击展开/折叠 ──
        print("\n[UI 用例 8] header 点击展开/折叠")
        section = page.locator('[data-test-key="thinking-only"]')
        header = section.locator('.chat-thinking-header')
        steps_wrap = section.locator('.chat-thinking-steps')

        # 初始状态：折叠
        assert_cond(header.get_attribute('data-expanded') == 'false', "初始状态 header 折叠")
        assert_cond(steps_wrap.get_attribute('data-expanded') == 'false', "初始状态步骤容器折叠")

        # 点击展开
        header.click()
        page.wait_for_timeout(400)
        assert_cond(header.get_attribute('data-expanded') == 'true', "点击后 header 展开")
        assert_cond(steps_wrap.get_attribute('data-expanded') == 'true', "点击后步骤容器展开")

        # 再次点击折叠
        header.click()
        page.wait_for_timeout(400)
        assert_cond(header.get_attribute('data-expanded') == 'false', "再次点击 header 折叠")
        assert_cond(steps_wrap.get_attribute('data-expanded') == 'false', "再次点击步骤容器折叠")

        # ── 用例 9：模式F 流式运行中 → running 状态标记 ──
        print("\n[UI 用例 9] 模式F：流式运行中 → running 状态标记")
        section = page.locator('[data-test-key="running-mode"]')
        section.wait_for()
        card = section.locator('.chat-thinking-card')
        assert_cond(card.get_attribute('data-running') == 'true', "卡片 data-running=true")

        steps = section.locator('.chat-thinking-step')
        step_count = steps.count()
        assert_cond(step_count == 2, f"running 模式显示 2 个步骤（thinking + MCP），实际: {step_count}")

        # thinking 步骤 running
        thinking_step = steps.nth(0)
        assert_cond(thinking_step.get_attribute('data-status') == 'running', "thinking 步骤 data-status=running")

        # MCP 步骤 running
        mcp_step = steps.nth(1)
        assert_cond(mcp_step.get_attribute('data-status') == 'running', "MCP 步骤 data-status=running")

        # running 步骤的 dot 有 running 标记
        mcp_dot = mcp_step.locator('.chat-thinking-step-dot')
        assert_cond(mcp_dot.get_attribute('data-status') == 'running', "MCP 步骤 dot data-status=running")

        # ── 用例 10：SVG 图标存在（无 emoji） ──
        print("\n[UI 用例 10] SVG 图标存在，无 emoji")
        section = page.locator('[data-test-key="chain-mode"]')
        header = section.locator('.chat-thinking-header')
        # 如果还没展开，先展开
        if header.get_attribute('data-expanded') != 'true':
            expand_card(page, section)

        # header 有 sparkle SVG
        header_svg = header.locator('.chat-thinking-header-icon svg')
        assert_cond(header_svg.count() > 0, "header 有 SVG 图标")

        # 每个步骤有 SVG 图标
        steps = section.locator('.chat-thinking-step')
        for i in range(steps.count()):
            step_svg = steps.nth(i).locator('.chat-thinking-step-icon svg')
            assert_cond(step_svg.count() > 0, f"步骤 {i+1} 有 SVG 图标")

        # ── 用例 11：无控制台错误 ──
        print("\n[UI 用例 11] 无控制台错误")
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
