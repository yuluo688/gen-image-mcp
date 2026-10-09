# Troubleshooting / FAQ

[← Back to README](../README.en.md) · [中文](faq.zh.md)

**npx cannot find the package**

Check the package name, version and npm registry URL. Run `npm view gen-image-mcp version --registry=https://registry.npmjs.org` to check the version in the public registry. Third-party mirrors may take time to synchronize.

**Missing configuration or no models configured**

Check that the MCP process receives the endpoint, key and at least one model group. With only Gemini models configured, use `generate_gemini_image`; with only Images models, use `generate_image` or `edit_image`.

**The command starts but shows no page or output**

This is a stdio MCP server, not an HTTP server or website. With valid configuration, it waits for a client to connect and send MCP messages.

**Cannot find generated images**

Use the absolute saved path returned by the tool. Running through `npx` does not automatically save images in the npm package directory. You can specify an absolute `output_path` directly.

**Which base URL should I use?**

Use the service root, without `/v1` and without a specific image endpoint. The server appends `/v1/images/generations`, `/v1/images/edits` and `/v1/chat/completions` itself. For a gateway at `https://gw.example`, use `https://gw.example`, not `https://gw.example/v1`. Since 0.2.3 a single trailing `/v1` is stripped automatically, so `https://gw.example/v1` also works.

**Does it work with official OpenAI `gpt-image` models?**

Requests send `response_format: "b64_json"` by default, which most OpenAI-compatible gateways need. Some upstreams (such as official OpenAI `gpt-image` models) reject that parameter; since 0.2.3, when the upstream answers 400 and mentions `response_format`, the request is retried once without it, and that model skips the parameter for the rest of the session.

**Which input images are accepted?**

`images` and `mask` must be PNG, JPEG, WebP or GIF files (detected from file content, not the extension), up to 50 MB each. Other files are rejected before anything is sent upstream.

**Can `generate_gemini_image` call Google's official Gemini API directly?**

Not currently; use an OpenAI-compatible gateway (such as CLIProxyAPI, new-api or LiteLLM). Two reasons:

- The path differs. This server calls `<base URL>/v1/chat/completions`, while Google's OpenAI-compatible endpoint is `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`.
- Even with Google's path you would not get an image back. Google's OpenAI compatibility layer does not currently return image-model output from Chat Completions (it fails with `Unhandled generated data mime type`); Google only supports Gemini image models on `/v1beta/openai/images/generations`. Vertex AI's compatible endpoint can return images, but it needs a Google Cloud access token that expires every hour, which does not fit an MCP config.

A configurable path alone would therefore not make direct access work, so no such option is offered for now.

**Can the Images and Gemini groups use different providers?**

No. Both model groups share the same `GEN_IMAGE_BASE_URL` and `GEN_IMAGE_API_KEY`.

## License

This project is licensed under the [MIT License](../LICENSE). Copyright (c) 2026 yuluo688.

Commercial use, modification and distribution, including proprietary use, are permitted provided the copyright and permission notices are retained. The software is provided as is, without warranty. This license covers the project software and does not replace upstream model service terms or determine rights to generated images.
