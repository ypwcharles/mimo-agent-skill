---
name: mimo-audio-understanding
description: >
  Analyze and transcribe audio using Xiaomi MiMo model. Supports speech-to-text
  transcription, audio description, and content summarization.
  ALWAYS use this skill when the user shares or references an audio file (.mp3, .wav,
  .flac, .m4a, .ogg), even casually. Also use when the user asks to: transcribe a
  recording, convert speech to text, describe what's in an audio file, summarize a
  meeting recording or podcast, or generate meeting notes from audio.
license: MIT
metadata:
  version: "2.1"
  category: ai-multimodal
  sources:
    - https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/multimodal-understanding/audio-understanding
---

# MiMo Audio Understanding

## Prerequisites

Requires `mcp__mimo-multimodal__understand_audio` tool. If not available, read `references/setup.md` and help the user configure the MCP server first — you will need to ask them for their API plan type (token plan vs standard API) and credentials.

## Supported Formats

MP3, WAV, FLAC, M4A, OGG
- URL input: max 100MB per file
- Base64 input: max 50MB per encoded string

Token estimation: `tokens ≈ duration_seconds × 6.25`

## Analysis Modes

| Mode | When to use | Prompt |
|---|---|---|
| **transcribe** | Speech-to-text, meeting notes | "Transcribe all spoken content in this audio file verbatim. Include speaker identification if multiple speakers are detectable. Preserve the original language." |
| **describe** | General audio understanding | "Describe this audio in detail. Include: type of content (speech, music, ambient), number of speakers, language, tone/mood, background sounds, and any notable features." |
| **summarize** | Long recordings, podcasts | "Listen to this audio and provide a concise summary of the key points discussed or the main content. Include any important details, names, dates, or action items." |

## Workflow

1. Detect audio files by extension: `.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`
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

## API Reference

For direct API calls (without MCP), see `references/api-examples.md`.
