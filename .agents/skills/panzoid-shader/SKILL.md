---
name: panzoid-shader
description: Create, validate, build, and render-test Panzoid WebGL 1 fragment shaders and Shader Object JSON. Use for Panzoid shader effects, .frag files, customProperties generation, static parameter defaults and bounds, visual regression checks, or tasks requiring Color, Opacity, Position, Rotation, Scale, vUvScaled, 16:9 coordinates, and source-over composition.
---

# Panzoid Shader

Use the repository CLI or MCP tools to produce a complete, tested Panzoid Shader Object. Treat the shader contract as mandatory.

## Workflow

1. Start from `assets/base.frag` or inspect `assets/circle.frag`.
2. Write the fragment shader with the contract below.
3. Run `agent-shader validate <shader.frag>`.
4. Run `agent-shader test <shader.frag> --out-dir <directory>` and inspect the PNG and report.
5. Run `agent-shader build <shader.frag> --out <shader.json>`.
6. Prefer the equivalent MCP tools when they are available.

## Shader contract

- Start with `precision highp float;` and `precision highp int;`.
- Declare `uniform sampler2D tDiffuse;` and `varying vec2 vUvScaled;`.
- Use `vUvScaled` as the only screen-space UV source.
- Do not use resolution-like uniforms.
- Map effect space with `vec2 p = vUvScaled * 2.0 - 1.0;`.
- Subtract `Position`, then scale centered x by `16.0 / 9.0`.
- Express `Rotation` in clockwise degrees.
- Treat `Scale` as a `vec2` multiplier with `[1, 1]` as the default.
- Sample the source with `texture2D(tDiffuse, vUvScaled)` unless intentional distortion requires modified UVs.
- Composite drawn pixels over the original texel with straight-alpha source-over.
- Do not add anti-aliasing or derivative-based smoothing.
- Do not write comments in shader code.
- Assign the result to `gl_FragColor`.

## Parameter contract

- Use `vec3 Color` for one color.
- Use `vec3 StartColor` and `vec3 EndColor` for endpoints.
- Use `float Opacity`, `vec2 Position`, `float Rotation`, and `vec2 Scale`.
- Use PascalCase for other parameters.
- Never prefix parameters with `u`.
- Keep parameters static. Do not accept animation or keyframe input.
- Omit `min` and `max` by default.
- Set bounds only when values outside them render identically to the boundary.
- Set `Opacity` to `0..1` because the shader must clamp it to that range.
- Do not bound `Position`, `Rotation`, `Scale`, or colors.

## Panzoid JSON

Infer standard defaults from uniform names. Use a small JSON config only for nonstandard defaults or explicitly justified bounds. Serialize static values exactly as Panzoid expects: `animated: false` with one value at frame zero. Do not expose animation or keyframes in the input model.

## Verification

Require zero validation errors, successful WebGL 1 compilation and linking, a generated PNG, and passing boundary saturation checks before returning JSON as complete.
