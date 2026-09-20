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

export type AttemptOutcome = "success" | "error";

export type AttemptRecord = {
  model: string;
  outcome: AttemptOutcome;
  elapsed_ms: number;
  error_category?: string;
  http_status?: number;
};

export type ModelSwitch = { from: string; to: string };

export type ExecutionSummary = {
  model: string | null;
  elapsed_ms: number;
  attempt_count: number;
  retry_count: number;
  model_switches: ModelSwitch[];
  attempts: AttemptRecord[];
};

export type StructuredImage = {
  path: string;
  name: string;
  mime_type: string;
  byte_size: number;
  uri: string;
};

export type GenerationStructuredContent = ExecutionSummary & {
  images: StructuredImage[];
  error?: {
    message: string;
    category?: string;
    http_status?: number;
  };
};

function mergeSummary(
  summary?: Partial<ExecutionSummary>,
): ExecutionSummary {
  return {
    model: null,
    elapsed_ms: 0,
    attempt_count: 0,
    retry_count: 0,
    ...summary,
    model_switches: summary?.model_switches ?? [],
    attempts: summary?.attempts ?? [],
  };
}

function toStructuredImages(saved: SavedImage[]): StructuredImage[] {
  return saved.map((item) => ({
    path: item.absPath,
    name: item.name,
    mime_type: item.mimeType,
    byte_size: item.bytes.length,
    uri: item.uri,
  }));
}

// 工具失败转成 MCP 错误内容，避免业务异常中断整个 stdio 会话。
export function errorResult(
  text: string,
  summary?: Partial<ExecutionSummary>,
  errorMeta?: { category?: string; http_status?: number },
): {
  isError: true;
  content: TextContent[];
  structuredContent: GenerationStructuredContent;
} {
  const base = mergeSummary(summary);
  const error: GenerationStructuredContent["error"] = { message: text };
  if (errorMeta?.category !== undefined) error.category = errorMeta.category;
  if (errorMeta?.http_status !== undefined)
    error.http_status = errorMeta.http_status;
  return {
    isError: true,
    content: [{ type: "text", text }],
    structuredContent: {
      ...base,
      images: [],
      error,
    },
  };
}

export function successResult(
  saved: SavedImage[],
  summary?: Partial<ExecutionSummary>,
): {
  content: ToolContent[];
  structuredContent: GenerationStructuredContent;
} {
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
  return {
    content,
    structuredContent: {
      ...mergeSummary(summary),
      images: toStructuredImages(saved),
    },
  };
}
