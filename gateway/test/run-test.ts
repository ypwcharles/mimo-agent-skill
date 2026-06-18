import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startFakeUpstream } from "./fake-upstream.ts";
import { startGateway } from "../src/index.ts";

// ── 完全隔离：fake 上游 + port 0 网关 + 临时缓存目录。不碰真实服务/真实 API/真实缓存。 ──

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.log(`  ✗ ${msg}`);
  }
}

// 1x1 透明 PNG 的 base64（不依赖任何外部文件）。
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
const TINY_PNG_HASH = createHash("sha256").update(TINY_PNG_B64).digest("hex");

function asText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content.map((b: { text?: string }) => b.text || "").join("\n");
}

async function main(): Promise<void> {
  const upstream = await startFakeUpstream();
  const cacheDir = await mkdtemp(join(tmpdir(), "mimo-gateway-test-"));
  const gw = await startGateway({
    mimoAnthropicBase: `http://127.0.0.1:${upstream.port}`,
    mimoApiKey: "test-mimo-key",
    imageCacheWriteDir: cacheDir,
    gatewayToken: "secret-gw-token",
    port: 0,
    host: "127.0.0.1",
  });
  const base = `http://127.0.0.1:${gw.port}`;
  const headers = {
    "content-type": "application/json",
    "x-api-key": "secret-gw-token",
    "anthropic-version": "2023-06-01",
  };

  try {
    // T1 纯文本：零修改字节级直通
    {
      upstream.requests.length = 0;
      const body = {
        model: "mimo-v2.5-pro",
        max_tokens: 100,
        messages: [{ role: "user", content: "hello" }],
      };
      const r = await fetch(`${base}/v1/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      assert(r.status === 200, "T1 纯文本: 状态 200");
      const seen = upstream.requests[0];
      assert(JSON.stringify(seen.body) === JSON.stringify(body), "T1 纯文本: body 字节级透传、无改动");
      assert(seen.headers["x-api-key"] === "test-mimo-key", "T1: 上游收到注入的 MiMo key（非客户端 token）");
    }

    // T2 单张 base64 图：转成 claude-cache-sha256 引用，无 base64 / data URI 泄漏，max_tokens 兜底
    {
      upstream.requests.length = 0;
      const body = {
        model: "mimo-v2.5-pro",
        max_tokens: 50,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/png", data: TINY_PNG_B64 } },
              { type: "text", text: "what is this?" },
            ],
          },
        ],
      };
      await fetch(`${base}/v1/messages`, { method: "POST", headers, body: JSON.stringify(body) });
      const seen = upstream.requests[0].body as {
        messages: { content: { type: string }[] }[];
        max_tokens: number;
      };
      const content = seen.messages[0].content;
      assert(content.every((b) => b.type === "text"), "T2: image block 全部转成 text block");
      const texts = asText(content);
      assert(texts.includes(`claude-cache-sha256:${TINY_PNG_HASH}`), "T2: 含 claude-cache-sha256:<完整sha256>");
      assert(!texts.includes(TINY_PNG_B64), "T2: 无原始 base64 泄漏");
      assert(!texts.includes("data:image"), "T2: 无 data URI 泄漏");
      assert(seen.max_tokens === 131072, "T2: max_tokens 兜底到 131072");
    }

    // T3 缓存目录出现 mimo-img-<full64hash>.png，内容 = 原图
    {
      const files = await readdir(cacheDir);
      const expected = `mimo-img-${TINY_PNG_HASH}.png`;
      const hit = files.find((f) => f === expected);
      assert(!!hit, "T3: 缓存文件名 = mimo-img-<完整64位hash>.png");
      if (hit) {
        const buf = await readFile(join(cacheDir, hit));
        assert(buf.equals(Buffer.from(TINY_PNG_B64, "base64")), "T3: 缓存文件内容 = 原图字节");
      }
    }

    // T4 URL 图：URL 作为 source 透传，不下载
    {
      upstream.requests.length = 0;
      const url = "https://example.com/photo.jpg";
      const body = {
        model: "mimo-v2.5-pro",
        max_tokens: 100,
        messages: [{ role: "user", content: [{ type: "image", source: { type: "url", url } }] }],
      };
      await fetch(`${base}/v1/messages`, { method: "POST", headers, body: JSON.stringify(body) });
      const texts = asText((upstream.requests[0].body as { messages: { content: unknown }[] }).messages[0].content);
      assert(texts.includes(url), "T4: URL 作为 source 透传");
    }

    // T5 多轮同图：每次生成相同引用
    {
      const mk = () => ({
        model: "mimo-v2.5-pro",
        max_tokens: 131072,
        messages: [
          {
            role: "user",
            content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: TINY_PNG_B64 } }],
          },
        ],
      });
      upstream.requests.length = 0;
      await fetch(`${base}/v1/messages`, { method: "POST", headers, body: JSON.stringify(mk()) });
      const ref1 = String(
        asText((upstream.requests[0].body as { messages: { content: unknown }[] }).messages[0].content).match(
          /claude-cache-sha256:[a-f0-9]{64}/
        )
      );
      upstream.requests.length = 0;
      await fetch(`${base}/v1/messages`, { method: "POST", headers, body: JSON.stringify(mk()) });
      const ref2 = String(
        asText((upstream.requests[0].body as { messages: { content: unknown }[] }).messages[0].content).match(
          /claude-cache-sha256:[a-f0-9]{64}/
        )
      );
      assert(ref1 === ref2 && ref1.includes(TINY_PNG_HASH), "T5: 同图两次生成相同引用");
    }

    // T6 损坏 block（缺 data）：返回明确错误文本，不崩溃
    {
      upstream.requests.length = 0;
      const body = {
        model: "mimo-v2.5-pro",
        max_tokens: 131072,
        messages: [
          { role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png" } }] },
        ],
      };
      await fetch(`${base}/v1/messages`, { method: "POST", headers, body: JSON.stringify(body) });
      const texts = asText((upstream.requests[0].body as { messages: { content: unknown }[] }).messages[0].content);
      assert(texts.includes("missing base64 data"), "T6: 损坏 block 返回明确错误文本");
    }

    // T7 非 /v1/messages：直通上游
    {
      upstream.requests.length = 0;
      const r = await fetch(`${base}/v1/models`, { method: "GET", headers });
      assert(r.status === 200, "T7: GET /v1/models 直通返回 200");
      assert(upstream.requests[0].url === "/v1/models", "T7: 上游收到原路径");
    }

    // T8 流式 SSE：增量收到多个事件
    {
      upstream.requests.length = 0;
      const body = {
        model: "mimo-v2.5-pro",
        max_tokens: 131072,
        stream: true,
        messages: [
          {
            role: "user",
            content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: TINY_PNG_B64 } }],
          },
        ],
      };
      const r = await fetch(`${base}/v1/messages`, { method: "POST", headers, body: JSON.stringify(body) });
      const text = await r.text();
      const eventCount = (text.match(/^event:/gm) || []).length;
      assert(eventCount >= 4, `T8: 流式收到 ${eventCount} 个 SSE 事件 (>=4)`);
      assert(text.includes("message_stop"), "T8: 流含 message_stop");
    }

    // T9 入站鉴权：错误 token → 401
    {
      const r = await fetch(`${base}/v1/messages`, {
        method: "POST",
        headers: { ...headers, "x-api-key": "wrong" },
        body: JSON.stringify({ model: "mimo-v2.5-pro", max_tokens: 10, messages: [{ role: "user", content: "x" }] }),
      });
      assert(r.status === 401, "T9: 错误 token → 401");
    }

    // T10 非法 JSON：原样直通，网关不崩溃
    {
      upstream.requests.length = 0;
      const r = await fetch(`${base}/v1/messages`, { method: "POST", headers, body: "not-json{" });
      assert(r.status === 200, "T10: 非法 JSON 直通上游，网关不崩溃（fake 返回 200）");
    }
  } finally {
    await gw.close();
    await upstream.close();
    await rm(cacheDir, { recursive: true, force: true });
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
