import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { buildShaderObject } from "../src/panzoid.js";

test("builds the static Panzoid Shader Object shape", async () => {
  const source = await readFile(resolve("fixtures/circle.glsl"), "utf8");
  const result = buildShaderObject(source);
  assert.equal(result.diagnostics.filter((item) => item.severity === "error").length, 0);
  const root = result.shaderObject[0] as Record<string, unknown>;
  const data = (root.data as Array<Record<string, unknown>>)[0];
  const properties = data.properties as Record<string, unknown>;
  assert.equal(properties.name, "Shader");
  assert.equal(properties.fragShader, source);
  const customProperties = data.customProperties as Array<Record<string, unknown>>;
  assert.deepEqual(
    customProperties.map((item) => (item.properties as Record<string, unknown>).name),
    ["Color", "Opacity", "Position", "Rotation", "Scale"],
  );
  const colorType = customProperties[0].type as Record<string, unknown>;
  const opacityType = customProperties[1].type as Record<string, unknown>;
  const positionType = customProperties[2].type as Record<string, unknown>;
  const rotationType = customProperties[3].type as Record<string, unknown>;
  const scaleType = customProperties[4].type as Record<string, unknown>;
  assert.equal(colorType.min, undefined);
  assert.equal(colorType.max, undefined);
  assert.equal(opacityType.min, 0);
  assert.equal(opacityType.max, 1);
  assert.equal(positionType.min, undefined);
  assert.equal(positionType.max, undefined);
  assert.equal(rotationType.min, undefined);
  assert.equal(rotationType.max, undefined);
  assert.equal(scaleType.min, undefined);
  assert.equal(scaleType.max, undefined);
  assert.deepEqual((customProperties[4].objects as Array<Record<string, unknown>>)[0].keyframes, [
    { value: 1, frame: 0, tween: 1, controlPoints: [[-10, 0], [10, 0]] },
  ]);
});

test("serializes sampler2D properties with the exact uniform name", async () => {
  const source = await readFile(resolve("fixtures/texture-blend.glsl"), "utf8");
  const config = JSON.parse(await readFile(resolve("fixtures/texture-blend.config.json"), "utf8"));
  const result = buildShaderObject(source, config);
  assert.equal(result.diagnostics.filter((item) => item.severity === "error").length, 0);
  const root = result.shaderObject[0] as Record<string, unknown>;
  const data = (root.data as Array<Record<string, unknown>>)[0];
  const properties = data.customProperties as Array<Record<string, unknown>>;
  assert.deepEqual(properties[0], {
    type: { custom: true, type: 8, assetType: 0, accept: "image/*", value: null },
    properties: { name: "Landscape" },
    value: null,
  });
});

test("requires an illustrative default for every nonstandard numeric uniform", async () => {
  const source = await readFile(resolve("fixtures/texture-blend.glsl"), "utf8");
  const result = buildShaderObject(source);
  assert.equal(result.diagnostics.some((item) => item.code === "missing-default"), true);
});
