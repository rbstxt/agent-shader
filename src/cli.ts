#!/usr/bin/env node
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { loadShaderConfig } from "./config.js";
import { withInferredShaderName } from "./naming.js";
import { buildShaderObject } from "./panzoid.js";
import { renderShader } from "./renderer.js";
import { testShader } from "./tester.js";
import { validateShader } from "./validate.js";
import type { RgbaColor, TexturePaths, UniformValues } from "./types.js";

interface ParsedArguments {
  command?: string;
  positionals: string[];
  options: Record<string, string>;
}

function parseArguments(argv: string[]): ParsedArguments {
  const result: ParsedArguments = { command: argv[0], positionals: [], options: {} };
  for (let index = 1; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith("--")) {
      const name = item.slice(2);
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for --${name}.`);
      result.options[name] = value;
      index += 1;
    } else {
      result.positionals.push(item);
    }
  }
  return result;
}

function usage(): string {
  return [
    "agent-shader mcp",
    "agent-shader install-browser",
    "agent-shader build <shader.glsl> --out <shader.json> [--config <config.json>] [--textures <textures.json>]",
    "agent-shader validate <shader.glsl>",
    "agent-shader render <shader.glsl> --out <render.png> [--rgb-only <diagnostic.png>] [--values <values.json>] [--textures <textures.json>] [--input <image> | --input-color r,g,b,a]",
    "agent-shader test <shader.glsl> --out-dir <directory> [--config <config.json>] [--textures <textures.json>]",
  ].join("\n");
}

async function installBrowser(): Promise<void> {
  const require = createRequire(import.meta.url);
  const playwrightDirectory = dirname(require.resolve("playwright/package.json"));
  const playwrightCli = resolve(playwrightDirectory, "cli.js");
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(process.execPath, [playwrightCli, "install", "chromium"], {
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
  if (exitCode !== 0) throw new Error(`Playwright browser installation exited with code ${exitCode}.`);
}

function parseUvScale(value?: string): [number, number] | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map(Number);
  if (parts.length !== 2 || parts.some((item) => !Number.isFinite(item))) {
    throw new Error("--uv-scale must be two comma-separated numbers.");
  }
  return [parts[0], parts[1]];
}

function parseInputColor(value?: string): RgbaColor | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map(Number);
  if (parts.length !== 4 || parts.some((item) => !Number.isFinite(item))) {
    throw new Error("--input-color must be four comma-separated numbers.");
  }
  return [parts[0], parts[1], parts[2], parts[3]];
}

async function loadValues(path?: string): Promise<UniformValues | undefined> {
  if (!path) return undefined;
  const text = path.trim().startsWith("{") ? path : await readFile(path, "utf8");
  return JSON.parse(text) as UniformValues;
}

async function loadTextures(path?: string): Promise<TexturePaths | undefined> {
  if (!path) return undefined;
  const text = path.trim().startsWith("{") ? path : await readFile(path, "utf8");
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("--textures must be a JSON object mapping sampler2D uniform names to image paths.");
  }
  for (const [name, value] of Object.entries(parsed)) {
    if (typeof value !== "string") throw new Error(`Texture path for ${name} must be a string.`);
  }
  return parsed as TexturePaths;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`);
}

async function main(): Promise<void> {
  const parsed = parseArguments(process.argv.slice(2));
  if (!parsed.command) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
    return;
  }

  if (parsed.command === "mcp") {
    await import("./mcp.js");
    return;
  }

  if (parsed.command === "install-browser") {
    await installBrowser();
    return;
  }

  const shaderPath = parsed.positionals[0];
  if (!shaderPath) {
    process.stderr.write(`${usage()}\n`);
    process.exitCode = 2;
    return;
  }

  const source = await readFile(shaderPath, "utf8");
  const config = withInferredShaderName(
    await loadShaderConfig(parsed.options.config),
    shaderPath,
    parsed.options.config,
  );
  const width = parsed.options.width ? Number(parsed.options.width) : undefined;
  const height = parsed.options.height ? Number(parsed.options.height) : undefined;
  const values = await loadValues(parsed.options.values);
  const texturePaths = await loadTextures(parsed.options.textures);
  const uvScale = parseUvScale(parsed.options["uv-scale"]);
  const inputColor = parseInputColor(parsed.options["input-color"]);
  if (parsed.options.input && inputColor) throw new Error("Use either --input or --input-color, not both.");

  if (parsed.command === "validate") {
    const diagnostics = validateShader(source);
    process.stdout.write(`${JSON.stringify({ valid: !diagnostics.some((item) => item.severity === "error"), diagnostics }, null, 2)}\n`);
    if (diagnostics.some((item) => item.severity === "error")) process.exitCode = 1;
    return;
  }

  if (parsed.command === "build") {
    if (!parsed.options.out) throw new Error("build requires --out.");
    const result = buildShaderObject(source, config);
    if (result.diagnostics.some((item) => item.severity === "error")) {
      process.stdout.write(`${JSON.stringify({ built: false, diagnostics: result.diagnostics }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    const testDirectory = await mkdtemp(join(tmpdir(), "agent-shader-build-"));
    const report = await testShader(source, config, {
      outputDirectory: testDirectory,
      inputImagePath: parsed.options.input,
      width,
      height,
      texturePaths,
      uvScale,
      background: parsed.options.background === "alpha-checker" ? "alpha-checker" : "checker",
    });
    if (!report.passed) {
      process.stdout.write(`${JSON.stringify({ built: false, verified: false, diagnostics: result.diagnostics, report }, null, 2)}\n`);
      process.exitCode = 1;
      return;
    }
    await writeJson(parsed.options.out, result.shaderObject);
    process.stdout.write(`${JSON.stringify({ built: true, verified: true, outputPath: resolve(parsed.options.out), parameters: result.parameters, diagnostics: result.diagnostics, report }, null, 2)}\n`);
    return;
  }

  if (parsed.command === "render") {
    if (!parsed.options.out) throw new Error("render requires --out.");
    const result = await renderShader(source, config, {
      outputPath: parsed.options.out,
      rgbOnlyOutputPath: parsed.options["rgb-only"],
      inputImagePath: parsed.options.input,
      inputColor,
      width,
      height,
      values,
      texturePaths,
      uvScale,
      background: parsed.options.background === "alpha-checker" ? "alpha-checker" : "checker",
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  if (parsed.command === "test") {
    const result = await testShader(source, config, {
      outputDirectory: parsed.options["out-dir"],
      inputImagePath: parsed.options.input,
      width,
      height,
      values,
      texturePaths,
      uvScale,
      background: parsed.options.background === "alpha-checker" ? "alpha-checker" : "checker",
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.passed) process.exitCode = 1;
    return;
  }

  throw new Error(`Unknown command: ${parsed.command}\n${usage()}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
