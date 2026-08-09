#!/usr/bin/env node
import { readFile, writeFile, mkdir, mkdtemp } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { loadShaderConfig } from "./config.js";
import { buildShaderObject } from "./panzoid.js";
import { renderShader } from "./renderer.js";
import { testShader } from "./tester.js";
import { validateShader } from "./validate.js";
import type { TexturePaths, UniformValues } from "./types.js";

const valueSchema = z.union([
  z.number(),
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number()]),
]);

const sourceFields = {
  shaderPath: z.string().optional().describe("Path to a Panzoid fragment shader."),
  shaderSource: z.string().optional().describe("Inline Panzoid fragment shader source."),
  configPath: z.string().optional().describe("Optional JSON config path for nonstandard defaults or bounds."),
};

const previewFields = {
  inputImagePath: z.string().optional(),
  texturePaths: z.record(z.string(), z.string()).optional(),
  width: z.number().int().positive().default(960),
  height: z.number().int().positive().default(540),
  uvScale: z.tuple([z.number(), z.number()]).default([1, 1]),
  alphaChecker: z.boolean().default(false),
};

const renderFields = {
  ...previewFields,
  values: z.record(z.string(), valueSchema).optional(),
};

async function loadSource(shaderPath?: string, shaderSource?: string): Promise<string> {
  if (shaderSource !== undefined) return shaderSource;
  if (shaderPath) return readFile(shaderPath, "utf8");
  throw new Error("Provide shaderPath or shaderSource.");
}

async function writeJson(path: string, value: unknown): Promise<string> {
  const outputPath = resolve(path);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`);
  return outputPath;
}

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function createServer(): McpServer {
  const server = new McpServer(
    { name: "agent-shader", version: "0.1.2" },
    { capabilities: { tools: {} } },
  );

  server.registerTool(
    "validate_shader",
    {
      title: "Validate Panzoid shader",
      description: "Validate Panzoid GLSL conventions before building or rendering.",
      inputSchema: z.object(sourceFields),
    },
    async ({ shaderPath, shaderSource }) => {
      const source = await loadSource(shaderPath, shaderSource);
      const diagnostics = validateShader(source);
      return textResult({
        valid: !diagnostics.some((item) => item.severity === "error"),
        diagnostics,
      });
    },
  );

  server.registerTool(
    "build_shader_object",
    {
      title: "Build Panzoid Shader Object",
      description: "Build Panzoid Shader Object JSON only after validation, WebGL 1 rendering, and the visible-default check pass.",
      inputSchema: z.object({
        ...sourceFields,
        ...previewFields,
        outputPath: z.string().optional().describe("Optional JSON output path."),
      }),
    },
    async ({ shaderPath, shaderSource, configPath, outputPath, inputImagePath, texturePaths, width, height, uvScale, alphaChecker }) => {
      const source = await loadSource(shaderPath, shaderSource);
      const config = await loadShaderConfig(configPath);
      const result = buildShaderObject(source, config);
      if (result.diagnostics.some((item) => item.severity === "error")) {
        return textResult({ built: false, verified: false, parameters: result.parameters, diagnostics: result.diagnostics });
      }
      const directory = await mkdtemp(join(tmpdir(), "agent-shader-build-"));
      const report = await testShader(source, config, {
        outputDirectory: directory,
        inputImagePath,
        texturePaths: texturePaths as TexturePaths | undefined,
        width,
        height,
        uvScale,
        background: alphaChecker ? "alpha-checker" : "checker",
      });
      const writtenPath = outputPath && report.passed ? await writeJson(outputPath, result.shaderObject) : undefined;
      const payload = {
        built: report.passed,
        verified: report.passed,
        outputPath: writtenPath,
        parameters: result.parameters,
        diagnostics: result.diagnostics,
        report,
        shaderObject: report.passed && !writtenPath ? result.shaderObject : undefined,
      };
      const content: Array<
        { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
      > = [{ type: "text", text: JSON.stringify(payload, null, 2) }];
      const imagePath = report.defaultRender?.outputPath;
      if (report.passed && imagePath) {
        const image = await readFile(imagePath);
        content.push({ type: "image", data: image.toString("base64"), mimeType: "image/png" });
      }
      return { content };
    },
  );

  server.registerTool(
    "render_shader",
    {
      title: "Render Panzoid shader",
      description: "Compile and render a Panzoid shader in Chromium WebGL 1 and return a PNG.",
      inputSchema: z.object({
        ...sourceFields,
        outputPath: z.string().optional(),
        ...renderFields,
      }),
    },
    async ({ shaderPath, shaderSource, configPath, outputPath, inputImagePath, texturePaths, width, height, uvScale, values, alphaChecker }) => {
      const source = await loadSource(shaderPath, shaderSource);
      const config = await loadShaderConfig(configPath);
      let renderPath = outputPath;
      if (!renderPath) {
        const directory = await mkdtemp(join(tmpdir(), "agent-shader-"));
        renderPath = join(directory, "render.png");
      }
      const result = await renderShader(source, config, {
        outputPath: renderPath,
        inputImagePath,
        width,
        height,
        uvScale,
        values: values as UniformValues | undefined,
        texturePaths: texturePaths as TexturePaths | undefined,
        background: alphaChecker ? "alpha-checker" : "checker",
      });
      const image = await readFile(renderPath);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify(result, null, 2) },
          { type: "image" as const, data: image.toString("base64"), mimeType: "image/png" },
        ],
      };
    },
  );

  server.registerTool(
    "test_shader",
    {
      title: "Test Panzoid shader",
      description: "Run validation, WebGL 1 rendering, PNG output, and a visible-default check.",
      inputSchema: z.object({
        ...sourceFields,
        outputDirectory: z.string().optional(),
        ...renderFields,
      }),
    },
    async ({ shaderPath, shaderSource, configPath, outputDirectory, inputImagePath, texturePaths, width, height, uvScale, values, alphaChecker }) => {
      const source = await loadSource(shaderPath, shaderSource);
      const config = await loadShaderConfig(configPath);
      const directory = outputDirectory ?? await mkdtemp(join(tmpdir(), "agent-shader-test-"));
      const report = await testShader(source, config, {
        outputDirectory: directory,
        inputImagePath,
        width,
        height,
        uvScale,
        values: values as UniformValues | undefined,
        texturePaths: texturePaths as TexturePaths | undefined,
        background: alphaChecker ? "alpha-checker" : "checker",
      });
      const imagePath = report.defaultRender?.outputPath;
      const content: Array<
        { type: "text"; text: string } | { type: "image"; data: string; mimeType: string }
      > = [{ type: "text", text: JSON.stringify(report, null, 2) }];
      if (imagePath) {
        const image = await readFile(imagePath);
        content.push({ type: "image", data: image.toString("base64"), mimeType: "image/png" });
      }
      return { content };
    },
  );

  return server;
}

serveStdio(createServer);
