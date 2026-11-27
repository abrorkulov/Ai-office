"use client";

import { Suspense, use, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { CameraControls, Environment, PerformanceMonitor, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { DEPARTMENTS } from "@/shared/catalog";
import type { StaffCard } from "@/server/modules/staff";
import { STATUS } from "../staff/status";
import { loadBaked } from "./baked";
import { Building, PAGE_BG } from "./building";
import type { Floor } from "@/shared/catalog";
import { rot } from "./layout";
import { PLANS } from "./plans";
import { Person, placeOf } from "./people";
import { Screens } from "./screens";

export type View = { mode: "all" } | { mode: "room" | "eyes"; seat: number };
const seatsOf = (f: Floor) => PLANS[f].seats;

interface Props {
  staff: StaffCard[];
  company: string;
  view: View;
  floor: Floor;
  onPick?: (seat: number) => void;
  labels?: boolean;
  onReady?: () => void;
}

const bakedOnce: Partial<Record<Floor, ReturnType<typeof loadBaked>>> = {};
const baked = (f: Floor) =>
  (bakedOnce[f] ??= loadBaked(f).catch((e) => {
    delete bakedOnce[f];
    throw e;
  }));

export default function OfficeScene({ staff, company, view, floor, onPick, labels = true, onReady }: Props) {
  const here = useMemo(() => staff.filter((s) => (s.floor ?? 1) === floor), [staff, floor]);
  const [dpr, setDpr] = useState(1.5);
  const layer = useRef<HTMLDivElement>(null);
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: PAGE_BG }}>
      <Canvas
        dpr={dpr}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ fov: 28, near: 0.05, far: 400, position: [0, 36, 34] }}
        onCreated={({ gl, scene }) => {
          gl.toneMapping = THREE.NeutralToneMapping;
          gl.toneMappingExposure = 1;
          scene.background = new THREE.Color(PAGE_BG);
        }}
      >
        <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(Math.min(2, window.devicePixelRatio || 1))} flipflops={2} onFallback={() => setDpr(1)} />
        <Suspense fallback={null}>
          <World key={floor} staff={here} floor={floor} company={company} view={view} onPick={onPick} layer={labels ? layer : null} onReady={onReady} />
        </Suspense>
      </Canvas>
      {labels && <div ref={layer} className="pointer-events-none absolute inset-0" />}
    </div>
  );
}

function World({ staff, company, view, floor, onPick, layer, onReady }: Omit<Props, "labels"> & { layer: React.RefObject<HTMLDivElement | null> | null }) {
  const light = use(useMemo(() => baked(floor), [floor]));
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  return (
    <>
      <Environment files="/office/tex/env.hdr" environmentIntensity={0.85} />
      {/* свет только для людей: стены и мебель освещены заранее */}
      <directionalLight position={[-9, 18, 11]} intensity={1.45} color="#fff5ea" />
      <Building baked={light} staff={staff} floor={floor} closeUp={view.mode === "room"} />
      <Screens staff={staff} company={company} floor={floor} />
      <City visible={view.mode !== "all"} />
      <Suspense fallback={null}>
        {staff.map((s) => (
          <Suspense key={s.id} fallback={null}>
            {!(view.mode === "eyes" && view.seat === s.seat) && <Person card={s} onPick={() => s.seat !== null && onPick?.(s.seat)} />}
          </Suspense>
        ))}
      </Suspense>
      <Pickers onPick={onPick} floor={floor} />
      <Rig view={view} floor={floor} />
      {layer && <Labels staff={staff} layer={layer} onPick={onPick} view={view} floor={floor} />}
    </>
  );
}

/** Вид из окон: город появляется, только когда камера внутри. */
function City({ visible }: { visible: boolean }) {
  const t = useTexture("/office/tex/city.webp");
  const tex = useMemo(() => {
    const c = t.clone();
    c.colorSpace = THREE.SRGBColorSpace;
    return c;
  }, [t]);
  return (
    <mesh visible={visible} rotation-y={2} position-y={1}>
      <sphereGeometry args={[90, 48, 24]} />
      <meshBasicMaterial map={tex} side={THREE.BackSide} toneMapped={false} depthWrite={false} />
    </mesh>
  );
}

