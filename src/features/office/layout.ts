// План офиса: чистые данные. Одни и те же данные читают сцена в браузере и расчёт света (tools/assets/bake.ts).

export type V3 = [number, number, number];
export interface Office {
  seat: number;
  /** Центр кабинета и поворот: локальная ось +z смотрит в атриум. */
  x: number;
  z: number;
  r: number;
  w: number;
  d: number;
  side: "top" | "bottom" | "left" | "right";
  /** Где сидит человек и куда смотрит (мировые координаты). */
  chair: { x: number; z: number; r: number };
  /** Экран монитора. */
  screen: { p: V3; r: number };
}
export interface Item {
  model: string;
  p: V3;
  r: number;
  s: number;
}

export const CELL = 4.4;
export const DEPTH = 4.6;
export const W = CELL * 8; // 35.2 м
export const D = DEPTH * 2 + CELL * 3; // 22.4 м
export const WALL = 2.8;
/** Земля вокруг здания попадает в ту же карту света. */
export const GROUND = { w: W + 14, d: D + 12 };
export const DESK_H = 0.735;

export const rot = (x: number, z: number, r: number): [number, number] => [x * Math.cos(r) + z * Math.sin(r), -x * Math.sin(r) + z * Math.cos(r)];

function makeOffices(): Office[] {
  const list: Omit<Office, "seat" | "chair" | "screen">[] = [];
  const x0 = -W / 2, z0 = -D / 2;
  for (let i = 0; i < 8; i++) list.push({ x: x0 + CELL * (i + 0.5), z: z0 + DEPTH / 2, r: 0, w: CELL, d: DEPTH, side: "top" });
  for (let i = 0; i < 3; i++) {
    const z = z0 + DEPTH + CELL * (i + 0.5);
    list.push({ x: x0 + CELL / 2, z, r: Math.PI / 2, w: CELL, d: CELL, side: "left" });
    list.push({ x: -x0 - CELL / 2, z, r: -Math.PI / 2, w: CELL, d: CELL, side: "right" });
  }
  for (const i of [0, 1, 2, 5, 6, 7]) list.push({ x: x0 + CELL * (i + 0.5), z: -z0 - DEPTH / 2, r: Math.PI, w: CELL, d: DEPTH, side: "bottom" });
  // сначала заселяются кабинеты в середине верхнего ряда — они лучше всего видны
  const order = [3, 4, 2, 5, 1, 6, 8, 9, 10, 11, 0, 7, 12, 13, 14, 15, 16, 17, 18, 19];
  return order.map((k, seat) => {
    const o = list[k];
    // в нижнем ряду стол развёрнут к окну: сидящего видно с основной камеры
    const toWindow = o.side === "bottom";
    const cz = toWindow ? 0.75 : -1.0, dir = toWindow ? -1 : 1;
    const [cx, czw] = rot(0.1, cz, o.r);
    const [sx, sz] = rot(0.1, cz + dir * 0.92, o.r);
    const face = o.r + (toWindow ? Math.PI : 0);
    return { ...o, seat, chair: { x: o.x + cx, z: o.z + czw, r: face }, screen: { p: [o.x + sx, DESK_H + 0.33, o.z + sz] as V3, r: face + Math.PI } };
  });
}
export const OFFICES = makeOffices();

const pick = <T,>(a: readonly T[], i: number) => a[((i % a.length) + a.length) % a.length];

