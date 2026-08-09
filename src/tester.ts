import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildShaderObject } from "./panzoid.js";
import { renderShader } from "./renderer.js";
import type {
  OpacityZeroCheck,
  ProgressRender,
  RgbaColor,
  RenderOptions,
  ShaderConfig,
  TestInputName,
  TestInputRender,
  TestReport,
} from "./types.js";

const passthroughSource = `precision highp float;
precision highp int;

uniform sampler2D tDiffuse;
varying vec2 vUvScaled;

void main()
{
  vec4 texel = texture2D(tDiffuse, vUvScaled);
  float outputAlpha = clamp(texel.a, 0.0, 1.0);
  gl_FragColor = vec4(texel.rgb * outputAlpha, outputAlpha);
}`;

const testInputs: Array<{ name: TestInputName; color?: RgbaColor }> = [
  { name: "xy-grid" },
  { name: "opaque-black", color: [0, 0, 0, 1] },
  { name: "transparent-black", color: [0, 0, 0, 0] },
  { name: "semi-transparent-color", color: [0.2, 0.5, 0.8, 0.25] },
];

const progressValues = [0, 0.1, 0.35, 0.65, 0.9, 1];

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
  const inputRenders: TestInputRender[] = [];
  for (const input of testInputs) {
    const stem = input.name === "xy-grid" ? "default" : input.name;
    const render = await renderShader(source, config, {
      ...options,
      inputImagePath: undefined,
      inputColor: input.color,
      outputPath: join(outputDirectory, `${stem}.png`),
      rgbOnlyOutputPath: join(outputDirectory, `${stem}-rgb-only.png`),
    });
    inputRenders.push({ name: input.name, inputColor: input.color, render });
  }
  const defaultRender = inputRenders[0].render;
  const inputRender = await renderShader(passthroughSource, {}, {
    ...options,
    inputImagePath: undefined,
    inputColor: undefined,
    outputPath: undefined,
    rgbOnlyOutputPath: undefined,
  });
  const defaultEffectCheck = {
    defaultHash: defaultRender.pixelSummary.hash,
    inputHash: inputRender.pixelSummary.hash,
    passed: defaultRender.pixelSummary.hash !== inputRender.pixelSummary.hash,
  };

  const transparentRender = inputRenders.find((item) => item.name === "transparent-black")?.render;
  const semiTransparentRender = inputRenders.find((item) => item.name === "semi-transparent-color")?.render;
  if (!transparentRender || !semiTransparentRender) throw new Error("Required alpha test renders are missing.");
  const premultipliedAlphaCheck = {
    hiddenRgbPixels: transparentRender.pixelSummary.hiddenRgbPixels,
    rgbExceedsAlphaPixels:
      transparentRender.pixelSummary.rgbExceedsAlphaPixels +
      semiTransparentRender.pixelSummary.rgbExceedsAlphaPixels,
    passed:
      transparentRender.pixelSummary.hiddenRgbPixels === 0 &&
      transparentRender.pixelSummary.rgbExceedsAlphaPixels === 0 &&
      semiTransparentRender.pixelSummary.rgbExceedsAlphaPixels === 0,
  };

  const hasOpacity = build.parameters.some((parameter) => parameter.name === "Opacity" && parameter.type === "float");
  let opacityZeroCheck: OpacityZeroCheck = { applicable: false, passed: true };
  if (hasOpacity) {
    const mismatchedInputs: TestInputName[] = [];
    let outputHash: string | undefined;
    let inputHash: string | undefined;
    for (const input of testInputs) {
      const opacityZeroRender = await renderShader(source, config, {
        ...options,
        inputImagePath: undefined,
        inputColor: input.color,
        outputPath: undefined,
        rgbOnlyOutputPath: undefined,
        values: { ...(options.values ?? {}), Opacity: 0 },
      });
      const opacityZeroInput = await renderShader(passthroughSource, {}, {
        ...options,
        inputImagePath: undefined,
        inputColor: input.color,
        outputPath: undefined,
        rgbOnlyOutputPath: undefined,
      });
      if (input.name === "transparent-black") {
        outputHash = opacityZeroRender.pixelSummary.hash;
        inputHash = opacityZeroInput.pixelSummary.hash;
      }
      if (opacityZeroRender.pixelSummary.hash !== opacityZeroInput.pixelSummary.hash) {
        mismatchedInputs.push(input.name);
      }
    }
    opacityZeroCheck = {
      applicable: true,
      outputHash,
      inputHash,
      mismatchedInputs,
      passed: mismatchedInputs.length === 0,
    };
  }

  const hasProgress = build.parameters.some((parameter) => parameter.name === "Progress" && parameter.type === "float");
  const progressRenders: ProgressRender[] = [];
  if (hasProgress) {
    for (const progress of progressValues) {
      const stem = `progress-${progress.toFixed(2).replace(".", "-")}`;
      const render = await renderShader(source, config, {
        ...options,
        inputImagePath: undefined,
        inputColor: [0, 0, 0, 0],
        outputPath: join(outputDirectory, `${stem}.png`),
        rgbOnlyOutputPath: join(outputDirectory, `${stem}-rgb-only.png`),
        values: { ...(options.values ?? {}), Progress: progress },
      });
      progressRenders.push({ progress, render });
    }
  }
  const progressPremultiplied = progressRenders.every(
    ({ render }) =>
      render.pixelSummary.hiddenRgbPixels === 0 &&
      render.pixelSummary.rgbExceedsAlphaPixels === 0,
  );
  const report: TestReport = {
    passed:
      defaultEffectCheck.passed &&
      premultipliedAlphaCheck.passed &&
      opacityZeroCheck.passed &&
      progressPremultiplied,
    diagnostics: build.diagnostics,
    defaultRender,
    defaultEffectCheck,
    inputRenders,
    premultipliedAlphaCheck,
    opacityZeroCheck,
    ...(progressRenders.length === 0 ? {} : { progressRenders }),
  };
  await writeFile(join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
