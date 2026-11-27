import type { Floor } from "@/shared/catalog";
import { makeGlass, makeItems, makeWalls, OFFICES, type Item, type Office } from "./layout";
import { makeGlass2, makeItems2, makeWalls2, SEATS2 } from "./layout2";

export interface Plan {
  floor: Floor;
  seats: Office[];
  items: () => Item[];
  walls: () => [number, number, number, number, number][];
  glass: () => [number, number, number, number, number, number, number][];
}

export const PLANS: Record<Floor, Plan> = {
  1: { floor: 1, seats: OFFICES, items: makeItems, walls: makeWalls, glass: makeGlass },
  2: { floor: 2, seats: SEATS2, items: makeItems2, walls: makeWalls2, glass: makeGlass2 },
};