/** Готовые модели (Poly Haven). */
export function makeItems(): Item[] {
  const out: Item[] = [];
  const add = (model: string, x: number, z: number, r = 0, y = 0, s = 1) => out.push({ model, p: [x, y, z], r, s });
  for (const o of OFFICES) {
    const k = o.seat, at = (m: string, x: number, z: number, r = 0, y = 0, s = 1) => {
      const [wx, wz] = rot(x, z, o.r);
      add(m, o.x + wx, o.z + wz, o.r + r, y, s);
    };
    const toWindow = o.side === "bottom", hw = o.w / 2, hd = o.d / 2, dz = toWindow ? -1 : 1;
    const deskZ = (toWindow ? 0.75 : -1.0) + dz * 0.72;
    // стеллаж у боковой стены, гостевое кресло, растение в углу
    const flip = k % 2 ? 1 : -1;
    at(pick(["drawer_cabinet", "steel_frame_shelves_03", "drawer_cabinet"], k), flip * (hw - 0.42), toWindow ? -0.2 : 0.9, -flip * Math.PI / 2, 0, k % 3 === 1 ? 0.82 : 1);
    at(pick(["modern_arm_chair_01", "mid_century_lounge_chair"], k >> 1), -flip * 1.35, toWindow ? -1.25 : 1.1, toWindow ? flip * 0.7 : Math.PI + flip * 0.6, 0, 0.94);
    at(pick(["potted_plant_01", "pachira_aquatica_01", "potted_plant_01", "pachira_aquatica_01"], k), -flip * (hw - 0.48), (toWindow ? 1 : -1) * (hd - 0.5), k * 1.3, k % 2 ? 0.36 : 0, pick([1.05, 0.8, 0.95, 0.75], k));
    at("desk_lamp_arm_01", 0.1 - flip * 0.7, deskZ + dz * 0.2, (toWindow ? 0 : Math.PI) - flip * 0.1, DESK_H + 0.06, 0.62);
    if (k % 3 === 0) at("potted_plant_04", 0.1 + flip * 0.6, deskZ + dz * 0.2, 0, DESK_H, 1);
    if (k % 2 === 0) at("binder_notebook", 0.1 + flip * 0.45, deskZ - dz * 0.05, Math.PI * (toWindow ? 0.05 : 1.05), DESK_H, 0.7);
    at("modern_ceiling_lamp_01", -flip * 0.9, toWindow ? -1.0 : 1.1, 0, WALL - 1.17 * 0.62, 0.62);
  }
  // Гостиная в центре атриума
  add("coffee_table_round_01", -1.2, 0);
  add("modern_coffee_table_01", 3.1, 0.1, Math.PI / 2);
  add("mid_century_lounge_chair", -3.35, -1.0, 1.25);
  add("mid_century_lounge_chair", -3.35, 1.0, 1.9);
  add("modern_arm_chair_01", 5.2, -0.8, -1.35);
  add("modern_arm_chair_01", 5.2, 0.9, -1.8);
  for (const [x, z, s] of [[-4.4, -3.2, 1.15], [6.2, -3.3, 1.2], [-4.4, 3.3, 1.1], [6.2, 3.3, 1.15]] as const) add("pachira_aquatica_01", x, z, x + z, 0.38, s);
  for (const x of [-1.2, 3.1]) add("modern_ceiling_lamp_01", x, 0, 0, WALL - 1.17, 1.25);
  // Переговорная слева
  add("modern_wooden_cabinet", -9.1, 2.42, Math.PI, 0, 0.9);
  add("pachira_aquatica_01", -11.95, 2.05, 2, 0.36, 0.8);
  for (const x of [-10.3, -8.0]) add("modern_ceiling_lamp_01", x, 0, 0, WALL - 1.17, 0.9);
  // Кухня справа
  for (const z of [-1.1, 0, 1.1]) add("modern_ceiling_lamp_01", 9.1, z, 0, WALL - 1.17, 0.7);
  add("potted_plant_02", 11.75, -2.3, 0, 0.92, 0.8);
  add("potted_plant_04", 9.1, 1.55, 0, 0.97, 1);
  // Холл
  add("potted_plant_01", -3.7, 10.2, 0, 0, 1.15);
  add("potted_plant_01", 3.7, 10.2, 1, 0, 1.15);
  add("modern_arm_chair_01", -3.3, 8.2, 1.2);
  add("modern_arm_chair_01", -3.3, 9.3, 1.9);
  add("side_table_01", -3.55, 8.75, 0.1, 0, 0.8);
  // Низкие полки в атриуме
  for (const z of [-4.6, 4.6]) {
    add("potted_plant_02", -1.75, z, z, 0.467, 0.62);
    add("potted_plant_04", 0.1, z, 1, 0.467, 1.3);
    add("standing_picture_frame_01", -0.5, z, 1.4, 0.467);
    add("potted_plant_02", 2.6, z, 2, 0.467, 0.6);
  }
  return out;
}

