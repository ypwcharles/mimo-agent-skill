---
name: mimo-audio-understanding
description: >
  Analyze and transcribe audio using Xiaomi MiMo model — speech-to-text transcription,
  audio description, and content summarization.
  Use this skill whenever the user shares or references an audio file (.mp3, .wav,
  .flac, .m4a, .ogg), a Base64-encoded audio string, or a data URI
  (data:audio/...;base64,...), even casually. Also use for: transcribing recordings,
  converting speech to text, describing audio content, summarizing meetings or
  podcasts, and generating meeting notes from audio files.
license: MIT
metadata:
  version: "2.2"
  category: ai-multimodal
  sources:
    - https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/audio-understanding
---

# MiMo Audio Understanding

## Prerequisites

Requires `mcp__mimo-multimodal__understand_audio` tool. If not available, read `references/setup.md` and help the user configure the MCP server — you will need to ask for their API plan type (token plan vs standard API) and credentials.

## Supported Formats

MP3, WAV, FLAC, M4A, OGG
- URL input: max 100MB per file
- Base64 input: max 50MB per encoded string

**Input types:** local file path, public URL, `data:audio/...;base64,...` data URI, or raw Base64 string. The MCP tool auto-detects the input type and converts as needed.

Token estimation: `tokens ≈ duration_seconds × 6.25`

## Duration Limits & Chunking Strategy

| Duration | Tokens (approx) | Reliability |
|---|---|---|
| < 2 min | < 750 | High — almost always succeeds |
| 2-5 min | 750-1,875 | Good — usually succeeds |
| 5-10 min | 1,875-3,750 | Moderate — may timeout |
| 10-20 min | 3,750-7,500 | Low — frequently times out |
| > 20 min | > 7,500 | Unreliable — very likely to timeout |

**For audio > 5 minutes, always split into chunks first:**

```bash
# Compress (voice-only): mono, 16kHz, 64kbps
ffmpeg -i input.m4a -ar 16000 -ac 1 -b:a 64k input_compressed.mp3

# Split into 2-minute chunks
ffmpeg -i input_compressed.mp3 -f segment -segment_time 120 -c copy chunk_%02d.mp3
```

Process each chunk separately, then combine results. On timeout (`MCP error -32001`), retry the same chunk 1-2 times before reducing chunk size.

**Speaker diarization across chunks:** Include speaker names in each chunk's prompt. Process sequentially to maintain speaker identity consistency.

## Analysis Modes

| Mode | When to use | Prompt |
|---|---|---|
| **transcribe** | Speech-to-text, meeting notes | "Transcribe all spoken content in this audio file verbatim. Include speaker identification if multiple speakers are detectable. Preserve the original language." |
| **describe** | General audio understanding | "Describe this audio in detail. Include: type of content (speech, music, ambient), number of speakers, language, tone/mood, background sounds, and any notable features." |
| **summarize** | Long recordings, podcasts | "Listen to this audio and provide a concise summary of the key points discussed or the main content. Include any important details, names, dates, or action items." |

## Workflow

1. Detect audio inputs: local file paths (`.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`), public URLs, `data:audio/...` data URIs, or raw Base64 strings
2. Select the analysis mode based on context
3. Call `mcp__mimo-multimodal__understand_audio` with the file path/URL and the mode's prompt
4. Present results in the format below

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

## Notes

- Multiple audio files can be sent in one request (total tokens must fit in context)
- Audio format variants are numerous — not all files are guaranteed to be recognized
- The MCP server converts local files to Base64 automatically

## Error Handling

- **401 Unauthorized:** API key is invalid or expired — ask user to check their key
- **413 Payload Too Large:** Audio exceeds size limits (100MB URL / 50MB Base64)
- **Connection timeout:** Check if `MIMO_API_BASE` URL is correct for the user's plan
- **Unrecognized format:** Some audio codec variants may not be supported — try converting to standard MP3 or WAV

For direct API calls (without MCP), see `references/api-examples.md`.
