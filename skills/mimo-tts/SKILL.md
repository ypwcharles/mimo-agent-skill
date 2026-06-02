---
name: mimo-tts
description: >
  Convert text to speech using Xiaomi MiMo TTS — preset voices, voice design from
  text descriptions, and voice cloning from audio samples. Supports style control
  via natural language and audio tags, dialects, and singing mode.
  Use this skill when the user asks to: generate speech from text, create a voiceover,
  clone a voice, design a custom voice, read text aloud, convert text to audio, or
  generate singing vocals. Also trigger on "TTS", "text to speech", "speech synthesis",
  "voice clone", "voice design", "voiceover", "read aloud".
license: MIT
metadata:
  version: "2.2"
  category: ai-multimodal
  sources:
    - https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/speech-synthesis-v2.5
---

# MiMo TTS

## Prerequisites

Requires `mcp__mimo-multimodal__tts` tool. If not available, read `references/setup.md` and help the user configure the MCP server — you will need to ask for their API plan type (token plan vs standard API) and credentials.

## Model Selection

Choose the right model based on the user's need:

```
User wants TTS
  │
  ├─ Has an audio sample to clone? ──→ mimo-v2.5-tts-voiceclone
  │   (provide mp3/wav sample, max 10MB Base64)
  │
  ├─ Describes a voice in words? ──→ mimo-v2.5-tts-voicedesign
  │   (e.g. "young woman, warm and confident, slow pace")
  │
  └─ Wants a ready-made voice? ──→ mimo-v2.5-tts
      (pick from preset voice list below)
```

## Preset Voices (mimo-v2.5-tts only)

| Voice | ID | Language | Gender |
|---|---|---|---|
| MiMo Default | `mimo_default` | Auto | — |
| 冰糖 | `冰糖` | Chinese | Female |
| 茉莉 | `茉莉` | Chinese | Female |
| 苏打 | `苏打` | Chinese | Male |
| 白桦 | `白桦` | Chinese | Male |
| Mia | `Mia` | English | Female |
| Chloe | `Chloe` | English | Female |
| Milo | `Milo` | English | Male |
| Dean | `Dean` | English | Male |

## Style Control

Two methods, placed in different message locations:

**Natural language** (in `user` message) — describe the desired style:
> "Bright, bouncy, slightly sing-song tone — like you are bursting with good news. Fast pace, rising pitch at the end."

**Director Mode** — for high-quality performance, describe: **Character** (identity, personality), **Scene** (what's happening, emotion), **Direction** (speed, breath, pauses, resonance, texture).

**Audio tags** (in `assistant` message text):

Opening style tags at the beginning: `(style1 style2)text to speak`

| Category | Examples |
|---|---|
| Emotions | 开心/悲伤/愤怒/兴奋/平静/冷漠, 怅然/欣慰/无奈/愧疚 |
| Tone | 温柔/高冷/活泼/严肃/慵懒/俏皮/深沉 |
| Voice | 磁性/醇厚/清亮/空灵/稚嫩/甜美/沙哑 |
| Character | 夹子音/御姐音/正太音/大叔音/台湾腔 |
| Dialects | 东北话/四川话/河南话/粤语 |
| Singing | 唱歌 — place at very beginning: `(唱歌)lyrics` |

Inline tags anywhere in text: `[吸气]` `[叹气]` `[笑]` `[大笑]` `[抽泣]` `[颤抖]` `[变调]` `[破音]` `[气声]`

## Workflow

### Preset Voice TTS
1. User provides text and optionally voice/style preference
2. Call `tts` tool with text, voice ID, and optional style description
3. Return the generated audio

### Voice Design TTS
1. User describes the desired voice (gender, age, timbre, emotion, speed)
2. Call `tts` tool with model `mimo-v2.5-tts-voicedesign`, voice description in `user` message
3. Optional: `optimize_text_preview: true` to polish the text automatically

### Voice Clone TTS
1. User provides an audio sample (mp3/wav) and text to speak
2. Call `tts` tool with model `mimo-v2.5-tts-voiceclone`, sample as Base64 in `voice` field

## Output Formats

| Format | Use Case |
|---|---|
| `wav` | Complete audio file (non-streaming) |
| `pcm16` | Streaming — 24kHz PCM16LE mono |

## Important Notes

- The **text to synthesize** goes in `role: assistant` content, NOT `user`
- The `user` message is for style instructions only — its content will NOT be spoken
- For `mimo-v2.5-tts-voicedesign`, the `user` message is **required**
- TTS is currently **free** (limited-time promotional pricing)

## Error Handling

- **401 Unauthorized:** API key is invalid or expired — ask user to check their key
- **413 Payload Too Large:** Voice clone sample exceeds 10MB Base64
- **Connection timeout:** Check if `MIMO_API_BASE` URL is correct for the user's plan
- **Empty audio response:** Check that text is in `role: assistant` (not `user`)

For direct API calls (without MCP), see `references/api-examples.md`.
