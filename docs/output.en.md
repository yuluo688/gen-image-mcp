# Files, output and structuredContent

[← Back to README](../README.en.md) · [中文](output.zh.md)

## Files and output

- Relative input and output paths resolve against the MCP process's working directory, not the npm cache or package installation directory. Use absolute paths if the working directory is uncertain.
- `output_path` is treated as a directory if it ends in `/` or `\`, points to an existing directory, or has no supported image extension.
- Without `filename`, directory outputs use `{slug}-{YYYYMMDD-HHmmss}-{randomUUID}[-index].extension`. A Chinese-only prompt uses `image` as the slug; timestamps use local time.
- File outputs retain the specified basename. Multiple images get `-1`, `-2`, etc., and the extension follows the actual image format.
- Missing parent directories are created automatically. Setting `output_path` directly to a file still overwrites without backup. Directory outputs use exclusive creation and never overwrite; with `filename`, collisions try numbered suffixes, otherwise they report an error.
- A maximum of 16 input images is allowed, with a maximum of 50 MiB per local input file.
- Image responses must contain recognizable PNG, JPEG, WebP or GIF bytes as Base64 or a data URL. Plain remote URLs returned by the upstream service are not downloaded automatically.

## Returned content

A successful call returns, in order:

1. Text containing saved paths and `gen-image:///<id>` resource URIs.
2. An inline preview of the first image, only when its decoded size is at most 2 MiB.
3. A `resource_link` for each image.

The three generation/editing tools also return `structuredContent`, so clients do not need to parse text paths:

| Field | Meaning |
| --- | --- |
| `images` | Files with `path`, `name`, `mime_type`, `byte_size`, `uri`; no duplicate Base64 payload |
| `model` | Actual successful model, or the last attempted model on failure; `null` when no upstream attempt occurred |
| `elapsed_ms` | Total elapsed time including retry waits and file saving |
| `attempt_count` | Upstream attempts, excluding pre-generation local validation failures |
| `retry_count` | Consecutive extra attempts of the same model; switching models is not a retry |
| `model_switches` | Ordered model switches, each with `from` and `to` |
| `attempts` | Each attempt's `model`, `outcome`, `elapsed_ms`, plus optional `error_category` and `http_status` on upstream failure |

Execution failures retain `isError: true` and error text, with the same summary, empty `images` and an `error` object. SDK input-schema rejection happens before execution and may not include this summary. Telemetry does not additionally record prompts, credentials or full request/response bodies and does not create a history database.

Clients can use `resources/list` to list images saved by the current server instance and `resources/read` to retrieve the full Base64 content. Resource reads are not subject to the 2 MiB preview limit. Restarting the server clears its resource list but does not delete saved files.

Tool failures return `isError: true` and error text. stdout is reserved for MCP messages; logs are written to stderr.
