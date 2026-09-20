import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppConfig } from "../config.js";
import { ImageRegistry } from "../storage/registry.js";
import { registerResources } from "./resources.js";
import { registerTools } from "./tools.js";

// 创建服务不连接传输层，便于测试；每个实例拥有独立的资源登记表。
export function createServer(config: AppConfig): McpServer {
  const server = new McpServer({ name: "gen-image", version: "0.1.0" });
  const registry = new ImageRegistry();
  registerTools(server, config, registry);
  registerResources(server, registry);
  return server;
}
