# MiMo MCP Server Setup Guide

Works with any AI coding tool that supports MCP (Claude Code, Cursor, Codex, OpenCode, etc.).

## 1. Get API Credentials

Sign up at [platform.xiaomimimo.com](https://platform.xiaomimimo.com) and obtain:

- **API Key** — from the developer console
- **API Base URL** — see below for the two types

### Two types of API Base URL

MiMo has two different endpoints depending on your plan:

| Plan | Base URL | Description |
|---|---|---|
| **Token Plan** (token 套餐) | e.g. `https://token-plan-cn.xiaomimimo.com/v1` | Dedicated endpoint for token plan users. Your exact URL is shown in your token plan console. |
| **Standard API** (标准 API) | `https://api.xiaomimimo.com/v1` | Standard pay-as-you-go endpoint |

> **Important:** These are two different endpoints. Using the wrong one will result in authentication errors. Check your console to confirm which URL applies to your account. If you use a third-party provider, use their endpoint instead.

## 2. Build the MCP Server

```bash
cd mcp-server
npm install
npm run build
```

## 3. Register with Your AI Tool

### Claude Code

```bash
claude mcp add mimo-multimodal \
  -e MIMO_API_BASE=your-api-base-url \
  -e MIMO_API_KEY=your-api-key \
  -- node /absolute/path/to/mcp-server/dist/index.js
```

> Replace `your-api-base-url` with your actual endpoint (token plan URL or `https://api.xiaomimimo.com/v1`).

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mimo-multimodal": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "MIMO_API_BASE": "your-api-base-url",
        "MIMO_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Manual (settings.json)

Add to your tool's MCP settings:

```json
{
  "mcpServers": {
    "mimo-multimodal": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "MIMO_API_BASE": "your-api-base-url",
        "MIMO_API_KEY": "your-api-key"
      }
    }
  }
}
```

## 4. Install Skills

Copy or symlink the skill directories to your tool's skills location:

```bash
# Claude Code
cp -r skills/mimo-* ~/.claude/skills/

# Or symlink for easy updates
ln -s $(pwd)/skills/mimo-image-understanding ~/.claude/skills/
ln -s $(pwd)/skills/mimo-audio-understanding ~/.claude/skills/
ln -s $(pwd)/skills/mimo-video-understanding ~/.claude/skills/
ln -s $(pwd)/skills/mimo-tts ~/.claude/skills/
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MIMO_API_BASE` | **Yes** | API base URL (e.g. `https://api.xiaomimimo.com/v1`) |
| `MIMO_API_KEY` | **Yes** | Your MiMo API key |

## Verification

Restart your AI tool and test:

```
Describe this image: /path/to/test.jpg
Transcribe this audio: /path/to/test.mp3
Summarize this video: /path/to/test.mp4
Convert this to speech: Hello world
```

## Troubleshooting

| Error | Fix |
|---|---|
| `MIMO_API_BASE env required` | Set the base URL in your MCP config |
| `MIMO_API_KEY env required` | Set the API key in your MCP config |
| Tools not appearing | Verify server path is absolute; restart your AI tool |
| `401 Unauthorized` | Check your API key |
| `413 Payload Too Large` | File exceeds size limits (50MB/100MB/300MB) |
| `Cannot find module` | Run `npm install && npm run build` in `mcp-server/` |
