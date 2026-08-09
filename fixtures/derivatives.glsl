#extension GL_OES_standard_derivatives : require
#define WAVE_SCALE 300.0
#if __VERSION__ == 100
#define VERSION_FACTOR 1.0
#else
#define VERSION_FACTOR 0.0
#endif
#ifdef GL_ES
#define ES_FACTOR 1.0
#else
#define ES_FACTOR 0.0
#endif
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define PRECISION_FACTOR 1.0
#else
#define PRECISION_FACTOR 0.0
#endif
precision highp float;
precision highp int;

uniform sampler2D tDiffuse;
varying vec2 vUvScaled;

void main()
{
  vec4 texel = texture2D(tDiffuse, vUvScaled);
  vec2 p = vUvScaled * 2.0 - 1.0;
  p.x *= 16.0 / 9.0;
  float waveX = sin(p.x * WAVE_SCALE);
  float waveY = sin(p.y * WAVE_SCALE);
  float derivativeX = clamp(abs(dFdx(waveX)) * 6.0, 0.0, 1.0);
  float derivativeY = clamp(abs(dFdy(waveY)) * 6.0, 0.0, 1.0);
  float derivativeWidth = clamp(fwidth(waveX + waveY) * 3.0, 0.0, 1.0);
  vec3 sourceColor = vec3(derivativeX * VERSION_FACTOR, derivativeY * ES_FACTOR, derivativeWidth * PRECISION_FACTOR);
  float sourceAlpha = 0.8;
  float backgroundAlpha = clamp(texel.a, 0.0, 1.0);
  float remainingBackground = backgroundAlpha * (1.0 - sourceAlpha);
  float outputAlpha = sourceAlpha + remainingBackground;
  vec3 outputColor = sourceColor * sourceAlpha + texel.rgb * remainingBackground;
  gl_FragColor = vec4(outputColor, outputAlpha);
}
