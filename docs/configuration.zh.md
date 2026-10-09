# 配置说明

[← 返回 README](../README.md) · [English](configuration.en.md)

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

## 命令行参数

也可以把非敏感配置放在启动参数中。以下命令要求已通过进程环境设置 `GEN_IMAGE_API_KEY`：

```bash
npx -y gen-image-mcp --base-url "https://your-proxy.example" --model "images-model-a,images-model-b" --auto-fallback true
```

API Key 建议通过 MCP 客户端的环境变量配置传入，避免出现在命令历史和进程参数中。

## 配置项

命令行参数优先于环境变量。

| 环境变量 | 命令行参数 | 说明 |
| --- | --- | --- |
| `GEN_IMAGE_BASE_URL` | `--base-url` | 必填，完整 HTTP/HTTPS 根地址；不含认证信息、查询参数和片段，不要填写具体图像端点（结尾多写的 `/v1` 会被自动去掉） |
| `GEN_IMAGE_API_KEY` | `--api-key` | 必填，非空 API Key |
| `GEN_IMAGE_MODEL` | `--model` | Images 模型列表，逗号分隔，按顺序使用 |
| `GEN_IMAGE_GEMINI_MODEL` | `--gemini-model` | Gemini 图像模型列表，逗号分隔，按顺序使用 |
| `GEN_IMAGE_AUTO_FALLBACK` | `--auto-fallback` | `true` 或 `false`，默认 `false` |
| `GEN_IMAGE_TIMEOUT_MS` | `--timeout-ms` | 单次上游请求超时，默认 `120000` 毫秒；正整数，最大 `2147483647` |

模型名称不能重复，也不能包含空项。URL、Key 或配置值无效时直接报错，不会替换成默认服务或模型。

`generate_gemini_image` 固定请求 `<根地址>/v1/chat/completions`，需要 OpenAI 兼容网关（如 CLIProxyAPI、new-api、LiteLLM）把 Gemini 图像模型的输出转成 Chat Completions 格式；不支持直连 Google 官方接口，原因见 [常见问题](faq.zh.md)。

模型选择、失败切换与重试规则见 [fallback.zh.md](fallback.zh.md)。
