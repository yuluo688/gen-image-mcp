# 文件、输出与 structuredContent

[← 返回 README](../README.md) · [English](output.en.md)

## 文件与输出

- 输入和输出的相对路径均相对于 MCP 进程工作目录，而不是 npm 缓存或包安装目录；不确定工作目录时使用绝对路径。
- `output_path` 以 `/` 或 `\` 结尾、指向现有目录，或没有受支持的图片扩展名时，按目录处理。
- 未指定 `filename` 时，目录输出命名为 `{slug}-{YYYYMMDD-HHmmss}-{随机UUID}[-序号].扩展名`；纯中文提示词的 slug 为 `image`，时间戳使用本地时间。
- 文件输出保留指定基名；多张图片插入 `-1`、`-2` 等序号，扩展名以实际图片格式为准。
- 缺少的父目录会自动创建。直接将 `output_path` 设为文件时仍覆盖，不备份；目录输出采用独占创建，不覆盖已有文件。使用 `filename` 时自动尝试序号后缀，其他目录输出遇到碰撞则报错。
- 最多输入 16 张图片，每个本地输入文件最多 50 MiB。
- 图片响应只接受可识别的 PNG、JPEG、WebP、GIF Base64 或 data URL，不会自动下载上游返回的普通远程 URL。

## 返回内容

成功时依次返回：

1. 保存路径和 `gen-image:///<id>` 资源 URI 的文本。
2. 第一张图片的内联预览，仅在其解码大小不超过 2 MiB 时附带。
3. 每张图片的 `resource_link`。

三个生图/编辑工具还返回 `structuredContent`，便于客户端直接处理，不必解析文本路径：

| 字段 | 含义 |
| --- | --- |
| `images` | 文件列表，每项包含 `path`、`name`、`mime_type`、`byte_size`、`uri`，不重复携带图片 Base64 |
| `model` | 实际成功的模型；失败时为最后尝试的模型，没有上游尝试时为 `null` |
| `elapsed_ms` | 总耗时，包含重试等待与文件保存 |
| `attempt_count` | 上游尝试次数，不计生图前的本地校验失败 |
| `retry_count` | 同一模型连续再次尝试的次数，不把切换模型算作重试 |
| `model_switches` | 按顺序记录模型切换，每项为 `from`、`to` |
| `attempts` | 每次尝试的 `model`、`outcome`、`elapsed_ms`；上游失败时可含 `error_category`、`http_status` |

执行失败时保留 `isError: true` 和错误文本，并返回上述摘要、空 `images` 及 `error`。SDK 输入 schema 校验失败发生在执行前，不保证附带执行摘要。摘要不额外记录提示词、密钥或完整请求/响应正文，也不新增历史数据库。

客户端可以通过 `resources/list` 列出当前服务实例保存的图片，再用 `resources/read` 读取完整 Base64 内容；资源读取不受 2 MiB 预览限制。服务重启后资源列表清空，但已经保存的文件不会删除。

工具失败返回 `isError: true` 和错误文本。stdout 仅用于 MCP 协议，日志写入 stderr。
