import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { validateShader } from "../src/validate.js";

test("accepts the circle fixture", async () => {
  const source = await readFile(resolve("fixtures/circle.glsl"), "utf8");
  assert.equal(validateShader(source).filter((item) => item.severity === "error").length, 0);
});

test("rejects u-prefixed parameters and comments", async () => {
  const source = await readFile(resolve("fixtures/circle.glsl"), "utf8");
  const invalid = source.replace("uniform float Opacity;", "uniform float uOpacity;\n// bad");
  const codes = validateShader(invalid).map((item) => item.code);
  assert.ok(codes.includes("uniform-prefix"));
  assert.ok(codes.includes("comments"));
});

test("accepts the supported preprocessor and derivative extension", async () => {
  const source = await readFile(resolve("fixtures/derivatives.glsl"), "utf8");
  assert.equal(validateShader(source).filter((item) => item.severity === "error").length, 0);
});

test("requires the derivative extension before precision declarations", async () => {
  const source = await readFile(resolve("fixtures/derivatives.glsl"), "utf8");
  const missingCodes = validateShader(source.replace("#extension GL_OES_standard_derivatives : require\n", "")).map((item) => item.code);
  const lateSource = source.replace("#extension GL_OES_standard_derivatives : require\n", "");
  const lateCodes = validateShader(lateSource.replace("precision highp int;", "precision highp int;\n#extension GL_OES_standard_derivatives : require")).map((item) => item.code);
  assert.ok(missingCodes.includes("derivative-extension"));
  assert.ok(lateCodes.includes("extension-order"));
});

test("rejects unsupported extensions, directives, symbols, and discard", async () => {
  const source = await readFile(resolve("fixtures/circle.glsl"), "utf8");
  const cases: Array<[string, string]> = [
    ["#extension GL_EXT_shader_texture_lod : require\n", "unsupported-extension"],
    ["#extension GL_EXT_frag_depth : require\n", "unsupported-extension"],
    ["#extension GL_EXT_draw_buffers : require\n", "unsupported-extension"],
    ["#version 100\n", "version-directive"],
    ["#include <common>\n", "include-directive"],
    ["#pragma glslify: blend = require(foo)\n", "pragma-directive"],
    ["import blend;\n", "import-syntax"],
    ["#undef Color\n", "unsupported-preprocessor"],
    ["#ifdef GL_OES_texture_float\n#endif\n", "unsupported-extension-reference"],
    ["texture2DLodEXT(tDiffuse, vUvScaled, 0.0);\n", "unsupported-extension-symbol"],
    ["texture2DGradEXT(tDiffuse, vUvScaled, vec2(0.0), vec2(0.0));\n", "unsupported-extension-symbol"],
    ["gl_FragDepthEXT = 0.5;\n", "unsupported-extension-symbol"],
    ["gl_FragData[0] = vec4(1.0);\n", "unsupported-extension-symbol"],
    ["discard;\n", "discard"],
  ];
  for (const [insertion, expectedCode] of cases) {
    const invalid = source.replace("precision highp float;", `${insertion}precision highp float;`);
    assert.ok(validateShader(invalid).some((item) => item.code === expectedCode), expectedCode);
  }
});

test("does not decide whether anti-aliasing was user-authorized", async () => {
  const source = await readFile(resolve("fixtures/circle.glsl"), "utf8");
  const named = source.replace("precision highp float;", "#define FXAA 1\nprecision highp float;");
  assert.equal(validateShader(named).some((item) => item.code === "anti-aliasing"), false);
});
