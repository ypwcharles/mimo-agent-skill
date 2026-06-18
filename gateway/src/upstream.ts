import { Readable } from "node:stream";
import type { ServerResponse } from "node:http";
import type { Config } from "./config.ts";

// 不应在客户端与上游之间透传的 hop-by-hop / 鉴权头。
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "host",
]);

type RawHeaders = Record<string, string | string[] | undefined>;

function buildUpstreamHeaders(clientHeaders: RawHeaders, cfg: Config): Record<string, string> {
  const h: Record<string, string> = {};
  for (const [k, v] of Object.entries(clientHeaders)) {
    if (v == null) continue;
    const lk = k.toLowerCase();
    if (HOP_BY_HOP.has(lk)) continue;
    // 不透传客户端的鉴权头，改用 MiMo 官方 key 注入。
    if (lk === "x-api-key" || lk === "authorization" || lk === "x-goog-api-key") continue;
    h[lk] = Array.isArray(v) ? v.join(", ") : v;
  }
  // MiMo 官方 Anthropic 端点鉴权：Anthropic 风格用 x-api-key。
  // 若 MiMo 官方实际要求 Authorization: Bearer，把下面这行改成：
  //   h["authorization"] = `Bearer ${cfg.mimoApiKey}`;
  h["x-api-key"] = cfg.mimoApiKey;
  return h;
}

function filterResponseHeaders(headers: Headers): Record<string, string> {
  const h: Record<string, string> = {};
  headers.forEach((v, k) => {
    if (!HOP_BY_HOP.has(k.toLowerCase())) h[k] = v;
  });
  return h;
}

function pipeResponse(upstream: Response, res: ServerResponse): void {
  res.writeHead(upstream.status, filterResponseHeaders(upstream.headers));
  if (upstream.body) {
    Readable.fromWeb(upstream.body as unknown as import("node:stream/web").ReadableStream)
      .on("error", () => {
        try {
          res.destroy();
        } catch {
          /* already gone */
        }
      })
      .pipe(res);
  } else {
    res.end();
  }
}

/** 把改造后的 JSON body 转发上游，响应（含流式）原样 pipe 回客户端。 */
export async function forwardJson(
  cfg: Config,
  pathWithQuery: string,
  clientHeaders: RawHeaders,
  body: unknown,
  res: ServerResponse
): Promise<number> {
  const upstream = await fetch(`${cfg.mimoAnthropicBase}${pathWithQuery}`, {
    method: "POST",
    headers: { ...buildUpstreamHeaders(clientHeaders, cfg), "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  pipeResponse(upstream, res);
  return upstream.status;
}

/** 把原始字节流原样转发（无图直通 / 非 /v1/messages / JSON 解析失败时使用）。 */
export async function forwardRaw(
  cfg: Config,
  pathWithQuery: string,
  clientHeaders: RawHeaders,
  raw: Buffer,
  method: string,
  res: ServerResponse
): Promise<number> {
  const upstream = await fetch(`${cfg.mimoAnthropicBase}${pathWithQuery}`, {
    method,
    headers: buildUpstreamHeaders(clientHeaders, cfg),
    body: raw.length ? raw : undefined,
  });
  pipeResponse(upstream, res);
  return upstream.status;
}
