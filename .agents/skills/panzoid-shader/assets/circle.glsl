precision highp float;
precision highp int;

uniform sampler2D tDiffuse;
uniform vec3 Color;
uniform float Opacity;
uniform vec2 Position;
uniform float Rotation;
uniform vec2 Scale;
varying vec2 vUvScaled;

void main()
{
  vec2 p = vUvScaled * 2.0 - 1.0;
  p -= Position;
  p.x *= 16.0 / 9.0;

  float angle = radians(Rotation);
  float c = cos(angle);
  float s = sin(angle);
  p = mat2(c, s, -s, c) * p;
  p /= Scale;

  float mask = step(length(p), 0.25);
  float sourceAlpha = mask * clamp(Opacity, 0.0, 1.0);
  vec3 sourceColor = Color;
  vec4 texel = texture2D(tDiffuse, vUvScaled);

  float backgroundAlpha = clamp(texel.a, 0.0, 1.0);
  float remainingBackground = backgroundAlpha * (1.0 - sourceAlpha);

  float outputAlpha = sourceAlpha + remainingBackground;
  vec3 outputColor = sourceColor * sourceAlpha + texel.rgb * remainingBackground;

  gl_FragColor = vec4(outputColor, outputAlpha);
}
