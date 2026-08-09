export type SupportedUniformType = "float" | "vec2" | "vec3";
export type UniformType = SupportedUniformType | "sampler2D";
export type ScalarOrVector = number | [number, number] | [number, number, number];

export interface UniformDeclaration {
  name: string;
  type: UniformType;
}

export interface ParameterOverride {
  default?: ScalarOrVector;
  min?: number | [number, number] | [number, number, number];
  max?: number | [number, number] | [number, number, number];
  color?: boolean;
}

export interface ShaderConfig {
  name?: string;
  parameters?: Record<string, ParameterOverride>;
}

export interface ParameterSpec {
  name: string;
  type: UniformType;
  default: ScalarOrVector | null;
  min?: number | [number, number] | [number, number, number];
  max?: number | [number, number] | [number, number, number];
  color: boolean;
}

export interface Diagnostic {
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface BuildResult {
  shaderObject: unknown[];
  parameters: ParameterSpec[];
  diagnostics: Diagnostic[];
}

export type UniformValues = Record<string, ScalarOrVector>;
export type TexturePaths = Record<string, string>;

export interface RenderOptions {
  width?: number;
  height?: number;
  uvScale?: [number, number];
  values?: UniformValues;
  texturePaths?: TexturePaths;
  outputPath?: string;
  inputImagePath?: string;
  background?: "checker" | "alpha-checker";
}

export interface PixelSummary {
  hash: string;
  mean: [number, number, number, number];
  minimum: [number, number, number, number];
  maximum: [number, number, number, number];
  nonTransparentPixels: number;
}

export interface RenderResult {
  width: number;
  height: number;
  outputPath?: string;
  pixelSummary: PixelSummary;
}

export interface DefaultEffectCheck {
  defaultHash: string;
  inputHash: string;
  passed: boolean;
}

export interface TestReport {
  passed: boolean;
  diagnostics: Diagnostic[];
  defaultRender?: RenderResult;
  defaultEffectCheck?: DefaultEffectCheck;
}
