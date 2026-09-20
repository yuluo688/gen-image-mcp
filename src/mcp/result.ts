// 预览上限属于 MCP 展示策略，不应由磁盘存储层决定。
export const PREVIEW_LIMIT_BYTES = 2 * 1024 * 1024;

export type SavedImage = {
  absPath: string;
  uri: string;
  name: string;
  mimeType: string;
  bytes: Buffer;
};

export type TextContent = { type: "text"; text: string };
export type ImageContent = { type: "image"; data: string; mimeType: string };
export type ResourceLinkContent = {
  type: "resource_link";
  uri: string;
  name: string;
  mimeType: string;
};
export type ToolContent = TextContent | ImageContent | ResourceLinkContent;

// 工具失败转成 MCP 错误内容，避免业务异常中断整个 stdio 会话。
export function errorResult(text: string): {
  isError: true;
  content: TextContent[];
} {
  return { isError: true, content: [{ type: "text", text }] };
}

export function successResult(saved: SavedImage[]): { content: ToolContent[] } {
  const lines: string[] = [];
  for (const item of saved) {
    lines.push(`saved: ${item.absPath}`);
    lines.push(`resource: ${item.uri}`);
  }
  const content: ToolContent[] = [{ type: "text", text: lines.join("\n") }];
  const first = saved[0];
  // 仅内联第一张小图；所有图片仍可通过资源链接读取完整内容。
  if (first && first.bytes.length <= PREVIEW_LIMIT_BYTES) {
    content.push({
      type: "image",
      data: first.bytes.toString("base64"),
      mimeType: first.mimeType,
    });
  }
  for (const item of saved) {
    content.push({
      type: "resource_link",
      uri: item.uri,
      name: item.name,
      mimeType: item.mimeType,
    });
  }
  return { content };
}
