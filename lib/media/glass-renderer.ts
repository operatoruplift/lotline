import { GLASS_OPTICS, glassBufferSize, glassTextureSize, type GlassGeometry } from './glass-geometry';

const vertexSource = `
attribute vec2 position;
varying vec2 uv;
void main() { uv = vec2((position.x + 1.0) * 0.5, (1.0 - position.y) * 0.5); gl_Position = vec4(position, 0.0, 1.0); }
`;
const fragmentSource = `
precision highp float;
varying vec2 uv;
uniform sampler2D image;
uniform vec4 card;
uniform vec4 cover;
uniform vec4 optics;
uniform vec3 edgeStyle;

float roundedDistance(vec2 point) {
  vec2 q = abs(point) - (card.zw * 0.5 - edgeStyle.x);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - edgeStyle.x;
}
void main() {
  vec2 local = uv * card.zw;
  vec2 p = local - card.zw * 0.5;
  float distance = roundedDistance(p);
  float depth = max(0.0, -distance);
  float span = min(card.z, card.w);
  float edge = 1.0 - smoothstep(0.0, span * 0.16, depth);
  vec2 gradient = vec2(roundedDistance(p + vec2(0.5, 0.0)) - roundedDistance(p - vec2(0.5, 0.0)), roundedDistance(p + vec2(0.0, 0.5)) - roundedDistance(p - vec2(0.0, 0.5)));
  vec2 normal = gradient / max(length(gradient), 0.001);
  // Curl and distortion use CSS pixels, independent of card aspect and DPR.
  vec2 bend = normal * span * (optics.x * edge * edge - optics.y * sin(edge * 3.14159265));
  vec2 sampleUV = (card.xy + local + bend - cover.xy) / cover.zw;
  vec3 color = texture2D(image, clamp(sampleUV, 0.0, 1.0)).rgb;
  float light = pow(max(dot(normal, normalize(vec2(-0.6, -0.8))), 0.0), 3.0) * edge;
  float border = (1.0 - smoothstep(0.0, edgeStyle.z, depth)) * edgeStyle.y;
  color += optics.z + light * optics.w + border;
  gl_FragColor = vec4(color, 1.0 - smoothstep(-0.75, 0.75, distance));
}
`;

export type GlassRenderer = { draw: (source: CanvasImageSource, geometry: GlassGeometry, dpr: number) => void; dispose: () => void };

export function createGlassRenderer(canvas: HTMLCanvasElement): GlassRenderer {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  if (!gl) throw new Error('Refraction is unavailable.');
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let texture: WebGLTexture | null = null;
  const scratch = document.createElement('canvas');
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    shaders.forEach(shader => gl.deleteShader(shader));
    gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    scratch.width = 1; scratch.height = 1;
  };
  try {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error('Refraction shader is unavailable.');
      shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('Refraction shader could not compile.');
      return shader;
    };
    program = gl.createProgram(); buffer = gl.createBuffer(); texture = gl.createTexture();
    if (!program || !buffer || !texture) throw new Error('Refraction resources are unavailable.');
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Refraction shader could not link.');
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.uniform1i(gl.getUniformLocation(program, 'image'), 0);
    gl.uniform4f(gl.getUniformLocation(program, 'optics'), GLASS_OPTICS.distort, GLASS_OPTICS.edgeCurl, GLASS_OPTICS.brightness, GLASS_OPTICS.specular);
    const edgeStyle = gl.getUniformLocation(program, 'edgeStyle');
    const card = gl.getUniformLocation(program, 'card');
    const cover = gl.getUniformLocation(program, 'cover');
    const context = scratch.getContext('2d', { alpha: false });
    if (!context) throw new Error('Refraction sampling is unavailable.');
    let textureWidth = 0;
    let textureHeight = 0;
    let verified = false;
    const sampled = new Uint8Array(4);
    return {
      draw(source, geometry, dpr) {
        if (disposed || gl.isContextLost()) throw new Error('Refraction context is unavailable.');
        const output = glassBufferSize(geometry.card, dpr);
        if (canvas.width !== output.width || canvas.height !== output.height) { canvas.width = output.width; canvas.height = output.height; }
        const input = glassTextureSize(geometry.source);
        const resized = textureWidth !== input.width || textureHeight !== input.height;
        if (resized) { scratch.width = input.width; scratch.height = input.height; }
        context.drawImage(source, 0, 0, scratch.width, scratch.height);
        if (resized) {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
          textureWidth = input.width; textureHeight = input.height;
        } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.uniform4f(card, geometry.card.left, geometry.card.top, geometry.card.width, geometry.card.height);
        gl.uniform4f(cover, geometry.cover.left, geometry.cover.top, geometry.cover.width, geometry.cover.height);
        const opticalScale = canvas.clientWidth > 0 ? geometry.card.width / canvas.clientWidth : 1;
        gl.uniform3f(edgeStyle, GLASS_OPTICS.radius * opticalScale, GLASS_OPTICS.border, GLASS_OPTICS.borderWidth * opticalScale);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (!verified) {
          gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, sampled);
          if (gl.getError() !== gl.NO_ERROR) throw new Error('Refraction sampling failed.');
          if (sampled[3] === 0) throw new Error('Refraction produced no pixels.');
          canvas.dataset.refractionSampled = 'true';
          verified = true;
        }
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
