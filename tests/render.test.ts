import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { renderShader } from "../src/renderer.js";
import { testShader } from "../src/tester.js";

const sourcePath = resolve("fixtures/circle.frag");

test("renders the shader in WebGL 1", async () => {
  const source = await readFile(sourcePath, "utf8");
  const outputPath = join(process.cwd(), ".test-output", "circle.png");
  const result = await renderShader(source, {}, { width: 320, height: 180, outputPath });
  assert.equal(result.width, 320);
  assert.equal(result.height, 180);
  assert.match(result.pixelSummary.hash, /^[0-9a-f]{16}$/);
  assert.ok((await stat(outputPath)).size > 100);
});

test("proves declared bounds are visually saturated", async () => {
  const source = await readFile(sourcePath, "utf8");
  const report = await testShader(source, {}, {
    width: 160,
    height: 90,
    outputDirectory: join(process.cwd(), ".test-output", "report"),
  });
  assert.equal(report.passed, true);
  assert.deepEqual(
    report.boundaryChecks.map((item) => [item.parameter, item.boundary, item.passed]),
    [["Opacity", "min", true], ["Opacity", "max", true]],
  );
});
