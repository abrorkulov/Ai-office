"use client";

import { useEffect, useMemo } from "react";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { DEPARTMENTS } from "@/shared/catalog";
import type { StaffCard } from "@/server/modules/staff";
import { bakeFloor, bakeVertices, groundMaterial, type Baked } from "./baked";
import type { Floor } from "@/shared/catalog";
import { CELL, D, DEPTH, GROUND, OFFICES, rot, W, WALL } from "./layout";
import { PODS } from "./layout2";
import { PLANS } from "./plans";
import { buildGlass, buildShell, type Surface } from "./shell";

const T = "/office/tex/";
export const PAGE_BG = "#f4f4f1";

function useSurfaceTextures() {
  const list = useTexture([
    `${T}oak_veneer_01.webp`, `${T}poly_wool_herringbone.webp`, `${T}poly_wool_herringbone_n.webp`,
    `${T}white_plaster_02_n.webp`, `${T}brushed_concrete_04.webp`, `${T}herringbone_parquet.webp`, `${T}terrazzo_tiles.webp`,
  ]);
  return useMemo(() => {
    const [oak, wool, woolN, plasterN, concrete, parquet, terrazzo] = list.map((t) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.anisotropy = 8;
      return c;
    });
    for (const t of [oak, wool, concrete, parquet, terrazzo]) t.colorSpace = THREE.SRGBColorSpace;
    oak.repeat.set(1, 1);
    for (const t of [wool, woolN]) t.repeat.set(3.5, 3.5);
    plasterN.repeat.set(0.6, 0.6);
    concrete.repeat.set(0.9, 0.9);
    parquet.repeat.set(1 / 2.2, 1 / 2.2);
    terrazzo.repeat.set(1 / 3.2, 1 / 3.2);
    return { oak, wool, woolN, plasterN, concrete, parquet, terrazzo };
  }, [list]);
}

/** Развёртка плоскости по мировым координатам, чтобы узор не тянулся. */
function floorPlane(x: number, z: number, w: number, d: number) {
  const g = new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2).translate(x, 0, z);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), p.getZ(i));
  return g;
}

