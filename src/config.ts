import { readFile } from "node:fs/promises";
import type { ShaderConfig } from "./types.js";

export async function loadShaderConfig(path?: string): Promise<ShaderConfig> {
  if (!path) return {};
  const text = await readFile(path, "utf8");
  const value = JSON.parse(text) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Shader config must be a JSON object.");
  }
  return value as ShaderConfig;
}
