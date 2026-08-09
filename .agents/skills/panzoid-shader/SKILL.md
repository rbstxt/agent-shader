---
name: panzoid-shader
description: Create, validate, build, and render-test Panzoid WebGL 1 / GLSL ES 1.00 fragment shaders and verified Shader Object JSON. Use for Panzoid shader effects, .glsl files, supported preprocessor syntax, GL_OES_standard_derivatives, sampler2D image properties, customProperties generation, static illustrative defaults and bounds, premultiplied-alpha diagnostics, visual regression checks, or tasks requiring Color, Opacity, Position, Rotation, Scale, vUvScaled, 16:9 coordinates, and source-over composition.
---

# Panzoid Shader

Use the repository CLI or MCP tools to produce a complete, tested Panzoid Shader Object. Treat the shader contract as mandatory.

## Workflow

1. Start from `assets/base.glsl` or inspect `assets/circle.glsl`.
2. Write the fragment shader with the contract below.
3. Choose explicit defaults that make every nonstandard parameter's behavior immediately visible.
4. Run `agent-shader test <shader.glsl> --out-dir <directory>` and inspect every normal and RGB-only PNG plus the report.
5. Fix the shader or defaults until the report passes, the defaults clearly demonstrate the effect, and the alpha diagnostics are visually clean.
6. Run `agent-shader build <shader.glsl> --out <shader.json>`. Build performs the full test again and writes JSON only on success.
7. Prefer the equivalent MCP tools when available. Return the Shader Object JSON as complete only after `agent-shader test` passes and `agent-shader build` succeeds.

## Shader contract

- Start with `precision highp float;` and `precision highp int;`.
- Declare `uniform sampler2D tDiffuse;` and `varying vec2 vUvScaled;`.
- Prefer `vUvScaled` as the screen-space UV source. Add a resolution-like uniform only when the user explicitly requests it or the effect genuinely needs externally supplied dimensions.
- Map effect space with `vec2 p = vUvScaled * 2.0 - 1.0;`.
- Subtract `Position`, then scale centered x by `16.0 / 9.0`.
- Express `Rotation` in clockwise degrees.
- Treat `Scale` as a `vec2` multiplier with `[1, 1]` as the default.
- Sample the source with `texture2D(tDiffuse, vUvScaled)` unless intentional distortion requires modified UVs.
- Composite drawn pixels over `tDiffuse` using source-over and output premultiplied-alpha. Do not divide the resulting RGB by the output alpha.
- Do not add anti-aliasing unless the user explicitly asks for it. This is an agent decision, not a validator rule.
- Omit shader comments by default. Include them when the user explicitly requests them or they are materially useful for the requested delivery.
- Assign the result to `gl_FragColor`.

Use this source-over form:

```glsl
float sourceAlpha = mask * clamp(Opacity, 0.0, 1.0);
vec4 texel = texture2D(tDiffuse, vUvScaled);

float backgroundAlpha = clamp(texel.a, 0.0, 1.0);
float remainingBackground = backgroundAlpha * (1.0 - sourceAlpha);

float outputAlpha =
    sourceAlpha +
    remainingBackground;

vec3 outputColor =
    sourceColor * sourceAlpha +
    texel.rgb * remainingBackground;

gl_FragColor = vec4(outputColor, outputAlpha);
```

Never divide premultiplied RGB by `outputAlpha`. Never output `vec4(sourceColor, sourceAlpha)`. When `tDiffuse` is `vec4(0.0)`, the result must be equivalent to:

```glsl
gl_FragColor = vec4(
    sourceColor * sourceAlpha,
    sourceAlpha
);
```

Fully transparent and low-alpha pixels must not retain unattenuated source RGB. Keep emitted color intensity bounded separately from density. Prefer `vec3 sourceColor = Color * clamp(brightness, 0.0, 1.0);`; do not add an unbounded Glow term directly to RGB. Drive Glow density through alpha or another separately clamped factor.

## GLSL ES 1.00 compatibility

- Treat Panzoid Shader Object code as WebGL 1 / GLSL ES 1.00.
- Do not write `#version 100` because Panzoid may prepend internal source.
- Use `#define`, function-like macros, `#if`, `#ifdef`, `#ifndef`, `#elif`, `#else`, and `#endif` when useful.
- Rely on `GL_ES`, `GL_FRAGMENT_PRECISION_HIGH`, and `__VERSION__ == 100` when conditional compilation is useful.
- Use only `GL_OES_standard_derivatives` among optional extensions.
- When using `dFdx`, `dFdy`, or `fwidth`, put `#extension GL_OES_standard_derivatives : require` before both precision declarations.
- Use derivatives for patterns, normal estimation, change measurement, and analytical effects. Use them for AA only when the user explicitly requested AA.
- Do not use `GL_EXT_shader_texture_lod`, `GL_EXT_frag_depth`, `GL_EXT_draw_buffers`, `texture2DLodEXT`, `texture2DGradEXT`, `gl_FragDepthEXT`, or `gl_FragData`.
- Do not use `discard`; output the original `tDiffuse` texel or a source-over result outside the mask.
- Do not use `#include`, imports, or glslify pragmas. Keep the delivered shader self-contained.

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

Every shader test must render the default X-Y grid, opaque black `vec4(0, 0, 0, 1)`, transparent black `vec4(0, 0, 0, 0)`, and semi-transparent color `vec4(0.2, 0.5, 0.8, 0.25)`. Inspect both the normal PNG and the RGB-only diagnostic for every input. The RGB-only image ignores output alpha so hidden RGB remains visible.

On transparent input, require `vec4(0.0)` outside the effect, zero RGB wherever alpha is zero, RGB attenuation as alpha decreases, exact input preservation at `Opacity = 0`, and no bright hidden RGB. When `Color` is within `0..1`, each output RGB component should normally be no greater than output alpha.

When a `Progress` float exists, test and inspect `0.00`, `0.10`, `0.35`, `0.65`, `0.90`, and `1.00`. Check that the center is not accidentally filled at the start, the representative form appears mid-animation, radius or displacement changes naturally, density and Glow decay near the end, and no hidden RGB remains at completion.

Require zero GLSL validation errors, successful WebGL 1 compilation and linking, successful display on all four inputs, passing premultiplied-alpha numerical checks, clean RGB-only diagnostics, visual inspection of all Progress checkpoints when applicable, a clearly demonstrative default, and a successful build. Never hand off a Shader Object JSON as complete before both `agent-shader test` and `agent-shader build` succeed. Do not run automated min/max rendering tests; apply the parameter-contract criterion when deciding whether each bound belongs in the JSON.
