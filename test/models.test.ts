import assert from "node:assert/strict";
import test from "node:test";
import { runWithModels } from "../dist/providers/models.js";
import { UpstreamError } from "../dist/shared/http.js";

test("explicit model with fallback disabled is the only attempted model", async () => {
  const calls: string[] = [];
  await assert.rejects(
    runWithModels(
      ["first", "second", "third"],
      "second",
      false,
      async (model) => {
        calls.push(model);
        throw new UpstreamError("unavailable");
      },
    ),
    /Model second failed/,
  );
  assert.deepEqual(calls, ["second"]);
});

test("uses first model and stops immediately after success", async () => {
  const calls: string[] = [];
  const result = await runWithModels(
    ["first", "second"],
    undefined,
    true,
    async (model) => {
      calls.push(model);
      return "image";
    },
  );
  assert.equal(result, "image");
  assert.deepEqual(calls, ["first"]);
});

test("fallback attempts each model once in order and resets on the next call", async () => {
  const calls: string[] = [];
  const generate = async (model: string) => {
    calls.push(model);
    if (model !== "third") throw new UpstreamError("unavailable");
    return "image";
  };
  for (let call = 0; call < 2; call += 1) {
    assert.equal(
      await runWithModels(
        ["first", "second", "third"],
        undefined,
        true,
        generate,
      ),
      "image",
    );
  }
  assert.deepEqual(calls, [
    "first",
    "second",
    "third",
    "first",
    "second",
    "third",
  ]);
});

test("disabled fallback returns the first error without trying another model", async () => {
  const calls: string[] = [];
  await assert.rejects(
    runWithModels(["first", "second"], undefined, false, async (model) => {
      calls.push(model);
      throw new UpstreamError("failed");
    }),
    /Model first failed: failed/,
  );
  assert.deepEqual(calls, ["first"]);
});

test("explicit model starts at that position and exhaustion returns the last error", async () => {
  const calls: string[] = [];
  await assert.rejects(
    runWithModels(
      ["first", "second", "third"],
      "second",
      true,
      async (model) => {
        calls.push(model);
        throw new UpstreamError(`${model} unavailable`);
      },
    ),
    /Model third failed: third unavailable/,
  );
  assert.deepEqual(calls, ["second", "third"]);
});

test("local errors and invalid model selections do not trigger fallback", async () => {
  let calls = 0;
  const error = new Error("Input file not found");
  const generate = async () => {
    calls += 1;
    throw error;
  };
  await assert.rejects(
    runWithModels([], undefined, true, generate),
    /No models configured/,
  );
  await assert.rejects(
    runWithModels(["first"], "unknown", true, generate),
    /not configured/,
  );
  assert.equal(calls, 0);
  await assert.rejects(
    runWithModels(["first", "second"], undefined, true, generate),
    (caught) => caught === error,
  );
  assert.equal(calls, 1);
});