/** Клик по полу кабинета выбирает кабинет, даже пустой. */
function Pickers({ onPick, floor }: { onPick?: (seat: number) => void; floor: Floor }) {
  if (!onPick) return null;
  return seatsOf(floor).map((o) => (
    <mesh
      key={o.seat}
      position={[o.x, 0.02, o.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      visible={false}
      onClick={(e) => {
        if (e.delta > 4) return;
        e.stopPropagation();
        onPick(o.seat);
      }}
    >
      <planeGeometry args={o.side === "left" || o.side === "right" ? [o.d, o.w] : [o.w, o.d]} />
    </mesh>
  ));
}

function Rig({ view, floor }: { view: View; floor: Floor }) {
  const ref = useRef<CameraControls>(null);
  const size = useThree((s) => s.size);
  const aspect = size.width / Math.max(1, size.height);
  const first = useRef(true);
  const mode = view.mode, seat = view.mode === "all" ? -1 : view.seat;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const smooth = !first.current;
    first.current = false;
    const cam = c.camera as THREE.PerspectiveCamera;
    const fov = (f: number) => {
      cam.fov = f;
      cam.updateProjectionMatrix();
    };
    c.smoothTime = 0.55;
    if (mode === "all") {
      fov(28);
      // весь офис помещается по ширине и высоте при любом экране
      // на вертикальном экране смотрим сбоку: длинная сторона этажа ложится по высоте
      const portrait = aspect < 0.8;
      const k = portrait ? Math.max(1, 1.12 / aspect) : Math.max(1, 1.8 / aspect);
      c.minDistance = 8;
      c.maxDistance = 60 * k;
      c.minPolarAngle = 0.15;
      c.maxPolarAngle = 1.2;
      if (portrait) void c.setLookAt(30 * k + 1, 41 * k, 0, 0.6, 0, 0, smooth);
      else void c.setLookAt(0, 41 * k, 30 * k + 1, 0, 0, 0.6, smooth);
      return;
    }
    const o = seatsOf(floor)[seat];
    if (!o) return;
    if (mode === "room") {
      fov(36);
      c.minDistance = 1.5;
      c.maxDistance = 30;
      c.minPolarAngle = 0.15;
      c.maxPolarAngle = 1.45;
      const s = Math.sin(o.chair.r), k = Math.cos(o.chair.r);
      // камера перед сотрудником, чуть сбоку и сверху
      // на узком экране нижнюю половину закрывает карточка: камера выше, человек в верхней части кадра
      const narrow = aspect < 1;
      if (floor === 2) {
        // на втором этаже столы стоят парами, спереди человека закрывают мониторы соседа:
        // смотрим из-за плеча, видно и разработчика, и его экран
        const back = narrow ? 2.2 : 1.6, side = -0.95;
        void c.setLookAt(o.chair.x - s * back + k * side, narrow ? 2.9 : 2.6, o.chair.z - k * back - s * side, o.chair.x + s * 0.55, 0.95, o.chair.z + k * 0.55, smooth);
        return;
      }
      const d = narrow ? 3.4 : 3.0, side = narrow ? 0.6 : 0.9, h = narrow ? 3.3 : 2.9;
      const px = o.chair.x + s * d + k * side, pz = o.chair.z + k * d - s * side;
      void c.setLookAt(px, h, pz, o.chair.x + s * 0.35, narrow ? 0.2 : 0.85, o.chair.z + k * 0.35, smooth);
      return;
    }
    void c.setFocalOffset(0, 0, 0, false);
    fov(62);
    c.minDistance = 0.01;
    c.maxDistance = 0.01;
    c.minPolarAngle = 0.5;
    c.maxPolarAngle = 2.4;
    const [dx, dz] = rot(0, -0.02, o.chair.r), [lx, lz] = rot(0, -0.01, o.chair.r);
    void c.setLookAt(o.chair.x + dx, 1.24, o.chair.z + dz, o.chair.x + lx, 1.236, o.chair.z + lz, smooth);
  }, [mode, seat, aspect, floor]);
  return <CameraControls ref={ref} makeDefault truckSpeed={1.2} dollySpeed={0.5} draggingSmoothTime={0.1} />;
}

/** Подписи: обычные элементы страницы, положение обновляется без React. */
function Labels({ staff, layer, onPick, view, floor }: { staff: StaffCard[]; layer: React.RefObject<HTMLDivElement | null>; onPick?: (seat: number) => void; view: View; floor: Floor }) {
  const { camera, size } = useThree();
  const items = useRef<{ el: HTMLButtonElement; p: THREE.Vector3 }[]>([]);
  const seat = view.mode === "all" ? null : view.seat, eyes = view.mode === "eyes";
  useEffect(() => {
    const root = layer.current;
    if (!root) return;
    items.current = staff.flatMap((s) => {
      const place = placeOf(s);
      const o = s.seat === null ? undefined : seatsOf(floor)[s.seat];
      if (!o || (eyes && s.seat === seat)) return [];
      const el = document.createElement("button");
      el.className = "office-label";
      el.type = "button";
      const dot = document.createElement("i");
      dot.style.background = STATUS[s.status].color;
      const name = document.createElement("span");
      name.textContent = s.name;
      el.title = `${s.title}. ${STATUS[s.status].label}`;
      el.style.setProperty("--dept", DEPARTMENTS[s.department]?.color ?? "#888");
      el.append(dot, name);
      el.onclick = () => onPick?.(s.seat!);
      root.append(el);
      const standing = s.status === "break";
      return [{ el, p: place ? new THREE.Vector3(place.x, standing ? 1.95 : 1.52, place.z) : new THREE.Vector3(o.chair.x, 1.2, o.chair.z) }];
    });
    return () => {
      items.current.forEach((i) => i.el.remove());
      items.current = [];
    };
  }, [staff, layer, onPick, eyes, seat, floor]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    for (const { el, p } of items.current) {
      v.copy(p).project(camera);
      const on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      el.style.display = on ? "" : "none";
      if (on) el.style.transform = `translate(-50%, -100%) translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px)`;
    }
  });
  return null;
}
