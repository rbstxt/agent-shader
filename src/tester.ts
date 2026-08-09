import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildShaderObject } from "./panzoid.js";
import { renderShader } from "./renderer.js";
import type {
  RenderOptions,
  ShaderConfig,
  TestReport,
} from "./types.js";

const passthroughSource = `precision highp float;
precision highp int;

uniform sampler2D tDiffuse;
varying vec2 vUvScaled;

void main()
{
  vec4 texel = texture2D(tDiffuse, vUvScaled);
  gl_FragColor = texel;
}`;

export async function testShader(
  source: string,
  config: ShaderConfig = {},
  options: RenderOptions & { outputDirectory?: string } = {},
): Promise<TestReport> {
  const build = buildShaderObject(source, config);
  const errors = build.diagnostics.filter((item) => item.severity === "error");
  if (errors.length > 0) {
    return { passed: false, diagnostics: build.diagnostics };
  }

  const outputDirectory = resolve(options.outputDirectory ?? "shader-test-output");
  await mkdir(outputDirectory, { recursive: true });
  const defaultRender = await renderShader(source, config, {
    ...options,
    outputPath: join(outputDirectory, "default.png"),
  });
  const inputRender = await renderShader(passthroughSource, {}, {
    ...options,
    outputPath: undefined,
  });
  const defaultEffectCheck = {
    defaultHash: defaultRender.pixelSummary.hash,
    inputHash: inputRender.pixelSummary.hash,
    passed: defaultRender.pixelSummary.hash !== inputRender.pixelSummary.hash,
  };
  const report: TestReport = {
    passed: defaultEffectCheck.passed,
    diagnostics: build.diagnostics,
    defaultRender,
    defaultEffectCheck,
  };
  await writeFile(join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
