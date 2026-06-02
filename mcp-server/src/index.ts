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

function fileToBase64DataUri(filePath: string): string {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const stat = statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }
  const mime = getMimeType(filePath);
  const data = readFileSync(filePath).toString("base64");
  return `data:${mime};base64,${data}`;
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

  const res = await fetch(API_BASE, {
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

// --- MCP Server ---

const server = new McpServer({
  name: "mimo-multimodal",
  version: "2.0.0",
});

// Image understanding
server.tool(
  "understand_image",
  "Analyze and understand image content using Xiaomi MiMo vision model. Supports local file paths and public URLs.",
  {
    source: z
      .string()
      .describe("Local file path or public URL of the image (JPEG, PNG, GIF, WebP, BMP, max 50MB)"),
    prompt: z
      .string()
      .describe("What to analyze or describe about the image"),
  },
  async ({ source, prompt }) => {
    const imageUrl = isUrl(source) ? source : fileToBase64DataUri(source);
    const result = await callMiMo("mimo-v2.5", [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: imageUrl } },
          { type: "text", text: prompt },
        ],
      },
    ]);
    return { content: [{ type: "text", text: result.text }] };
  }
);

// Audio understanding (also serves as ASR / transcription)
server.tool(
  "understand_audio",
  "Analyze and understand audio content using Xiaomi MiMo model. Supports transcription, description, and summarization. Accepts local file paths and public URLs.",
  {
    source: z
      .string()
      .describe("Local file path or public URL of the audio (MP3, WAV, FLAC, M4A, OGG, max 100MB for URL, max 50MB for Base64)"),
    prompt: z
      .string()
      .describe("What to analyze or describe about the audio"),
  },
  async ({ source, prompt }) => {
    const audioData = isUrl(source) ? source : fileToBase64DataUri(source);
    const result = await callMiMo("mimo-v2.5", [
      {
        role: "user",
        content: [
          { type: "input_audio", input_audio: { data: audioData } },
          { type: "text", text: prompt },
        ],
      },
    ]);
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
      .describe("Local file path or public URL of the video (MP4, MOV, AVI, WMV, max 300MB for URL, max 50MB for Base64)"),
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
    const videoUrl = isUrl(source) ? source : fileToBase64DataUri(source);
    const result = await callMiMo("mimo-v2.5", [
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
    ]);
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
