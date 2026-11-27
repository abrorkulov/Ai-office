import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Floor } from "@/shared/catalog";
import { DEPTH, DESK_H, OFFICES, rot, WALL } from "./layout";
import { PODS, POD, ROOMS2, SEATS2 } from "./layout2";
import { PLANS } from "./plans";

// Стены и простая мебель строятся кодом. Без DOM: тот же модуль работает в расчёте света.
export const SURFACES = ["plaster", "cap", "frame", "oak", "walnut", "wool", "woolDark", "white", "metal", "black", "concrete", "soil", "leaf"] as const;
export type Surface = (typeof SURFACES)[number];
/** Средний цвет поверхности для отражённого света. */
export const ALBEDO: Record<Surface, [number, number, number]> = {
  plaster: [0.82, 0.81, 0.79], cap: [0.1, 0.1, 0.11], frame: [0.05, 0.05, 0.055], oak: [0.55, 0.4, 0.26], walnut: [0.28, 0.17, 0.1], wool: [0.6, 0.57, 0.52], woolDark: [0.1, 0.12, 0.15], white: [0.85, 0.85, 0.85], metal: [0.5, 0.5, 0.52], black: [0.03, 0.03, 0.035], concrete: [0.5, 0.49, 0.47], soil: [0.08, 0.06, 0.05], leaf: [0.1, 0.2, 0.06],
};

type Bucket = Record<Surface, THREE.BufferGeometry[]>;

/** RoundedBoxGeometry не делит вершины между гранями; склейка уменьшает её в несколько раз. */
function rounded(w: number, h: number, d: number, seg: number, rad: number) {
  const g: THREE.BufferGeometry = new RoundedBoxGeometry(w, h, d, seg, rad);
  g.deleteAttribute("uv");
  return mergeVertices(g, 1e-4);
}

