# MiMo 本地媒体网关 (Local Media Gateway)

本网关是 [mimo-agent-skill](..) 的**可选**组件。

> **适配范围：** 本网关只针对 **Claude Code** 做了适配和测试。其它 agent（Cursor、Codex、OpenCode 等）的请求形态不同，需自行调整 [`src/`](src/) 里的拦截/改写逻辑并重新验证后再使用。

一个跑在 `127.0.0.1` 的透明代理，让纯文本推理模型（如 MiMo v2.5 Pro）能处理 agent **内联粘贴**的图片，而不把 base64 塞进文本上下文。

## 它解决什么问题

当主模型是纯文本模型（MiMo v2.5 Pro）时，agent 内联粘贴的图片（`image` content block）有两种失败：

- 上游 API 直接拒绝（纯文本模型不接收 image block）
- 或 base64 被当文本塞进上下文 → 上下文爆炸、首字节等待数十秒（227KB 图 ≈ 46 万 tokens）

> 如果你 / 你的 agent 总是给 MCP 提供**本地文件路径**（而非内联粘贴），就**不需要**本网关——直接用 skill + MCP 即可。

## 方案

网关拦截请求中的 `image` content block，转成短引用 `claude-cache-sha256:<sha256>`，并把原图落盘到共享图片缓存目录（默认 `~/.claude/image-cache`）。主模型只看到引用，按需调用 MCP `understand_image`；MCP 按 hash 从缓存目录取回原图，交给 MiMo v2.5 视觉模型。

```
Agent 客户端 (ANTHROPIC_BASE_URL=http://127.0.0.1:PORT)
  → 本地网关 (拦截 image block，把原图落盘)
  → MiMo 官方 /v1/messages (Anthropic 兼容端点)

模型回调 understand_image(source="claude-cache-sha256:<hash>")
  → mimo-multimodal MCP 从缓存目录按 hash 取原图 → MiMo v2.5 视觉模型
```

因为 MiMo 官方提供 Anthropic 兼容端点，网关**不做任何格式转换**——纯透传，只在 body 里替换图片 block。

## 与 MCP server 的契约（改任一边都要同步）

引用前缀、hash 算法、缓存文件名必须与本仓库 [`../mcp-server/src/index.ts`](../mcp-server/src/index.ts) 的 resolver 一致：

- 引用前缀：`claude-cache-sha256:`，hash = `SHA-256(base64)` 的 **64 位小写 hex**。
- 落盘文件名：`mimo-img-<完整hash>.<ext>`（MCP 的 `resolveCacheRefFromImageFiles` 优先按"文件名 includes(完整 hash)"秒命中）。
- 网关的 `MIMO_IMAGE_CACHE_WRITE_DIR` 默认 `~/.claude/image-cache`，这正是 MCP 默认扫描的目录之一，因此**默认配置即可闭环**，无需额外设置。

## 配置

| 变量 | 必填 | 说明 |
|---|:---:|---|
| `MIMO_ANTHROPIC_BASE` | ✅ | MiMo 官方 Anthropic 兼容端点，如 `https://api.xiaomimimo.com/anthropic` |
| `MIMO_API_KEY` | ✅ | MiMo API key，转发时以 `api-key` 头注入上游 |
| `MIMO_IMAGE_CACHE_WRITE_DIR` | | 原图落盘目录，须在 MCP 查找目录中。默认 `~/.claude/image-cache` |
| `GATEWAY_TOKEN` | | 入站鉴权 token；未设则不校验（仅本地监听） |
| `PORT` | | 监听端口，默认 `4199` |
| `HOST` | | 监听地址，默认 `127.0.0.1` |

## 运行（开启）

零运行时依赖（只用 Node 原生 API）。`npm install` 只装类型检查用的 devDependencies，**不装也能跑**。

```bash
cd gateway
npm install                 # 可选，只为 typecheck / IDE 补全
MIMO_ANTHROPIC_BASE=https://api.xiaomimimo.com/anthropic \
MIMO_API_KEY=sk-... \
npm start                   # Node 22.6+：node --experimental-strip-types src/index.ts
# 或 Bun：bun src/index.ts
```

启动后日志示例：

```
[mimo-local-gateway] listening on http://127.0.0.1:4199
[mimo-local-gateway] upstream    : https://api.xiaomimimo.com/anthropic
[mimo-local-gateway] image cache : ~/.claude/image-cache
```

### 接 Claude Code

```jsonc
// ~/.claude.json 或项目 settings
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:4199",
    "ANTHROPIC_API_KEY": "<你的 GATEWAY_TOKEN；未设鉴权则任意值>"
  }
}
```

并把配套的 `mimo-multimodal` MCP server 注册到 Claude Code（见仓库根 README 的安装步骤）。网关**依赖**它解析 `claude-cache-sha256:` 引用，不替代它。

