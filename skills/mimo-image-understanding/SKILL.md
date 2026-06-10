---
name: mimo-image-understanding
description: >
  Analyze images using Xiaomi MiMo vision model — OCR, UI review, chart extraction,
  object detection, and frontend web debugging from screenshots.
  Use this skill whenever the user shares or references an image file (.jpg, .jpeg,
  .png, .gif, .webp, .bmp, .svg), a Base64-encoded image string, a data URI
  (data:image/...;base64,...), or a Claude Code image-cache hash reference
  (claude-cache-sha256:<hash>), even if they casually mention a screenshot, photo,
  or picture without naming the format. Also use for: extracting text from images,
  reviewing UI mockups or designs, reading charts or graphs, identifying objects in
  photos, debugging frontend layouts from browser screenshots, and visual regression
  analysis. The skill's MCP tools handle image analysis far better than the Read tool,
  so prefer them for any visual content.
license: MIT
metadata:
  version: "2.2"
  category: ai-multimodal
  sources:
    - https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/image-understanding
---

# MiMo Image Understanding

## Prerequisites

Requires `mcp__mimo-multimodal__understand_image` tool. If not available, read `references/setup.md` and help the user configure the MCP server — you will need to ask for their API plan type (token plan vs standard API) and credentials.

## Supported Formats

JPEG, PNG, GIF, WebP, BMP — max 50MB per image.

**Input types:** local file path, public URL, `data:image/...;base64,...` data URI, raw Base64 string, or `claude-cache-sha256:<hash>` reference. The MCP tool auto-detects the input type and converts as needed.

> **Important:** Always pass the image as a file path string (e.g. `/Users/you/Desktop/photo.png`). Do NOT paste the image directly into the chat — the MCP tool cannot read inline images and will error.

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

1. Detect image inputs: local file paths (`.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`), public URLs, `data:image/...` data URIs, raw Base64 strings, or `claude-cache-sha256:<hash>` references
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

## Error Handling

- **401 Unauthorized:** API key is invalid or expired — ask user to check their key
- **413 Payload Too Large:** Image exceeds 50MB — ask user to compress or resize
- **Connection timeout:** Check if `MIMO_API_BASE` URL is correct for the user's plan
- **File not found:** Verify the file path exists; for URLs, ensure they are publicly accessible
- **Claude cache reference not found:** The MCP server checks image files and recent Claude transcripts in parallel. If needed, set `MIMO_IMAGE_LOOKUP_DIRS` for image files or `MIMO_CLAUDE_TRANSCRIPT_DIRS` for Claude Desktop/Claude Code transcript folders

## Performance Knobs

- `MIMO_DEBUG_TIMING=1`: log resolver and MiMo API timings to stderr
- `MIMO_IMAGE_LOOKUP_FILES`: max image files to inspect while resolving cache refs; defaults to 5000
- `MIMO_IMAGE_CACHE_WRITE_DIR`: local directory for resolved Claude images; defaults to `~/.claude/image-cache`
- `MIMO_DISABLE_IMAGE_CACHE_WRITE=1`: disable local cache writes
- `MIMO_CLAUDE_TRANSCRIPT_DIRS`: Claude transcript directories to search; defaults to `~/.claude/projects`
- `MIMO_CLAUDE_FAST_TRANSCRIPT_FILES`: number of recent transcript files to scan first; defaults to 10
- `MIMO_CLAUDE_TRANSCRIPT_FILES`: max transcript files to scan; defaults to 120
- `MIMO_CLAUDE_TRANSCRIPT_BYTES`: max bytes per transcript file; defaults to 120MB

For direct API calls (without MCP), see `references/api-examples.md`.
