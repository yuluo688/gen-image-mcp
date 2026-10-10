#!/usr/bin/env node
// MCPB launcher: some clients pass optional, unset user_config fields as an
// empty string or as the literal "${user_config.x}" placeholder. gen-image-mcp
// treats any present value as set (an empty GEN_IMAGE_MODEL is an error), so
// drop those before starting the real server.
const KEYS = [
  "GEN_IMAGE_BASE_URL",
  "GEN_IMAGE_API_KEY",
  "GEN_IMAGE_MODEL",
  "GEN_IMAGE_GEMINI_MODEL",
  "GEN_IMAGE_AUTO_FALLBACK",
  "GEN_IMAGE_TIMEOUT_MS",
];
for (const key of KEYS) {
  const value = process.env[key];
  if (value === undefined) continue;
  const trimmed = value.trim();
  if (trimmed === "" || /^\$\{user_config\.[^}]*\}$/.test(trimmed)) {
    delete process.env[key];
  }
}
await import("../dist/index.js");
