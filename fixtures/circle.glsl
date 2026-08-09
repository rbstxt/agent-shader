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
  vec4 texel = texture2D(tDiffuse, vUvScaled);
  float outputAlpha = sourceAlpha + texel.a * (1.0 - sourceAlpha);
  vec3 outputPremultiplied = Color * sourceAlpha + texel.rgb * texel.a * (1.0 - sourceAlpha);
  vec3 outputColor = outputAlpha > 0.0 ? outputPremultiplied / outputAlpha : vec3(0.0);

  gl_FragColor = vec4(outputColor, outputAlpha);
}
