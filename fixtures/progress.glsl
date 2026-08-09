precision highp float;
precision highp int;

uniform sampler2D tDiffuse;
uniform vec3 Color;
uniform float Opacity;
uniform float Progress;
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
  float cosine = cos(angle);
  float sine = sin(angle);
  p = mat2(cosine, sine, -sine, cosine) * p;
  p /= Scale;

  float progress = clamp(Progress, 0.0, 1.0);
  float life = sin(progress * 3.141592653589793);
  float radius = mix(0.08, 0.7, progress);
  float ring = step(abs(length(p) - radius), 0.055 * life);
  float density = ring * life;
  float sourceAlpha = density * clamp(Opacity, 0.0, 1.0);
  vec3 sourceColor = Color * clamp(life, 0.0, 1.0);
  vec4 texel = texture2D(tDiffuse, vUvScaled);

  float backgroundAlpha = clamp(texel.a, 0.0, 1.0);
  float remainingBackground = backgroundAlpha * (1.0 - sourceAlpha);
  float outputAlpha = sourceAlpha + remainingBackground;
  vec3 outputColor = sourceColor * sourceAlpha + texel.rgb * remainingBackground;

  gl_FragColor = vec4(outputColor, outputAlpha);
}
