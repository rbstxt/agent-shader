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

function standardDefault(name: string, type: SupportedUniformType): ScalarOrVector | undefined {
  if (name === "Opacity" && type === "float") return 1;
  if (name === "Position" && type === "vec2") return [0, 0];
  if (name === "Rotation" && type === "float") return 0;
  if (name === "Scale" && type === "vec2") return [1, 1];
  if (/^(?:Color|StartColor|EndColor)$/.test(name) && type === "vec3") return [1, 1, 1];
  return undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function matchesType(value: ScalarOrVector, type: SupportedUniformType): boolean {
  if (type === "float") return isFiniteNumber(value);
  if (!Array.isArray(value)) return false;
  const length = type === "vec2" ? 2 : 3;
  return value.length === length && value.every(isFiniteNumber);
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
      const override = config.parameters?.[uniform.name];
      if (override && Object.values(override).some((value) => value !== undefined)) {
        diagnostics.push({
          severity: "error",
          code: "texture-override",
          message: `${uniform.name} is an image property and cannot use numeric default, min, max, or color overrides.`,
        });
      }
      parameters.push({
        name: uniform.name,
        type: "sampler2D",
        default: null,
        color: false,
      });
      continue;
    }

    const override = config.parameters?.[uniform.name];
    const inferredDefault = standardDefault(uniform.name, uniform.type);
    if (override?.default === undefined && inferredDefault === undefined) {
      diagnostics.push({
        severity: "error",
        code: "missing-default",
        message: `${uniform.name} requires an explicit, deliberate default. A no-change value is allowed when intentional and appropriate.`,
      });
    }
    const defaultValue = override?.default ?? inferredDefault ?? zeroValue(uniform.type);
    if (!matchesType(defaultValue, uniform.type)) {
      diagnostics.push({
        severity: "error",
        code: "invalid-default",
        message: `${uniform.name} default does not match ${uniform.type}.`,
      });
    }
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
