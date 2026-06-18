import { createServer } from "node:http";
import type { Server, IncomingMessage } from "node:http";
import { pathToFileURL } from "node:url";
import { loadConfig, type Config } from "./config.ts";
import { processMessages, processSystem, type RequestBody } from "./convert.ts";
import { forwardJson, forwardRaw } from "./upstream.ts";

const IMAGE_MAX_TOKENS = 131072;

export interface GatewayHandle {
  server: Server;
  port: number;
  close(): Promise<void>;
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function extractClientToken(req: IncomingMessage): string | null {
  const auth = req.headers["authorization"];
  if (auth) {
    const m = String(auth).match(/^Bearer\s+(.+)$/i);
    if (m) return m[1];
  }
  const k = req.headers["x-api-key"];
  if (typeof k === "string") return k;
  const g = req.headers["x-goog-api-key"];
  if (typeof g === "string") return g;
  return null;
}

export function startGateway(cfg: Config): Promise<GatewayHandle> {
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        if (req.method === "OPTIONS") {
          res.writeHead(204, {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "POST, GET, OPTIONS",
            "access-control-allow-headers":
              "Content-Type, Authorization, x-api-key, x-goog-api-key, anthropic-version",
          });
          res.end();
          return;
        }

        if (cfg.gatewayToken) {
          if (extractClientToken(req) !== cfg.gatewayToken) {
            res.writeHead(401, { "content-type": "application/json" });
            res.end(
              JSON.stringify({
                error: { type: "authentication_error", message: "invalid gateway token" },
              })
            );
            return;
          }
        }

        const url = new URL(req.url ?? "/", "http://localhost");
        const isMessages = req.method === "POST" && url.pathname.endsWith("/v1/messages");

        if (!isMessages) {
          const raw = await readBody(req);
          await forwardRaw(cfg, `${url.pathname}${url.search}`, req.headers, raw, req.method ?? "GET", res);
          return;
        }

        const raw = await readBody(req);
        let body: RequestBody;
        try {
          body = JSON.parse(raw.toString("utf8"));
        } catch {
          // JSON 解析失败：原样直通上游。
          await forwardRaw(cfg, `${url.pathname}${url.search}`, req.headers, raw, "POST", res);
          return;
        }

        const [msgs, msgCount] = await processMessages(body.messages ?? [], cfg.imageCacheWriteDir);
        const [sys, sysCount] = await processSystem(body.system, cfg.imageCacheWriteDir);
        const totalImages = msgCount + sysCount;

        if (totalImages === 0) {
          // 无图：字节级原样转发，保持流式透明。
          await forwardRaw(cfg, `${url.pathname}${url.search}`, req.headers, raw, "POST", res);
          return;
        }

        const modified: RequestBody = {
          ...body,
          messages: msgs,
          max_tokens: Math.max(body.max_tokens ?? 0, IMAGE_MAX_TOKENS),
        };
        if (sys !== undefined) modified.system = sys;
        await forwardJson(cfg, `${url.pathname}${url.search}`, req.headers, modified, res);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(502, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { type: "gateway_error", message: String(err) } }));
        } else {
          try {
            res.destroy();
          } catch {
            /* already gone */
          }
        }
      }
    });

    server.on("error", reject);
    server.listen(cfg.port, cfg.host, () => {
      const addr = server.address();
      const port = addr && typeof addr === "object" ? addr.port : cfg.port;
      resolve({
        server,
        port,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

async function main(): Promise<void> {
  const cfg = loadConfig();
  const handle = await startGateway(cfg);
  console.log(`[mimo-local-gateway] listening on http://${cfg.host}:${handle.port}`);
  console.log(`[mimo-local-gateway] upstream    : ${cfg.mimoAnthropicBase}`);
  console.log(`[mimo-local-gateway] image cache : ${cfg.imageCacheWriteDir}`);
  if (cfg.gatewayToken) console.log("[mimo-local-gateway] inbound auth : enabled (GATEWAY_TOKEN)");
}

const invokedDirectly = !!process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
const isBunMain = (import.meta as { main?: boolean }).main === true;
if (invokedDirectly || isBunMain) {
  main();
}
