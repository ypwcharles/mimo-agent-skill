import { createServer } from "node:http";
import type { Server } from "node:http";

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface FakeUpstream {
  server: Server;
  port: number;
  requests: RecordedRequest[];
  close(): Promise<void>;
}

/**
 * 一个本地假的 MiMo Anthropic 端点。监听 127.0.0.1 + port 0（OS 分配），
 * 记录每个请求，并按 stream 标志返回固定响应（JSON 或 SSE）。
 * 不接触真实网络、不接触真实 MiMo API。
 */
export function startFakeUpstream(): Promise<FakeUpstream> {
  const requests: RecordedRequest[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let parsed: unknown = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = raw;
      }
      requests.push({
        method: req.method ?? "",
        url: req.url ?? "",
        headers: req.headers,
        body: parsed,
      });

      const wantStream =
        parsed && typeof parsed === "object" && (parsed as { stream?: boolean }).stream === true;

      if (wantStream) {
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" });
        const events: Array<{ event: string; data: unknown }> = [
          {
            event: "message_start",
            data: {
              type: "message_start",
              message: {
                id: "msg_fake",
                role: "assistant",
                content: [],
                model: "mimo-v2.5-pro",
                stop_reason: null,
                usage: { input_tokens: 10, output_tokens: 0 },
              },
            },
          },
          {
            event: "content_block_start",
            data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
          },
          {
            event: "content_block_delta",
            data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } },
          },
          { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
          {
            event: "message_delta",
            data: { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } },
          },
          { event: "message_stop", data: { type: "message_stop" } },
        ];
        for (const e of events) res.write(`event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`);
        res.end();
      } else {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "msg_fake",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "ok" }],
            model: "mimo-v2.5-pro",
            stop_reason: "end_turn",
            usage: { input_tokens: 10, output_tokens: 1 },
          })
        );
      }
    });
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = addr && typeof addr === "object" ? addr.port : 0;
      resolve({
        server,
        port,
        requests,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
