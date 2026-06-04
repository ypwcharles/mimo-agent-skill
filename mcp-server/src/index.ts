import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { createHash } from "crypto";
import { createReadStream, readFileSync, existsSync, statSync } from "fs";
import { mkdir, readdir, readFile, stat, writeFile } from "fs/promises";
import { homedir } from "os";
import { createInterface } from "readline";
import { basename, delimiter, extname, join } from "path";

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
const CACHE_REF_PREFIX = "claude-cache-sha256:";
const MAX_LOOKUP_FILES = getPositiveIntEnv("MIMO_IMAGE_LOOKUP_FILES", 5000);
const MAX_TRANSCRIPT_FILES = getPositiveIntEnv("MIMO_CLAUDE_TRANSCRIPT_FILES", 120);
const FAST_TRANSCRIPT_FILES = Math.min(getPositiveIntEnv("MIMO_CLAUDE_FAST_TRANSCRIPT_FILES", 10), MAX_TRANSCRIPT_FILES);
const MAX_TRANSCRIPT_BYTES = getPositiveIntEnv("MIMO_CLAUDE_TRANSCRIPT_BYTES", 120 * 1024 * 1024);
const DEBUG_TIMING = process.env.MIMO_DEBUG_TIMING === "1" || process.env.MIMO_DEBUG_TIMING === "true";

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

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"]);
const MEDIA_TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
};

function getPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function now(): bigint {
  return process.hrtime.bigint();
}

function elapsedMs(start: bigint): number {
  return Number(process.hrtime.bigint() - start) / 1_000_000;
}

function debugTiming(label: string, start: bigint, details: Record<string, unknown> = {}): void {
  if (!DEBUG_TIMING) return;
  console.error(JSON.stringify({ event: "mimo_timing", label, ms: Number(elapsedMs(start).toFixed(1)), ...details }));
}

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

function getExtensionForMediaType(mediaType: string): string {
  return MEDIA_TYPE_EXTENSIONS[mediaType.toLowerCase()] || ".bin";
}

function isUrl(source: string): boolean {
  return source.startsWith("http://") || source.startsWith("https://");
}

function isDataUri(source: string): boolean {
  return source.startsWith("data:");
}

function isCacheRef(source: string): boolean {
  return source.startsWith(CACHE_REF_PREFIX);
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

async function fileToBase64Async(filePath: string): Promise<{ mediaType: string; data: string }> {
  const fileStat = await stat(filePath);
  if (!fileStat.isFile()) {
    throw new Error(`Not a file: ${filePath}`);
  }
  const mediaType = getMimeType(filePath);
  const data = (await readFile(filePath)).toString("base64");
  return { mediaType, data };
}

function getImageLookupDirs(): string[] {
  const configured = process.env.MIMO_IMAGE_LOOKUP_DIRS || "";
  const configuredDirs = configured
    .split(new RegExp(`[${delimiter},]`))
    .map((dir) => dir.trim())
    .filter(Boolean);

  const dirs = [
    ...configuredDirs,
    process.env.CLAUDE_IMAGE_CACHE_DIR || "",
    join(homedir(), ".claude", "image-cache"),
    process.cwd(),
    join(process.cwd(), ".tmp"),
  ];

  const seen = new Set<string>();
  return dirs.filter((dir) => {
    if (!dir || seen.has(dir) || !existsSync(dir)) return false;
    seen.add(dir);
    return statSync(dir).isDirectory();
  });
}

function getImageCacheWriteDir(): string | null {
  if (process.env.MIMO_DISABLE_IMAGE_CACHE_WRITE === "1" || process.env.MIMO_DISABLE_IMAGE_CACHE_WRITE === "true") {
    return null;
  }
  return (
    process.env.MIMO_IMAGE_CACHE_WRITE_DIR ||
    process.env.CLAUDE_IMAGE_CACHE_DIR ||
    join(homedir(), ".claude", "image-cache")
  );
}

async function persistResolvedImageToCache(expectedHash: string, image: ResolvedMedia): Promise<void> {
  const start = now();
  const cacheDir = getImageCacheWriteDir();
  if (!cacheDir || !image.mediaType.startsWith("image/")) return;

  const extension = getExtensionForMediaType(image.mediaType);
  if (extension === ".bin") return;

  const filePath = join(cacheDir, `mimo-img-${expectedHash}${extension}`);
  if (existsSync(filePath)) {
    debugTiming("cache_ref.persist.skip_existing", start, { filePath });
    return;
  }

  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(filePath, Buffer.from(image.data, "base64"), { flag: "wx" });
    debugTiming("cache_ref.persist.write", start, { filePath, bytes: Buffer.byteLength(image.data, "base64") });
  } catch (err: any) {
    if (err?.code === "EEXIST") return;
    debugTiming("cache_ref.persist.error", start, { filePath, error: String(err?.message || err) });
  }
}

