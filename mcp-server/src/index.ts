import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, existsSync, statSync } from "fs";
import { extname } from "path";

const API_BASE = process.env.MIMO_API_BASE;
const API_KEY = process.env.MIMO_API_KEY;

if (!API_BASE) {
  console.error("MIMO_API_BASE environment variable is required");
  process.exit(1);
}

if (!API_KEY) {
  console.error("MIMO_API_KEY environment variable is required");
  process.exit(1);
}

const PRIMARY_MODEL = "mimo-v2.5";
const FALLBACK_MODEL = "mimo-v2-omni";

const MIME_MAP: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".avi": "video/x-msvideo",
  ".wmv": "video/x-ms-wmv",
};

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

function isUrl(source: string): boolean {
  return source.startsWith("http://") || source.startsWith("https://");
}

function isDataUri(source: string): boolean {
  return source.startsWith("data:");
}

function parseDataUri(uri: string): { mediaType: string; data: string } {
  const match = uri.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URI format");
  return { mediaType: match[1], data: match[2] };
}

const MAGIC_BYTES: Array<{ mime: string; bytes: number[] }> = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", bytes: [0x47, 0x49, 0x46] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] },
  { mime: "image/bmp", bytes: [0x42, 0x4d] },
  { mime: "audio/mpeg", bytes: [0xff, 0xfb] },
  { mime: "audio/flac", bytes: [0x66, 0x4c, 0x61, 0x43] },
  { mime: "audio/ogg", bytes: [0x4f, 0x67, 0x67, 0x53] },
  { mime: "video/mp4", bytes: [0x00, 0x00, 0x00] },
];

function detectMediaType(b64: string): string {
  const buf = Buffer.from(b64.slice(0, 16), "base64");
  for (const { mime, bytes } of MAGIC_BYTES) {
    if (bytes.every((b, i) => buf[i] === b)) return mime;
  }
  return "application/octet-stream";
}

function fileToBase64DataUri(filePath: string): string {
  const { mediaType, data } = fileToBase64(filePath);
  return `data:${mediaType};base64,${data}`;
}

function fileToBase64(filePath: string): { mediaType: string; data: string } {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const stat = statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }
  const mediaType = getMimeType(filePath);
  const data = readFileSync(filePath).toString("base64");
  return { mediaType, data };
}

function getOpenAIApiUrl(): string {
  return API_BASE!.replace(/\/chat\/completions\/?$/, "");
}

function getAnthropicApiUrl(): string {
  const base = API_BASE!.replace(/\/v1\/chat\/completions\/?$/, "");
  return `${base}/anthropic/v1/messages`;
}

