import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { inferParameters } from "./uniforms.js";
import type {
  RenderOptions,
  RenderResult,
  ScalarOrVector,
  ShaderConfig,
  UniformValues,
} from "./types.js";

function mimeType(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  return "image/png";
}

async function imageDataUrl(path?: string): Promise<string | undefined> {
  if (!path) return undefined;
  const data = await readFile(path);
  return `data:${mimeType(path)};base64,${data.toString("base64")}`;
}

async function bundledSampleDataUrl(name: string): Promise<string | undefined> {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(moduleDirectory, "../../samples", name),
    resolve(moduleDirectory, "../samples", name),
  ];
  for (const candidate of candidates) {
    try {
      return await imageDataUrl(candidate);
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
  }
  return undefined;
}

export async function renderShader(
  source: string,
  config: ShaderConfig = {},
  options: RenderOptions = {},
): Promise<RenderResult> {
  const width = options.width ?? 960;
  const height = options.height ?? 540;
  const uvScale = options.uvScale ?? [1, 1];
  const inferred = inferParameters(source, config);
  const errors = inferred.diagnostics.filter((item) => item.severity === "error");
  if (errors.length > 0) throw new Error(errors.map((item) => item.message).join("\n"));

  const defaults: UniformValues = Object.fromEntries(
    inferred.parameters
      .filter((parameter) => parameter.type !== "sampler2D" && parameter.default !== null)
      .map((parameter) => [parameter.name, parameter.default as ScalarOrVector]),
  );
  const values = { ...defaults, ...(options.values ?? {}) };
  const inputDataUrl = options.inputColor
    ? undefined
    : await imageDataUrl(options.inputImagePath) ?? await bundledSampleDataUrl("xy-grid.png");
  const defaultTextureDataUrl = await bundledSampleDataUrl("landscape.jpg") ?? inputDataUrl;
  const textureDataUrls: Record<string, string | undefined> = {};
  for (const parameter of inferred.parameters) {
    if (parameter.type !== "sampler2D") continue;
    textureDataUrls[parameter.name] = options.texturePaths?.[parameter.name]
      ? await imageDataUrl(options.texturePaths[parameter.name])
      : defaultTextureDataUrl;
  }
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
  });

  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(`<canvas id="shader" width="${width}" height="${height}"></canvas>`);
    const pixelSummary = await page.evaluate(
      async ({ fragmentSource, width, height, uvScale, uniforms, declarations, inputDataUrl, inputColor, textureDataUrls, background }) => {
        const canvas = document.getElementById("shader") as HTMLCanvasElement;
        const gl = canvas.getContext("webgl", {
          alpha: true,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: true,
        });
        if (!gl) throw new Error("WebGL 1 is unavailable in Chromium.");
        if (/^[ \t]*#\s*extension\s+GL_OES_standard_derivatives\s*:\s*require\s*$/m.test(fragmentSource)) {
          if (!gl.getExtension("OES_standard_derivatives")) {
            throw new Error("OES_standard_derivatives is unavailable in Chromium WebGL 1.");
          }
        }

        const vertexSource = `precision highp float;
attribute vec3 position;
attribute vec2 uv;
uniform vec2 uvScale;
uniform mat4 projectionMatrix;
uniform mat4 modelViewMatrix;
varying vec2 vUv;
varying vec2 vUvScaled;
varying vec2 bgCoord;
void main()
{
  vUv = uv;
  vUvScaled = uv * uvScale;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  bgCoord = gl_Position.xy * 0.5 + 0.5;
}`;

        const compile = (type: number, shaderSource: string) => {
          const shader = gl.createShader(type);
          if (!shader) throw new Error("Unable to create WebGL shader.");
          gl.shaderSource(shader, shaderSource);
          gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(shader) ?? "Unknown shader compile error.";
            gl.deleteShader(shader);
            throw new Error(log);
          }
          return shader;
        };

        const vertexShader = compile(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = compile(gl.FRAGMENT_SHADER, fragmentSource);
        const program = gl.createProgram();
        if (!program) throw new Error("Unable to create WebGL program.");
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
          throw new Error(gl.getProgramInfoLog(program) ?? "Unknown shader link error.");
        }
        gl.useProgram(program);

        const bindAttribute = (name: string, size: number, data: number[]) => {
          const location = gl.getAttribLocation(program, name);
          if (location < 0) return;
          const buffer = gl.createBuffer();
          gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
          gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
          gl.enableVertexAttribArray(location);
          gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
        };

        bindAttribute("position", 3, [
          -1, -1, 0,
          1, -1, 0,
          -1, 1, 0,
          -1, 1, 0,
          1, -1, 0,
          1, 1, 0,
        ]);
        bindAttribute("uv", 2, [
          0, 0,
          1, 0,
          0, 1,
          0, 1,
          1, 0,
          1, 1,
        ]);

        const identity = new Float32Array([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1,
        ]);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "projectionMatrix"), false, identity);
        gl.uniformMatrix4fv(gl.getUniformLocation(program, "modelViewMatrix"), false, identity);
        gl.uniform2f(gl.getUniformLocation(program, "uvScale"), uvScale[0], uvScale[1]);

        const bindTexture = async (unit: number, dataUrl?: string, solidColor?: [number, number, number, number]) => {
          const texture = gl.createTexture();
          gl.activeTexture(gl.TEXTURE0 + unit);
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
          if (solidColor) {
            const pixel = new Uint8Array(solidColor.map((value) => Math.round(Math.min(1, Math.max(0, value)) * 255)));
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          } else if (dataUrl) {
            const image = await new Promise<HTMLImageElement>((resolveImage, rejectImage) => {
              const item = new Image();
              item.onload = () => resolveImage(item);
              item.onerror = () => rejectImage(new Error("Unable to decode input image."));
              item.src = dataUrl;
            });
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          } else {
            const size = 64;
            const pixels = new Uint8Array(size * size * 4);
            for (let y = 0; y < size; y += 1) {
              for (let x = 0; x < size; x += 1) {
                const offset = (y * size + x) * 4;
                const light = ((x >> 3) + (y >> 3)) % 2 === 0;
                pixels[offset] = light ? 220 : 48;
                pixels[offset + 1] = light ? 224 : 54;
                pixels[offset + 2] = light ? 232 : 68;
                pixels[offset + 3] = background === "alpha-checker" && !light ? 96 : 255;
              }
            }
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          }
        };

        await bindTexture(0, inputDataUrl, inputColor);
        gl.uniform1i(gl.getUniformLocation(program, "tDiffuse"), 0);

        let textureUnit = 1;
        for (const declaration of declarations) {
          const location = gl.getUniformLocation(program, declaration.name);
          if (location === null) continue;
          if (declaration.type === "sampler2D") {
            await bindTexture(textureUnit, textureDataUrls[declaration.name]);
            gl.uniform1i(location, textureUnit);
            textureUnit += 1;
            continue;
          }
          const value = uniforms[declaration.name] as number | number[] | undefined;
          if (value === undefined) continue;
          if (declaration.type === "float") gl.uniform1f(location, value as number);
          if (declaration.type === "vec2") {
            const vector = value as number[];
            gl.uniform2f(location, vector[0], vector[1]);
          }
          if (declaration.type === "vec3") {
            const vector = value as number[];
            gl.uniform3f(location, vector[0], vector[1], vector[2]);
          }
        }

        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.finish();
        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        const sums = [0, 0, 0, 0];
        const minimum = [255, 255, 255, 255];
        const maximum = [0, 0, 0, 0];
        let nonTransparentPixels = 0;
        let transparentPixels = 0;
        let hiddenRgbPixels = 0;
        let rgbExceedsAlphaPixels = 0;
        let maxRgbAtZeroAlpha = 0;
        for (let index = 0; index < pixels.length; index += 4) {
          for (let channel = 0; channel < 4; channel += 1) {
            const value = pixels[index + channel];
            sums[channel] += value;
            minimum[channel] = Math.min(minimum[channel], value);
            maximum[channel] = Math.max(maximum[channel], value);
          }
          const alpha = pixels[index + 3];
          const maxRgb = Math.max(pixels[index], pixels[index + 1], pixels[index + 2]);
          if (alpha > 0) nonTransparentPixels += 1;
          if (alpha === 0) {
            transparentPixels += 1;
            maxRgbAtZeroAlpha = Math.max(maxRgbAtZeroAlpha, maxRgb);
            if (maxRgb > 0) hiddenRgbPixels += 1;
          }
          if (maxRgb > alpha + 1) rgbExceedsAlphaPixels += 1;
        }
        let hashA = 2166136261;
        let hashB = 2654435761;
        for (const value of pixels) {
          hashA = Math.imul(hashA ^ value, 16777619) >>> 0;
          hashB = Math.imul(hashB ^ value, 3266489917) >>> 0;
        }
        const hash = `${hashA.toString(16).padStart(8, "0")}${hashB.toString(16).padStart(8, "0")}`;
        const diagnosticCanvas = document.createElement("canvas");
        diagnosticCanvas.id = "rgb-diagnostic";
        diagnosticCanvas.width = width;
        diagnosticCanvas.height = height;
        const diagnosticContext = diagnosticCanvas.getContext("2d");
        if (!diagnosticContext) throw new Error("Unable to create RGB diagnostic canvas.");
        const diagnosticImage = diagnosticContext.createImageData(width, height);
        for (let y = 0; y < height; y += 1) {
          const targetY = height - 1 - y;
          for (let x = 0; x < width; x += 1) {
            const sourceOffset = (y * width + x) * 4;
            const targetOffset = (targetY * width + x) * 4;
            diagnosticImage.data[targetOffset] = pixels[sourceOffset];
            diagnosticImage.data[targetOffset + 1] = pixels[sourceOffset + 1];
            diagnosticImage.data[targetOffset + 2] = pixels[sourceOffset + 2];
            diagnosticImage.data[targetOffset + 3] = 255;
          }
        }
        diagnosticContext.putImageData(diagnosticImage, 0, 0);
        document.body.appendChild(diagnosticCanvas);
        const pixelCount = width * height;
        return {
          hash,
          mean: sums.map((value) => value / pixelCount) as [number, number, number, number],
          minimum: minimum as [number, number, number, number],
          maximum: maximum as [number, number, number, number],
          nonTransparentPixels,
          transparentPixels,
          hiddenRgbPixels,
          rgbExceedsAlphaPixels,
          maxRgbAtZeroAlpha,
        };
      },
      {
        fragmentSource: source,
        width,
        height,
        uvScale,
        uniforms: values as Record<string, ScalarOrVector>,
        declarations: inferred.parameters.map(({ name, type }) => ({ name, type })),
        inputDataUrl,
        inputColor: options.inputColor,
        textureDataUrls,
        background: options.background ?? "checker",
      },
    );

    let outputPath: string | undefined;
    if (options.outputPath) {
      outputPath = resolve(options.outputPath);
      await mkdir(dirname(outputPath), { recursive: true });
      await page.locator("#shader").screenshot({ path: outputPath, type: "png" });
    }

    let rgbOnlyOutputPath: string | undefined;
    if (options.rgbOnlyOutputPath) {
      rgbOnlyOutputPath = resolve(options.rgbOnlyOutputPath);
      await mkdir(dirname(rgbOnlyOutputPath), { recursive: true });
      await page.locator("#rgb-diagnostic").screenshot({ path: rgbOnlyOutputPath, type: "png" });
    }

    return { width, height, outputPath, rgbOnlyOutputPath, pixelSummary };
  } finally {
    await browser.close();
  }
}