/** Сплошные перегородки: [x1, z1, x2, z2, высота]. */
export function makeWalls(): [number, number, number, number, number][] {
  const w: [number, number, number, number, number][] = [];
  const x0 = -W / 2, z0 = -D / 2;
  for (let i = 1; i < 8; i++) w.push([x0 + CELL * i, z0, x0 + CELL * i, z0 + DEPTH, WALL]);
  for (let i = 1; i < 8; i++) if (i !== 4) w.push([x0 + CELL * i, -z0 - DEPTH, x0 + CELL * i, -z0, WALL]);
  // глухой северный фасад, остальные — остекление
  w.push([x0, z0, -x0, z0, WALL]);
  for (const s of [-1, 1]) {
    w.push([s * x0, z0, s * x0, z0 + DEPTH, WALL]);
    w.push([s * x0, -z0 - DEPTH, s * x0, -z0, 0.5]);
    for (let i = 0; i < 4; i++) w.push([s * x0, z0 + DEPTH + CELL * i, s * (x0 + CELL), z0 + DEPTH + CELL * i, i === 0 ? WALL : 0.9]);
    w.push([s * x0, z0 + DEPTH, s * x0, -z0 - DEPTH, 0.5]);
  }
  for (const [a, b] of [[x0, -CELL], [CELL, -x0]]) w.push([a, -z0, b, -z0, 0.5]);
  return w;
}

/** Стекло с тонкой рамой: [x1, z1, x2, z2, низ, верх, створок]. */
export function makeGlass(): [number, number, number, number, number, number, number][] {
  const g: [number, number, number, number, number, number, number][] = [];
  const x0 = -W / 2, z0 = -D / 2, door = 1.0;
  for (const o of OFFICES) {
    // фасад кабинета в атриум с дверным проёмом
    const hw = o.w / 2 - 0.06, hd = o.d / 2;
    const seg = (a: number, b: number, n: number) => {
      const [ax, az] = rot(a, hd, o.r), [bx, bz] = rot(b, hd, o.r);
      g.push([o.x + ax, o.z + az, o.x + bx, o.z + bz, 0, WALL, n]);
    };
    const f = o.seat % 2 ? 1 : -1;
    if (f > 0) seg(-hw, hw - door, 3);
    else seg(-hw + door, hw, 3);
  }
  for (const s of [-1, 1]) {
    g.push([s * x0, z0 + DEPTH, s * x0, -z0 - DEPTH, 0.5, WALL, 9]);
    g.push([s * x0, -z0 - DEPTH, s * x0, -z0, 0.5, WALL, 3]);
    for (let i = 1; i < 4; i++) g.push([s * x0, z0 + DEPTH + CELL * i, s * (x0 + CELL), z0 + DEPTH + CELL * i, 0.9, WALL, 3]);
  }
  for (const [a, b] of [[x0, -CELL], [CELL, -x0]]) g.push([a, -z0, b, -z0, 0.5, WALL, 9]);
  g.push([-CELL, -z0, -0.9, -z0, 0, WALL, 3], [0.9, -z0, CELL, -z0, 0, WALL, 3]);
  // переговорная
  g.push([-12.4, -2.6, -6.2, -2.6, 0, WALL, 5], [-12.4, 2.75, -6.2, 2.75, 0, WALL, 5], [-12.4, -2.6, -12.4, 2.75, 0, WALL, 4], [-6.2, -2.6, -6.2, 1.5, 0, WALL, 3]);
  return g;
}
