# 工具参数参考

[← 返回 README](../README.md) · [English](tools.en.md)

以下 JSON 是工具参数，不是终端命令。三个生图/编辑工具都要求 `prompt` 和 `output_path`；示例省略 `model`，使用对应组第一个模型。`list_models` 无需参数。

| 工具 | 用途 | 上游端点 |
| --- | --- | --- |
| `list_models` | 查询已配置模型、所属接口组、默认模型和对应工具 | 无网络请求 |
| `generate_image` | 文本生成图片 | `POST /v1/images/generations` |
| `edit_image` | 编辑或合并本地图片 | `POST /v1/images/edits` |
| `generate_gemini_image` | Gemini 文生图或参考图生成 | `POST /v1/chat/completions` |

## generate_image

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

## edit_image

```json
{
  "prompt": "将天空改为日落，保留建筑细节",
  "output_path": "exports/edited.png",
  "images": ["inputs/photo.png"],
  "auto_fallback": true
}
```

`images` 必填，包含 1–16 个本地图片路径。可选参数：`filename`、`mask`（本地蒙版路径）、`model`、`size`、`quality`、`auto_fallback`。蒙版和编辑能力取决于上游模型。

## generate_gemini_image

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

## list_models

调用参数为 `{}`。返回文本和 `structuredContent`，包含按配置顺序排列的 `groups`：每组有 `api`（`images` 或 `gemini`）、`models`、`default_model` 和 `tools`。未配置的组返回空列表及 `default_model: null`；顶层 `auto_fallback` 表示全局切换设置。

此工具只读取本地配置，不发网络请求、不返回 API Key 或服务地址。`availability_checked: false` 明确表示没有检查模型当前是否可用。

## AI 文件命名

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

输出路径、文件命名与返回内容见 [output.zh.md](output.zh.md)。
