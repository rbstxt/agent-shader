import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { validateShader } from "../src/validate.js";

test("accepts the circle fixture", async () => {
  const source = await readFile(resolve("fixtures/circle.frag"), "utf8");
  assert.equal(validateShader(source).filter((item) => item.severity === "error").length, 0);
});

test("rejects u-prefixed parameters and comments", async () => {
  const source = await readFile(resolve("fixtures/circle.frag"), "utf8");
  const invalid = source.replace("uniform float Opacity;", "uniform float uOpacity;\n// bad");
  const codes = validateShader(invalid).map((item) => item.code);
  assert.ok(codes.includes("uniform-prefix"));
  assert.ok(codes.includes("comments"));
});
