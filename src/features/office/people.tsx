"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { StaffCard } from "@/server/modules/staff";
import { rot } from "./layout";
import { ROOMS2 } from "./layout2";
import { PLANS } from "./plans";

const MOTION = { f: "/office/people/motion-f.glb", m: "/office/people/motion-m.glb" };
export const personUrl = (avatar: string) => `/office/people/${avatar}.glb`;
const isF = (a: string) => a.includes("Female");

type Place = { x: number; y: number; z: number; r: number; clip: string; typing: boolean };

/** Где и чем занят человек. null — его нет в офисе. */
export function placeOf(s: StaffCard): Place | null {
  if (s.seat === null) return null;
  const floor = s.floor ?? 1;
  const o = PLANS[floor].seats[s.seat];
  if (!o || s.status === "offline") return null;
  if (s.status === "break") {
    // перерыв проводят у кухонного острова
    const k = (s.seat % 4) * 0.8 - 1.2;
    return floor === 1 ? { x: 10.05, y: 0, z: k, r: -Math.PI / 2, clip: "drink", typing: false } : { x: 11.9 + (s.seat % 4) * 0.7, y: 0, z: -7.15, r: Math.PI, clip: "drink", typing: false };
  }
  if (s.status === "meeting") {
    // созвон в переговорной: стоя у экрана
    const m = ROOMS2.meetA, k = s.seat % 3;
    return { x: m.x0 + 1.3 + k * 1.5, y: 0, z: m.z0 + 2.9, r: Math.PI + (k - 1) * 0.3, clip: k === 1 ? "talk" : "stand", typing: false };
  }
  const seat = { x: o.chair.x, y: -0.01, z: o.chair.z, r: o.chair.r };
  const [bx, bz] = rot(0, 0.02, o.chair.r);
  seat.x += bx;
  seat.z += bz;
  const busy = s.status === "working" || s.status === "focus";
  const clip = busy ? (s.seat % 3 === 2 ? "think" : "sit") : s.status === "waiting" ? "look" : s.status === "paused" ? "relax" : s.seat % 2 ? "relax" : "sit";
  return { ...seat, clip, typing: busy && clip === "sit" };
}

/** Кости пальцев и кистей: печать поверх записанного движения. */
const FINGERS = /_(L|R)_Finger[1-4]$/;

export function Person({ card, onPick }: { card: StaffCard; onPick: () => void }) {
  const place = placeOf(card);
  const gltf = useGLTF(personUrl(card.avatar));
  const motion = useGLTF(isF(card.avatar) ? MOTION.f : MOTION.m);
  const root = useRef<THREE.Group>(null);

  const { body, mixer, fingers, look } = useMemo(() => {
    const body = clone(gltf.scene) as THREE.Group;
    const fingers: THREE.Bone[] = [];
    const look: { bone: THREE.Bone; rest: THREE.Quaternion }[] = [];
    body.traverse((n) => {
      if (n instanceof THREE.SkinnedMesh) {
        const m = (n.material as THREE.MeshStandardMaterial).clone();
        if (m.alphaTest > 0) {
          m.alphaTest = 0.28;
          m.alphaToCoverage = true;
        }
        m.envMapIntensity = 0.75;
        n.material = m;
        n.castShadow = n.receiveShadow = true;
        n.frustumCulled = false;
      }
      if (n instanceof THREE.Bone) {
        if (FINGERS.test(n.name)) fingers.push(n);
        if (n.name === "Bip01_Head" || n.name === "Bip01_Neck") look.push({ bone: n, rest: n.quaternion.clone() });
      }
    });
    return { body, mixer: new THREE.AnimationMixer(body), fingers, look };
  }, [gltf]);

  const clip = place?.clip;
  useEffect(() => {
    if (!clip) return;
    const c = motion.animations.find((a) => a.name === clip) ?? motion.animations[0];
    const action = mixer.clipAction(c).reset().fadeIn(0.5).play();
    // у каждого своя фаза: люди не двигаются синхронно
    action.time = ((card.seat ?? 0) * 2.37) % c.duration;
    action.timeScale = 0.92 + ((card.seat ?? 0) % 5) * 0.04;
    return () => void action.fadeOut(0.5);
  }, [clip, mixer, motion, card.seat]);
  useEffect(() => () => void mixer.stopAllAction(), [mixer]);

  const typing = place?.typing ?? false;
  const phase = (card.seat ?? 0) * 1.7;
  const saved = useRef<THREE.Quaternion[]>([]);
  useFrame(({ clock }, dt) => {
    // микшер не переписывает неподвижные кости: снимаем свою добавку сами
    const bones = [...fingers, ...look.map((l) => l.bone)];
    saved.current.forEach((q, i) => bones[i]?.quaternion.copy(q));
    mixer.update(Math.min(dt, 0.1));
    saved.current = typing ? bones.map((b) => b.quaternion.clone()) : [];
    if (typing) {
      const t = clock.elapsedTime;
      const burst = Math.max(0, Math.sin(t * 0.7 + phase) + 0.55);
      fingers.forEach((f, i) => f.rotateZ(Math.max(0, Math.sin(t * (9 + (i % 4) * 1.7) + i * 2.1 + phase)) * 0.22 * Math.min(1, burst)));
      // за работой смотрит в монитор, а не по сторонам
      look.forEach((l) => l.bone.quaternion.slerp(l.rest, 0.75));
    }
  });
  useEffect(() => {
    if (root.current && place) {
      root.current.position.set(place.x, place.y, place.z);
      root.current.rotation.y = place.r;
    }
  });
  if (!place) return null;
  return (
    <group
      ref={root}
      onClick={(e) => {
        if (e.delta > 4) return;
        e.stopPropagation();
        onPick();
      }}
    >
      <primitive object={body} />
      {/* невидимая капсула: попасть мышью проще, чем в тонкую модель */}
      <mesh position={[0, 0.8, 0]} visible={false}>
        <capsuleGeometry args={[0.4, 0.9, 4, 8]} />
      </mesh>
    </group>
  );
}
