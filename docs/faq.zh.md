# 常见问题

[← 返回 README](../README.md) · [English](faq.en.md)

**npx 提示找不到包**

检查包名、版本和 npm 仓库地址。可运行 `npm view gen-image-mcp version --registry=https://registry.npmjs.org` 查询公共仓库中的版本；第三方镜像可能存在同步延迟。

**提示配置缺失或没有可用模型**

检查 MCP 进程是否收到 URL、Key 和至少一组模型环境变量。只配置 Gemini 模型时，请使用 `generate_gemini_image`；只配置 Images 模型时，请使用 `generate_image` 或 `edit_image`。

**命令启动后没有页面或输出**

这是 stdio MCP 服务，不提供 HTTP 服务或网页。有效配置下，它需要由 MCP 客户端连接并发送协议消息。

**找不到生成的图片**

以工具返回的绝对保存路径为准。使用 `npx` 不会把图片自动保存到 npm 包目录；可以直接指定绝对 `output_path`。

**服务地址应该填什么？**

填服务的根地址，不要带 `/v1`，也不要填写具体图像端点。服务会自动拼接 `/v1/images/generations`、`/v1/images/edits` 和 `/v1/chat/completions`。例如网关地址为 `https://gw.example` 时，填写 `https://gw.example`，而不是 `https://gw.example/v1`。从 0.2.3 起，结尾多写的一个 `/v1` 会被自动去掉，所以填 `https://gw.example/v1` 也能用。

**能直接用官方 OpenAI 的 `gpt-image` 模型吗？**

请求默认带 `response_format: "b64_json"`，大多数 OpenAI 兼容网关需要它。部分上游（如官方 OpenAI 的 `gpt-image` 系列）不接受这个参数；从 0.2.3 起，如果上游返回 400 且错误里提到 `response_format`，会去掉该参数自动重试一次，本次会话中该模型之后也不再携带。

**输入图片支持哪些格式？**

`images` 和 `mask` 必须是 PNG、JPEG、WebP 或 GIF（按文件内容识别，不看扩展名），单个文件不超过 50 MB。其他文件会在发往上游之前直接拒绝。

**`generate_gemini_image` 能直连 Google 官方 Gemini API 吗？**

目前不能，需要经过 OpenAI 兼容网关（如 CLIProxyAPI、new-api、LiteLLM）。原因有两点：

- 路径不同。本服务请求 `<根地址>/v1/chat/completions`，Google 的 OpenAI 兼容接口在 `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`。
- 即使改成 Google 的路径也拿不到图。Google 的 OpenAI 兼容层目前不支持在 Chat Completions 里返回图像模型的输出（会报 `Unhandled generated data mime type`），官方只在 `/v1beta/openai/images/generations` 上支持 Gemini 图像模型。Vertex AI 的兼容接口虽然能返回图片，但需要每小时过期的 Google Cloud 访问令牌，不适合放进 MCP 配置。

所以只加一个“自定义路径”的配置并不能让直连可用，本项目暂不提供该选项。

**Images 和 Gemini 两组模型可以使用不同的服务商吗？**

不可以。两组模型共用同一个 `GEN_IMAGE_BASE_URL` 和 `GEN_IMAGE_API_KEY`。

## 开源许可证

本项目采用 [MIT 许可证](../LICENSE)，版权归属 `Copyright (c) 2026 yuluo688`。

允许商用、修改和分发，包括闭源使用；须保留版权及许可证声明。软件按原样提供，不作担保。该许可证适用于本项目软件，不替代上游模型服务条款或对生成图片权利的约定。
