import { McpServer } from "@modelcontextprotocol/server";
import { createRequire } from "node:module";
import type { AppConfig } from "../config.js";
import { ImageRegistry } from "../storage/registry.js";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";

// 版本号以 package.json 为准，避免与 npm 发布版本脱节。
const { version } = createRequire(import.meta.url)("../../package.json") as {
  version: string;
};

// 创建服务不连接传输层，便于测试；每个实例拥有独立的资源登记表。
export function createServer(config: AppConfig): McpServer {
  const server = new McpServer({ name: "gen-image", version });
  const registry = new ImageRegistry();
  registerTools(server, config, registry);
  registerResources(server, registry);
  return server;
}
