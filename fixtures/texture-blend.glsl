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
  vec3 sourceColor = source.rgb;
  float backgroundAlpha = clamp(texel.a, 0.0, 1.0);
  float remainingBackground = backgroundAlpha * (1.0 - sourceAlpha);
  float outputAlpha = sourceAlpha + remainingBackground;
  vec3 outputColor = sourceColor * sourceAlpha + texel.rgb * remainingBackground;

  gl_FragColor = vec4(outputColor, outputAlpha);
}
