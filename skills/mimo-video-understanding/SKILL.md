---
name: mimo-video-understanding
description: >
  Analyze and understand video content using Xiaomi MiMo model. Supports scene
  description, video summarization, and action detection with timestamps.
  ALWAYS use this skill when the user shares or references a video file (.mp4, .mov,
  .avi, .wmv), even casually. Also use when the user asks to: describe what happens
  in a video, summarize a tutorial or lecture, identify actions in footage, or
  extract key moments from a recording.
license: MIT
metadata:
  version: "2.1"
  category: ai-multimodal
  sources:
    - https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/video-understanding
---

# MiMo Video Understanding

## Prerequisites

Requires `mcp__mimo-multimodal__understand_video` tool. If not available, read `references/setup.md` and help the user configure the MCP server first — you will need to ask them for their API plan type (token plan vs standard API) and credentials.

## Supported Formats

MP4, MOV, AVI, WMV
- URL input: max 300MB per file
- Base64 input: max 50MB per encoded string

## Parameters

| Parameter | Default | Range | Description |
|---|---|---|---|
| `fps` | 2 | 0.1 – 10 | Frames per second. Higher = finer detail, more tokens |
| `media_resolution` | `default` | `default`, `max` | Per-frame resolution. `max` for small objects/textures |

**FPS guide:** 0.1–0.5 for lectures, 1–2 general, 3–5 tutorials, 5–10 sports/actions.

## Analysis Modes

| Mode | When to use | Prompt |
|---|---|---|
| **describe** | General video understanding | "Describe this video in detail, scene by scene. Include: setting, people/objects, actions, any text or graphics overlaid, and overall context." |
| **summarize** | Long videos, tutorials | "Watch this video and provide a concise summary. Include: main topic, key moments, any instructions or demonstrations, and the overall purpose." |
| **action-detect** | Activity identification | "Identify and describe all distinct actions or events in this video. For each, note approximately when it occurs and what happens." |

## Workflow

1. Detect video files by extension: `.mp4`, `.mov`, `.avi`, `.wmv`
2. Select the analysis mode and choose `fps` / `media_resolution` based on content
3. Call `mcp__mimo-multimodal__understand_video` with the file path/URL and prompt
4. Present results in the format below

## Output Formats

**describe:** Scene-by-scene narrative description

**summarize:**
```
## Video Summary
### Main Topic
- ...
### Key Moments
1. [timestamp] — [what happens]
### Purpose
- ...
```

**action-detect:**
```
## Actions Detected
1. **[Action]** — ~[timestamp]
   [Description]
```

## Notes

- Video format variants are numerous — not all files are guaranteed to be recognized
- Audio tokens: `duration_seconds × 6.25`; visual tokens depend on fps/resolution
- Use `media_resolution: "max"` when fine details matter (small text, textures)

## API Reference

For direct API calls (without MCP), see `references/api-examples.md`.
