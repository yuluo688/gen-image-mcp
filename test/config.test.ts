import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../dist/config.js";

const env = {
  GEN_IMAGE_BASE_URL: "https://example.test/",
  GEN_IMAGE_API_KEY: "test-key",
  GEN_IMAGE_MODEL: "first, second",
};

test("Gemini CLI models override the environment group", () => {
  const config = loadConfig({ ...env, GEN_IMAGE_GEMINI_MODEL: "env-gemini" }, [
    "--gemini-model=gemini-first,gemini-second",
  ]);
  assert.deepEqual(config.geminiModels, ["gemini-first", "gemini-second"]);
});

test("configuration requires URL, key and at least one model group", () => {
  assert.throws(() => loadConfig({}, []), /BASE_URL.*required/);
  assert.throws(
    () => loadConfig({ ...env, GEN_IMAGE_BASE_URL: " " }, []),
    /BASE_URL.*required/,
  );
  assert.throws(
    () => loadConfig({ ...env, GEN_IMAGE_API_KEY: "" }, []),
    /API_KEY.*required/,
  );
  assert.throws(
    () => loadConfig({ ...env, GEN_IMAGE_MODEL: undefined }, []),
    /MODEL.*required/,
  );
  const config = loadConfig(
    {
      ...env,
      GEN_IMAGE_MODEL: undefined,
      GEN_IMAGE_GEMINI_MODEL: "gemini-a,gemini-b",
    },
    [],
  );
  assert.deepEqual(config.models, []);
  assert.deepEqual(config.geminiModels, ["gemini-a", "gemini-b"]);
});

test("CLI overrides environment and keeps model order", () => {
  const config = loadConfig(env, [
    "--model=cli-first,cli-second",
    "--base-url",
    "http://localhost:8317///",
    "--timeout-ms",
    "2500",
    "--auto-fallback=true",
  ]);
  assert.deepEqual(config.models, ["cli-first", "cli-second"]);
  assert.equal(config.baseUrl, "http://localhost:8317");
  assert.equal(config.timeoutMs, 2500);
  assert.equal(config.autoFallback, true);
  assert.throws(() => loadConfig(env, ["--api-key="]), /API_KEY.*required/);
});

test("only optional operational settings have defaults", () => {
  const config = loadConfig(env, []);
  assert.equal(config.baseUrl, "https://example.test");
  assert.deepEqual(config.models, ["first", "second"]);
  assert.equal(config.timeoutMs, 120000);
  assert.equal(config.autoFallback, false);
});

test("invalid model lists, URLs, timeouts and switches fail instead of falling back", () => {
  for (const value of ["", " ", "first,", ",second", "first,first"]) {
    assert.throws(
      () => loadConfig({ ...env, GEN_IMAGE_MODEL: value }, []),
      /GEN_IMAGE_MODEL/,
    );
  }
  for (const value of [
    "file:///tmp",
    "not-a-url",
    "https:example.test",
    "https://example.test?q=1",
    "https://user:pass@example.test",
  ]) {
    assert.throws(() => loadConfig({ ...env, GEN_IMAGE_BASE_URL: value }, []));
  }
  for (const value of ["", "bad", "0", "-1", "1.5", "Infinity", "2147483648"]) {
    assert.throws(
      () => loadConfig({ ...env, GEN_IMAGE_TIMEOUT_MS: value }, []),
      /TIMEOUT_MS/,
    );
  }
  for (const value of ["", "yes", "1", "TRUE"]) {
    assert.throws(
      () => loadConfig({ ...env, GEN_IMAGE_AUTO_FALLBACK: value }, []),
      /AUTO_FALLBACK/,
    );
  }
  assert.throws(() => loadConfig(env, ["--unknown=value"]), /Unknown option/);
  assert.throws(() => loadConfig(env, ["--model"]), /argument missing/);
});