## 停止（关闭）

- 前台运行：`Ctrl-C`。
- 后台运行：`pkill -f gateway/src/index.ts`。
- launchd / systemd：见下文对应小节的 `unload` / `stop` 命令。

## 持久化运行（后台常驻）

任选一种。示例假设仓库已 clone 到 `/path/to/mimo-agent-skill`，请替换绝对路径与密钥。

### nohup（最简单，所有平台）

```bash
nohup env MIMO_ANTHROPIC_BASE=https://api.xiaomimimo.com/anthropic MIMO_API_KEY=sk-... \
  npm --prefix /path/to/mimo-agent-skill/gateway start \
  > /tmp/mimo-gateway.log 2>&1 &
# 停止：
pkill -f gateway/src/index.ts
```

### macOS launchd（开机自启）

创建 `~/Library/LaunchAgents/com.mimo.gateway.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.mimo.gateway</string>
    <key>WorkingDirectory</key><string>/path/to/mimo-agent-skill/gateway</string>
    <key>ProgramArguments</key>
    <array>
        <string>node</string>
        <string>--experimental-strip-types</string>
        <string>src/index.ts</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>MIMO_ANTHROPIC_BASE</key><string>https://api.xiaomimimo.com/anthropic</string>
        <key>MIMO_API_KEY</key><string>sk-your-key</string>
        <key>PORT</key><string>4199</string>
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>/tmp/mimo-gateway.log</string>
    <key>StandardErrorPath</key><string>/tmp/mimo-gateway.err.log</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.mimo.gateway.plist    # 开启 + 开机自启
launchctl unload ~/Library/LaunchAgents/com.mimo.gateway.plist  # 停止
```

### Linux systemd

创建 `/etc/systemd/system/mimo-gateway.service`：

```ini
[Unit]
Description=MiMo Local Media Gateway
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/mimo-agent-skill/gateway
Environment=MIMO_ANTHROPIC_BASE=https://api.xiaomimimo.com/anthropic
Environment=MIMO_API_KEY=sk-your-key
Environment=PORT=4199
ExecStart=/usr/bin/node --experimental-strip-types src/index.ts
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now mimo-gateway   # 开启 + 开机自启
sudo systemctl stop mimo-gateway           # 停止
sudo systemctl disable mimo-gateway        # 取消开机自启
```

## 验证

```bash
curl -s http://127.0.0.1:4199/v1/messages \
  -H "x-api-key: $GATEWAY_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"mimo-v2.5-pro","max_tokens":16,"messages":[{"role":"user","content":"ping"}]}'
# 纯文本请求，应正常返回（直通，无图片处理）
```

完整自测（完全隔离，不碰真实服务 / API / 缓存）：

```bash
cd gateway && npm test    # typecheck + 19 项端到端断言
```

## For AI agents — 如何配置和调用本网关

如果你是一个 AI agent，被要求启用本网关，按下面做：

1. **确认前置**：仓库根的 `mimo-multimodal` MCP server 已注册并运行（本网关依赖它解析 `claude-cache-sha256:` 引用）。
2. **配置环境变量**：必须设 `MIMO_ANTHROPIC_BASE`（MiMo Anthropic 端点）和 `MIMO_API_KEY`。其余用默认即可（端口 4199、缓存 `~/.claude/image-cache`）。
3. **启动**：`cd gateway && npm install && npm start`（前台），或用上文 nohup / launchd / systemd 之一后台常驻。
4. **改客户端指向网关**：把 agent 的 `ANTHROPIC_BASE_URL` 设为 `http://127.0.0.1:4199`。`ANTHROPIC_API_KEY` 设为 `GATEWAY_TOKEN`（若未设 token 则任意值）。
5. **确认在跑**：用上面的 `curl` 验证返回正常即通。
6. **不要**改引用前缀（`claude-cache-sha256:`）或 hash 算法（SHA-256 of base64）——它们必须和 MCP server 一致，否则闭环断开。改动前先核对 [`../mcp-server/src/index.ts`](../mcp-server/src/index.ts) 的 `CACHE_REF_PREFIX`。

## 注意事项

- **上游鉴权头**：代码默认用 `api-key` 头注入 MiMo key（MiMo 官方 Anthropic 端点即此风格）。若端点要求 `Authorization: Bearer`，改 [`src/upstream.ts`](src/upstream.ts) 里标注的一行。
- **入站鉴权**：纯本地 `127.0.0.1` 监听可不设 `GATEWAY_TOKEN`；暴露到网络必须设置。
- **不透传客户端密钥**：转发时用 `MIMO_API_KEY` 替换，客户端 token 不会到达上游。
- **流式透明**：无图请求按原始字节流转发（字节级），含图请求改造后转发，响应（含 SSE）原样 pipe 回客户端。
