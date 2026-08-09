import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderShader } from "../src/renderer.js";
import { testShader } from "../src/tester.js";

const sourcePath = resolve("fixtures/circle.glsl");

test("renders the shader in WebGL 1", async () => {
  const source = await readFile(sourcePath, "utf8");
  const outputPath = join(process.cwd(), ".test-output", "circle.png");
  const result = await renderShader(source, {}, { width: 320, height: 180, outputPath });
  assert.equal(result.width, 320);
  assert.equal(result.height, 180);
  assert.match(result.pixelSummary.hash, /^[0-9a-f]{16}$/);
  assert.ok((await stat(outputPath)).size > 100);
});

test("verifies that defaults visibly demonstrate the effect", async () => {
  const source = await readFile(sourcePath, "utf8");
  const report = await testShader(source, {}, {
    width: 160,
    height: 90,
    outputDirectory: join(process.cwd(), ".test-output", "report"),
  });
  assert.equal(report.passed, true);
  assert.equal(report.defaultEffectCheck?.passed, true);
});

test("renders a custom sampler2D with the bundled landscape", async () => {
  const source = await readFile(resolve("fixtures/texture-blend.glsl"), "utf8");
  const config = JSON.parse(await readFile(resolve("fixtures/texture-blend.config.json"), "utf8"));
  const report = await testShader(source, config, {
    width: 160,
    height: 90,
    outputDirectory: join(process.cwd(), ".test-output", "texture-report"),
  });
  assert.equal(report.passed, true);
  assert.equal(report.defaultEffectCheck?.passed, true);
});

test("renders GL_OES_standard_derivatives and supported preprocessor directives", async () => {
  const source = await readFile(resolve("fixtures/derivatives.glsl"), "utf8");
  const report = await testShader(source, {}, {
    width: 160,
    height: 90,
    outputDirectory: join(process.cwd(), ".test-output", "derivatives-report"),
  });
  assert.equal(report.passed, true);
  assert.equal(report.defaultEffectCheck?.passed, true);
});
