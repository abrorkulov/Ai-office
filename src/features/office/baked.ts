import * as THREE from "three";
import { GROUND } from "./layout";

export interface LightInfo {
  verts: number;
  width: number;
  scale: number;
  version: number;
  shell: Record<string, [number, number]>;
  models: Record<string, [number, number]>;
}
export interface Baked {
  info: LightInfo;
  verts: THREE.Texture;
  floor: THREE.Texture;
}

const load = (url: string) =>
  new Promise<THREE.Texture>((res, rej) => {
    new THREE.ImageBitmapLoader().setOptions({ colorSpaceConversion: "none", premultiplyAlpha: "none" }).load(
      url,
      (img) => {
        const t = new THREE.Texture(img);
        t.flipY = false;
        t.colorSpace = THREE.NoColorSpace;
        t.generateMipmaps = false;
        t.needsUpdate = true;
        res(t);
      },
      undefined,
      rej,
    );
  });

export async function loadBaked(level: 1 | 2): Promise<Baked> {
  const dir = `/office/light/f${level}`;
  const r = await fetch(`${dir}/light.json`, { cache: "no-cache" });
  if (!r.ok) throw new Error("Нет карты света");
  const info = (await r.json()) as LightInfo;
  const [verts, floor] = await Promise.all([load(`${dir}/verts.webp?v=${info.version}`), load(`${dir}/floor.webp?v=${info.version}`)]);
  verts.minFilter = verts.magFilter = THREE.NearestFilter;
  floor.minFilter = floor.magFilter = THREE.LinearFilter;
  return { info, verts, floor };
}

const DIRECT_OFF = THREE.ShaderChunk.lights_fragment_begin.replace("( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )", "0");
// рассчитанный свет заменяет рассеянный, отражения остаются и гаснут в затенённых углах
const MAPS = `${THREE.ShaderChunk.lights_fragment_maps.replace("iblIrradiance += getIBLIrradiance( geometryNormal );", "")}
  irradiance += bakedLight * PI;
  radiance *= smoothstep( 0.05, 1.1, dot( bakedLight, vec3( 0.333 ) ) );
`;

/** Статичный предмет: свет берётся из текстуры по номеру вершины (и экземпляра). Видеокарта не считает ни теней, ни ламп. */
export function bakeVertices<T extends THREE.Material>(mat: T, b: Baked, offset: number, stride: number): T {
  mat.onBeforeCompile = (s) => {
    s.uniforms.bakeTex = { value: b.verts };
    s.uniforms.bakeAt = { value: new THREE.Vector2(offset, stride) };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", `#include <common>\nuniform highp sampler2D bakeTex;\nuniform vec2 bakeAt;\nvarying vec3 vBake;`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        int bi = int( bakeAt.x ) + gl_InstanceID * int( bakeAt.y ) + gl_VertexID;
        vBake = pow( texelFetch( bakeTex, ivec2( bi % ${b.info.width}, bi / ${b.info.width} ), 0 ).rgb, vec3( 2.2 ) ) * ${b.info.scale.toFixed(2)};`,
      );
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vBake;")
      .replace("#include <lights_fragment_begin>", DIRECT_OFF)
      .replace("#include <lights_fragment_maps>", `vec3 bakedLight = vBake;\n${MAPS}`);
  };
  mat.customProgramCacheKey = () => "baked-v";
  return mat;
}

/** Пол и ковры: карта света по мировым координатам. */
export function bakeFloor<T extends THREE.Material>(mat: T, b: Baked): T {
  mat.onBeforeCompile = (s) => {
    s.uniforms.bakeMap = { value: b.floor };
    s.vertexShader = s.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFloor;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        vec4 fw = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          fw = instanceMatrix * fw;
        #endif
        fw = modelMatrix * fw;
        vFloor = vec2( fw.x / ${GROUND.w.toFixed(3)} + 0.5, fw.z / ${GROUND.d.toFixed(3)} + 0.5 );`,
      );
    s.fragmentShader = s.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vFloor;\nuniform sampler2D bakeMap;")
      .replace("#include <lights_fragment_begin>", DIRECT_OFF)
      .replace("#include <lights_fragment_maps>", `vec3 bakedLight = pow( texture2D( bakeMap, vFloor ).rgb, vec3( 2.2 ) ) * ${b.info.scale.toFixed(2)};\n${MAPS}`);
  };
  mat.customProgramCacheKey = () => "baked-f";
  return mat;
}

/** Земля вокруг: цвет страницы, умноженный на тень здания, без видимого края. */
export function groundMaterial(b: Baked, bg: string) {
  return new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: { bakeMap: { value: b.floor }, bg: { value: new THREE.Color(bg) } },
    vertexShader: `varying vec2 vUvF; void main() { vec4 w = modelMatrix * vec4( position, 1.0 ); vUvF = vec2( w.x / ${GROUND.w.toFixed(3)} + 0.5, w.z / ${GROUND.d.toFixed(3)} + 0.5 ); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform sampler2D bakeMap; uniform vec3 bg; varying vec2 vUvF;
      void main() {
        vec3 l = pow( texture2D( bakeMap, vUvF ).rgb, vec3( 2.2 ) );
        vec3 open = pow( texture2D( bakeMap, vec2( 0.03, 0.97 ) ).rgb, vec3( 2.2 ) );
        float k = clamp( dot( l, vec3( 0.333 ) ) / dot( open, vec3( 0.333 ) ), 0.0, 1.0 );
        vec2 e = smoothstep( vec2( 0.0 ), vec2( 0.1 ), vUvF ) * smoothstep( vec2( 0.0 ), vec2( 0.1 ), 1.0 - vUvF );
        gl_FragColor = vec4( bg * mix( 1.0, mix( 0.55, 1.0, k ), e.x * e.y ), 1.0 );
        #include <colorspace_fragment>
      }`,
  });
}
