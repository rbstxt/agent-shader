import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildShaderObject } from "./panzoid.js";
import { renderShader } from "./renderer.js";
import type {
  BoundaryCheck,
  ParameterSpec,
  RenderOptions,
  ScalarOrVector,
  ShaderConfig,
  TestReport,
} from "./types.js";

function outsideValue(value: ScalarOrVector, direction: -1 | 1): ScalarOrVector {
  const outside = (item: number) => item + direction * Math.max(1, Math.abs(item));
  if (typeof value === "number") return outside(value);
  if (value.length === 2) return [outside(value[0]), outside(value[1])];
  return [outside(value[0]), outside(value[1]), outside(value[2])];
}

function boundaryValue(parameter: ParameterSpec, boundary: "min" | "max"): ScalarOrVector | undefined {
  return parameter[boundary];
}

export async function testShader(
  source: string,
  config: ShaderConfig = {},
  options: RenderOptions & { outputDirectory?: string } = {},
): Promise<TestReport> {
  const build = buildShaderObject(source, config);
  const errors = build.diagnostics.filter((item) => item.severity === "error");
  if (errors.length > 0) {
    return { passed: false, diagnostics: build.diagnostics, boundaryChecks: [] };
  }

  const outputDirectory = resolve(options.outputDirectory ?? "shader-test-output");
  await mkdir(outputDirectory, { recursive: true });
  const defaultRender = await renderShader(source, config, {
    ...options,
    outputPath: join(outputDirectory, "default.png"),
  });
  const boundaryChecks: BoundaryCheck[] = [];

  for (const parameter of build.parameters) {
    for (const boundary of ["min", "max"] as const) {
      const value = boundaryValue(parameter, boundary);
      if (value === undefined) continue;
      const direction = boundary === "min" ? -1 : 1;
      const boundaryRender = await renderShader(source, config, {
        ...options,
        outputPath: undefined,
        values: { ...(options.values ?? {}), [parameter.name]: value },
      });
      const outsideRender = await renderShader(source, config, {
        ...options,
        outputPath: undefined,
        values: { ...(options.values ?? {}), [parameter.name]: outsideValue(value, direction) },
      });
      boundaryChecks.push({
        parameter: parameter.name,
        boundary,
        boundaryHash: boundaryRender.pixelSummary.hash,
        outsideHash: outsideRender.pixelSummary.hash,
        passed: boundaryRender.pixelSummary.hash === outsideRender.pixelSummary.hash,
      });
    }
  }

  const report: TestReport = {
    passed: boundaryChecks.every((check) => check.passed),
    diagnostics: build.diagnostics,
    defaultRender,
    boundaryChecks,
  };
  await writeFile(join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
