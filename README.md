# gen-image MCP

中文 | [English](./README.en.md)

[![npm version](https://img.shields.io/npm/v/gen-image-mcp?logo=npm&label=npm)](https://www.npmjs.com/package/gen-image-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-active-10B981)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.yuluo688%2Fgen-image-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-0B7BB9)](./LICENSE)

面向 AI 编程 Agent 的本地图片工作流 MCP。通过用户自选的 OpenAI 兼容或 Gemini 图像接口生成、编辑图片，直接保存到项目目录。

GitHub 项目：[yuluo688/gen-image-mcp](https://github.com/yuluo688/gen-image-mcp) | 已登记 [官方 MCP Registry](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.yuluo688%2Fgen-image-mcp)

## 为什么使用它

- **直接写入本地项目**：生成或编辑的图片保存到调用 MCP 的机器，可立即被代码仓库引用。
- **使用自己的上游服务**：自行配置 API 地址、Key 和模型，不依赖本服务托管模型。
- **失败自动恢复**：可按配置顺序重试容量或限流错误，并切换到后续模型。
- **覆盖完整图片流程**：支持文生图、本地参考图生成和图片编辑，并返回预览与资源链接。

## 使用前准备

- 安装 Node.js，建议使用 Node.js 24 LTS；服务最低要求为 20。
- 准备支持对应图像接口的服务地址、API Key 和模型名称。
- 使用支持 stdio 的 MCP 客户端。

本服务没有内置地址、Key 或模型。缺少必填配置会拒绝启动，也不会自动读取 `.env` 文件。

## 通过 npx 使用

包名：[`gen-image-mcp`](https://www.npmjs.com/package/gen-image-mcp)。

用户无需克隆源码、手动安装项目依赖或编译。`npx` 会自动下载并缓存 npm 包，再在本机启动服务；它不是远程托管服务。

在 MCP 客户端中添加一个 stdio 服务，启动命令与参数为：

```text
命令：npx
参数：-y gen-image-mcp
```

下面是使用 `mcpServers`、`command`、`args`、`env` 字段的通用配置示例。不同客户端的配置结构可能不同，对应填入启动命令、参数和环境变量即可。

```json
{
  "mcpServers": {
    "gen-image": {
      "command": "npx",
      "args": ["-y", "gen-image-mcp"],
      "env": {
        "GEN_IMAGE_BASE_URL": "https://your-proxy.example",
        "GEN_IMAGE_API_KEY": "your-api-key",
        "GEN_IMAGE_MODEL": "images-model-a,images-model-b",
        "GEN_IMAGE_GEMINI_MODEL": "gemini-image-model-a",
        "GEN_IMAGE_AUTO_FALLBACK": "true"
      }
    }
  }
}
```

将示例地址、Key 和模型替换为实际值。两组模型至少配置一组；不使用的组应删除对应环境变量，不要填写空字符串。图片读写发生在启动此 MCP 的机器上，建议使用绝对路径。

配置完成后，连接或重启该 MCP 服务，客户端应能发现四个工具。直接在终端启动时，服务会等待标准输入中的 MCP 消息，不会打开网页或交互式命令菜单。

生产使用建议将参数中的包名固定为已发布版本，例如 `gen-image-mcp@<version>`，避免升级时行为变化。首次运行需要能够访问 npm 仓库。

### 命令行参数

也可以把非敏感配置放在启动参数中。以下命令要求已通过进程环境设置 `GEN_IMAGE_API_KEY`：

```bash
npx -y gen-image-mcp --base-url "https://your-proxy.example" --model "images-model-a,images-model-b" --auto-fallback true
```

API Key 建议通过 MCP 客户端的环境变量配置传入，避免出现在命令历史和进程参数中。

## 配置项

命令行参数优先于环境变量。

| 环境变量 | 命令行参数 | 说明 |
| --- | --- | --- |
| `GEN_IMAGE_BASE_URL` | `--base-url` | 必填，完整 HTTP/HTTPS 根地址；不含认证信息、查询参数和片段，不要填写具体图像端点 |
| `GEN_IMAGE_API_KEY` | `--api-key` | 必填，非空 API Key |
| `GEN_IMAGE_MODEL` | `--model` | Images 模型列表，逗号分隔，按顺序使用 |
| `GEN_IMAGE_GEMINI_MODEL` | `--gemini-model` | Gemini 图像模型列表，逗号分隔，按顺序使用 |
| `GEN_IMAGE_AUTO_FALLBACK` | `--auto-fallback` | `true` 或 `false`，默认 `false` |
| `GEN_IMAGE_TIMEOUT_MS` | `--timeout-ms` | 单次上游请求超时，默认 `120000` 毫秒；正整数，最大 `2147483647` |

模型名称不能重复，也不能包含空项。URL、Key 或配置值无效时直接报错，不会替换成默认服务或模型。

### 模型选择与失败切换

- 未指定工具参数 `model` 时，使用对应组的第一个模型。
- `model` 只能指定该组已经配置的模型。
- 开启自动切换后，上游 HTTP 错误、网络错误、超时或无有效图片会触发下一模型。
- 显式指定模型时，从该项开始，只向后尝试；不会绕回列表开头。
- 明确的容量不足或限流（含外层 500 包裹内层 503 / no capacity）会先对同一模型做有限退避重试（默认最多额外 2 次，并尊重有上界的 `Retry-After`）；超时、网络、鉴权、内容策略等错误不重试。
- 非上述可重试错误，或同模型重试仍失败后，才按开关切换下一模型；成功即停止，全部失败返回最后一个模型的结构化错误（保留 HTTP 状态与类别）。
- 每次调用重新从第一项或指定模型开始，不永久改变模型顺序。
- 单次调用参数 `auto_fallback` 可覆盖全局开关；设为 `false` 时只尝试当前模型（仍可对容量/限流做同模型重试）。
- 参数错误、本地图片读取错误和保存失败不触发模型切换。
- 两组模型不会跨接口切换。未配置某组时，其对应工具返回错误。

客户端的请求超时应为每个模型最多 3 次请求及两次退避等待留出余量；开启切换时还需乘以最多尝试的模型数，并考虑文件读写时间。无 `Retry-After` 时默认等待 400ms、800ms，单次等待最多 5 秒。普通 503 不视为明确容量不足。多次上游请求可能产生额外费用。

## 工具调用

以下 JSON 是工具参数，不是终端命令。三个生图/编辑工具都要求 `prompt` 和 `output_path`；示例省略 `model`，使用对应组第一个模型。`list_models` 无需参数。

| 工具 | 用途 | 上游端点 |
| --- | --- | --- |
| `list_models` | 查询已配置模型、所属接口组、默认模型和对应工具 | 无网络请求 |
| `generate_image` | 文本生成图片 | `POST /v1/images/generations` |
| `edit_image` | 编辑或合并本地图片 | `POST /v1/images/edits` |
| `generate_gemini_image` | Gemini 文生图或参考图生成 | `POST /v1/chat/completions` |

### generate_image

```json
{
  "prompt": "白色桌面上的红色立方体，柔和自然光",
  "output_path": "exports/cube.png",
  "size": "1024x1024",
  "quality": "high",
  "n": 1,
  "output_format": "png",
  "auto_fallback": true
}
```

可选参数：`filename`、`model`、`size`、`quality`、`n`、`output_format`、`auto_fallback`。`size` 默认 `auto`；`n` 为 1–4，默认 1；`quality` 可取 `low`、`medium`、`high`、`auto`；`output_format` 可取 `png`、`jpeg`、`webp`，省略时由上游决定。

### edit_image

```json
{
  "prompt": "将天空改为日落，保留建筑细节",
  "output_path": "exports/edited.png",
  "images": ["inputs/photo.png"],
  "auto_fallback": true
}
```

`images` 必填，包含 1–16 个本地图片路径。可选参数：`filename`、`mask`（本地蒙版路径）、`model`、`size`、`quality`、`auto_fallback`。蒙版和编辑能力取决于上游模型。

### generate_gemini_image

```json
{
  "prompt": "将这张草图转为水彩画",
  "output_path": "exports/watercolor.png",
  "images": ["inputs/sketch.png"],
  "aspect_ratio": "16:9",
  "auto_fallback": false
}
```

省略 `images` 即为纯文生图。可选参数：`filename`、`images`、`model`、`aspect_ratio`、`auto_fallback`。

支持的宽高比：`1:1`、`2:3`、`3:2`、`3:4`、`4:3`、`4:5`、`5:4`、`9:16`、`16:9`、`21:9`。

### list_models

调用参数为 `{}`。返回文本和 `structuredContent`，包含按配置顺序排列的 `groups`：每组有 `api`（`images` 或 `gemini`）、`models`、`default_model` 和 `tools`。未配置的组返回空列表及 `default_model: null`；顶层 `auto_fallback` 表示全局切换设置。

此工具只读取本地配置，不发网络请求、不返回 API Key 或服务地址。`availability_checked: false` 明确表示没有检查模型当前是否可用。

### AI 文件命名

由调用方 AI 根据主题填写可选 `filename`，服务本身不额外调用模型命名。三个生图/编辑工具均支持：

```json
{
  "prompt": "夕阳花园中的优雅成年女性人像，自然光摄影",
  "output_path": "exports/",
  "filename": "夕阳花园人像.png",
  "n": 1
}
```

`filename` 是单个文件名，不是路径，可包含中文，扩展名可省略，最终后缀以实际图片格式为准。名称最多 200 个 UTF-8 字节，为序号和后缀预留空间。提供该参数时 `output_path` 必须为目录；空名称、路径分隔符、Windows 保留名称等无效输入会在生图请求前拒绝。

同名输出通过独占创建和递增序号防覆盖，例如 `夕阳花园人像.png`、`夕阳花园人像-2.png`、`夕阳花园人像-3.png`，最多尝试 1000 个候选名称。多图输出先添加图片序号，再处理已有文件冲突。不传 `filename` 时保持原有命名方式。

## 文件与输出

- 输入和输出的相对路径均相对于 MCP 进程工作目录，而不是 npm 缓存或包安装目录；不确定工作目录时使用绝对路径。
- `output_path` 以 `/` 或 `\` 结尾、指向现有目录，或没有受支持的图片扩展名时，按目录处理。
- 未指定 `filename` 时，目录输出命名为 `{slug}-{YYYYMMDD-HHmmss}-{随机UUID}[-序号].扩展名`；纯中文提示词的 slug 为 `image`，时间戳使用本地时间。
- 文件输出保留指定基名；多张图片插入 `-1`、`-2` 等序号，扩展名以实际图片格式为准。
- 缺少的父目录会自动创建。直接将 `output_path` 设为文件时仍覆盖，不备份；目录输出采用独占创建，不覆盖已有文件。使用 `filename` 时自动尝试序号后缀，其他目录输出遇到碰撞则报错。
- 最多输入 16 张图片，每个本地输入文件最多 50 MiB。
- 图片响应只接受可识别的 PNG、JPEG、WebP、GIF Base64 或 data URL，不会自动下载上游返回的普通远程 URL。

### 返回内容

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

## 常见问题

**npx 提示找不到包**

检查包名、版本和 npm 仓库地址。可运行 `npm view gen-image-mcp version --registry=https://registry.npmjs.org` 查询公共仓库中的版本；第三方镜像可能存在同步延迟。

**提示配置缺失或没有可用模型**

检查 MCP 进程是否收到 URL、Key 和至少一组模型环境变量。只配置 Gemini 模型时，请使用 `generate_gemini_image`；只配置 Images 模型时，请使用 `generate_image` 或 `edit_image`。

**命令启动后没有页面或输出**

这是 stdio MCP 服务，不提供 HTTP 服务或网页。有效配置下，它需要由 MCP 客户端连接并发送协议消息。

**找不到生成的图片**

以工具返回的绝对保存路径为准。使用 `npx` 不会把图片自动保存到 npm 包目录；可以直接指定绝对 `output_path`。

## 开源许可证

本项目采用 [MIT 许可证](./LICENSE)，版权归属 `Copyright (c) 2026 yuluo688`。

允许商用、修改和分发，包括闭源使用；须保留版权及许可证声明。软件按原样提供，不作担保。该许可证适用于本项目软件，不替代上游模型服务条款或对生成图片权利的约定。
