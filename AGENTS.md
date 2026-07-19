# AGENTS.md

## 项目简介

本仓库是个人 AI 伴侣应用「小手机」。当前代码形态是一个前端单页应用：`index.html` 负责手机桌面与全局容器，`style.css` 提供全局视觉变量和基础样式，`core/` 放通用基础设施，`apps/` 放各个应用模块，`tests/` 放 Node/Python 自动化校验。

整体体验应保持「Soft Cozy Minimal」：柔和、温暖、轻量、像私人小手机一样亲密。用户可见文案要温柔可爱，避免生硬系统语气。不要引入突兀的强技术话术，不要破坏现有的圆角、柔光、卡片、半透明和小间距视觉体系。

## 目录和核心文件

### 根目录

- `index.html`：应用入口和手机桌面主体。这里导入 `core/storage.js`、`core/theme.js`、`core/ui.js` 和默认角色种子逻辑。桌面、状态栏、dock、图标布局、全局容器等核心 UI 在这里。
- `style.css`：全局主题变量、基础 UI 风格、通用组件样式。改动会影响整个应用外观。
- `manifest.json`：PWA 元信息。
- `README.md`：目前只有极简问候内容。
- `tests/`：覆盖 API、记忆、思维链、MCP、主题、桌面图标、游戏、权限、安全等关键行为的测试脚本。

### core/ 基础设施

- `core/storage.js`：IndexedDB/localStorage 基础层。当前 DB 名为 `ai_phone_db`，版本为 7，集中声明了 `characters`、`messages`、`memories`、`worldbook`、`inventory`、`groups`、`group_messages`、`dreams`、`api_pool`、`ai_phone_*`、音乐相关 store 等。新增或修改数据结构时必须同步考虑版本、索引、迁移和调用方。
- `core/api.js`：多供应商模型调用与 API 轮换池核心。支持 OpenAI-compatible、Anthropic/Claude、Gemini、Ollama 风格请求；维护 paid/free/sensory_eye/sensory_ear 分组；提供 `callAPI`、`streamMessage`、`silentRequest`、模型拉取、端点测试、轮换池增删改查。
- `core/memory.js`：角色记忆系统。负责记忆 CRUD、重要信息抽取、聊天摘要、相关记忆检索、记忆提示词构建、外部互动记录等。删除记忆强制要求 `characterId`，不要改成跨角色删除。
- `core/mcp.js`：MCP 工具连接、会话、鉴权头、SSE/streamable 传输和工具调用底座。
- `core/ui.js`：通用 UI 工具，包括图标、toast、底部弹层等。
- `core/theme.js`、`core/theme-resource-manager.js`、`core/theme-ai-agent.js`：主题加载、主题资源管理和 AI 主题生成相关逻辑。
- `core/app-registry.js`、`core/app-system-registry.js`、`core/app-bus.js`：应用注册、系统注册和跨模块事件总线。
- `core/local-chat.js`：默认角色、本地关键词回复、硅基流动回退请求等离线/兜底聊天能力。
- `core/tts.js`：TTS 配置解析和多供应商语音合成请求。
- `core/push.js`：复用云同步配置向服务端推送消息/状态，token 通过请求头传递。
- `core/character-deletion.js`：角色私有数据删除链路。
- `core/worldbook-prompt.js`：世界书提示词格式化与加载。

### apps/ 功能模块

