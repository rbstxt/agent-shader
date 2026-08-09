import { parseUniforms } from "./uniforms.js";
import type { Diagnostic } from "./types.js";

const requiredPatterns: Array<[string, RegExp, string]> = [
  ["precision-float", /\bprecision\s+highp\s+float\s*;/, "Missing precision highp float;"],
  ["precision-int", /\bprecision\s+highp\s+int\s*;/, "Missing precision highp int;"],
  ["tdiffuse", /\buniform\s+sampler2D\s+tDiffuse\s*;/, "Missing uniform sampler2D tDiffuse;"],
  ["vuvscaled", /\bvarying\s+vec2\s+vUvScaled\s*;/, "Missing varying vec2 vUvScaled;"],
  ["texture-sample", /\btexture2D\s*\(\s*tDiffuse\s*,/, "Missing texture2D sample from tDiffuse."],
  ["fragment-output", /\bgl_FragColor\s*=/, "Missing gl_FragColor assignment."],
];

const standardizedTypes: Record<string, string> = {
  Color: "vec3",
  StartColor: "vec3",
  EndColor: "vec3",
  Opacity: "float",
  Position: "vec2",
  Rotation: "float",
  Scale: "vec2",
};

function error(code: string, message: string): Diagnostic {
  return { severity: "error", code, message };
}

function warning(code: string, message: string): Diagnostic {
  return { severity: "warning", code, message };
}

export function validateShader(source: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const [code, pattern, message] of requiredPatterns) {
    if (!pattern.test(source)) diagnostics.push(error(code, message));
  }

  const forbiddenPatterns: Array<[string, RegExp, string]> = [
    ["comments", /\/\/|\/\*|\*\//, "Shader code must not contain comments."],
    ["resolution", /\b(?:iResolution|resolution|uResolution|viewportSize|screenSize)\b/i, "Resolution-like identifiers are forbidden."],
    ["derivative-aa", /\b(?:fwidth|dFdx|dFdy)\s*\(/, "Derivative-based anti-aliasing is forbidden."],
    ["named-aa", /\b(?:FXAA|SMAA|MSAA|antialias|antiAlias|anti_alias|supersampl\w*)\b/i, "Anti-aliasing techniques are forbidden."],
  ];

  for (const [code, pattern, message] of forbiddenPatterns) {
    if (pattern.test(source)) diagnostics.push(error(code, message));
  }

  const uniforms = parseUniforms(source);
  for (const uniform of uniforms) {
    if (/^u[A-Z_]/.test(uniform.name)) {
      diagnostics.push(error("uniform-prefix", `Uniform ${uniform.name} must not start with u.`));
    }
    const expected = standardizedTypes[uniform.name];
    if (expected && uniform.type !== expected) {
      diagnostics.push(error("uniform-type", `${uniform.name} must use ${expected}, not ${uniform.type}.`));
    }
  }

  if (/\b(?:length|distance|dot|atan|sin|cos|tan)\s*\(/.test(source)) {
    if (!/\bvUvScaled\s*\*\s*2(?:\.0)?\s*-\s*1(?:\.0)?/.test(source)) {
      diagnostics.push(warning("coordinate-space", "Aspect-sensitive shader does not visibly map vUvScaled to center-zero coordinates."));
    }
    if (!/\b\w+\.x\s*\*=\s*16(?:\.0)?\s*\/\s*9(?:\.0)?/.test(source)) {
      diagnostics.push(warning("aspect-ratio", "Aspect-sensitive shader does not visibly scale x by 16.0 / 9.0."));
    }
  }

  if (uniforms.some((uniform) => uniform.name === "Opacity")) {
    if (!/\bclamp\s*\(\s*Opacity\s*,\s*0(?:\.0)?\s*,\s*1(?:\.0)?\s*\)/.test(source)) {
      diagnostics.push(warning("opacity-clamp", "Opacity has 0..1 bounds but is not visibly clamped to that range."));
    }
  }

  return diagnostics;
}
