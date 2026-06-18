# MiMo Agent Skill

[English](./README.md)

为 AI 编程工具添加多模态能力的 Agent 技能与 MCP 服务器，基于[小米 MiMo](https://platform.xiaomimimo.com)。

**为什么需要这个：** MiMo v2.5 Pro 是一个强大的推理模型，但原生不支持多模态输入。这些技能弥补了这一空白 — 让你的 Agent 调用 MiMo v2.5（视觉）和 MiMo v2-Omni（音频/视频）来进行图片理解、音频转写、视频分析和语音合成，无需切换主模型即可获得完整的多模态能力。

支持 Claude Code、Cursor、Codex、OpenCode 等所有支持 MCP 或 Agent Skills 的工具。

## 技能列表

### mimo-image-understanding

使用 MiMo 视觉模型分析图片。OCR 文字识别、UI 评审、图表数据提取、物体检测、前端截图调试。

**适用场景：**
- 用户分享了图片文件（.jpg, .png, .gif, .webp, .bmp）
- 从截图或文档中提取文字（OCR）
- 评审 UI 设计稿、线框图
- 从图表中提取数据
- 识别图片中的物体、人物或活动
- 从浏览器截图调试前端布局问题

**支持格式：** JPEG, PNG, GIF, WebP, BMP（最大 50MB）

> **使用提示：** 引用图片时，请提供本地文件路径字符串（如 `/Users/you/Desktop/screenshot.png`），而不是直接在聊天中粘贴图片。MCP 工具通过路径读取文件，直接粘贴图片会导致报错。

### mimo-audio-understanding

使用 MiMo 分析和转写音频。语音转文字、音频描述、内容摘要。

**适用场景：**
- 用户分享了音频文件（.mp3, .wav, .flac, .m4a, .ogg）
- 转写会议录音或语音备忘
- 描述音频内容（语音、音乐、环境声）
- 总结长录音或播客

**支持格式：** MP3, WAV, FLAC, M4A, OGG（URL 最大 100MB / Base64 最大 50MB）

**时长限制：** Token 估算公式 `tokens ≈ 秒数 × 6.25`。建议将超过 5 分钟的音频切分为 2-3 分钟的小段处理，避免超时。详见 [SKILL.md](skills/mimo-audio-understanding/SKILL.md)。

### mimo-video-understanding

分析和理解视频内容。场景描述、视频摘要、带时间戳的动作检测。

**适用场景：**
- 用户分享了视频文件（.mp4, .mov, .avi, .wmv）
- 总结教程、讲座或长视频
- 逐场景描述视频内容
- 识别并标记特定动作或事件

**支持格式：** MP4, MOV, AVI, WMV（URL 最大 300MB / Base64 最大 50MB）

### mimo-tts

将文本转换为语音，支持预设音色、自定义声音设计、声音克隆。支持标签控制风格和唱歌模式。

**适用场景：**
- 用户要求将文本转为语音/音频
- 生成带有特定风格或情感的配音
- 从音频样本克隆声音
- 通过文字描述创建自定义声音
- 生成唱歌人声

**3 个模型：** `mimo-v2.5-tts`（预设音色）、`mimo-v2.5-tts-voicedesign`（文字描述生成声音）、`mimo-v2.5-tts-voiceclone`（样本克隆声音）

## 安装

### 前置条件

- [Node.js](https://nodejs.org/) 18+
- MiMo API 密钥 — 在 [platform.xiaomimimo.com](https://platform.xiaomimimo.com) 注册获取
- MiMo API 基础 URL — 有两种类型：
  - **Token 套餐**：在你的 token 套餐控制台查看专属端点（如 `https://token-plan-cn.xiaomimimo.com/v1`）
  - **标准 API**：`https://api.xiaomimimo.com/v1`
  - 请在控制台确认你的账户使用哪种端点

### 第一步：克隆并构建

```bash
git clone https://github.com/<your-org>/mimo-multimodal.git
cd mimo-multimodal/mcp-server
npm install
npm run build
```

### 第二步：注册 MCP 服务器

**Claude Code：**
```bash
claude mcp add mimo-multimodal \
  -e MIMO_API_BASE=你的API基础URL \
  -e MIMO_API_KEY=你的API密钥 \
  -- node /absolute/path/to/mcp-server/dist/index.js
```

> 将 `你的API基础URL` 替换为你的实际端点 — token 套餐的专属 URL 或 `https://api.xiaomimimo.com/v1`。

**Cursor：** 其他平台请参见 [docs/setup.md](docs/setup.md)。

### 第三步：安装技能

```bash
cp -r skills/mimo-* ~/.claude/skills/
```

重启 AI 工具。技能会在引用媒体文件时自动触发。

## 可选：本地媒体网关

> **注意 —— 仅 Claude Code：** 本网关只针对 **Claude Code** 做了适配和测试。其它 agent（Cursor、Codex、OpenCode 等）的请求形态不同，可能需要自行调整 `gateway/src/` 里的拦截/改写逻辑并重新验证后再使用。

上面的技能假设 agent 给 MCP 工具的是图片**文件路径**。如果你的 agent 是**内联粘贴图片**（作为 content block），而主模型是 MiMo v2.5 Pro 这类纯文本模型，这些内联图片就到不了 MCP 工具。可选的 [`gateway/`](gateway/) 是一个轻量本地代理，自动解决这一点。

它位于 agent 和 MiMo Anthropic 端点之间，把每个内联 `image` block 改写成短引用 `claude-cache-sha256:<hash>`，并把原图写入共享图片缓存。主模型随后调用 `understand_image(source="claude-cache-sha256:<hash>")`；MCP 从缓存按 hash 取回原图发给 MiMo v2.5。原始 base64 绝不进入文本模型上下文。

```
Agent (ANTHROPIC_BASE_URL=http://127.0.0.1:4199)
  → 网关 (拦截内联 image → 原图落盘 → 生成 claude-cache-sha256:<hash>)
  → MiMo Anthropic 端点 (api.xiaomimimo.com/anthropic)

模型调用 understand_image(source="claude-cache-sha256:<hash>")
  → MCP 从图片缓存按 hash 取图 → MiMo v2.5 (视觉)
```

**只有当** agent 向纯文本主模型发送内联图片时才需要网关。如果你的流程总是引用本地图片路径，可以跳过。

### 配置与调用（快速开始）

| 变量 | 必填 | 说明 |
|---|:---:|---|
| `MIMO_ANTHROPIC_BASE` | **是** | MiMo Anthropic 端点，如 `https://api.xiaomimimo.com/anthropic` |
| `MIMO_API_KEY` | **是** | MiMo API key，以 `api-key` 头转发上游 |
| `MIMO_IMAGE_CACHE_WRITE_DIR` | | 原图落盘目录，须在 MCP 查找目录中。默认 `~/.claude/image-cache`（MCP 默认就扫它 → 零额外配置） |
| `GATEWAY_TOKEN` | | 入站鉴权 token；未设 = 不鉴权（仅本地） |
| `PORT` / `HOST` | | 默认 `4199` / `127.0.0.1` |

```bash
cd gateway && npm install        # 运行时零依赖；install 仅为 typecheck/IDE
MIMO_ANTHROPIC_BASE=https://api.xiaomimimo.com/anthropic \
MIMO_API_KEY=sk-... npm start    # 或：bun src/index.ts
```

把 agent 指向网关（它会把请求以正确的 `api-key` 转发给 MiMo）：

```jsonc
// Claude Code 环境变量
{ "ANTHROPIC_BASE_URL": "http://127.0.0.1:4199", "ANTHROPIC_API_KEY": "<GATEWAY_TOKEN 或任意值>" }
```

`mimo-multimodal` MCP server 仍需注册——网关**依赖**它解析引用，不替代它。

### 开启 / 关闭 / 持久化运行

- **开启**：`npm start`（前台）。
- **关闭**：`Ctrl-C`（前台），或 `pkill -f gateway/src/index.ts`（后台）。
- **持久化**：`nohup`、macOS `launchd` 或 Linux `systemd`——完整 plist/unit 文件见 [`gateway/README.md`](gateway/README.md)。

完整参考、面向 AI agent 的配置指南、隔离自测，见 [`gateway/README.md`](gateway/README.md)。

## 工作原理

```
用户分享媒体文件
        │
        ▼
  技能 SKILL.md 检测文件类型，
  选择分析模式和提示词
        │
        ▼
  MCP 服务器 (mcp-server/dist/index.js)
  读取文件 → Base64，调用 MiMo API
        │
        ▼
  MiMo API
  mimo-v2.5（图片/音频/视频）
  mimo-v2.5-tts（语音合成）
        │
        ▼
  返回结构化结果给 AI Agent
```

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `MIMO_API_BASE` | **是** | API 基础 URL — token 套餐端点或 `https://api.xiaomimimo.com/v1` |
| `MIMO_API_KEY` | **是** | MiMo API 密钥 |

## API 参考

MiMo 提供 OpenAI 兼容和 Anthropic 兼容端点：

| API | 基础 URL |
|---|---|
| OpenAI 兼容（标准 API） | `https://api.xiaomimimo.com/v1` |
| OpenAI 兼容（Token 套餐） | `https://token-plan-cn.xiaomimimo.com/v1` |
| Anthropic 兼容 | `https://api.xiaomimimo.com/anthropic` |

认证方式：`api-key` 请求头（不是 `Authorization: Bearer`）

官方文档：[platform.xiaomimimo.com/docs](https://platform.xiaomimimo.com/docs)

## 项目结构

```
mimo-multimodal/
├── README.md / README_zh.md
├── LICENSE
├── docs/
│   └── setup.md                          # 各平台设置指南
├── skills/
│   ├── mimo-image-understanding/
│   │   └── SKILL.md
│   ├── mimo-audio-understanding/
│   │   └── SKILL.md
│   ├── mimo-video-understanding/
│   │   └── SKILL.md
│   └── mimo-tts/
│       └── SKILL.md
├── mcp-server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/index.ts                       # MCP 服务器（图片、音频、视频、TTS）
└── gateway/                               # 可选：本地媒体网关
    └── README.md                           # 为纯文本模型代理内联图片
```

## 常见问题

| 问题 | 解决方案 |
|---|---|
| `MIMO_API_BASE environment variable is required` | 在 MCP 服务器配置中设置 `MIMO_API_BASE` |
| `MIMO_API_KEY environment variable is required` | 在 MCP 服务器配置中设置 `MIMO_API_KEY` |
| 工具未出现 | 确认服务器路径为绝对路径；重启 AI 工具 |
| `401 Unauthorized` | 检查 API 密钥 |
| `413 Payload Too Large` | 文件超出大小限制 |
| `Cannot find module` 错误 | 在 `mcp-server/` 下运行 `npm install && npm run build` |

## 许可证

[MIT](./LICENSE)
