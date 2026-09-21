#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config.js";
import { createServer } from "./mcp/server.js";

// 入口仅负责启动；stdout 专用于 MCP 消息，诊断信息必须写入 stderr。
try {
  const server = createServer(loadConfig());
  await server.connect(new StdioServerTransport());
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}
