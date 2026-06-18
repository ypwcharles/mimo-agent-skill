import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  /** MiMo 官方 Anthropic 兼容端点 URL（例如 https://.../v1/messages 的 base）。 */
  mimoAnthropicBase: string;
  /** 转发上游时注入的 key。 */
  mimoApiKey: string;
  /**
   * 网关把原图落盘的目录。必须落在 MCP 的查找目录之一（MIMO_IMAGE_LOOKUP_DIRS /
   * CLAUDE_IMAGE_CACHE_DIR / ~/.claude/image-cache），默认 ~/.claude/image-cache 已在其中，
   * 因此默认配置即可与 MCP 闭环，无需额外设置。
   */
  imageCacheWriteDir: string;
  /** 入站鉴权 token；未设置则不校验（仅本地监听）。 */
  gatewayToken?: string;
  /** 监听端口。 */
  port: number;
  /** 监听地址。 */
  host: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const base = env.MIMO_ANTHROPIC_BASE;
  if (!base) {
    throw new Error("MIMO_ANTHROPIC_BASE is required (MiMo Anthropic-compatible endpoint URL)");
  }
  const key = env.MIMO_API_KEY;
  if (!key) {
    throw new Error("MIMO_API_KEY is required");
  }
  const port = Number(env.PORT ?? 4199);
  return {
    mimoAnthropicBase: base.replace(/\/+$/, ""),
    mimoApiKey: key,
    imageCacheWriteDir:
      env.MIMO_IMAGE_CACHE_WRITE_DIR ?? join(homedir(), ".claude", "image-cache"),
    gatewayToken: env.GATEWAY_TOKEN || undefined,
    port: Number.isFinite(port) && port > 0 ? port : 4199,
    host: env.HOST ?? "127.0.0.1",
  };
}
