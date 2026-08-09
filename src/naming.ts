import { basename } from "node:path";

const genericSuffixes = new Set(["shader", "effect"]);

export function inferShaderName(path?: string): string {
  if (!path) return "Effect";
  const filename = basename(path)
    .replace(/\.(?:glsl|frag|json)$/i, "")
    .replace(/\.config$/i, "");
  const tokens = filename
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean);
  while (tokens.length > 0 && genericSuffixes.has(tokens[tokens.length - 1].toLowerCase())) {
    tokens.pop();
  }
  if (tokens.length === 0) return "Effect";
  return tokens
    .map((token) => token.length <= 2 && token.toLowerCase() === "xy"
      ? "XY"
      : `${token[0].toUpperCase()}${token.slice(1).toLowerCase()}`)
    .join(" ");
}

export function withInferredShaderName<T extends { name?: string }>(
  config: T,
  shaderPath?: string,
  configPath?: string,
): T & { name: string } {
  return {
    ...config,
    name: config.name ?? inferShaderName(shaderPath ?? configPath),
  };
}
