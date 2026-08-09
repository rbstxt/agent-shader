precision highp float;
precision highp int;

uniform sampler2D tDiffuse;
uniform sampler2D Landscape;
uniform float MixAmount;
varying vec2 vUvScaled;

void main()
{
  vec4 texel = texture2D(tDiffuse, vUvScaled);
  vec4 source = texture2D(Landscape, vUvScaled);
  float sourceAlpha = source.a * clamp(MixAmount, 0.0, 1.0);
  float outputAlpha = sourceAlpha + texel.a * (1.0 - sourceAlpha);
  vec3 outputPremultiplied = source.rgb * sourceAlpha + texel.rgb * texel.a * (1.0 - sourceAlpha);
  vec3 outputColor = outputAlpha > 0.0 ? outputPremultiplied / outputAlpha : vec3(0.0);

  gl_FragColor = vec4(outputColor, outputAlpha);
}
