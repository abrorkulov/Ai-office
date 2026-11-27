// Расчёт света офиса: солнце, небо и отражения. npx tsx tools/assets/bake.ts [качество 0.1…1] [этаж 1|2]
// Результат: floor.webp (карта света пола) и verts.png (свет в вершинах стен и мебели).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isMainThread, parentPort, Worker, workerData } from "node:worker_threads";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dequantize } from "@gltf-transform/functions";
import { MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
import * as THREE from "three";
import { MeshBVH } from "three-mesh-bvh";
import { GROUND } from "../../src/features/office/layout";
import { PLANS } from "../../src/features/office/plans";
import { ALBEDO, buildShell } from "../../src/features/office/shell";

// ── Общие параметры света ──
const SUN = new THREE.Vector3(-0.55, 1.0, 0.62).normalize();
const SUN_E: [number, number, number] = [1.02, 0.96, 0.86];
const sky = (y: number): [number, number, number] => (y < 0 ? [0.5, 0.5, 0.5] : [0.72 + 0.1 * y, 0.75 + 0.11 * y, 0.8 + 0.14 * y]);
const SCALE = 2.2; // 255 в файле = освещённость 2.2

interface Job { kind: "points"; from: number; to: number }
interface Shared { index: SharedArrayBuffer; pos: SharedArrayBuffer; col: SharedArrayBuffer; roots: SharedArrayBuffer[]; pts: SharedArrayBuffer; nrm: SharedArrayBuffer; out: SharedArrayBuffer; spp: SharedArrayBuffer; version: number }

function tracer(s: Shared) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(s.pos), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(s.index), 1));
  const bvh = MeshBVH.deserialize({ version: s.version, roots: s.roots, index: new Uint32Array(s.index), indirectBuffer: null } as never, g, { setIndex: true });
  const col = new Float32Array(s.col), idx = g.index!.array, pos = g.attributes.position.array;
  const ray = new THREE.Ray(), d = new THREE.Vector3(), t = new THREE.Vector3(), b = new THREE.Vector3(), n = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), A = new THREE.Vector3();
  let seed = 1;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  const cosine = (nx: number, ny: number, nz: number, u: number, v: number, out: THREE.Vector3) => {
    n.set(nx, ny, nz);
    t.set(Math.abs(nx) > 0.9 ? 0 : 1, Math.abs(nx) > 0.9 ? 1 : 0, 0).cross(n).normalize();
    b.copy(n).cross(t);
    const r = Math.sqrt(u), p = 2 * Math.PI * v;
    return out.copy(t).multiplyScalar(r * Math.cos(p)).addScaledVector(b, r * Math.sin(p)).addScaledVector(n, Math.sqrt(1 - u)).normalize();
  };
  const sunAt = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    // мягкая кромка тени: солнце чуть больше настоящего
    d.set(SUN.x + (rnd() - 0.5) * 0.07, SUN.y + (rnd() - 0.5) * 0.07, SUN.z + (rnd() - 0.5) * 0.07).normalize();
    const c = d.x * nx + d.y * ny + d.z * nz;
    if (c <= 0) return 0;
    ray.origin.set(x + nx * 0.004, y + ny * 0.004, z + nz * 0.004);
    ray.direction.copy(d);
    return bvh.raycastFirst(ray, THREE.DoubleSide) ? 0 : c;
  };
  const dir = new THREE.Vector3();
  return (px: number, py: number, pz: number, nx: number, ny: number, nz: number, spp: number, out: Float32Array, o: number, s0: number) => {
    seed = s0 * 7919 + 13;
    let R = 0, G = 0, B = 0;
    const m = Math.max(1, Math.round(Math.sqrt(spp)));
    for (let i = 0; i < m * m; i++) {
      const sun = sunAt(px, py, pz, nx, ny, nz);
      R += sun * SUN_E[0]; G += sun * SUN_E[1]; B += sun * SUN_E[2];
      let x = px, y = py, z = pz, ax = nx, ay = ny, az = nz, tr = 1, tg = 1, tb = 1;
      let u = ((i % m) + rnd()) / m, v = (Math.floor(i / m) + rnd()) / m;
      for (let bounce = 0; bounce < 3; bounce++) {
        cosine(ax, ay, az, u, v, dir);
        ray.origin.set(x + ax * 0.004, y + ay * 0.004, z + az * 0.004);
        ray.direction.copy(dir);
        const hit = bvh.raycastFirst(ray, THREE.DoubleSide);
        if (!hit) {
          const c = sky(dir.y);
          R += tr * c[0]; G += tg * c[1]; B += tb * c[2];
          break;
        }
        const f = hit.faceIndex!, k = f * 3;
        const i0 = idx[k] * 3, i1 = idx[k + 1] * 3, i2 = idx[k + 2] * 3;
        A.set(pos[i0], pos[i0 + 1], pos[i0 + 2]);
        e1.set(pos[i1], pos[i1 + 1], pos[i1 + 2]).sub(A);
        e2.set(pos[i2], pos[i2 + 1], pos[i2 + 2]).sub(A);
        e1.cross(e2).normalize();
        if (e1.dot(dir) > 0) e1.negate();
        x = hit.point.x; y = hit.point.y; z = hit.point.z;
        ax = e1.x; ay = e1.y; az = e1.z;
        tr *= col[idx[k] * 3]; tg *= col[idx[k] * 3 + 1]; tb *= col[idx[k] * 3 + 2];
        const sb = sunAt(x, y, z, ax, ay, az);
        R += tr * sb * SUN_E[0]; G += tg * sb * SUN_E[1]; B += tb * sb * SUN_E[2];
        u = rnd(); v = rnd();
        if (tr + tg + tb < 0.06) break;
      }
    }
    const q = 1 / (m * m);
    out[o] = R * q; out[o + 1] = G * q; out[o + 2] = B * q;
  };
}

