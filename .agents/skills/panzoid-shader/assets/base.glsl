precision highp float;
precision highp int;

uniform sampler2D tDiffuse;
varying vec2 vUvScaled;

void main()
{
  vec4 texel = texture2D(tDiffuse, vUvScaled);
  gl_FragColor = texel;
}