/** closeUp: камера внутри кабинета; подвесные лампы тогда прячем, иначе они закрывают кадр. */
export function Building({ baked, staff, floor, closeUp = false }: { baked: Baked; staff: StaffCard[]; floor: Floor; closeUp?: boolean }) {
  const tex = useSurfaceTextures();
  const shell = useMemo(() => {
    const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ envMapIntensity: 0.9, ...p });
    const mats: Record<Surface, THREE.MeshStandardMaterial> = {
      plaster: std({ color: "#f1efea", roughness: 0.95, normalMap: tex.plasterN, normalScale: new THREE.Vector2(0.15, 0.15) }),
      cap: std({ color: "#2b2d31", roughness: 0.7 }),
      frame: std({ color: "#1b1c1f", roughness: 0.45, metalness: 0.5 }),
      oak: std({ map: tex.oak, color: "#ffffff", roughness: 0.55 }),
      walnut: std({ map: tex.oak, color: "#8f6547", roughness: 0.5 }),
      wool: std({ map: tex.wool, color: "#cfc7ba", roughness: 1, normalMap: tex.woolN }),
      woolDark: std({ map: tex.wool, color: "#4c535d", roughness: 1, normalMap: tex.woolN }),
      white: std({ color: "#f4f3f0", roughness: 0.5 }),
      metal: std({ color: "#b9bcc0", roughness: 0.28, metalness: 0.95 }),
      black: std({ color: "#17181b", roughness: 0.4 }),
      concrete: std({ map: tex.concrete, color: "#ffffff", roughness: 0.9 }),
      soil: std({ color: "#3a2c22", roughness: 1 }),
      leaf: std({ color: "#4f6b4a", roughness: 0.8 }),
    };
    return [...buildShell(floor)].map(([s, g]) => {
      const [offset, count] = baked.info.shell[s] ?? [0, 0];
      if (count !== g.attributes.position.count) console.warn("Карта света устарела:", s);
      const mesh = new THREE.Mesh(g, bakeVertices(mats[s], baked, offset, 0));
      mesh.matrixAutoUpdate = false;
      return mesh;
    });
  }, [baked, tex, floor]);

  const floors = useMemo(() => {
    const parquet = bakeFloor(new THREE.MeshStandardMaterial({ map: tex.parquet, roughness: 0.5, envMapIntensity: 0.5 }), baked);
    const terrazzo = bakeFloor(new THREE.MeshStandardMaterial({ map: tex.terrazzo, roughness: 0.34, envMapIntensity: 0.7 }), baked);
    const out: THREE.Mesh[] = [];
    const add = (m: THREE.Material, x: number, z: number, w: number, d: number, y = 0) => {
      const mesh = new THREE.Mesh(floorPlane(x, z, w, d), m);
      mesh.position.y = y;
      out.push(mesh);
    };
    if (floor === 1) {
      add(terrazzo, 0, 0, W - CELL * 2, D - DEPTH * 2);
      add(terrazzo, 0, D / 2 - DEPTH / 2, CELL * 2, DEPTH);
      add(parquet, 0, -D / 2 + DEPTH / 2, W, DEPTH);
      for (const s of [-1, 1]) {
        add(parquet, s * (W / 2 - CELL / 2), 0, CELL, CELL * 3);
        add(parquet, s * (CELL + (CELL * 3) / 2), D / 2 - DEPTH / 2, CELL * 3, DEPTH);
      }
    } else {
      add(terrazzo, 0, 2.2, W, D - 4.4);
      add(parquet, 0, -D / 2 + 2.2, W, 4.4);
    }
    const rug = (x: number, z: number, w: number, d: number, color: string) => {
      const m = new THREE.Mesh(floorPlane(x, z, w, d), bakeFloor(new THREE.MeshStandardMaterial({ map: tex.wool, normalMap: tex.woolN, color, roughness: 1, envMapIntensity: 0.3 }), baked));
      m.position.y = 0.008;
      out.push(m);
    };
    if (floor === 1) {
      rug(-1.2, 0, 4.2, 5.6, "#d8d0c2");
      rug(3.1, 0, 3.6, 5.2, "#5f6b78");
      rug(-9.12, 0.05, 5.4, 4.0, "#8f8a82");
    } else {
      for (const [x, z] of PODS) rug(x, z, 4.6, 4.2, "#7d848c");
      rug(11.2, 2.0, 5.6, 6.0, "#cbc3b5");
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND.w, GROUND.d).rotateX(-Math.PI / 2), groundMaterial(baked, PAGE_BG));
    ground.position.y = -0.02;
    out.push(ground);
    return out;
  }, [baked, tex, floor]);

  return (
    <>
      {shell.map((m) => <primitive key={m.uuid} object={m} />)}
      {floors.map((m) => <primitive key={m.uuid} object={m} />)}
      {floor === 1 && <Rugs baked={baked} staff={staff} tex={tex} />}
      <Furniture baked={baked} floor={floor} closeUp={closeUp} />
      <Glass floor={floor} />
      <Ceiling />
    </>
  );
}

/** Ковёр кабинета в цвет отдела: сразу видно, кто где сидит. */
function Rugs({ baked, staff, tex }: { baked: Baked; staff: StaffCard[]; tex: ReturnType<typeof useSurfaceTextures> }) {
  const mesh = useMemo(() => {
    const g = new THREE.PlaneGeometry(2.7, 2.3).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2.7, uv.getY(i) * 2.3);
    const m = new THREE.InstancedMesh(g, bakeFloor(new THREE.MeshStandardMaterial({ map: tex.wool, normalMap: tex.woolN, roughness: 1, envMapIntensity: 0.25 }), baked), OFFICES.length);
    const M = new THREE.Matrix4();
    OFFICES.forEach((o, i) => {
      const [x, z] = rot(0.1, o.side === "bottom" ? 0.35 : -0.6, o.r);
      m.setMatrixAt(i, M.makeRotationY(o.r).setPosition(o.x + x, 0.008, o.z + z));
      m.setColorAt(i, new THREE.Color("#cfcac2"));
    });
    m.frustumCulled = false;
    return m;
  }, [baked, tex]);
  useEffect(() => {
    const bySeat = new Map(staff.map((s) => [s.seat, s]));
    OFFICES.forEach((o, i) => {
      const s = bySeat.get(o.seat);
      mesh.setColorAt(i, s ? new THREE.Color(DEPARTMENTS[s.department]?.color ?? "#888").lerp(new THREE.Color("#ffffff"), 0.18) : new THREE.Color("#d5d1c9"));
    });
    mesh.instanceColor!.needsUpdate = true;
  }, [mesh, staff]);
  return <primitive object={mesh} />;
}

