// Второй этаж: открытое пространство разработчиков. Те же размеры здания, что у первого.
import { D, DESK_H, rot, W, WALL, type Item, type Office, type V3 } from "./layout";

const X0 = -W / 2, Z0 = -D / 2;
/** Столы стоят группами по четыре: два напротив двух. */
export const PODS: [number, number][] = [
  [-5.4, -2.2], [1.8, -2.2], [-12.6, -2.2],
  [-5.4, 4.8], [1.8, 4.8], [-12.6, 4.8],
];
export const POD = { desk: 1.6, depth: 0.8, gap: 0.04 };

function makeSeats(): Office[] {
  const out: Office[] = [];
  // сначала места, где человек сидит лицом к основной камере
  for (const north of [true, false])
    for (const [px, pz] of PODS)
      for (const sx of [-1, 1]) {
        const x = px + sx * (POD.desk / 2 + POD.gap / 2);
        const dz = north ? -1 : 1, deskZ = pz + dz * (POD.depth / 2 + 0.01);
        const r = north ? 0 : Math.PI;
        const chair = { x: x + 0.05 * sx, z: deskZ + dz * 0.78, r };
        const [mx, mz] = rot(-0.18, -0.16, r);
        out.push({ seat: out.length, x, z: deskZ, r, w: POD.desk, d: 2.2, side: north ? "top" : "bottom", chair, screen: { p: [x + mx, DESK_H + 0.31, deskZ + mz] as V3, r: r + Math.PI } });
      }
  return out;
}
export const SEATS2 = makeSeats();

export const ROOMS2 = {
  meetA: { x0: X0, x1: -11.6, z0: Z0, z1: -6.8 },
  meetB: { x0: -11.6, x1: -5.6, z0: Z0, z1: -6.8 },
  booth: { x0: -5.6, x1: -3.2, z0: Z0, z1: -8.6 },
  kitchen: { x0: 9.2, x1: -X0, z0: Z0, z1: -6.6 },
};

export function makeItems2(): Item[] {
  const out: Item[] = [];
  const add = (model: string, x: number, z: number, r = 0, y = 0, s = 1) => out.push({ model, p: [x, y, z], r, s });
  for (const [px, pz] of PODS) {
    add("modern_ceiling_lamp_01", px, pz, 0, WALL - 1.17 * 0.55, 0.55);
    add("potted_plant_04", px + 1.42, pz, px, DESK_H, 1.1);
  }
  // переговорные
  for (const [k, m] of [["A", ROOMS2.meetA], ["B", ROOMS2.meetB]] as const) {
    const cx = (m.x0 + m.x1) / 2, cz = (m.z0 + m.z1) / 2 + 0.2;
    add("modern_ceiling_lamp_01", cx, cz, 0, WALL - 1.17 * 0.8, 0.8);
    add("pachira_aquatica_01", m.x1 - 0.55, m.z0 + 0.6, k === "A" ? 1 : 2, 0.36, 0.75);
  }
  // лаунж на востоке
  add("mid_century_lounge_chair", 9.0, 1.1, 1.6);
  add("mid_century_lounge_chair", 9.0, 2.6, 1.9);
  add("modern_arm_chair_01", 13.4, 1.0, -1.4);
  add("modern_arm_chair_01", 13.4, 2.6, -1.8);
  add("coffee_table_round_01", 11.2, 1.9, 0, 0, 0.9);
  for (const [x, z, s] of [[8.0, -3.6, 1.15], [16.4, -3.6, 1.1], [16.3, 5.4, 1.2], [6.6, 9.9, 1.0]] as const) add("pachira_aquatica_01", x, z, x - z, 0.38, s);
  add("steel_frame_shelves_03", 17.0, 1.9, -Math.PI / 2, 0, 0.95);
  add("drawer_cabinet", 17.05, -1.2, -Math.PI / 2);
  // кухня
  add("potted_plant_02", 16.9, -10.65, 0, 0.92, 0.75);
  for (const x of [11.2, 13.2, 15.2]) add("modern_ceiling_lamp_01", x, -7.9, 0, WALL - 1.17 * 0.7, 0.7);
  // зелень и полки между группами столов
  for (const [x, z] of [[-9.0, 1.3], [-1.8, 1.3], [5.4, 1.3]] as const) add("pachira_aquatica_01", x, z, x, 0.38, 1.05);
  for (const x of [-9.0, -1.8]) add("potted_plant_02", x, 7.8, x, 0.467, 0.6);
  // общий стол у северной стены
  for (const x of [1.2, 3.4, 5.6]) add("modern_ceiling_lamp_01", x, -8.4, 0, WALL - 1.17 * 0.7, 0.7);
  // зона стендапа у доски
  add("modern_arm_chair_01", -14.6, 9.0, 0.5);
  add("modern_arm_chair_01", -12.8, 9.4, -0.2);
  add("potted_plant_01", -16.8, 10.5, 0.4, 0, 1.1);
  add("potted_plant_01", -1.9, 10.5, 2.2, 0, 1.0);
  return out;
}

/** [x1, z1, x2, z2, высота] */
export function makeWalls2(): [number, number, number, number, number][] {
  const w: [number, number, number, number, number][] = [];
  w.push([X0, Z0, -X0, Z0, WALL]);
  // торцы и подоконники
  for (const s of [-1, 1]) w.push([s * X0, Z0, s * X0, -Z0, 0.5]);
  w.push([X0, -Z0, -X0, -Z0, 0.5]);
  // перегородки переговорных и будок
  for (const x of [ROOMS2.meetA.x1, ROOMS2.meetB.x1]) w.push([x, Z0, x, ROOMS2.meetA.z1, WALL]);
  w.push([-4.4, Z0, -4.4, ROOMS2.booth.z1, WALL], [ROOMS2.booth.x1, Z0, ROOMS2.booth.x1, ROOMS2.booth.z1, WALL]);
  return w;
}

/** [x1, z1, x2, z2, низ, верх, створок] */
export function makeGlass2(): [number, number, number, number, number, number, number][] {
  const g: [number, number, number, number, number, number, number][] = [];
  for (const s of [-1, 1]) g.push([s * X0, Z0, s * X0, -Z0, 0.5, WALL, 10]);
  g.push([X0, -Z0, -X0, -Z0, 0.5, WALL, 16]);
  // фасады переговорных с дверью
  for (const m of [ROOMS2.meetA, ROOMS2.meetB]) g.push([m.x0 + 0.06, m.z1, m.x1 - 1.0, m.z1, 0, WALL, 4]);
  g.push([ROOMS2.booth.x0, ROOMS2.booth.z1, -4.4, ROOMS2.booth.z1, 0, WALL, 1], [-4.4, ROOMS2.booth.z1, ROOMS2.booth.x1 - 0.06, ROOMS2.booth.z1, 0, WALL, 1]);
  return g;
}
