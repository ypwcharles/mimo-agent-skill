---
name: mimo-video-understanding
description: >
  Analyze and understand video content using Xiaomi MiMo model. Supports scene
  description, video summarization, and action detection with timestamps.
  Triggers on: .mp4, .mov, .avi, .wmv file extensions, or phrases like
  "analyze video", "what's happening in this video", "describe this video",
  "summarize video", "video summary".
license: MIT
metadata:
  version: "2.0"
  category: ai-multimodal
  sources:
    - https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/video-understanding
---

# MiMo Video Understanding

Analyze and understand video content using the Xiaomi MiMo model. Covers scene description, video summarization, and action detection.

## Prerequisites

- MiMo multimodal MCP server running with `understand_video` tool available
- If the tool is NOT available, ask the user for their **API Base URL** and **API Key**, then help them set up the MCP server (see `references/setup.md`)

## Supported Formats

MP4, MOV, AVI, WMV
- URL input: max 300MB per file
- Base64 input: max 50MB per encoded string

## Key Parameters

| Parameter | Default | Range | Description |
|---|---|---|---|
| `fps` | 2 | 0.1 – 10 | Frames sampled per second. Higher = finer temporal detail, more tokens |
| `media_resolution` | `default` | `default`, `max` | Per-frame resolution tier. `max` improves small object/texture recognition |

### FPS Guidelines

| FPS | Best for |
|---|---|
| 0.1 – 0.5 | Long videos, lectures, presentations (slow-changing content) |
| 1 – 2 | General purpose |
| 3 – 5 | Tutorials with fast transitions, demos |
| 5 – 10 | Sports, action-packed content, frame-by-frame analysis |

## Analysis Modes

| Mode | When to use | Prompt |
|---|---|---|
| **describe** | General video understanding | "Describe this video in detail, scene by scene. Include: setting, people/objects, actions, any text or graphics overlaid, and overall context." |
| **summarize** | Long videos, tutorials | "Watch this video and provide a concise summary. Include: main topic, key moments, any instructions or demonstrations, and the overall purpose." |
| **action-detect** | Activity identification | "Identify and describe all distinct actions or events in this video. For each, note approximately when it occurs and what happens." |

## Workflow

1. Detect video files by extension: `.mp4`, `.mov`, `.avi`, `.wmv`
2. Select the appropriate analysis mode
3. Choose `fps` and `media_resolution` based on content type
4. Call `mcp__mimo-multimodal__understand_video` with the file path/URL and prompt
5. Present results in the appropriate format

## Output Formats

**describe:** Scene-by-scene narrative description

**summarize:**
```
## Video Summary

### Main Topic
- ...

### Key Moments
1. [timestamp] — [what happens]
2. ...

### Purpose
- ...
```

**action-detect:**
```
## Actions Detected

1. **[Action]** — ~[timestamp]
   [Description]

2. **[Action]** — ~[timestamp]
   [Description]
```

## Platform Examples

### Curl (OpenAI-compatible)
```bash
curl -X POST "$MIMO_API_BASE/chat/completions" \
  -H "api-key: $MIMO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2.5",
    "messages": [{"role":"user","content":[
      {"type":"video_url","video_url":{"url":"$VIDEO_URL_OR_DATA_URI"},"fps":2,"media_resolution":"default"},
      {"type":"text","text":"Describe this video in detail"}
    ]}],
    "max_completion_tokens": 4096
  }'
```

### Python (OpenAI SDK)
```python
from openai import OpenAI
client = OpenAI(api_key=MIMO_API_KEY, base_url=f"{MIMO_API_BASE}")
completion = client.chat.completions.create(
    model="mimo-v2.5",
    messages=[{"role":"user","content":[
        {"type":"video_url","video_url":{"url":"$VIDEO_URL_OR_DATA_URI"},"fps":2,"media_resolution":"default"},
        {"type":"text","text":"Describe this video in detail"}
    ]}],
    max_completion_tokens=4096
)
```

## Token Estimation

Video tokens include both visual (`video_tokens`) and audio (`audio_tokens`) components:
- Audio tokens: `duration_seconds × 6.25`
- Visual tokens: depends on fps, resolution, and frame dimensions (see platform docs for algorithm)

## Notes

- Both local file paths and public URLs are accepted
- Video format variants are numerous — not all files are guaranteed to be recognized
- The response includes `reasoning_content`, `video_tokens`, and `audio_tokens` in usage details
- Use lower fps for longer videos to reduce token consumption
- Use `media_resolution: "max"` when fine details matter (small text, textures)