/** Развёртка по мировым координатам: текстура одного масштаба на всех предметах. */
function boxUv(g: THREE.BufferGeometry, scale = 1) {
  const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const [u, v] = ay >= ax && ay >= az ? [p.getX(i), p.getZ(i)] : ax >= az ? [p.getZ(i), p.getY(i)] : [p.getX(i), p.getY(i)];
    uv[i * 2] = u * scale;
    uv[i * 2 + 1] = v * scale;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

export function buildShell(floor: Floor = 1): Map<Surface, THREE.BufferGeometry> {
  const plan = PLANS[floor];
  const b = Object.fromEntries(SURFACES.map((s) => [s, []])) as unknown as Bucket;
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  const put = (s: Surface, g: THREE.BufferGeometry, x: number, y: number, z: number, r = 0) => {
    boxUv(g);
    g.applyMatrix4(M.compose(new THREE.Vector3(x, y, z), Q.setFromAxisAngle(UP, r), new THREE.Vector3(1, 1, 1)));
    b[s].push(g);
  };
  // мелкая сетка: свет считается в вершинах
  const box = (s: Surface, w: number, h: number, d: number, x: number, y: number, z: number, r = 0, step = 0.5) =>
    put(s, new THREE.BoxGeometry(w, h, d, Math.max(1, Math.ceil(w / step)), Math.max(1, Math.ceil(h / step)), Math.max(1, Math.ceil(d / step))), x, y, z, r);
  const soft = (s: Surface, w: number, h: number, d: number, rad: number, x: number, y: number, z: number, r = 0, seg = 3) => put(s, rounded(w, h, d, seg, rad), x, y, z, r);
  const tube = (s: Surface, rad: number, h: number, x: number, y: number, z: number, seg = 14, rad2 = rad) => put(s, new THREE.CylinderGeometry(rad2, rad, h, seg), x, y, z);

  // ── Стены ──
  for (const [x1, z1, x2, z2, h] of plan.walls()) {
    const len = Math.hypot(x2 - x1, z2 - z1), r = -Math.atan2(z2 - z1, x2 - x1);
    const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    box("plaster", len + 0.12, h, 0.12, cx, h / 2, cz, r, 0.2);
    box("cap", len + 0.124, 0.012, 0.124, cx, h + 0.006, cz, r, 2);
    box("white", len, 0.08, 0.145, cx, 0.04, cz, r, 0.5);
  }
  // ── Рамы остекления ──
  for (const [x1, z1, x2, z2, y0, y1, n] of plan.glass()) {
    const len = Math.hypot(x2 - x1, z2 - z1), r = -Math.atan2(z2 - z1, x2 - x1), cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
    box("frame", len, 0.035, 0.05, cx, y1 - 0.018, cz, r, 1);
    box("frame", len, 0.035, 0.05, cx, y0 + 0.018, cz, r, 1);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      box("frame", 0.026, y1 - y0, 0.045, x1 + (x2 - x1) * t, (y0 + y1) / 2, z1 + (z2 - z1) * t, r, 0.7);
    }
  }
  // ── Кабинеты ──
  for (const o of floor === 1 ? OFFICES : []) {
    const at = (x: number, z: number): [number, number] => {
      const [wx, wz] = rot(x, z, o.r);
      return [o.x + wx, o.z + wz];
    };
    const toWindow = o.side === "bottom", dz = toWindow ? -1 : 1, cz = toWindow ? 0.75 : -1.0, deskZ = cz + dz * 0.72;
    const [dx, dzw] = at(0.1, deskZ);
    const wood: Surface = o.seat % 3 === 1 ? "walnut" : "oak";
    soft(wood, 1.7, 0.035, 0.82, 0.012, dx, DESK_H - 0.0175, dzw, o.r, 2);
    for (const sx of [-0.74, 0.74]) {
      const [lx, lz] = at(0.1 + sx, deskZ);
      box("frame", 0.06, 0.04, 0.7, lx, 0.02, lz, o.r, 0.4);
      box("frame", 0.07, DESK_H - 0.06, 0.05, lx, DESK_H / 2, lz, o.r, 0.25);
      box("frame", 0.05, 0.03, 0.62, lx, DESK_H - 0.05, lz, o.r, 0.4);
    }
    // монитор, клавиатура, мышь
    const [mx, mz] = at(0.1, cz + dz * 0.935);
    soft("black", 0.66, 0.39, 0.022, 0.008, mx, DESK_H + 0.33, mz, o.r, 2);
    const [sx, sz] = at(0.1, cz + dz * 0.97);
    box("metal", 0.05, 0.3, 0.02, sx, DESK_H + 0.16, sz, o.r, 0.15);
    soft("metal", 0.24, 0.012, 0.17, 0.005, sx, DESK_H + 0.006, sz, o.r, 2);
    const [kx, kz] = at(0.1, cz + dz * 0.56);
    soft("white", 0.42, 0.014, 0.125, 0.005, kx, DESK_H + 0.008, kz, o.r, 2);
    const [ux, uz] = at(0.1 + dz * -0.3, cz + dz * 0.56);
    soft("white", 0.055, 0.026, 0.1, 0.012, ux, DESK_H + 0.013, uz, o.r, 2);
    taskChair(o.chair.x, o.chair.z, o.chair.r + (o.seat % 2 ? 0.06 : -0.05));
    // деревянная панель на задней стене верхнего ряда
    if (o.side === "top") {
      box("black", 3.2, 2.5, 0.012, o.x, 1.33, o.z - DEPTH / 2 + 0.067, 0, 0.6);
      for (let i = 0; i < 53; i++) box(wood, 0.042, 2.5, 0.024, o.x - 1.56 + i * 0.06, 1.33, o.z - DEPTH / 2 + 0.085, 0, 0.6);
    } else if (!toWindow) {
      const [cx, czz] = at(0, -o.d / 2 + 0.3);
      soft(wood, 2.3, 0.45, 0.4, 0.012, cx, 0.225, czz, o.r, 2);
    }
  }
  function taskChair(x: number, z: number, r: number) {
    const at = (lx: number, lz: number): [number, number] => {
      const [a, c] = rot(lx, lz, r);
      return [x + a, z + c];
    };
    soft("woolDark", 0.5, 0.08, 0.48, 0.035, ...xz(at(0, 0.0), 0.455), r, 4);
    // спинка чуть изогнута
    const g = rounded(0.46, 0.56, 0.06, 3, 0.028);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + p.getX(i) ** 2 * 0.55 - p.getY(i) * 0.16);
    g.computeVertexNormals();
    put("woolDark", g, ...xz(at(0, -0.25), 0.8), r);
    box("metal", 0.06, 0.3, 0.02, ...xz(at(0, -0.27), 0.52), r, 0.3);
    tube("metal", 0.03, 0.34, x, 0.26, z);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + r;
      box("metal", 0.3, 0.028, 0.045, x + Math.cos(a) * 0.15, 0.085, z - Math.sin(a) * 0.15, a, 0.3);
      put("black", new THREE.SphereGeometry(0.03, 10, 8), x + Math.cos(a) * 0.29, 0.035, z - Math.sin(a) * 0.29);
    }
  }
  function xz([x, z]: [number, number], y: number): [number, number, number] {
    return [x, y, z];
  }
  function sofa(x: number, z: number, r: number, len: number, s: Surface) {
    const at = (lx: number, lz: number): [number, number] => {
      const [a, c] = rot(lx, lz, r);
      return [x + a, z + c];
    };
    const n = Math.round(len / 0.85), cw = (len - 0.36) / n;
    soft(s, len, 0.24, 0.86, 0.05, ...xz(at(0, 0), 0.24), r);
    soft(s, len, 0.46, 0.18, 0.07, ...xz(at(0, -0.36), 0.5), r, 4);
    for (const e of [-1, 1]) soft(s, 0.17, 0.4, 0.86, 0.07, ...xz(at(e * (len / 2 - 0.085), 0), 0.4), r, 4);
    for (let i = 0; i < n; i++) {
      const lx = -len / 2 + 0.18 + cw * (i + 0.5);
      soft(s, cw - 0.012, 0.15, 0.66, 0.06, ...xz(at(lx, 0.08), 0.42), r, 4);
      soft(s, cw - 0.02, 0.36, 0.16, 0.07, ...xz(at(lx, -0.2), 0.6), r, 4);
    }
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) tube("walnut", 0.02, 0.12, ...xz(at(ex * (len / 2 - 0.1), ez * 0.34), 0.06), 10);
  }
  // ── Гостиная ──
  if (floor === 1) {
    sofa(-1.2, -2.15, 0, 3.1, "wool");
    sofa(-1.2, 2.15, Math.PI, 3.1, "wool");
    sofa(3.1, -2.0, 0, 2.6, "woolDark");
    sofa(3.1, 2.1, Math.PI, 2.6, "woolDark");
  }
  // низкие кадки с зеленью вокруг гостиной
  for (const i of plan.items()) if (i.model === "pachira_aquatica_01") planter(i.p[0], i.p[2], i.s > 1 ? 0.5 : 0.26, i.p[1] + 0.04, i.s > 1 ? "concrete" : "white");
  function planter(x: number, z: number, rad: number, h: number, s: Surface = "concrete") {
    put(s, new THREE.CylinderGeometry(rad, rad * 0.9, h, 40, 3, true), x, h / 2, z);
    put(s, new THREE.TorusGeometry(rad - 0.012, 0.014, 8, 40).rotateX(Math.PI / 2), x, h, z);
    put("soil", new THREE.CircleGeometry(rad - 0.01, 32).rotateX(-Math.PI / 2), x, h - 0.04, z);
  }
  if (floor === 1) {
  // ── Переговорная ──
  soft("walnut", 4.4, 0.045, 1.35, 0.02, -9.12, 0.74, 0, 0, 3);
  for (const x of [-10.6, -7.65]) {
    box("frame", 0.5, 0.03, 0.8, x, 0.015, 0, 0, 0.3);
    box("frame", 0.09, 0.7, 0.4, x, 0.37, 0, 0, 0.3);
  }
  soft("black", 0.05, 1.1, 1.95, 0.015, -12.25, 1.5, 0, 0, 2);
  // ── Кухня: остров и стенка ──
  soft("white", 0.95, 0.05, 3.7, 0.012, 9.1, 0.945, 0, 0, 2);
  box("oak", 0.75, 0.92, 3.5, 9.15, 0.46, 0, 0, 0.25);
  box("walnut", 0.62, 0.9, 5.4, 12.0, 0.45, 0, 0, 0.25);
  soft("white", 0.66, 0.04, 5.44, 0.01, 12.0, 0.92, 0, 0, 2);
  for (let i = 0; i < 9; i++) box("frame", 0.01, 0.8, 0.012, 11.685, 0.46, -2.4 + i * 0.6, 0, 1);
  soft("metal", 0.34, 0.42, 0.36, 0.03, 12.0, 1.15, 1.5, 0, 3);
  soft("black", 0.3, 0.05, 0.3, 0.02, 11.9, 0.99, 1.5, 0, 2);
  for (let i = 0; i < 5; i++) tube("white", 0.036, 0.09, 11.95, 0.985, 0.5 + i * 0.11, 16, 0.042);
  for (const z of [-1.2, -0.4, 0.4, 1.2]) {
    tube("walnut", 0.19, 0.045, 8.25, 0.68, z, 28);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      box("frame", 0.025, 0.66, 0.025, 8.25 + Math.cos(a) * 0.15, 0.33, z + Math.sin(a) * 0.15, 0, 0.3);
    }
    put("frame", new THREE.TorusGeometry(0.15, 0.01, 6, 24).rotateX(Math.PI / 2), 8.25, 0.22, z);
  }
  // ── Холл: стойка ──
  soft("oak", 3.2, 1.05, 0.6, 0.02, 1.2, 0.525, 7.9, 0, 3);
  soft("white", 3.3, 0.04, 0.72, 0.012, 1.2, 1.07, 7.9, 0, 2);
  // переговорные стулья
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) shellChair(-10.55 + i * 0.95, s * 1.05, s > 0 ? Math.PI : 0);
  }
  function shellChair(x: number, z: number, r: number) {
    const at = (lx: number, lz: number): [number, number] => {
      const [a, c] = rot(lx, lz, r);
      return [x + a, z + c];
    };
    soft("wool", 0.46, 0.06, 0.44, 0.028, ...xz(at(0, 0), 0.45), r, 4);
    const g = rounded(0.46, 0.4, 0.045, 3, 0.02);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + p.getX(i) ** 2 * 0.9 - p.getY(i) * 0.14);
    g.computeVertexNormals();
    put("wool", g, ...xz(at(0, -0.23), 0.68), r);
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) tube("oak", 0.013, 0.43, ...xz(at(ex * 0.19, ez * 0.18), 0.215), 10, 0.018);
  }
  // книжные полки-перегородки между гостиной и кухней
  for (const z of floor === 1 ? [-4.6, 4.6] : []) {
    for (const x of [-2.2, 0, 2.2]) {
      box("oak", 2.1, 0.035, 0.36, x, 0.45, z, 0, 0.4);
      box("oak", 2.1, 0.035, 0.36, x, 0.06, z, 0, 0.4);
      for (const e of [-1.03, 1.03]) box("oak", 0.035, 0.42, 0.36, x + e, 0.25, z, 0, 0.3);
    }
  }

  // ── Книги: на низких полках атриума и на стеллажах кабинетов ──
  let seed = floor === 1 ? 7 : 31;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const books = (x: number, y: number, z: number, r: number, len: number) => {
    for (let at = -len / 2; at < len / 2; ) {
      const t = 0.018 + rnd() * 0.026, h = 0.17 + rnd() * 0.08, d = 0.14 + rnd() * 0.04;
      const [dx, dz] = rot(at + t / 2, 0, r);
      box((["white", "woolDark", "walnut", "wool", "oak", "leaf"] as const)[Math.floor(rnd() * 6)], t, h, d, x + dx, y + h / 2, z + dz, r, 1);
      at += t + 0.002;
    }
  };
  for (const z of floor === 1 ? [-4.6, 4.6] : []) {
    books(-2.6, 0.467, z, 0, 0.5);
    books(0.75, 0.467, z, 0, 0.6);
    for (const x of [-2.4, 0.2, 2.1]) books(x, 0.077, z, 0, 0.9);
  }
  for (const i of plan.items()) {
    if (i.model === "drawer_cabinet") {
      const [ox, oz] = rot(-0.15, -0.02, i.r);
      for (const y of [1.265, 1.605]) books(i.p[0] + ox * (y > 1.5 ? -1 : 1), y * i.s, i.p[2] + oz, i.r, 0.5);
    }
    if (i.model === "steel_frame_shelves_03") {
      const [ox, oz] = rot(0.6 * i.s, 0, i.r), [px, pz] = rot(-0.5 * i.s, 0, i.r);
      books(i.p[0] + ox, 1.75 * i.s, i.p[2] + oz, i.r, 0.7);
      books(i.p[0] + px, 1.38 * i.s, i.p[2] + pz, i.r, 0.6);
    }
  }

  // ── Второй этаж ──
  function floor2() {
    // группы столов: у каждого места стол, два монитора, клавиатура, кресло
    for (const s of SEATS2) {
      const at = (lx: number, lz: number): [number, number] => {
        const [a, c] = rot(lx, lz, s.r);
        return [s.x + a, s.z + c];
      };
      soft(s.seat % 3 === 0 ? "oak" : "white", POD.desk, 0.03, POD.depth, 0.01, s.x, DESK_H - 0.015, s.z, s.r, 2);
      for (const e of [-1, 1]) box("frame", 0.05, DESK_H - 0.03, POD.depth - 0.1, ...xz(at(e * (POD.desk / 2 - 0.06), 0), (DESK_H - 0.03) / 2), s.r, 0.3);
      for (const [mx, ang] of [[-0.18, 0], [0.42, 0.42]] as const) {
        const [x, z] = at(mx, -0.16 - (mx > 0 ? 0.02 : 0));
        soft("black", 0.6, 0.35, 0.02, 0.006, x, DESK_H + 0.31, z, s.r + ang, 2);
        const [bx, bz] = at(mx, -0.24);
        box("metal", 0.04, 0.27, 0.02, bx, DESK_H + 0.14, bz, s.r + ang, 0.2);
        soft("metal", 0.2, 0.01, 0.14, 0.004, bx, DESK_H + 0.005, bz, s.r + ang, 2);
      }
      const [kx, kz] = at(-0.15, 0.14);
      soft("black", 0.4, 0.016, 0.13, 0.005, kx, DESK_H + 0.008, kz, s.r, 2);
      const [ux, uz] = at(0.2, 0.16);
      soft("black", 0.06, 0.025, 0.1, 0.012, ux, DESK_H + 0.012, uz, s.r, 2);
      const [px, pz] = at(-0.5, 0.05);
      box("white", 0.4, 0.55, 0.5, px, 0.3, pz, s.r, 0.3);
      taskChair(s.chair.x, s.chair.z, s.chair.r + (s.seat % 2 ? 0.08 : -0.06));
    }
    // войлочные экраны между рядами
    for (const [x, z] of PODS) {
      box("woolDark", 3.2, 0.42, 0.03, x, DESK_H + 0.21, z, 0, 0.3);
      // линейный светильник над группой
      box("black", 2.4, 0.05, 0.1, x, WALL - 0.55, z, 0, 0.6);
      for (const e of [-1, 1]) box("black", 0.006, 0.5, 0.006, x + e * 1.0, WALL - 0.27, z, 0, 1);
    }
    // переговорные: стол и стулья, экран на стене
    for (const m of [ROOMS2.meetA, ROOMS2.meetB]) {
      const cx = (m.x0 + m.x1) / 2, cz = (m.z0 + m.z1) / 2 + 0.2;
      soft("walnut", 3.0, 0.045, 1.2, 0.02, cx, 0.74, cz, 0, 3);
      for (const e of [-1, 1]) box("frame", 0.08, 0.7, 0.5, cx + e * 1.1, 0.37, cz, 0, 0.3);
      for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) shellChair(cx - 0.9 + i * 0.9, cz + sd * 0.95, sd > 0 ? Math.PI : 0);
      soft("black", 1.6, 0.92, 0.04, 0.01, cx, 1.45, m.z0 + 0.1, 0, 2);
    }
    // будки для созвонов
    for (const bx of [-5.0, -3.8]) {
      soft("wool", 0.9, 0.45, 0.5, 0.05, bx, 0.225, -10.85, 0, 3);
      soft("white", 0.5, 0.03, 0.4, 0.01, bx, 0.95, -10.75, 0, 2);
    }
    // кухня у северной стены и остров
    box("walnut", 8.0, 0.9, 0.62, 13.4, 0.45, -10.85, 0, 0.25);
    soft("white", 8.04, 0.04, 0.66, 0.01, 13.4, 0.92, -10.85, 0, 2);
    box("white", 8.0, 0.75, 0.36, 13.4, 1.9, -11.0, 0, 0.3);
    soft("metal", 0.34, 0.42, 0.36, 0.03, 10.0, 1.15, -10.85, 0, 3);
    soft("oak", 3.6, 0.92, 0.9, 0.02, 13.2, 0.46, -8.2, 0, 3);
    soft("white", 3.7, 0.04, 1.0, 0.01, 13.2, 0.94, -8.2, 0, 2);
    for (const x of [11.9, 12.9, 13.9, 14.9]) {
      tube("walnut", 0.19, 0.045, x, 0.68, -7.25, 28);
      tube("frame", 0.02, 0.66, x, 0.33, -7.25, 10);
      put("frame", new THREE.CircleGeometry(0.2, 24).rotateX(-Math.PI / 2), x, 0.01, -7.25);
    }
    // лаунж
    sofa(11.2, -0.35, 0, 2.8, "wool");
    sofa(11.2, 4.4, Math.PI, 2.8, "woolDark");
    // настольный теннис
    box("leaf", 2.74, 0.03, 1.525, 12.6, 0.745, 8.2, 0, 0.5);
    box("white", 2.74, 0.006, 0.02, 12.6, 0.762, 8.2, 0, 1);
    box("black", 0.015, 0.15, 1.7, 12.6, 0.83, 8.2, 0, 0.3);
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) box("frame", 0.05, 0.73, 0.05, 12.6 + ex * 1.2, 0.365, 8.2 + ez * 0.6, 0, 0.3);
    // стена из реек с большим экраном и общий стол
    box("black", 11.6, 2.5, 0.012, 3.4, 1.33, -11.13, 0, 0.6);
    for (let i = 0; i < 193; i++) box(i % 4 === 0 ? "walnut" : "oak", 0.042, 2.5, 0.024, -2.36 + i * 0.06, 1.33, -11.115, 0, 0.6);
    soft("black", 2.2, 1.24, 0.05, 0.01, 3.4, 1.55, -11.07, 0, 2);
    soft("oak", 5.6, 0.05, 1.1, 0.02, 3.4, 0.74, -8.4, 0, 3);
    for (const e of [-2.4, 2.4]) box("frame", 0.08, 0.72, 0.9, 3.4 + e, 0.36, -8.4, 0, 0.3);
    for (let i = 0; i < 5; i++) for (const sd of [-1, 1]) shellChair(1.4 + i * 1.0, -8.4 + sd * 0.85, sd > 0 ? Math.PI : 0);
    // низкие полки между рядами столов
    for (const x of [-9.0, -1.8]) {
      box("oak", 2.4, 0.035, 0.36, x, 0.45, 7.8, 0, 0.4);
      box("oak", 2.4, 0.035, 0.36, x, 0.06, 7.8, 0, 0.4);
      for (const e of [-1.18, 1.18]) box("oak", 0.035, 0.42, 0.36, x + e, 0.25, 7.8, 0, 0.3);
      books(x + 0.4, 0.077, 7.8, 0, 1.4);
    }
    // доска для стендапов и полки у входа
    soft("white", 2.4, 1.2, 0.04, 0.01, -14.5, 1.4, 6.9, 0, 2);
    box("frame", 2.46, 0.03, 0.06, -14.5, 0.78, 6.9, 0, 1);
    for (const e of [-1, 1]) box("frame", 0.04, 2.0, 0.04, -14.5 + e * 1.15, 1.0, 6.9, 0, 0.5);
    for (const [x, z, color] of [[-15.0, 6.88, "leaf"], [-14.2, 6.88, "walnut"], [-13.9, 6.88, "woolDark"]] as const) box(color, 0.3, 0.3, 0.004, x, 1.55 + (x % 2) * 0.1, z - 0.02, 0, 1);
    for (const x of [-9.0, -6.0, -3.0]) {
      box("oak", 2.6, 0.035, 0.36, x, 0.45, 10.6, 0, 0.4);
      box("oak", 2.6, 0.035, 0.36, x, 0.06, 10.6, 0, 0.4);
      for (const e of [-1.28, 1.28]) box("oak", 0.035, 0.42, 0.36, x + e, 0.25, 10.6, 0, 0.3);
      books(x - 0.5, 0.467, 10.6, 0, 0.9);
      books(x + 0.3, 0.077, 10.6, 0, 1.6);
    }
  }

  if (floor === 2) floor2();

  const out = new Map<Surface, THREE.BufferGeometry>();
  for (const s of SURFACES) {
    if (!b[s].length) continue;
    out.set(s, mergeGeometries(b[s].map((g) => (g.index ? g : withIndex(g))))!);
  }
  return out;
}
const withIndex = (g: THREE.BufferGeometry) => {
  g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
  return g;
};

/** Стёкла: отдельная прозрачная сетка, в расчёте света не участвует. */
export function buildGlass(floor: Floor = 1): THREE.BufferGeometry {
  return mergeGeometries(
    PLANS[floor].glass().map(([x1, z1, x2, z2, y0, y1]) => {
      const len = Math.hypot(x2 - x1, z2 - z1);
      const g = new THREE.PlaneGeometry(len, y1 - y0);
      return g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3((x1 + x2) / 2, (y0 + y1) / 2, (z1 + z2) / 2), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(z2 - z1, x2 - x1)), new THREE.Vector3(1, 1, 1)));
    }),
  )!;
}