async function callMiMo(
  model: string,
  messages: Array<{ role: string; content: any }>,
  maxCompletionTokens = 4096,
  audio?: { format: string; voice?: string; optimize_text_preview?: boolean }
): Promise<{ text: string; audioData?: string }> {
  const body: any = {
    model,
    messages,
    max_completion_tokens: maxCompletionTokens,
  };
  if (audio) {
    body.audio = audio;
  }

  const res = await fetch(getOpenAIApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": API_KEY!,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`MiMo API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as any;
  const choice = data.choices?.[0]?.message;
  if (!choice) throw new Error("No response from MiMo API");

  const parts: string[] = [];
  if (choice.reasoning_content) {
    parts.push(`[Reasoning]\n${choice.reasoning_content}`);
  }
  if (choice.content) {
    parts.push(choice.content);
  }

  return {
    text: parts.join("\n\n") || "(empty response)",
    audioData: choice.audio?.data,
  };
}

async function callMiMoAnthropic(
  model: string,
  messages: Array<{ role: string; content: any }>,
  maxTokens = 4096,
  system?: string
): Promise<string> {
  const body: any = {
    model,
    messages,
    max_tokens: maxTokens,
    thinking: { type: "disabled" },
  };
  if (system) {
    body.system = system;
  }

  const res = await fetch(getAnthropicApiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": API_KEY!,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`MiMo Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as any;
  const contentBlocks: any[] = data.content || [];
  if (!contentBlocks.length) throw new Error("No response from MiMo Anthropic API");

  const parts: string[] = [];
  for (const block of contentBlocks) {
    if (block.type === "thinking" && block.thinking) {
      parts.push(`[Reasoning]\n${block.thinking}`);
    }
    if (block.type === "text" && block.text) {
      parts.push(block.text);
    }
  }

  return parts.join("\n\n") || "(empty response)";
}

async function withFallback<T>(fn: (model: string) => Promise<T>): Promise<T> {
  try {
    return await fn(PRIMARY_MODEL);
  } catch {
    return await fn(FALLBACK_MODEL);
  }
}

// --- MCP Server ---

const server = new McpServer({
  name: "mimo-multimodal",
  version: "2.1.0",
});

// Image understanding
server.tool(
  "understand_image",
  "Analyze and understand image content using Xiaomi MiMo vision model. Supports local file paths and public URLs.",
  {
    source: z
      .string()
      .describe("Local file path, public URL, data URI, or raw Base64 string of the image (JPEG, PNG, GIF, WebP, BMP, max 50MB)"),
    prompt: z
      .string()
      .describe("What to analyze or describe about the image"),
  },
  async ({ source, prompt }) => {
    let imageBlock: any;
    if (isUrl(source)) {
      imageBlock = { type: "image", source: { type: "url", url: source } };
    } else if (isDataUri(source)) {
      const { mediaType, data } = parseDataUri(source);
      imageBlock = { type: "image", source: { type: "base64", media_type: mediaType, data } };
    } else if (/^[A-Za-z0-9+/=\s]{100,}$/.test(source.replace(/\s/g, ""))) {
      const data = source.replace(/\s/g, "");
      imageBlock = { type: "image", source: { type: "base64", media_type: detectMediaType(data), data } };
    } else {
      const { mediaType, data } = fileToBase64(source);
      imageBlock = { type: "image", source: { type: "base64", media_type: mediaType, data } };
    }
    const text = await withFallback((model) => callMiMoAnthropic(model, [
      {
        role: "user",
        content: [imageBlock, { type: "text", text: prompt }],
      },
    ]));
    return { content: [{ type: "text", text }] };
  }
);

// Audio understanding (also serves as ASR / transcription)
server.tool(
  "understand_audio",
  "Analyze and understand audio content using Xiaomi MiMo model. Supports transcription, description, and summarization. Accepts local file paths and public URLs.",
  {
    source: z
      .string()
      .describe("Local file path, public URL, data URI, or raw Base64 string of the audio (MP3, WAV, FLAC, M4A, OGG, max 100MB for URL, max 50MB for Base64)"),
    prompt: z
      .string()
      .describe("What to analyze or describe about the audio"),
  },
  async ({ source, prompt }) => {
    let audioData: string;
    if (isUrl(source)) {
      audioData = source;
    } else if (isDataUri(source)) {
      audioData = source;
    } else if (/^[A-Za-z0-9+/=\s]{100,}$/.test(source.replace(/\s/g, ""))) {
      const data = source.replace(/\s/g, "");
      audioData = `data:${detectMediaType(data)};base64,${data}`;
    } else {
      audioData = fileToBase64DataUri(source);
    }
    const result = await withFallback((model) => callMiMo(model, [
      {
        role: "user",
        content: [
          { type: "input_audio", input_audio: { data: audioData } },
          { type: "text", text: prompt },
        ],
      },
    ]));
    return { content: [{ type: "text", text: result.text }] };
  }
);

// Video understanding
server.tool(
  "understand_video",
  "Analyze and understand video content using Xiaomi MiMo model. Accepts local file paths and public URLs.",
  {
    source: z
      .string()
      .describe("Local file path, public URL, data URI, or raw Base64 string of the video (MP4, MOV, AVI, WMV, max 300MB for URL, max 50MB for Base64)"),
    prompt: z
      .string()
      .describe("What to analyze or describe about the video"),
    fps: z
      .number()
      .min(0.1)
      .max(10)
      .default(2)
      .describe("Frames sampled per second (0.1-10, default 2). Higher = finer temporal detail, more tokens."),
    media_resolution: z
      .enum(["default", "max"])
      .default("default")
      .describe("Per-frame resolution tier: 'default' (balanced) or 'max' (highest detail for small objects/textures)"),
  },
  async ({ source, prompt, fps, media_resolution }) => {
    let videoUrl: string;
    if (isUrl(source)) {
      videoUrl = source;
    } else if (isDataUri(source)) {
      videoUrl = source;
    } else if (/^[A-Za-z0-9+/=\s]{100,}$/.test(source.replace(/\s/g, ""))) {
      const data = source.replace(/\s/g, "");
      videoUrl = `data:${detectMediaType(data)};base64,${data}`;
    } else {
      videoUrl = fileToBase64DataUri(source);
    }
    const result = await withFallback((model) => callMiMo(model, [
      {
        role: "user",
        content: [
          {
            type: "video_url",
            video_url: { url: videoUrl },
            fps,
            media_resolution,
          },
          { type: "text", text: prompt },
        ],
      },
    ]));
    return { content: [{ type: "text", text: result.text }] };
  }
);

// TTS — Text-to-Speech with preset voices
server.tool(
  "tts",
  "Convert text to speech using Xiaomi MiMo TTS. Supports preset voices, style/emotion control via tags, and singing mode. Returns Base64-encoded WAV audio.",
  {
    text: z
      .string()
      .describe("Text to synthesize into speech"),
    voice: z
      .string()
      .default("mimo_default")
      .describe("Preset voice ID: 'mimo_default', '冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'"),
    style: z
      .string()
      .optional()
      .describe("Optional natural language style description (e.g. 'warm and enthusiastic, fast pace')"),
    format: z
      .enum(["wav", "pcm16"])
      .default("wav")
      .describe("Output audio format: 'wav' for complete file, 'pcm16' for streaming"),
  },
  async ({ text, voice, style, format }) => {
    const messages: Array<{ role: string; content: string }> = [
      { role: "assistant", content: text },
    ];
    if (style) {
      messages.unshift({ role: "user", content: style });
    }
    const result = await callMiMo("mimo-v2.5-tts", messages, 4096, {
      format,
      voice,
    });
    if (result.audioData) {
      return {
        content: [
          { type: "text", text: `Audio generated successfully (${format} format, voice: ${voice}). Base64 data:` },
          { type: "text", text: result.audioData },
        ],
      };
    }
    return { content: [{ type: "text", text: result.text }] };
  }
);

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
