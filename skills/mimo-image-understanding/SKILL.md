---
name: mimo-image-understanding
description: >
  Analyze images using Xiaomi MiMo vision model. Supports OCR, UI review, chart
  data extraction, object detection, and frontend web debugging from screenshots.
  ALWAYS use this skill when the user shares or references an image file (.jpg, .jpeg,
  .png, .gif, .webp, .bmp, .svg), even if they just casually mention a screenshot,
  photo, or picture. Also use when the user asks to: extract text from an image,
  review a UI mockup or design, read a chart or graph, identify objects in a photo,
  debug a frontend layout from a browser screenshot, or do visual regression analysis.
  Do NOT use the Read tool for image analysis — always use this skill's MCP tools instead.
license: MIT
metadata:
  version: "2.1"
  category: ai-multimodal
  sources:
    - https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/image-understanding
---

# MiMo Image Understanding

## Prerequisites

Requires `mcp__mimo-multimodal__understand_image` tool. If not available, read `references/setup.md` and help the user configure the MCP server first — you will need to ask them for their API plan type (token plan vs standard API) and credentials.

## Supported Formats

JPEG, PNG, GIF, WebP, BMP — max 50MB per image (URL or Base64). Multiple images can be sent in one request for comparison.

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
2. Select the analysis mode based on context (or ask the user what they need)
3. Call `mcp__mimo-multimodal__understand_image` with the file path/URL and the mode's prompt
4. Present results in the format below

### Web Debugging Pipeline

When doing frontend debugging, take a browser screenshot first (using available tools), save to disk, then pass the saved path to `understand_image` with the `web-debug` prompt.

## Output Formats

**describe / object-detect:** Readable prose or structured list

**ocr / chart-data:** Preserve structure (tables, lists, columns)

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

## API Reference

For direct API calls (without MCP), see `references/api-examples.md`.