const ITEMS = { 1: PLANS[1].items(), 2: PLANS[2].items() };
const MODELS = { 1: [...new Set(ITEMS[1].map((i) => i.model))].sort(), 2: [...new Set(ITEMS[2].map((i) => i.model))].sort() };

function Furniture({ baked, floor, closeUp }: { baked: Baked; floor: Floor; closeUp: boolean }) {
  const gltfs = useGLTF(MODELS[floor].map((m) => `/office/furniture/${m}.glb`));
  const meshes = useMemo(() => {
    const out: THREE.InstancedMesh[] = [];
    gltfs.forEach((gltf, gi) => {
      const model = MODELS[floor][gi], list = ITEMS[floor].filter((i) => i.model === model);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((n) => {
        if (!(n instanceof THREE.Mesh)) return;
        const a = gltf.parser.associations.get(n) as { nodes?: number; meshes?: number; primitives?: number } | undefined;
        const owner = a?.nodes !== undefined ? a : (gltf.parser.associations.get(n.parent!) as typeof a);
        const key = `${model}/${owner?.nodes ?? 0}/${a?.primitives ?? 0}`;
        const at = baked.info.models[key];
        if (!at || at[1] !== n.geometry.attributes.position.count) console.warn("Карта света устарела:", key);
        const src = n.material as THREE.MeshStandardMaterial;
        const mat = bakeVertices(src.clone(), baked, at?.[0] ?? 0, at?.[1] ?? 0);
        mat.envMapIntensity = 0.8;
        if (src.transparent || src.alphaTest > 0) {
          mat.transparent = false;
          mat.alphaTest = 0.45;
          mat.side = THREE.DoubleSide;
        }
        if (/ceiling_lamp/.test(model) && /glass|bulb|globe|white/i.test(src.name)) {
          mat.emissive = new THREE.Color("#fff1da");
          mat.emissiveIntensity = 0.35;
        }
        const m = new THREE.InstancedMesh(n.geometry, mat, list.length);
        const M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        list.forEach((it, i) => {
          M.compose(new THREE.Vector3(...it.p), q.setFromAxisAngle(up, it.r), new THREE.Vector3(it.s, it.s, it.s)).multiply(n.matrixWorld);
          m.setMatrixAt(i, M);
        });
        m.frustumCulled = false;
        m.userData.lamp = /ceiling_lamp/.test(model);
        out.push(m);
      });
    });
    return out;
  }, [gltfs, baked, floor]);
  useEffect(() => {
    for (const m of meshes) if (m.userData.lamp) m.visible = !closeUp;
  }, [meshes, closeUp]);
  return meshes.map((m) => <primitive key={m.uuid} object={m} />);
}

function Glass({ floor }: { floor: Floor }) {
  const g = useMemo(() => buildGlass(floor), [floor]);
  return (
    <mesh geometry={g} renderOrder={5}>
      <meshStandardMaterial color="#dfeaf0" transparent opacity={0.1} roughness={0.04} metalness={0} envMapIntensity={1.3} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

/** Потолок виден только изнутри: сверху офис открыт как макет. */
function Ceiling() {
  const g = useMemo(() => new THREE.PlaneGeometry(W, D).rotateX(Math.PI / 2).translate(0, WALL + 0.02, 0), []);
  return (
    <mesh geometry={g}>
      <meshBasicMaterial color="#e9e8e4" side={THREE.FrontSide} toneMapped={false} />
    </mesh>
  );
}
