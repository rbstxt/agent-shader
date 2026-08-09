import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
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
    inferred.parameters.map((parameter) => [parameter.name, parameter.default]),
  );
  const values = { ...defaults, ...(options.values ?? {}) };
  const inputDataUrl = await imageDataUrl(options.inputImagePath);
  const browser = await chromium.launch({
    headless: true,
    args: ["--enable-webgl", "--ignore-gpu-blocklist", "--use-angle=swiftshader"],
  });

  try {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(`<canvas id="shader" width="${width}" height="${height}"></canvas>`);
    const pixelSummary = await page.evaluate(
      async ({ fragmentSource, width, height, uvScale, uniforms, declarations, inputDataUrl, background }) => {
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

        const texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);

        if (inputDataUrl) {
          const image = await new Promise<HTMLImageElement>((resolveImage, rejectImage) => {
            const item = new Image();
            item.onload = () => resolveImage(item);
            item.onerror = () => rejectImage(new Error("Unable to decode input image."));
            item.src = inputDataUrl;
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
        gl.uniform1i(gl.getUniformLocation(program, "tDiffuse"), 0);

        for (const declaration of declarations) {
          const location = gl.getUniformLocation(program, declaration.name);
          if (location === null) continue;
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
        for (let index = 0; index < pixels.length; index += 4) {
          for (let channel = 0; channel < 4; channel += 1) {
            const value = pixels[index + channel];
            sums[channel] += value;
            minimum[channel] = Math.min(minimum[channel], value);
            maximum[channel] = Math.max(maximum[channel], value);
          }
          if (pixels[index + 3] > 0) nonTransparentPixels += 1;
        }
        let hashA = 2166136261;
        let hashB = 2654435761;
        for (const value of pixels) {
          hashA = Math.imul(hashA ^ value, 16777619) >>> 0;
          hashB = Math.imul(hashB ^ value, 3266489917) >>> 0;
        }
        const hash = `${hashA.toString(16).padStart(8, "0")}${hashB.toString(16).padStart(8, "0")}`;
        const pixelCount = width * height;
        return {
          hash,
          mean: sums.map((value) => value / pixelCount) as [number, number, number, number],
          minimum: minimum as [number, number, number, number],
          maximum: maximum as [number, number, number, number],
          nonTransparentPixels,
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
        background: options.background ?? "checker",
      },
    );

    let outputPath: string | undefined;
    if (options.outputPath) {
      outputPath = resolve(options.outputPath);
      await mkdir(dirname(outputPath), { recursive: true });
      await page.locator("#shader").screenshot({ path: outputPath, type: "png" });
    }

    return { width, height, outputPath, pixelSummary };
  } finally {
    await browser.close();
  }
}
