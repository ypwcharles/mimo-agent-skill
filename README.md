# MiMo Agent Skill

[中文版](./README_zh.md)

Agent skills and MCP server that add multimodal capabilities to any AI coding agent, powered by [Xiaomi MiMo](https://platform.xiaomimimo.com).

**Why this exists:** MiMo v2.5 Pro is a strong reasoning model but does not support multimodal input natively. These skills bridge that gap — they let your agent call MiMo v2.5 (vision) and MiMo v2-Omni (audio/video) for image understanding, audio transcription, video analysis, and TTS, giving your agent full multimodal capabilities without switching away from v2.5 Pro as the primary model.

Works with Claude Code, Cursor, Codex, OpenCode, and any tool that supports MCP or agent skills.

## Available Skills

### mimo-image-understanding

Analyze images using MiMo's vision model. OCR, UI review, chart data extraction, object detection, web debugging from screenshots.

**Use when:**
- User shares an image file (.jpg, .png, .gif, .webp, .bmp)
- Extracting text from screenshots or documents (OCR)
- Reviewing UI mockups, wireframes, or design files
- Extracting data from charts or graphs
- Identifying objects, people, or activities in photos
- Debugging frontend layout issues from browser screenshots

**Supported formats:** JPEG, PNG, GIF, WebP, BMP (max 50MB)

### mimo-audio-understanding

Analyze and transcribe audio using MiMo. Speech-to-text, audio description, content summarization.

**Use when:**
- User shares an audio file (.mp3, .wav, .flac, .m4a, .ogg)
- Transcribing meeting recordings or voice memos
- Describing audio content (speech, music, ambient)
- Summarizing long recordings or podcasts

**Supported formats:** MP3, WAV, FLAC, M4A, OGG (max 100MB URL / 50MB Base64)

**Duration limits:** Token estimation: `tokens ≈ duration_seconds × 6.25`. For audio > 5 minutes, split into 2-3 minute chunks to avoid timeouts. See [SKILL.md](skills/mimo-audio-understanding/SKILL.md) for chunking strategy.

### mimo-video-understanding

Analyze and understand video content. Scene description, video summarization, action detection with timestamps.

**Use when:**
- User shares a video file (.mp4, .mov, .avi, .wmv)
- Summarizing tutorials, lectures, or long videos
- Describing what happens in a video scene by scene
- Identifying and timestamping specific actions or events

**Supported formats:** MP4, MOV, AVI, WMV (max 300MB URL / 50MB Base64)

### mimo-tts

Convert text to speech with preset voices, custom voice design, or voice cloning. Supports style control via tags and singing mode.

**Use when:**
- User asks to convert text to speech / audio
- Generating voiceovers with specific styles or emotions
- Cloning a voice from an audio sample
- Creating a custom voice from a text description
- Generating singing vocals

**3 models:** `mimo-v2.5-tts` (preset voices), `mimo-v2.5-tts-voicedesign` (text-to-voice), `mimo-v2.5-tts-voiceclone` (sample-to-voice)

## Installation

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A MiMo API key — sign up at [platform.xiaomimimo.com](https://platform.xiaomimimo.com)
- Your MiMo API base URL — there are two types:
  - **Token Plan** (token 套餐): dedicated endpoint shown in your token plan console (e.g. `https://token-plan-cn.xiaomimimo.com/v1`)
  - **Standard API**: `https://api.xiaomimimo.com/v1`
  - Check your console to confirm which one applies to your account

### Step 1: Clone and build

```bash
git clone https://github.com/<your-org>/mimo-multimodal.git
cd mimo-multimodal/mcp-server
npm install
npm run build
```

### Step 2: Register the MCP server

**Claude Code:**
```bash
claude mcp add mimo-multimodal \
  -e MIMO_API_BASE=your-api-base-url \
  -e MIMO_API_KEY=your-api-key \
  -- node /absolute/path/to/mcp-server/dist/index.js
```

> Replace `your-api-base-url` with your actual endpoint — token plan URL or `https://api.xiaomimimo.com/v1`.

**Cursor:** See [docs/setup.md](docs/setup.md) for all platforms.

### Step 3: Install skills

```bash
cp -r skills/mimo-* ~/.claude/skills/
```

Restart your AI tool. Skills auto-trigger when you reference media files.

## How It Works

```
User shares media file
        │
        ▼
  Skill SKILL.md detects file type,
  selects analysis mode and prompt
        │
        ▼
  MCP Server (mcp-server/dist/index.js)
  reads file → Base64, calls MiMo API
        │
        ▼
  MiMo API
  mimo-v2.5 (image/audio/video)
  mimo-v2.5-tts (speech synthesis)
        │
        ▼
  Structured result returned to agent
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `MIMO_API_BASE` | **Yes** | API base URL — token plan endpoint or `https://api.xiaomimimo.com/v1` |
| `MIMO_API_KEY` | **Yes** | Your MiMo API key |

## API Reference

MiMo provides OpenAI-compatible and Anthropic-compatible endpoints:

| API | Base URL |
|---|---|
| OpenAI-compatible | `https://api.xiaomimimo.com/v1` |
| Anthropic-compatible | `https://api.xiaomimimo.com/anthropic` |

Authentication: `api-key` header (not `Authorization: Bearer`)

Official documentation: [platform.xiaomimimo.com/docs](https://platform.xiaomimimo.com/docs)

## Project Structure

```
mimo-multimodal/
├── README.md / README_zh.md
├── LICENSE
├── docs/
│   └── setup.md                          # Setup guide for all platforms
├── skills/
│   ├── mimo-image-understanding/
│   │   └── SKILL.md
│   ├── mimo-audio-understanding/
│   │   └── SKILL.md
│   ├── mimo-video-understanding/
│   │   └── SKILL.md
│   └── mimo-tts/
│       └── SKILL.md
└── mcp-server/
    ├── package.json
    ├── tsconfig.json
    └── src/index.ts                       # MCP server (image, audio, video, TTS)
```

## Troubleshooting

| Problem | Solution |
|---|---|
| `MIMO_API_BASE environment variable is required` | Set `MIMO_API_BASE` in MCP server config |
| `MIMO_API_KEY environment variable is required` | Set `MIMO_API_KEY` in MCP server config |
| Tools not appearing | Verify server path is absolute; restart AI tool |
| `401 Unauthorized` | Check your API key |
| `413 Payload Too Large` | File exceeds size limits |
| `Cannot find module` | Run `npm install && npm run build` in `mcp-server/` |

## License

[MIT](./LICENSE)
