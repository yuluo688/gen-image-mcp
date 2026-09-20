# gen-image MCP

中文 | [English](./README.en.md)

通过 OpenAI 兼容接口生成、编辑图片的本地 MCP 服务。支持多模型顺序切换，将图片保存到本地，并返回预览和资源链接。

## 使用前准备

- 安装 Node.js，建议使用 Node.js 24 LTS；服务最低要求为 18.3。
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

配置完成后，连接或重启该 MCP 服务，客户端应能发现三个工具。直接在终端启动时，服务会等待标准输入中的 MCP 消息，不会打开网页或交互式命令菜单。

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
- 每个模型最多尝试一次，成功即停止，全部失败返回最后一个模型的错误。
- 每次调用重新从第一项或指定模型开始，不永久改变模型顺序。
- 单次调用参数 `auto_fallback` 可覆盖全局开关；设为 `false` 时只尝试当前模型。
- 参数错误、本地图片读取错误和保存失败不触发模型切换。
- 两组模型不会跨接口切换。未配置某组时，其对应工具返回错误。

开启切换后，客户端的请求超时应大于“单次请求超时 × 最多尝试的模型数”，并为文件读写留出余量。多次上游请求可能产生额外费用。

## 工具调用

以下 JSON 是工具参数，不是终端命令。所有工具都要求 `prompt` 和 `output_path`；示例省略 `model`，使用对应组第一个模型。

| 工具 | 用途 | 上游端点 |
| --- | --- | --- |
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

可选参数：`model`、`size`、`quality`、`n`、`output_format`、`auto_fallback`。`size` 默认 `auto`；`n` 为 1–4，默认 1；`quality` 可取 `low`、`medium`、`high`、`auto`；`output_format` 可取 `png`、`jpeg`、`webp`，省略时由上游决定。

### edit_image

```json
{
  "prompt": "将天空改为日落，保留建筑细节",
  "output_path": "exports/edited.png",
  "images": ["inputs/photo.png"],
  "auto_fallback": true
}
```

`images` 必填，包含 1–16 个本地图片路径。可选参数：`mask`（本地蒙版路径）、`model`、`size`、`quality`、`auto_fallback`。蒙版和编辑能力取决于上游模型。

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

省略 `images` 即为纯文生图。可选参数：`images`、`model`、`aspect_ratio`、`auto_fallback`。

支持的宽高比：`1:1`、`2:3`、`3:2`、`3:4`、`4:3`、`4:5`、`5:4`、`9:16`、`16:9`、`21:9`。

## 文件与输出

- 输入和输出的相对路径均相对于 MCP 进程工作目录，而不是 npm 缓存或包安装目录；不确定工作目录时使用绝对路径。
- `output_path` 以 `/` 或 `\` 结尾、指向现有目录，或没有受支持的图片扩展名时，按目录处理。
- 目录输出命名为 `{slug}-{YYYYMMDD-HHmmss}[-序号].扩展名`；纯中文提示词的 slug 为 `image`，时间戳使用本地时间。
- 文件输出保留指定基名；多张图片插入 `-1`、`-2` 等序号，扩展名以实际图片格式为准。
- 缺少的父目录会自动创建。相同路径直接覆盖，不备份；同一秒内的同名目录输出也可能覆盖。
- 最多输入 16 张图片，每个本地输入文件最多 50 MiB。
- 图片响应只接受可识别的 PNG、JPEG、WebP、GIF Base64 或 data URL，不会自动下载上游返回的普通远程 URL。

### 返回内容

成功时依次返回：

1. 保存路径和 `gen-image:///<id>` 资源 URI 的文本。
2. 第一张图片的内联预览，仅在其解码大小不超过 2 MiB 时附带。
3. 每张图片的 `resource_link`。

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
