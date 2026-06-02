---
name: mimo-tts
description: >
  Convert text to speech using Xiaomi MiMo TTS. Supports preset voices, custom
  voice design from text descriptions, voice cloning from audio samples, style
  control via tags and natural language, and singing mode.
  Triggers on: "text to speech", "TTS", "generate speech", "voice over",
  "read this aloud", "voice clone", "voice design", "singing",
  "convert text to audio", "speech synthesis".
license: MIT
metadata:
  version: "2.0"
  category: ai-multimodal
  sources:
    - https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/speech-synthesis-v2.5
---

# MiMo TTS (Text-to-Speech)

Convert text to speech using Xiaomi MiMo TTS models. Three modes: preset voices, voice design, and voice cloning.

## Prerequisites

- MiMo multimodal MCP server running with `tts` tool available
- If the tool is NOT available, ask the user for their **API Base URL** and **API Key**, then help them set up the MCP server (see `references/setup.md`)

## Models

| Model | Function | Voice Source |
|---|---|---|
| `mimo-v2.5-tts` | TTS with preset premium voices | Preset voice list. Supports singing. |
| `mimo-v2.5-tts-voicedesign` | Custom voice from text description | Auto-generated. No preset or sample needed. |
| `mimo-v2.5-tts-voiceclone` | Clone voice from audio sample | Audio sample (mp3/wav, max 10MB Base64) |

## Preset Voices

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

### Natural Language Control (in `user` message)

Describe the desired voice style in natural language:

> "Bright, bouncy, slightly sing-song tone — like you are bursting with good news. Fast pace, rising pitch at the end."

**Director Mode** — for high-quality performance, cover three dimensions:
- **Character**: Identity, personality, speaking habits
- **Scene**: What's happening, who is being spoken to, emotional state
- **Direction**: Speed, breath, pauses, stress, resonance, vocal texture, emotion

### Audio Tag Control (in `assistant` message text)

**Opening style tags** — at the beginning of text: `(style1 style2)text to speak`

| Category | Examples |
|---|---|
| Basic Emotions | 开心/悲伤/愤怒/恐惧/惊讶/兴奋/委屈/平静/冷漠 |
| Compound Emotions | 怅然/欣慰/无奈/愧疚/释然/嫉妒/厌倦/忐忑/动情 |
| Overall Tone | 温柔/高冷/活泼/严肃/慵懒/俏皮/深沉/干练/凌厉 |
| Voice Quality | 磁性/醇厚/清亮/空灵/稚嫩/苍老/甜美/沙哑/醇雅 |
| Character Voice | 夹子音/御姐音/正太音/大叔音/台湾腔 |
| Dialects | 东北话/四川话/河南话/粤语 |
| Singing | 唱歌 (place at very beginning: `(唱歌)lyrics`) |

**Inline audio tags** — insert anywhere in text: `[tag]`

| Category | Examples |
|---|---|
| Breathing | [吸气]/[深呼吸]/[叹气]/[喘息]/[屏息] |
| Emotion | [紧张]/[害怕]/[激动]/[疲惫]/[委屈]/[撒娇]/[震惊] |
| Voice Effects | [颤抖]/[变调]/[破音]/[鼻音]/[气声]/[沙哑] |
| Crying/Laughing | [笑]/[轻笑]/[大笑]/[冷笑]/[抽泣]/[呜咽]/[嚎啕大哭] |

## Usage Modes

### Mode 1: Preset Voice TTS

Use `mimo-v2.5-tts` model with a preset voice.

**Workflow:**
1. User provides text and optionally a voice preference and style
2. Call `tts` tool with the text, voice ID, and optional style description
3. Return the generated audio

### Mode 2: Voice Design TTS

Use `mimo-v2.5-tts-voicedesign` model. No audio sample needed — describe the voice in the `user` message.

**Writing voice descriptions — key dimensions:**

| Dimension | Example |
|---|---|
| Gender & Age | "young woman in her mid-20s" / "五十多岁的中年男性" |
| Voice/Timbre | "deep and gravelly" / "丝滑醇厚、带着磁性" |
| Emotion/Tone | "warm and confident" / "温柔但带着一丝疲惫" |
| Speed/Rhythm | "slow and deliberate" / "语速极快，像连珠炮" |

Optional: `optimize_text_preview: true` — the model intelligently polishes the target text.

### Mode 3: Voice Clone TTS

Use `mimo-v2.5-tts-voiceclone` model. Provide an audio sample for voice replication.

**Audio sample requirements:**
- Formats: MP3, WAV only
- Max Base64 size: 10MB
- Supports style control via natural language (user message) and tags (assistant message)

## Output Formats

| Format | Use Case |
|---|---|
| `wav` | Complete audio file (non-streaming) |
| `pcm16` | Streaming — 24kHz PCM16LE mono (concatenate chunks for full audio) |

## Platform Examples

### Curl (Preset Voice)
```bash
curl -X POST "$MIMO_API_BASE/chat/completions" \
  -H "api-key: $MIMO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2.5-tts",
    "messages": [
      {"role":"user","content":"Warm, enthusiastic tone"},
      {"role":"assistant","content":"Hello! Welcome to the show."}
    ],
    "audio": {"format":"wav","voice":"Chloe"}
  }'
```

### Python (Preset Voice)
```python
import base64
from openai import OpenAI

client = OpenAI(api_key=MIMO_API_KEY, base_url=f"{MIMO_API_BASE}")
completion = client.chat.completions.create(
    model="mimo-v2.5-tts",
    messages=[
        {"role": "user", "content": "Warm, enthusiastic tone"},
        {"role": "assistant", "content": "Hello! Welcome to the show."}
    ],
    audio={"format": "wav", "voice": "Chloe"}
)
audio_bytes = base64.b64decode(completion.choices[0].message.audio.data)
with open("output.wav", "wb") as f:
    f.write(audio_bytes)
```

### Python (Voice Clone)
```python
import base64
from openai import OpenAI

client = OpenAI(api_key=MIMO_API_KEY, base_url=f"{MIMO_API_BASE}")

with open("sample.mp3", "rb") as f:
    voice_b64 = base64.b64encode(f.read()).decode()

completion = client.chat.completions.create(
    model="mimo-v2.5-tts-voiceclone",
    messages=[
        {"role": "user", "content": ""},
        {"role": "assistant", "content": "Hello! This is my cloned voice."}
    ],
    audio={"format": "wav", "voice": f"data:audio/mpeg;base64,{voice_b64}"}
)
audio_bytes = base64.b64decode(completion.choices[0].message.audio.data)
with open("cloned_output.wav", "wb") as f:
    f.write(audio_bytes)
```

## Important Notes

- The **text to synthesize** goes in `role: assistant` content, NOT `user`
- The `user` message is for style instructions only (its content will NOT be spoken)
- For `mimo-v2.5-tts-voicedesign`, the `user` message is **required**
- For singing, use `(唱歌)` tag at the very beginning of the text
- Streaming (`pcm16`) currently returns chunks only after all inference is complete (low-latency streaming not yet available)
- TTS is currently **free** (limited-time promotional pricing)
