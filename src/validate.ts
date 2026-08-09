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
    ["discard", /\bdiscard\b/, "discard is forbidden because it can make Panzoid Shader Object output black."],
    ["import-syntax", /\bimport\b/, "GLSL ES 1.00 has no standard import syntax."],
    ["unsupported-extension-symbol", /\b(?:texture2DLodEXT|texture2DGradEXT|gl_FragDepthEXT|gl_FragData)\b/, "Unsupported WebGL 1 extension symbol detected."],
  ];

  for (const [code, pattern, message] of forbiddenPatterns) {
    if (pattern.test(source)) diagnostics.push(error(code, message));
  }

  const extensionReferences = new Set(source.match(/\bGL_(?:OES|EXT|WEBGL)_[A-Za-z0-9_]+\b/g) ?? []);
  for (const extensionName of extensionReferences) {
    if (extensionName !== "GL_OES_standard_derivatives") {
      diagnostics.push(error("unsupported-extension-reference", `Extension ${extensionName} is not supported by Panzoid Shader Objects.`));
    }
  }

  const allowedDirectives = new Set(["define", "if", "ifdef", "ifndef", "elif", "else", "endif"]);
  const derivativeExtension = /^[ \t]*#\s*extension\s+GL_OES_standard_derivatives\s*:\s*require\s*$/m;
  const directivePattern = /^[ \t]*#\s*([A-Za-z_]\w*)([^\r\n]*)$/gm;
  let directive: RegExpExecArray | null;
  while ((directive = directivePattern.exec(source)) !== null) {
    const name = directive[1];
    if (name === "extension") {
      if (!/^\s+GL_OES_standard_derivatives\s*:\s*require\s*$/.test(directive[2])) {
        diagnostics.push(error("unsupported-extension", "Only #extension GL_OES_standard_derivatives : require is supported."));
      }
      continue;
    }
    if (name === "version") {
      diagnostics.push(error("version-directive", "Do not use #version; Panzoid injects code before the fragment shader."));
      continue;
    }
    if (name === "include") {
      diagnostics.push(error("include-directive", "GLSL ES 1.00 has no standard #include directive."));
      continue;
    }
    if (name === "pragma") {
      diagnostics.push(error("pragma-directive", "Nonstandard #pragma directives such as glslify are forbidden."));
      continue;
    }
    if (!allowedDirectives.has(name)) {
      diagnostics.push(error("unsupported-preprocessor", `Preprocessor directive #${name} is not in the Panzoid allowlist.`));
    }
  }

  const usesDerivatives = /\b(?:dFdx|dFdy|fwidth)\s*\(/.test(source);
  const hasDerivativeExtension = derivativeExtension.test(source);
  if (usesDerivatives && !hasDerivativeExtension) {
    diagnostics.push(error("derivative-extension", "dFdx, dFdy, and fwidth require #extension GL_OES_standard_derivatives : require."));
  }
  if (hasDerivativeExtension) {
    const extensionIndex = source.search(derivativeExtension);
    const precisionIndex = source.search(/\bprecision\s+highp\s+(?:float|int)\s*;/);
    if (precisionIndex >= 0 && extensionIndex > precisionIndex) {
      diagnostics.push(error("extension-order", "GL_OES_standard_derivatives must be declared before precision statements."));
    }
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