- `apps/chat.js`：消息 App 总入口，协调聊天列表、线程、设置、工具等子模块。
- `apps/chat/thread-ai.js`：聊天 AI 主链路。负责组装身份层、世界书、记忆、MCP 工具上下文、图片识别纸条、思维链解析、流式渲染、主动消息、群聊回复、关系锁/惩罚等。这里是最核心的高风险文件之一。
- `apps/chat/thread-ai-local.js`：默认角色种子和三层回退总管。逻辑为用户 API 优先；若角色开启本地聊天且没有用户 API，则尝试硅基流动；最后用本地关键词匹配兜底。
- `apps/chat/thread-settings.js`：单个聊天的模型、记忆、语音和回复习惯设置。模型选择实时读取 API 轮换池，禁止写死模型列表。
- `apps/chat/ai-sensory-eye.js`：感官「眼睛」识图服务。从 `sensory_eye` 分组取视觉 endpoint，压缩图片后调用视觉模型，输出隐藏纸条给主模型参考；失败时返回降级纸条，不阻塞聊天。
- `apps/chat/sensory-ear.js`：感官「耳朵」语音输入服务。从 `sensory_ear` 分组取 STT endpoint，把录音转文字填回输入框；不自动发送、不持久化音频。
- `apps/chat/github-tool.js`：聊天工具里的 GitHub 集成。通过 GitHub REST API 读取仓库树、读取文件、创建分支、提交文件和创建 PR。Token 使用独立存储键，避免与仓库配置混存。
- `apps/characters.js`：角色和用户档案管理。角色包含人设、头像、世界书、记忆触发、TTS、API 配置等。
- `apps/worldbook.js`：世界书条目管理。
- `apps/wallet.js`：虚拟钱包和 AI 钱包。包含用户余额、角色钱包、交易记录、自定义背景/图标等。
- `apps/shop.js`：商店和道具系统。商品会影响心情、聊天氛围、宠物/小游戏上下文，并调用钱包扣款能力。
- `apps/moments.js`：朋友圈功能，使用 `silentRequest` 生成/回复内容，并可记录外部互动。
- `apps/dream.js`：梦境功能，读取角色、消息和世界书，使用 `silentRequest` 生成梦境/醒来回应。
- `apps/memo.js`、`apps/anniversary.js`、`apps/gallery.js`、`apps/music.js`：备忘录、纪念日、记仇本/相册、音乐等生活化模块。
- `apps/games/`：小游戏模块，例如画猜、骗子酒馆、真心话、塔罗，部分会调用 `silentRequest` 并记录外部互动。
- `apps/settings/`：设置子页面，尤其是 `api-pool-settings.js` 和 `tts-settings.js`，分别管理 API 轮换池/感官分组和语音配置。

## 多模型调用逻辑

当前项目不是把 Claude/GPT/GLM 写成固定代码分工，而是以「供应商协议 + 轮换池 + 角色级配置」为核心：

- GPT/OpenAI-compatible：默认协议，`core/api.js` 对大多数中转站使用 `/v1/chat/completions` 和 `Authorization: Bearer <key>`。很多非 OpenAI 模型也可能通过这个兼容协议接入。
- Claude/Anthropic：当 endpoint 或 provider 指向 anthropic 时，`core/api.js` 使用 Anthropic Messages 格式、`x-api-key` 和 `anthropic-version`，并把 system 与 user/assistant messages 按 Anthropic 结构转换。
- Gemini：`core/api.js` 支持 Gemini `generateContent`/`streamGenerateContent` 路径和 parts 结构。
- Ollama：本地地址会被识别为 Ollama，走 `/api/chat`/`/api/tags` 风格。
- GLM：项目中没有发现专门的 GLM 供应商适配代码。现有可读内容里，GLM 只出现在一份「消息APP的设置界面API单独的布局.html」参考页面中，展示为「GLM 工作组」和 `GLM-5.2` 等示例。实际运行代码应把 GLM 当作用户配置的模型名/中转站能力处理，通常走 OpenAI-compatible 协议，除非后续新增明确的 GLM provider。待补充：如果未来接入智谱官方非兼容协议，需要在 `core/api.js` 增加真实 provider 分支和测试。

关键调用分工：

- 主聊天回复：`apps/chat/thread-ai.js` 组装上下文后调用 `callAPI`，支持流式、轮换池、MCP、记忆、世界书、感官纸条和回退。
- 静默辅助任务：记忆抽取/总结、朋友圈、梦境、主题生成、小游戏等使用 `silentRequest`。
- 视觉识图：`apps/chat/ai-sensory-eye.js` 只调用 `sensory_eye` 分组里的视觉模型，产出隐藏纸条，不直接写聊天记录。
- 语音转文字：`apps/chat/sensory-ear.js` 只调用 `sensory_ear` 分组里的 STT 接口，填入输入框，不自动发送。
- TTS：`core/tts.js` 使用全局或角色级 TTS 配置，和聊天文本生成模型分开。
- 本地兜底：`apps/chat/thread-ai-local.js` 只在角色启用本地聊天且用户没有配置可用 API 时介入。

## 不能随便动的核心链路和高危区域

