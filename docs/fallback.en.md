# Model selection, fallback and retries

[← Back to README](../README.en.md) · [中文](fallback.zh.md)

- Omit the tool's `model` argument to use the first model in its group.
- An explicit `model` must already be configured in that group.
- With automatic fallback enabled, upstream HTTP errors, network errors, timeouts or responses without valid images trigger the next model.
- An explicit model selection starts at that entry and only moves forward; it never wraps to the beginning.
- Explicit capacity or rate-limit failures (including outer HTTP 500 wrapping an inner 503 / no capacity) get bounded same-model backoff retries first (default up to 2 extra attempts, with a capped `Retry-After`); timeouts, network, auth, and content-policy errors are not retried.
- After non-retryable failures, or once same-model retries are exhausted, the next model is tried when fallback is enabled. Success stops the sequence; if all fail, the last model's structured error is returned (HTTP status and category preserved).
- Each new call starts from the first or explicitly selected model, without permanently changing the order.
- Per-call `auto_fallback` overrides the global switch. When false, only the selected model is attempted (capacity/rate-limit same-model retries still apply).
- Invalid arguments, local input errors and save failures do not trigger fallback.
- Input images (`images`, `mask`) are read once per tool call; same-model retries and model fallback reuse the same bytes (since 0.2.3).
- Models never switch across API groups. Calling a tool with an unconfigured group returns an error.

Allow up to 3 requests and two backoff waits per model in the client's timeout; multiply by the number of models when fallback is enabled and leave room for file I/O. Without `Retry-After`, waits default to 400ms and 800ms, capped at 5 seconds per wait. A generic 503 is not treated as confirmed capacity exhaustion. Additional upstream requests may incur additional charges.

Related settings (`GEN_IMAGE_MODEL`, `GEN_IMAGE_GEMINI_MODEL`, `GEN_IMAGE_AUTO_FALLBACK`, `GEN_IMAGE_TIMEOUT_MS`) are described in [configuration.en.md](configuration.en.md).
