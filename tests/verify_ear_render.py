"""验证耳朵语音输入功能渲染：麦克风按钮 + 耳朵分组配置 UI

参考 verify_ui_acceptance.py 的模式：
- 锁屏密码 0326 解锁
- 用 dispatch_event('click') 触发桌面图标（真实 click 受布局/动画影响不稳定）
- 进设置 → API 轮换池 → 校验耳朵/眼睛分组卡片
- 进聊天 → 进入会话 → 校验麦克风按钮在输入栏渲染
"""
import sys
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8845/index.html"
PASSWORD = "0326"

errors = []


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
                page.wait_for_timeout(80)
                break
    page.wait_for_timeout(600)


def open_app(page, aria_label):
    btn = page.query_selector(f'button.desktop-icon[aria-label="{aria_label}"]')
    if not btn:
        return False
    btn.dispatch_event('click')
    return True


def back_to_desktop(page):
    """点设置返回按钮直到回到桌面。"""
    for _ in range(4):
        btn = page.query_selector('.settings-nav-btn')
        if not btn:
            break
        btn.dispatch_event('click')
        page.wait_for_timeout(500)
    page.wait_for_timeout(300)
    # 聊天返回键另算
    for _ in range(3):
        btn = page.query_selector('.chat-back-btn, .app-back, [aria-label="返回"]')
        if not btn:
            break
        btn.dispatch_event('click')
        page.wait_for_timeout(400)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            permissions=[]  # 不预授权麦克风，headless 下本就拒绝
        )
        page = context.new_page()
        page.on("pageerror", lambda e: errors.append(f"[pageerror] {e}"))
        page.on("console", lambda m: errors.append(f"[console.{m.type}] {m.text}") if m.type == "error" else None)

        # 启动竞态重试
        last_err = None
        for _ in range(5):
            try:
                page.goto(URL, wait_until='networkidle', timeout=30000)
                last_err = None
                break
            except Exception as e:
                last_err = e
                page.wait_for_timeout(500)
        if last_err:
            print(f"=== goto 失败: {last_err} ===")

        page.wait_for_timeout(800)
        unlock(page)
        page.wait_for_timeout(600)
        page.screenshot(path="/tmp/ear_desktop.png")

        print("=== 桌面图标 aria-label ===")
        labels = page.evaluate(
            "() => Array.from(document.querySelectorAll('button.desktop-icon')).map(b => b.getAttribute('aria-label'))"
        )
        print(f"  {labels}")

        # ---------- 1. 聊天 → 会话 → 麦克风按钮 ----------
        print("\n=== 打开聊天 app ===")
        ok_chat = open_app(page, "聊天")
        print(f"  open_app('聊天') = {ok_chat}")
        page.wait_for_timeout(900)
        page.screenshot(path="/tmp/ear_chat_list.png")

        mic_count = 0
        input_bar_count = page.locator(".chat-thread-input-bar").count()
        print(f"  chat-thread-input-bar count = {input_bar_count}")

        if input_bar_count == 0:
            # 在会话列表，点第一个会话项
            print("  === 尝试进入会话 ===")
            # 实测选择器：会话项是 .chat-thread-row / 内部 .chat-thread-body 按钮
            candidates = [
                ".chat-thread-body",
                ".chat-thread-row",
                ".chat-list-item",
                "[class*='conversation'] [class*='item']",
            ]
            entered = False
            for sel in candidates:
                items = page.locator(sel).all()
                if items:
                    print(f"  选中器 {sel} 命中 {len(items)} 项")
                    try:
                        items[0].dispatch_event('click')
                        page.wait_for_timeout(1000)
                        if page.locator(".chat-thread-input-bar").count() > 0:
                            entered = True
                            print("  === 进入会话成功 ===")
                            break
                    except Exception as e:
                        print(f"  点击失败: {e}")
            if not entered:
                print("  === 所有选择器都未进入会话 ===")

        input_bar_count = page.locator(".chat-thread-input-bar").count()
        print(f"  进会话后 chat-thread-input-bar count = {input_bar_count}")
        page.screenshot(path="/tmp/ear_chat_thread.png")

        if input_bar_count > 0:
            mic_count = page.locator(".chat-thread-mic").count()
            print(f"  === 麦克风按钮 count = {mic_count} ===")
            if mic_count > 0:
                bar = page.locator(".chat-thread-input-bar").first
                children = bar.locator(":scope > *").all()
                child_classes = [c.get_attribute("class") or "" for c in children]
                print(f"  输入栏子元素 class: {child_classes}")
                mic_svg = page.locator(".chat-thread-mic svg").count()
                print(f"  mic 内 svg count = {mic_svg}")
                # 点麦克风（headless 拒绝麦克风权限，应不崩溃）
                try:
                    page.locator(".chat-thread-mic").first.dispatch_event('click')
                    page.wait_for_timeout(800)
                    print("  === 点击麦克风后未崩溃 ===")
                except Exception as e:
                    print(f"  点击麦克风异常: {e}")
                page.screenshot(path="/tmp/ear_after_mic_click.png")
                # 复位：reload 回桌面
                page.goto(URL)
                page.wait_for_load_state('networkidle')
                page.wait_for_timeout(500)
                unlock(page)
                page.wait_for_timeout(400)

        # ---------- 2. 设置 → API 轮换池 → 耳朵分组 ----------
        print("\n=== 打开设置 app ===")
        ok_settings = open_app(page, "设置")
        print(f"  open_app('设置') = {ok_settings}")
        page.wait_for_timeout(900)
        page.screenshot(path="/tmp/ear_settings.png")

        print("=== 进入 API 轮换池 ===")
        try:
            nav = page.locator('button.settings-nav-item').filter(has_text="API 轮换池")
            nav.wait_for(timeout=5000)
            nav.dispatch_event('click')
            page.wait_for_timeout(900)
            page.wait_for_selector('.api-pool-host', timeout=5000)
            print("  === 进入 API 池成功 ===")
        except Exception as e:
            print(f"  进入 API 池失败: {e}")
        page.screenshot(path="/tmp/ear_api_pool.png")

        ear_group = page.locator(".api-pool-group:has(.api-pool-group-name:has-text('耳朵'))").count()
        print(f"  耳朵分组卡片 count = {ear_group} (应≥1)")
        ear_add_btn = page.locator("button:has-text('新增耳朵接口')").count()
        print(f"  新增耳朵接口按钮 count = {ear_add_btn} (应≥1)")
        eye_group = page.locator(".api-pool-group:has(.api-pool-group-name:has-text('眼睛'))").count()
        print(f"  眼睛分组卡片 count = {eye_group} (应=1, 原功能保护)")
        old_placeholder = page.locator(".api-pool-ear-placeholder").count()
        print(f"  旧耳朵占位卡片 count = {old_placeholder} (应=0, 已删除)")

        # 打开耳朵新增编辑器，校验锁定分组标签
        locked_text = ""
        if ear_add_btn > 0:
            try:
                page.locator("button:has-text('新增耳朵接口')").first.dispatch_event('click')
                page.wait_for_timeout(800)
                editor = page.locator(".settings-sheet").count()
                print(f"  编辑器弹层 count = {editor}")
                locked = page.locator(".api-pool-group-locked").count()
                print(f"  分组锁定标签 count = {locked}")
                if locked > 0:
                    locked_text = page.locator(".api-pool-group-locked").first.inner_text()
                    print(f"  锁定分组名 = '{locked_text}' (应为 '感官-耳朵')")
                page.screenshot(path="/tmp/ear_editor.png")
            except Exception as e:
                print(f"  打开编辑器失败: {e}")

        # ---------- 3. 结论 ----------
        print("\n=== 页面错误汇总 ===")
        if errors:
            for e in errors[:15]:
                print(f"  {e}")
        else:
            print("  无错误")

        browser.close()

        print("\n=== 验收结论 ===")
        print(f"麦克风按钮 = {'OK' if mic_count > 0 else 'FAIL'} (count={mic_count})")
        ear_ok = ear_group > 0 and ear_add_btn > 0
        print(f"耳朵分组配置UI = {'OK' if ear_ok else 'FAIL'} (group={ear_group}, add_btn={ear_add_btn})")
        print(f"眼睛分组保留 = {'OK' if eye_group > 0 else 'FAIL'} (count={eye_group})")
        print(f"旧占位已删 = {'OK' if old_placeholder == 0 else 'FAIL'} (count={old_placeholder})")
        locked_ok = locked_text == "感官-耳朵"
        print(f"编辑器锁定分组名 = {'OK' if locked_ok else 'FAIL'} (text='{locked_text}')")
        print(f"页面无错误 = {'OK' if not errors else 'FAIL'}")
        all_ok = mic_count > 0 and ear_ok and eye_group > 0 and old_placeholder == 0 and locked_ok and not errors
        print(f"\n总评 = {'ALL OK' if all_ok else 'FAIL'}")
        sys.exit(0 if all_ok else 1)


if __name__ == "__main__":
    main()
