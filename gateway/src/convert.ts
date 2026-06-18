import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// 与本仓库 mcp-server 的 CACHE_REF_PREFIX 保持一致（mcp-server/src/index.ts）。
// MCP 按 "文件名 includes(完整 hash)" 秒命中，因此落盘文件名必须含完整 64 位 hash。
const MEDIA_REF_PREFIX = "claude-cache-sha256:";

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
};

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export interface ContentBlock {
  type: string;
  source?: { type: string; media_type?: string; data?: string; url?: string };
  text?: string;
  [k: string]: unknown;
}

export interface Message {
  role: string;
  content: string | ContentBlock[];
  [k: string]: unknown;
}

export interface RequestBody {
  messages?: Message[];
  system?: string | ContentBlock[];
  max_tokens?: number;
  stream?: boolean;
  [k: string]: unknown;
}

/**
 * 把一张 image block 转成引用文本。
 * - base64 源：算 sha256，把原图落盘到 cacheDir（文件名 mimo-img-<hash>.<ext>），生成 claude-cache-sha256:<hash>。
 * - url 源：不下载，直接把 URL 作为 MCP source。
 */
async function convertImage(block: ContentBlock, index: number, cacheDir: string): Promise<ContentBlock> {
  const source = block.source;
  if (!source) {
    return { type: "text", text: `[Image ${index}: missing source]` };
  }

  if (source.type === "url") {
    const url = source.url ?? "unknown";
    return {
      type: "text",
      text: [
        `[Attached Image ${index}]`,
        `source_ref: ${url}`,
        "",
        `Call understand_image(source=${JSON.stringify(url)}) to analyze this image.`,
      ].join("\n"),
    };
  }

  if (source.type === "base64") {
    const data = source.data;
    if (!data) {
      return { type: "text", text: `[Image ${index}: missing base64 data]` };
    }
    const mediaType = source.media_type ?? "image/png";
    const ext = EXT_BY_MIME[mediaType] ?? "png";
    const hash = sha256Hex(data);
    const filename = `mimo-img-${hash}.${ext}`;
    await mkdir(cacheDir, { recursive: true });
    await writeFile(join(cacheDir, filename), Buffer.from(data, "base64"));
    const ref = `${MEDIA_REF_PREFIX}${hash}`;
    return {
      type: "text",
      text: [
        `[Attached Image ${index}]`,
        `media_type: ${mediaType}`,
        `source_ref: ${ref}`,
        "",
        `You cannot view this image in the primary model context.`,
        `Call understand_image(source=${JSON.stringify(ref)}) and do not infer image contents before the tool returns.`,
      ].join("\n"),
    };
  }

  return { type: "text", text: `[Image ${index}: unsupported source type "${source.type}"]` };
}

export async function processMessages(messages: Message[], cacheDir: string): Promise<[Message[], number]> {
  let count = 0;
  const out: Message[] = [];
  for (const msg of messages) {
    if (typeof msg.content === "string" || !Array.isArray(msg.content)) {
      out.push(msg);
      continue;
    }
    if (!msg.content.some((b) => b.type === "image")) {
      out.push(msg);
      continue;
    }
    const newContent: ContentBlock[] = [];
    for (const b of msg.content) {
      if (b.type === "image") {
        count++;
        newContent.push(await convertImage(b, count, cacheDir));
      } else {
        newContent.push(b);
      }
    }
    out.push({ ...msg, content: newContent });
  }
  return [out, count];
}

export async function processSystem(
  system: RequestBody["system"],
  cacheDir: string
): Promise<[RequestBody["system"], number]> {
  if (!Array.isArray(system)) return [system, 0];
  if (!system.some((b) => b.type === "image")) return [system, 0];
  let count = 0;
  const out: ContentBlock[] = [];
  for (const b of system) {
    if (b.type === "image") {
      count++;
      out.push(await convertImage(b, count, cacheDir));
    } else {
      out.push(b);
    }
  }
  return [out, count];
}
