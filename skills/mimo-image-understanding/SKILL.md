---
name: mimo-image-understanding
description: >
  Analyze images using Xiaomi MiMo vision model — OCR, UI review, chart extraction,
  object detection, web debugging. Triggers on: .jpg, .jpeg, .png, .gif, .webp, .bmp,
  .svg file extensions, or phrases like "analyze image", "describe photo", "OCR",
  "read this image", "what's in this picture", "understand this screenshot".
  Also triggers for: UI mockup review, chart data extraction, object detection,
  web debugging screenshots, frontend layout verification, visual regression comparison.
  When a screenshot is taken via browser tools and needs visual analysis, pass the
  saved image path to this skill — do NOT rely on the Read tool for screenshot analysis.
license: MIT
metadata:
  version: "2.0"
  category: ai-multimodal
  sources:
    - https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/image-understanding
---

# MiMo Image Understanding

Analyze images using the Xiaomi MiMo vision model. Supports OCR, UI review, chart data extraction, object detection, and web debugging.

## Prerequisites

- MiMo multimodal MCP server running with `understand_image` tool available
- If the tool is NOT available, perform the following first-time setup:

### First-time Setup

Ask the user these questions **before** configuring:

1. **Which plan are you using?**
   - **Token Plan** (token 套餐) — uses a dedicated token plan endpoint (e.g. `https://token-plan-cn.xiaomimimo.com/v1`)
   - **Standard API** (标准 API 调用) — uses the standard endpoint `https://api.xiaomimimo.com/v1`
   - **Third-party provider** — uses the provider's own endpoint

2. **What is your API Base URL?** — based on their answer above, confirm the exact URL. Do NOT assume or guess.

3. **What is your API Key?**

Then help them register the MCP server with both `MIMO_API_BASE` and `MIMO_API_KEY`. See `references/setup.md` for the exact commands.

## Supported Formats

JPEG, PNG, GIF, WebP, BMP — max 50MB per image (URL or Base64)

## Multi-Image Support

Multiple images can be sent in a single request. The model parses all images and returns semantically relevant responses. Useful for comparing images, analyzing sequences, or understanding relationships between visuals.

## Analysis Modes

| Mode | When to use | Prompt |
|---|---|---|
| **describe** | General understanding | "Provide a detailed description of this image. Include: main subject, setting, colors/style, any text visible, notable objects, and overall composition." |
| **ocr** | Text extraction | "Extract all text visible in this image verbatim. Preserve structure and formatting (headers, lists, columns). If no text is found, say so." |
| **ui-review** | Design critique | "You are a UI/UX design reviewer. Analyze this interface mockup. Provide: (1) Strengths, (2) Issues — usability or design problems, (3) Specific, actionable suggestions for improvement." |
| **chart-data** | Chart/graph analysis | "Extract all data from this chart or graph. List: chart title, axis labels, all data points/series with values if readable, and a brief summary of the trend." |
| **object-detect** | Identify elements | "List all distinct objects, people, and activities you can identify. For each, describe what it is and its approximate location in the image." |
| **web-debug** | Frontend debugging | "You are a frontend debugging assistant. Analyze this browser screenshot. Identify: (1) visual bugs — misaligned elements, overflow, incorrect spacing, wrong colors/fonts; (2) layout problems — broken grid/flex, responsive issues; (3) style mismatches vs expected design; (4) console errors if visible. For each issue, suggest a specific CSS/code fix." |

## Workflow

1. Detect image files by extension: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.svg`
2. Select the appropriate analysis mode based on context
3. Call `mcp__mimo-multimodal__understand_image` with the file path/URL and the mode's prompt
4. Present results in the appropriate format

## Web Debugging Screenshot Pipeline

When doing frontend debugging:

1. Take a browser screenshot using available tools and save to disk
2. Pass the saved path to `understand_image` with the `web-debug` prompt
3. Report findings with specific CSS/code fix suggestions

## Output Formats

**describe / object-detect:** Readable prose or structured list

**ocr / chart-data:** Preserved structure (tables, lists, columns)

**ui-review:**
```
## Design Review

### Strengths
- ...

### Issues
1. [Element] — [Problem description]

### Suggestions
- ...
```

**web-debug:**
```
## Visual Bug Report

### Issues Found
1. **[Element]** — [Problem]
   - Location: [where]
   - Fix: [CSS/code suggestion]
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
      {"type":"image_url","image_url":{"url":"$IMAGE_URL_OR_DATA_URI"}},
      {"type":"text","text":"Describe this image"}
    ]}],
    "max_completion_tokens": 1024
  }'
```

### Python (OpenAI SDK)
```python
from openai import OpenAI
client = OpenAI(api_key=MIMO_API_KEY, base_url=f"{MIMO_API_BASE}")
completion = client.chat.completions.create(
    model="mimo-v2.5",
    messages=[{"role":"user","content":[
        {"type":"image_url","image_url":{"url":"$IMAGE_URL_OR_DATA_URI"}},
        {"type":"text","text":"Describe this image"}
    ]}],
    max_completion_tokens=1024
)
```

### Curl (Anthropic-compatible)
```bash
curl -X POST "$MIMO_API_BASE/anthropic/v1/messages" \
  -H "api-key: $MIMO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2.5",
    "max_tokens": 1024,
    "messages": [{"role":"user","content":[
      {"type":"image","source":{"type":"url","url":"$IMAGE_URL"}},
      {"type":"text","text":"Describe this image"}
    ]}]
  }'
```

## Notes

- Both local file paths and public URLs are accepted
- Multiple images can be sent in one request for comparison
- The model returns `reasoning_content` (chain-of-thought) alongside the final answer
- Token usage includes `image_tokens` in the response
