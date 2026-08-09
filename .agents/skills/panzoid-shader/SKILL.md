---
name: panzoid-shader
description: Create, validate, build, and render-test Panzoid WebGL 1 fragment shaders and verified Shader Object JSON. Use for Panzoid shader effects, .glsl files, sampler2D image properties, customProperties generation, static illustrative defaults and bounds, visual regression checks, or tasks requiring Color, Opacity, Position, Rotation, Scale, vUvScaled, 16:9 coordinates, and source-over composition.
---

# Panzoid Shader

Use the repository CLI or MCP tools to produce a complete, tested Panzoid Shader Object. Treat the shader contract as mandatory.

## Workflow

1. Start from `assets/base.glsl` or inspect `assets/circle.glsl`.
2. Write the fragment shader with the contract below.
3. Choose explicit defaults that make every nonstandard parameter's behavior immediately visible.
4. Run `agent-shader test <shader.glsl> --out-dir <directory>` and inspect the PNG and report.
5. Fix the shader or defaults until the report passes and the default PNG clearly demonstrates the effect.
6. Run `agent-shader build <shader.glsl> --out <shader.json>`. Build performs the full test again and writes JSON only on success.
7. Prefer the equivalent MCP tools when available. Return JSON as complete only when `verified` and `report.passed` are both true.

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
- Give every nonstandard numeric uniform an explicit config default. Choose the value for clarity, not merely convenience.
- Override a standard default when it would hide or poorly demonstrate this particular effect.
- Omit `min` and `max` by default.
- Decide whether to set `min` or `max` while authoring the JSON. Do not add bounds merely because a range seems valid, useful, safe, conventional, or intended.
- Set a bound only at the point beyond which changing the value further produces no additional visual change. Omit it whenever that is uncertain or interesting behavior remains possible.
- Set `Opacity` to `0..1` because the shader must clamp it to that range.
- Do not bound `Position`, `Rotation`, `Scale`, or colors.

## Panzoid JSON

Infer standard defaults from uniform names. Use a small JSON config only for nonstandard defaults or explicitly justified bounds. Serialize static values exactly as Panzoid expects: `animated: false` with one value at frame zero. Do not expose animation or keyframes in the input model.

For each extra `uniform sampler2D Name;`, create one image custom property with `type: 8`, `assetType: 0`, `accept: "image/*"`, and `properties.name` exactly equal to `Name`. Never rename the uniform in JSON. Use `--textures` or the MCP `texturePaths` map to supply explicit preview images.

Use the bundled X-Y grid as `tDiffuse` when testing coordinate warps and distortions. It is generated deterministically with Python. Use the bundled CC0 landscape as the default extra image sampler when photographic detail makes the effect easier to judge.

## Verification

Require zero validation errors, successful WebGL 1 compilation and linking, a generated and visually inspected PNG, and a visible difference from the input at defaults. Never hand off an unverified Shader Object JSON as complete. Do not run automated min/max rendering tests; apply the parameter-contract criterion when deciding whether each bound belongs in the JSON.