async function* walkImageFiles(root: string): AsyncGenerator<string> {
  const stack = [root];
  let visitedFiles = 0;

  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;
      yield path;
      visitedFiles++;
      if (visitedFiles >= MAX_LOOKUP_FILES) return;
    }
  }
}

type ResolvedMedia = { mediaType: string; data: string; filePath: string };

async function resolveCacheRefFromImageFiles(
  expectedHash: string,
  searchedDirs: string[],
  isCancelled: () => boolean
): Promise<ResolvedMedia | null> {
  const shortHash = expectedHash.slice(0, 12);

  for (const dir of searchedDirs) {
    if (isCancelled()) return null;
    for await (const filePath of walkImageFiles(dir)) {
      if (isCancelled()) return null;
      const name = basename(filePath).toLowerCase();
      if (name.includes(expectedHash)) {
        const image = await fileToBase64Async(filePath);
        return { ...image, filePath };
      }

      const image = await fileToBase64Async(filePath);
      if (name.includes(shortHash)) {
        const hash = createHash("sha256").update(image.data).digest("hex");
        if (hash === expectedHash) {
          return { ...image, filePath };
        }
        continue;
      }

      const hash = createHash("sha256").update(image.data).digest("hex");
      if (hash === expectedHash) {
        return { ...image, filePath };
      }
    }
  }
  return null;
}

function getClaudeTranscriptLookupDirs(): string[] {
  const configured = process.env.MIMO_CLAUDE_TRANSCRIPT_DIRS || "";
  const configuredDirs = configured
    .split(new RegExp(`[${delimiter},]`))
    .map((dir) => dir.trim())
    .filter(Boolean);

  const dirs = [
    ...configuredDirs,
    join(homedir(), ".claude", "projects"),
  ];

  const seen = new Set<string>();
  return dirs.filter((dir) => {
    if (!dir || seen.has(dir) || !existsSync(dir)) return false;
    seen.add(dir);
    return statSync(dir).isDirectory();
  });
}

async function collectTranscriptFiles(
  root: string,
  isCancelled: () => boolean
): Promise<Array<{ filePath: string; mtimeMs: number; size: number }>> {
  const stack = [root];
  const files: Array<{ filePath: string; mtimeMs: number; size: number }> = [];

  while (stack.length) {
    if (isCancelled()) return files;
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(path);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      try {
        const fileStat = await stat(path);
        files.push({ filePath: path, mtimeMs: fileStat.mtimeMs, size: fileStat.size });
      } catch {
        continue;
      }
    }
  }

  return files;
}

function imageFromTranscriptLine(line: string, expectedHash: string): ResolvedMedia | null {
  if (!line.includes('"image"') || !line.includes('"base64"')) return null;

  let record: any;
  try {
    record = JSON.parse(line);
  } catch {
    return null;
  }

  const content = record.message?.content;
  if (!Array.isArray(content)) return null;

  for (const block of content) {
    if (block?.type !== "image") continue;
    const source = block.source;
    if (source?.type !== "base64" || typeof source.data !== "string") continue;
    const data = source.data;
    const hash = createHash("sha256").update(data).digest("hex");
    if (hash !== expectedHash) continue;
    return {
      mediaType: source.media_type || detectMediaType(data),
      data,
      filePath: `${record.sessionId || "claude-transcript"}:${record.uuid || "image"}`,
    };
  }

  return null;
}

async function resolveCacheRefFromClaudeTranscripts(
  expectedHash: string,
  transcriptDirs: string[],
  isCancelled: () => boolean
): Promise<ResolvedMedia | null> {
  const collectStart = now();
  const files = (await Promise.all(transcriptDirs.map((dir) => collectTranscriptFiles(dir, isCancelled))))
    .flat()
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_TRANSCRIPT_FILES);
  debugTiming("cache_ref.transcript.collect", collectStart, { files: files.length, dirs: transcriptDirs.length });

  const fastFiles = files.slice(0, FAST_TRANSCRIPT_FILES);
  const fullFiles = files.slice(FAST_TRANSCRIPT_FILES);
  const fastHit = await scanTranscriptFiles(expectedHash, fastFiles, isCancelled, "fast");
  if (fastHit) return fastHit;

  return scanTranscriptFiles(expectedHash, fullFiles, isCancelled, "full");
}