- `core/storage.js` 的 `DB_VERSION`、`STORE_DEFINITIONS`、主键和索引：会影响所有本地数据。新增 store/index 要考虑 IndexedDB 升级兼容；不要随意改 store 名、主键或删除旧 store。
- `core/api.js` 的 `resolveApiSources`、`callAPI`、`streamMessage`、`silentRequest`、`buildRequestContext`、`buildHeaders`、轮换池迁移和 paid/free/sensory 分组：这是所有模型调用的主干。不要写死 key、endpoint、模型名或供应商域名。
- `apps/chat/thread-ai.js` 的上下文组装、思维链解析、MCP 工具调用、图片纸条包装、消息写入、主动消息和群聊逻辑：容易出现隐私泄漏、工具幻觉、重复消息、流式残片、记忆污染。
- `core/memory.js` 的记忆写入/删除/提示词边界：不要让一个角色删除或读取另一个角色的私有记忆；不要把内部标签或系统提示词泄漏给用户。
- `apps/chat/ai-sensory-eye.js` 与 `apps/chat/sensory-ear.js`：感官分组必须配置驱动，不内置默认 endpoint/model/key；调试日志必须脱敏；眼睛只产出 note，耳朵只填输入框。
- `apps/chat/github-tool.js`：涉及 GitHub Token 和远程仓库写入。Token 必须继续独立存储并只进请求头；提交/PR 路径要保留冲突处理、路径编码和二进制过滤。
- `apps/wallet.js`、`apps/shop.js`：虚拟经济链路。扣款、余额、AI 钱包、库存/道具效果不要绕过既有函数；不要用前端展示变化替代真实数据写入。
- `apps/characters.js` 和 `core/character-deletion.js`：角色资料、头像、背景、世界书、记忆、消息和私有数据清理之间有关联。删除逻辑必须先全局搜索影响范围。
- `core/app-registry.js`、`core/app-system-registry.js`、`index.html` 桌面加载逻辑：改 app id、module path、dock/page/ready 会影响桌面入口和测试。

## UI 风格约束

- 风格关键词：Soft Cozy Minimal、柔光、圆角、低对比、卡片感、轻盈、温暖、私人陪伴感。
- 常见视觉结构：`var(--bg-primary)`、`var(--bg-card)`、`var(--text-primary)`、`var(--text-secondary)`、`var(--accent-light)`、`var(--accent-dark)`、`var(--shadow-sm/md)`、大圆角、半透明背景、`backdrop-filter: blur(...)`。
- 用户可见文案：温柔可爱，但不要过度卖萌；错误提示要能说明怎么处理。
- 禁止突兀系统语气：避免「操作失败」「非法参数」「权限不足」这类裸系统文案，优先写成「这里还没接好」「去设置里补一下」「这个接口没接上」等更贴近小手机氛围的表达。
- 用户明确要求本项目内不要新增 emoji/emj 表情符号；修改代码和文案时遵守这一点。

## 常见容易犯错的地方

- 不要看到某个文件里没有功能就判定不存在。必须先用 `rg` 全局搜索相关关键词和调用方。
- 不要把模型名当作协议判断依据。视觉模块里已有注释提醒：即使模型名包含 gemini/grok/claude，中转站也可能仍是 OpenAI-compatible。
- 不要把 `sensory_eye` 或 `sensory_ear` 的 endpoint 混进聊天 paid/free 模型选择器。
- 不要在源码里写死 API Key、GitHub Token、base64 图片、私人响应体或用户隐私内容。
- 不要在 import 外面包 try/catch；按项目规范保持静态 import。
- 不要删除、隐藏、绕过已有功能来完成当前任务。尤其不要用假实现、占位实现或只改 UI 不改数据链路的方式糊弄功能。
- 不要破坏思维链/工具调用清洗逻辑。`thinking-pure.js`、`render-pure.js`、`ask-user-pure.js` 有专门测试覆盖，改动前后要跑相关测试。
- 不要让模型暴露「系统消息」「提示词」「AI 助手」「模型」等身份层内容。`apps/chat/identity-core.js` 和 `thread-ai.js` 已有约束。
- 不要跨角色污染数据。消息、记忆、梦境、钱包、访问记录、应用锁等大多带 `characterId` 索引或字段。
- 不要随意更改桌面 app id、store name、localStorage key。很多测试和迁移依赖这些稳定键。
- 不要在没有检查调用方的情况下重命名导出函数。项目大量模块通过显式 import 串联。

## 建议修改流程

1. 先读根目录结构和本文件。
2. 用 `rg` 搜索目标功能、存储 key、导出函数和调用方。
3. 识别是否触及核心链路：存储、API、聊天 AI、记忆、GitHub、虚拟经济、角色删除、app 注册。
4. 小步修改，优先复用现有工具函数和样式变量。
5. 跑相关测试；如果改了核心链路，至少跑对应 `tests/test_*` 中的相关用例。
6. 若改动可见 UI，检查是否符合 Soft Cozy Minimal 和温柔可爱文案。
