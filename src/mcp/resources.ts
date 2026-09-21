import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/server";
import { promises as fs } from "node:fs";
import type { ImageRegistry } from "../storage/registry.js";

export function registerResources(
  server: McpServer,
  registry: ImageRegistry,
): void {
  server.registerResource(
    "generated-images",
    new ResourceTemplate("gen-image:///{id}", {
      list: async () => ({
        resources: registry
          .list()
          .map(({ uri, name, mimeType }) => ({ uri, name, mimeType })),
      }),
    }),
    {},
    async (uri, variables) => {
      // 只允许读取登记过的 UUID，不能把资源 URI 直接拼成磁盘路径。
      const item = registry.get(String(variables.id ?? ""));
      if (!item) throw new Error(`Unknown gen-image resource: ${uri.href}`);
      const bytes = await fs.readFile(item.absPath);
      // 资源读取返回完整文件，不受工具内联预览的 2 MiB 上限限制。
      return {
        contents: [
          {
            uri: item.uri,
            mimeType: item.mimeType,
            blob: bytes.toString("base64"),
          },
        ],
      };
    },
  );
}
