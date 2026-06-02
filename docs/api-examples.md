# MiMo API — Platform Examples

Reference for calling MiMo API directly (without MCP). All examples use OpenAI-compatible format.

**Authentication:** `api-key` header (not `Authorization: Bearer`)

**Base URL:** `$MIMO_API_BASE` — set to your endpoint (token plan URL or `https://api.xiaomimimo.com/v1`)

---

## Image Understanding

### Curl
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
client = OpenAI(api_key=MIMO_API_KEY, base_url=MIMO_API_BASE)
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

---

## Audio Understanding

### Curl
```bash
curl -X POST "$MIMO_API_BASE/chat/completions" \
  -H "api-key: $MIMO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2.5",
    "messages": [{"role":"user","content":[
      {"type":"input_audio","input_audio":{"data":"$AUDIO_URL_OR_BASE64"}},
      {"type":"text","text":"Transcribe this audio verbatim"}
    ]}],
    "max_completion_tokens": 4096
  }'
```

### Python
```python
from openai import OpenAI
client = OpenAI(api_key=MIMO_API_KEY, base_url=MIMO_API_BASE)
completion = client.chat.completions.create(
    model="mimo-v2.5",
    messages=[{"role":"user","content":[
        {"type":"input_audio","input_audio":{"data":"$AUDIO_URL_OR_BASE64"}},
        {"type":"text","text":"Transcribe this audio verbatim"}
    ]}],
    max_completion_tokens=4096
)
```

---

## Video Understanding

### Curl
```bash
curl -X POST "$MIMO_API_BASE/chat/completions" \
  -H "api-key: $MIMO_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-v2.5",
    "messages": [{"role":"user","content":[
      {"type":"video_url","video_url":{"url":"$VIDEO_URL_OR_BASE64"},"fps":2,"media_resolution":"default"},
      {"type":"text","text":"Describe this video in detail"}
    ]}],
    "max_completion_tokens": 4096
  }'
```

### Python
```python
from openai import OpenAI
client = OpenAI(api_key=MIMO_API_KEY, base_url=MIMO_API_BASE)
completion = client.chat.completions.create(
    model="mimo-v2.5",
    messages=[{"role":"user","content":[
        {"type":"video_url","video_url":{"url":"$VIDEO_URL_OR_BASE64"},"fps":2,"media_resolution":"default"},
        {"type":"text","text":"Describe this video in detail"}
    ]}],
    max_completion_tokens=4096
)
```

---

## TTS — Preset Voice

### Curl
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

### Python
```python
import base64
from openai import OpenAI

client = OpenAI(api_key=MIMO_API_KEY, base_url=MIMO_API_BASE)
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

---

## TTS — Voice Clone

### Python
```python
import base64
from openai import OpenAI

client = OpenAI(api_key=MIMO_API_KEY, base_url=MIMO_API_BASE)

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