if (!isMainThread) {
  const s = workerData as Shared;
  const shade = tracer(s), P = new Float32Array(s.pts), N = new Float32Array(s.nrm), O = new Float32Array(s.out), S = new Uint16Array(s.spp);
  parentPort!.on("message", (j: Job) => {
    for (let i = j.from; i < j.to; i++) shade(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2], S[i], O, i * 3, i);
    parentPort!.postMessage(0);
  });
} else void main();

const share = (a: Float32Array | Uint32Array | Uint16Array) => {
  const b = new SharedArrayBuffer(a.byteLength);
  new Uint8Array(b).set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  return b;
};

async function main() {
  const q = Number(process.argv[2] ?? 1);
  const floor = Number(process.argv[3] ?? 1) as 1 | 2;
  const OUT = `public/office/light/f${floor}`;
  fs.mkdirSync(OUT, { recursive: true });
  const t0 = Date.now();

  // ── Геометрия сцены ──
  const pos: number[][] = [], idx: number[][] = [], cols: number[][] = [];
  let vertexBase = 0;
  const addScene = (p: ArrayLike<number>, ix: ArrayLike<number>, c: number[]) => {
    pos.push(Array.from(p));
    idx.push(Array.from(ix, (v) => v + vertexBase));
    const n = p.length / 3, arr = new Array<number>(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c[0]; arr[i * 3 + 1] = c[1]; arr[i * 3 + 2] = c[2]; }
    cols.push(arr);
    vertexBase += n;
  };
  const pts: number[][] = [], nrm: number[][] = [];
  // где в текстуре лежит свет каждой сетки
  const shellMap: Record<string, [number, number]> = {}, modelMap: Record<string, [number, number]> = {};
  let bakeAt = 0;
  for (const [surface, g] of buildShell(floor)) {
    // тонкие рамы стекла тени не дают: частая решётка на полу только рябит
    if (surface !== "frame") addScene(g.attributes.position.array, g.index!.array, ALBEDO[surface]);
    shellMap[surface] = [bakeAt, g.attributes.position.count];
    bakeAt += g.attributes.position.count;
    pts.push(Array.from(g.attributes.position.array));
    nrm.push(Array.from(g.attributes.normal.array));
  }
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const items = PLANS[floor].items(), models = [...new Set(items.map((i) => i.model))].sort();
  for (const model of models) {
    const doc = await io.read(`public/office/furniture/${model}.glb`);
    await doc.transform(dequantize());
    const list = items.filter((i) => i.model === model);
    const colorOf = new Map<unknown, number[]>();
    for (const m of doc.getRoot().listMaterials()) {
      const img = m.getBaseColorTexture()?.getImage();
      const f = m.getBaseColorFactor();
      let c = [f[0], f[1], f[2]];
      if (img) {
        const st = await sharp(img).removeAlpha().stats();
        c = st.channels.slice(0, 3).map((x, i) => ((x.mean / 255) ** 2.2) * f[i]);
      }
      colorOf.set(m, c);
    }
    for (const [ni, node] of doc.getRoot().listNodes().entries()) {
      const mesh = node.getMesh();
      if (!mesh) continue;
      const local = new THREE.Matrix4().fromArray(node.getWorldMatrix());
      for (const [pi, prim] of mesh.listPrimitives().entries()) {
        const p = prim.getAttribute("POSITION")!.getArray()!, nn = prim.getAttribute("NORMAL")!.getArray()!, ix = prim.getIndices()!.getArray()!;
        modelMap[`${model}/${ni}/${pi}`] = [bakeAt, p.length / 3];
        bakeAt += (p.length / 3) * list.length;
        for (const it of list) {
          const M = new THREE.Matrix4().compose(new THREE.Vector3(...it.p), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.r), new THREE.Vector3(it.s, it.s, it.s)).multiply(local);
          const NM = new THREE.Matrix3().getNormalMatrix(M), v = new THREE.Vector3();
          const wp = new Array<number>(p.length), wn = new Array<number>(p.length);
          for (let i = 0; i < p.length; i += 3) {
            v.set(p[i], p[i + 1], p[i + 2]).applyMatrix4(M).toArray(wp, i);
            v.set(nn[i], nn[i + 1], nn[i + 2]).applyMatrix3(NM).normalize().toArray(wn, i);
          }
          addScene(wp, ix, colorOf.get(prim.getMaterial()) ?? [0.5, 0.5, 0.5]);
          pts.push(wp);
          nrm.push(wn);
        }
      }
    }
  }
  const verts = pts.reduce((s, a) => s + a.length / 3, 0);
  // пол: кабинеты — паркет, атриум — терраццо; для отражений хватает среднего цвета
  addScene([-GROUND.w / 2, 0, -GROUND.d / 2, GROUND.w / 2, 0, -GROUND.d / 2, GROUND.w / 2, 0, GROUND.d / 2, -GROUND.w / 2, 0, GROUND.d / 2], [0, 2, 1, 0, 3, 2], [0.58, 0.52, 0.45]);

  const floorW = Math.round(2048 * Math.sqrt(q)), floorH = Math.round((floorW * GROUND.d) / GROUND.w), floorN = floorW * floorH;
  const total = verts + floorN;
  const P = new Float32Array(total * 3), N = new Float32Array(total * 3), S = new Uint16Array(total);
  let o = 0;
  for (let k = 0; k < pts.length; k++) { P.set(pts[k], o * 3); N.set(nrm[k], o * 3); o += pts[k].length / 3; }
  S.fill(Math.max(16, Math.round(100 * q)), 0, verts);
  // стены большие и гладкие: на них шум заметнее всего
  S.fill(Math.round(400 * q), ...([shellMap.plaster[0], shellMap.plaster[0] + shellMap.plaster[1]] as const));
  for (let y = 0; y < floorH; y++) for (let x = 0; x < floorW; x++) {
    const i = verts + y * floorW + x;
    P[i * 3] = ((x + 0.5) / floorW - 0.5) * GROUND.w; P[i * 3 + 1] = 0.001; P[i * 3 + 2] = ((y + 0.5) / floorH - 0.5) * GROUND.d;
    N[i * 3 + 1] = 1;
    S[i] = Math.max(16, Math.round(81 * q));
  }
  const flat = (a: number[][]) => { const n = a.reduce((s, x) => s + x.length, 0); const f = new Float32Array(n); let k = 0; for (const x of a) { f.set(x, k); k += x.length; } return f; };
  const pos32 = flat(pos), index = new Uint32Array(idx.reduce((s, x) => s + x.length, 0));
  { let k = 0; for (const x of idx) { index.set(x, k); k += x.length; } }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos32, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  const bvh = new MeshBVH(geo);
  const ser = MeshBVH.serialize(bvh, { cloneBuffers: true }) as unknown as { version: number; roots: ArrayBuffer[]; index: Uint32Array };
  console.log(`треугольников ${index.length / 3}, вершин ${verts}, пол ${floorW}×${floorH}, подготовка ${((Date.now() - t0) / 1000).toFixed(1)} с`);
  const shared: Shared = {
    index: share(ser.index), pos: share(pos32), col: share(flat(cols)), roots: ser.roots.map((r) => share(new Uint32Array(r))),
    pts: share(P), nrm: share(N), out: new SharedArrayBuffer(total * 12), spp: share(S), version: ser.version,
  };
  {
    const size = new Map<string, number>();
    for (const [s2, g] of buildShell(floor)) size.set(s2, g.attributes.position.count);
    console.log([...size].map(([a, b]) => `${a} ${b}`).join(", "));
  }
  const CH = 4000;
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, os.cpus().length - 1) }, () => new Promise<void>((res, rej) => {
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: shared, execArgv: ["--import", "tsx"] });
      const give = () => {
        if (next >= total) return void w.terminate().then(() => res());
        const from = next;
        next = Math.min(total, next + CH);
        if (Math.floor(from / total * 10) !== Math.floor(next / total * 10)) console.log(`${Math.round((next / total) * 100)}%  ${((Date.now() - t0) / 1000).toFixed(0)} с`);
        w.postMessage({ kind: "points", from, to: next } satisfies Job);
      };
      w.on("message", give);
      w.on("error", rej);
      give();
    })),
  );
  const out = new Float32Array(shared.out);
  const enc = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v / SCALE)) ** (1 / 2.2));

  // Вершины
  const tw = 2048, th = Math.ceil(verts / tw), vb = Buffer.alloc(tw * th * 3);
  for (let i = 0; i < verts * 3; i++) vb[i] = enc(out[i]);
  await sharp(vb, { raw: { width: tw, height: th, channels: 3 } }).webp({ lossless: true, effort: 6 }).toFile(path.join(OUT, "verts.webp"));

  // Пол: сглаживание шума с сохранением кромок теней
  const src = out.subarray(verts * 3), den = new Float32Array(floorN * 3), R = 2;
  for (let y = 0; y < floorH; y++) for (let x = 0; x < floorW; x++) {
    const i = (y * floorW + x) * 3, L = src[i] + src[i + 1] + src[i + 2];
    let w = 0, r = 0, gg = 0, bb = 0;
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= floorW || yy >= floorH) continue;
      const j = (yy * floorW + xx) * 3, dl = src[j] + src[j + 1] + src[j + 2] - L;
      const k = Math.exp(-(dx * dx + dy * dy) / 4 - (dl * dl) / 0.18);
      w += k; r += src[j] * k; gg += src[j + 1] * k; bb += src[j + 2] * k;
    }
    den[i] = r / w; den[i + 1] = gg / w; den[i + 2] = bb / w;
  }
  const fb = Buffer.alloc(floorN * 3);
  for (let i = 0; i < floorN * 3; i++) fb[i] = enc(den[i]);
  await sharp(fb, { raw: { width: floorW, height: floorH, channels: 3 } }).webp({ quality: 92, effort: 6 }).toFile(path.join(OUT, "floor.webp"));
  fs.writeFileSync(path.join(OUT, "light.json"), JSON.stringify({ verts, width: tw, scale: SCALE, version: Date.now(), shell: shellMap, models: modelMap }));
  console.log(`готово за ${((Date.now() - t0) / 1000).toFixed(0)} с`, fs.readdirSync(OUT).map((f) => `${f} ${Math.round(fs.statSync(path.join(OUT, f)).size / 1024)} КБ`).join(", "));
  process.exit(0);
}
