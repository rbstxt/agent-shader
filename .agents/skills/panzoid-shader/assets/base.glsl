precision highp float;
precision highp int;

uniform sampler2D tDiffuse;
varying vec2 vUvScaled;

void main()
{
  vec4 texel = texture2D(tDiffuse, vUvScaled);
  float outputAlpha = clamp(texel.a, 0.0, 1.0);
  gl_FragColor = vec4(texel.rgb * outputAlpha, outputAlpha);
}
