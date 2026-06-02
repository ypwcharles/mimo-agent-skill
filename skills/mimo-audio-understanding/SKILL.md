---
name: mimo-audio-understanding
description: >
  Analyze and transcribe audio using Xiaomi MiMo model. Supports speech-to-text
  transcription, audio description, and content summarization.
  Triggers on: .mp3, .wav, .flac, .m4a, .ogg file extensions, or phrases like
  "transcribe", "analyze audio", "what's in this recording", "listen to",
  "speech to text", "meeting notes from audio".
license: MIT
metadata:
  version: "2.0"
  category: ai-multimodal
  sources:
    - https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/audio-understanding
---

# MiMo Audio Understanding

Analyze and transcribe audio using the Xiaomi MiMo model. Covers speech-to-text transcription, audio content description, and summarization.

## Prerequisites

- MiMo multimodal MCP server running with `understand_audio` tool available
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

MP3, WAV, FLAC, M4A, OGG
- URL input: max 100MB per file
- Base64 input: max 50MB per encoded string

## Audio Token Estimation

```
Tokens ≈ duration_in_seconds × 6.25
```

## Analysis Modes

| Mode | When to use | Prompt |
|---|---|---|
| **transcribe** | Speech-to-text, meeting notes | "Transcribe all spoken content in this audio file verbatim. Include speaker identification if multiple speakers are detectable. Preserve the original language." |
| **describe** | General audio understanding | "Describe this audio in detail. Include: type of content (speech, music, ambient), number of speakers, language, tone/mood, background sounds, and any notable features." |
| **summarize** | Long recordings, podcasts | "Listen to this audio and provide a concise summary of the key points discussed or the main content. Include any important details, names, dates, or action items." |

## Workflow

1. Detect audio files by extension: `.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`
2. Select the appropriate analysis mode
3. Call `mcp__mimo-multimodal__understand_audio` with the file path/URL and the mode's prompt
4. Present results in the appropriate format

## Output Formats

**transcribe:** Preserved spoken content with speaker labels if detectable

**describe:** Structured description covering content type, speakers, language, mood, sounds

**summarize:**
```
## Audio Summary

### Key Points
- ...

### Details
- ...
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
      {"type":"input_audio","input_audio":{"data":"$AUDIO_URL_OR_DATA_URI"}},
      {"type":"text","text":"Transcribe this audio verbatim"}
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
        {"type":"input_audio","input_audio":{"data":"$AUDIO_URL_OR_DATA_URI"}},
        {"type":"text","text":"Transcribe this audio verbatim"}
    ]}],
    max_completion_tokens=4096
)
```

## Notes

- Both local file paths and public URLs are accepted
- Multiple audio files can be sent in one request (total tokens must fit in context)
- Audio format variants are numerous — not all files are guaranteed to be recognized; test with your specific files
- The response includes `reasoning_content` and `audio_tokens` usage details
- No local file upload API — the MCP server converts local files to Base64 automatically
