import { inferParameters } from "./uniforms.js";
import { validateShader } from "./validate.js";
import type {
  BuildResult,
  ParameterSpec,
  ScalarOrVector,
  ShaderConfig,
} from "./types.js";

const controlPoints = [
  [-10, 0],
  [10, 0],
];

function staticAnimatedValue(value: number, tween = 1) {
  return {
    animated: false,
    keyframes: [
      {
        value,
        frame: 0,
        tween,
        controlPoints,
      },
    ],
  };
}

function vectorValue(value: ScalarOrVector, index: number): number {
  if (typeof value === "number") return value;
  return value[index] ?? 0;
}

function optionalComponent(value: ParameterSpec["min"], index: number): number | undefined {
  if (value === undefined) return undefined;
  return vectorValue(value, index);
}

function componentDescriptor(
  name: string,
  value: number,
  min?: number,
  max?: number,
) {
  return {
    name,
    type: 0,
    value,
    ...(min === undefined ? {} : { min }),
    ...(max === undefined ? {} : { max }),
    dynamic: true,
  };
}

function scalarProperty(parameter: ParameterSpec) {
  const value = vectorValue(parameter.default ?? 0, 0);
  return {
    type: {
      custom: true,
      type: 0,
      ...(parameter.min === undefined ? {} : { min: vectorValue(parameter.min, 0) }),
      ...(parameter.max === undefined ? {} : { max: vectorValue(parameter.max, 0) }),
      dynamic: true,
    },
    properties: { name: parameter.name },
    ...staticAnimatedValue(value),
  };
}

function vectorProperty(parameter: ParameterSpec) {
  const count = parameter.type === "vec2" ? 2 : 3;
  const componentNames = parameter.color ? ["R", "G", "B"] : ["X", "Y", "Z"];
  const groupType = parameter.color ? 4 : parameter.type === "vec2" ? 1 : 2;
  const values = Array.from({ length: count }, (_, index) => vectorValue(parameter.default ?? 0, index));
  return {
    type: {
      custom: true,
      group: true,
      type: groupType,
      objects: values.map((value, index) =>
        componentDescriptor(
          componentNames[index],
          value,
          optionalComponent(parameter.min, index),
          optionalComponent(parameter.max, index),
        ),
      ),
      dynamic: true,
    },
    properties: { name: parameter.name },
    objects: values.map((value) => staticAnimatedValue(value)),
  };
}

function customProperty(parameter: ParameterSpec) {
  if (parameter.type === "sampler2D") {
    return {
      type: {
        custom: true,
        type: 8,
        assetType: 0,
        accept: "image/*",
        value: null,
      },
      properties: { name: parameter.name },
      value: null,
    };
  }
  return parameter.type === "float" ? scalarProperty(parameter) : vectorProperty(parameter);
}

export function buildShaderObject(source: string, config: ShaderConfig = {}): BuildResult {
  const inferred = inferParameters(source, config);
  const diagnostics = [...validateShader(source), ...inferred.diagnostics];
  const shaderObject = [
    {
      data: [
        {
          type: 1,
          properties: {
            name: config.name ?? "Shader",
            enabled: staticAnimatedValue(1, 0),
            fragShader: source,
          },
          customProperties: inferred.parameters.map(customProperty),
        },
      ],
      baseType: "effect",
      assets: [],
    },
  ];
  return {
    shaderObject,
    parameters: inferred.parameters,
    diagnostics,
  };
}