async function scanTranscriptFiles(
  expectedHash: string,
  files: Array<{ filePath: string; mtimeMs: number; size: number }>,
  isCancelled: () => boolean,
  phase: "fast" | "full"
): Promise<ResolvedMedia | null> {
  const start = now();
  let scannedFiles = 0;
  let scannedBytes = 0;
  let parsedImageLines = 0;

  for (const { filePath, size } of files) {
    if (isCancelled()) return null;
    if (size > MAX_TRANSCRIPT_BYTES) continue;
    scannedFiles++;
    scannedBytes += size;

    try {
      const lines = createInterface({
        input: createReadStream(filePath, { encoding: "utf8", highWaterMark: 1024 * 1024 }),
        crlfDelay: Infinity,
      });

      for await (const line of lines) {
        if (isCancelled()) return null;
        if (!line.includes('"image"') || !line.includes('"base64"')) continue;
        parsedImageLines++;
        const image = imageFromTranscriptLine(line, expectedHash);
        if (image) {
          const resolved = { ...image, filePath };
          void persistResolvedImageToCache(expectedHash, resolved);
          debugTiming("cache_ref.transcript.hit", start, {
            phase,
            files: scannedFiles,
            mb: Number((scannedBytes / 1024 / 1024).toFixed(2)),
            parsedImageLines,
            filePath,
          });
          return resolved;
        }
      }
    } catch {
      continue;
    }
  }

  debugTiming("cache_ref.transcript.miss", start, {
    phase,
    files: scannedFiles,
    mb: Number((scannedBytes / 1024 / 1024).toFixed(2)),
    parsedImageLines,
  });
  return null;
}

async function resolveCacheRef(source: string): Promise<ResolvedMedia> {
  const start = now();
  const expectedHash = source.slice(CACHE_REF_PREFIX.length).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) {
    throw new Error(`Invalid Claude image cache reference: ${source}`);
  }

  const searchedDirs = getImageLookupDirs();
  const transcriptDirs = getClaudeTranscriptLookupDirs();
  let cancelled = false;
  const isCancelled = () => cancelled;

  const fileLookup = (async () => {
    const fileStart = now();
    const image = await resolveCacheRefFromImageFiles(expectedHash, searchedDirs, isCancelled);
    if (!image) {
      if (!isCancelled()) debugTiming("cache_ref.image_files.miss", fileStart, { dirs: searchedDirs.length });
      throw new Error("No matching image file");
    }
    debugTiming("cache_ref.image_files.hit", fileStart, { dirs: searchedDirs.length, filePath: image.filePath });
    return image;
  })();

  const transcriptLookup = (async () => {
    const transcriptStart = now();
    const image = await resolveCacheRefFromClaudeTranscripts(expectedHash, transcriptDirs, isCancelled);
    if (!image) {
      if (!isCancelled()) debugTiming("cache_ref.transcript.total_miss", transcriptStart, { dirs: transcriptDirs.length });
      throw new Error("No matching Claude transcript image");
    }
    debugTiming("cache_ref.transcript.total_hit", transcriptStart, { dirs: transcriptDirs.length, filePath: image.filePath });
    return image;
  })();

  try {
    const image = await Promise.any([fileLookup, transcriptLookup]);
    cancelled = true;
    debugTiming("cache_ref.resolve.hit", start, { filePath: image.filePath });
    return image;
  } catch {
    cancelled = true;
    debugTiming("cache_ref.resolve.miss", start, { imageDirs: searchedDirs.length, transcriptDirs: transcriptDirs.length });
    // Fall through to a single actionable error message.
  }

  throw new Error(
    `Claude image cache reference not found: ${expectedHash}. ` +
      `Searched ${searchedDirs.length} image director${searchedDirs.length === 1 ? "y" : "ies"} ` +
      `and ${transcriptDirs.length} Claude transcript director${transcriptDirs.length === 1 ? "y" : "ies"}. ` +
      `Set MIMO_IMAGE_LOOKUP_DIRS or MIMO_CLAUDE_TRANSCRIPT_DIRS to include the source.`
  );
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
  maxCompletionTokens = 131072,
  audio?: { format: string; voice?: string; optimize_text_preview?: boolean }
): Promise<{ text: string; audioData?: string }> {
  const start = now();
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
    debugTiming("mimo_api.openai.error", start, { model, status: res.status });
    throw new Error(`MiMo API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as any;
  debugTiming("mimo_api.openai.ok", start, { model, status: res.status });
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
  maxTokens = 131072,
  system?: string
): Promise<string> {
  const start = now();
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
    debugTiming("mimo_api.anthropic.error", start, { model, status: res.status });
    throw new Error(`MiMo Anthropic API error ${res.status}: ${errText}`);
  }

  const data = await res.json() as any;
  debugTiming("mimo_api.anthropic.ok", start, { model, status: res.status });
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
  "Analyze and understand image content using Xiaomi MiMo vision model. Supports local file paths, public URLs, data URIs, and Claude Code image-cache hash references.",
  {
    source: z
      .string()
      .describe("Local file path, public URL, data URI, raw Base64 string, or claude-cache-sha256:<hash> reference of the image (JPEG, PNG, GIF, WebP, BMP, max 50MB)"),
    prompt: z
      .string()
      .describe("What to analyze or describe about the image"),
  },
  async ({ source, prompt }) => {
    let imageBlock: any;
    if (isUrl(source)) {
      imageBlock = { type: "image", source: { type: "url", url: source } };
    } else if (isCacheRef(source)) {
      const { mediaType, data } = await resolveCacheRef(source);
      imageBlock = { type: "image", source: { type: "base64", media_type: mediaType, data } };
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
