import type {
  Diagnostic,
  ParameterOverride,
  ParameterSpec,
  ScalarOrVector,
  ShaderConfig,
  SupportedUniformType,
  UniformDeclaration,
} from "./types.js";

const supportedTypes = new Set(["float", "vec2", "vec3", "sampler2D"]);

export function parseUniforms(source: string): UniformDeclaration[] {
  const uniforms: UniformDeclaration[] = [];
  const pattern = /\buniform\s+(\w+)\s+([A-Za-z_]\w*)\s*;/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    if (supportedTypes.has(match[1])) {
      uniforms.push({
        type: match[1] as UniformDeclaration["type"],
        name: match[2],
      });
    }
  }
  return uniforms;
}

function zeroValue(type: SupportedUniformType): ScalarOrVector {
  if (type === "float") return 0;
  if (type === "vec2") return [0, 0];
  return [0, 0, 0];
}

function standardDefault(name: string, type: SupportedUniformType): ScalarOrVector {
  if (name === "Opacity" && type === "float") return 1;
  if (name === "Position" && type === "vec2") return [0, 0];
  if (name === "Rotation" && type === "float") return 0;
  if (name === "Scale" && type === "vec2") return [1, 1];
  if (/^(?:Color|StartColor|EndColor)$/.test(name) && type === "vec3") return [1, 1, 1];
  return zeroValue(type);
}

function isColor(name: string, type: SupportedUniformType, override?: ParameterOverride): boolean {
  if (override?.color !== undefined) return override.color;
  return type === "vec3" && /Color$/.test(name);
}

export function inferParameters(
  source: string,
  config: ShaderConfig = {},
): { parameters: ParameterSpec[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const parameters: ParameterSpec[] = [];
  const uniforms = parseUniforms(source);

  for (const uniform of uniforms) {
    if (uniform.name === "tDiffuse" || uniform.name === "uvScale") continue;
    if (uniform.type === "sampler2D") {
      diagnostics.push({
        severity: "error",
        code: "unsupported-sampler",
        message: `Only tDiffuse may use sampler2D; found ${uniform.name}.`,
      });
      continue;
    }

    const override = config.parameters?.[uniform.name];
    const defaultValue = override?.default ?? standardDefault(uniform.name, uniform.type);
    const min = override?.min ?? (uniform.name === "Opacity" ? 0 : undefined);
    const max = override?.max ?? (uniform.name === "Opacity" ? 1 : undefined);
    parameters.push({
      name: uniform.name,
      type: uniform.type,
      default: defaultValue,
      min,
      max,
      color: isColor(uniform.name, uniform.type, override),
    });
  }

  for (const name of Object.keys(config.parameters ?? {})) {
    if (!parameters.some((parameter) => parameter.name === name)) {
      diagnostics.push({
        severity: "error",
        code: "orphan-parameter",
        message: `Configuration declares ${name}, but the shader has no matching uniform.`,
      });
    }
  }

  return { parameters, diagnostics };
}
