"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { DEPARTMENTS } from "@/shared/catalog";
import type { StaffCard } from "@/server/modules/staff";
import type { Floor } from "@/shared/catalog";
import { rot } from "./layout";
import { PLANS } from "./plans";
import { STATUS } from "../staff/status";

const COLS = 4, ROWS = 6, SW = 512, SH = 300;

/** Экраны мониторов: одна общая картинка, на каждом — чем сотрудник занят прямо сейчас. */
export function Screens({ staff, company, floor }: { staff: StaffCard[]; company: string; floor: Floor }) {
  const SEATS = PLANS[floor].seats;
  const { geo, tex, ctx, board, boardTex } = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = SW * COLS;
    canvas.height = SH * ROWS;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (const o of SEATS) {
      const { p, r } = o.screen, w = floor === 1 ? 0.315 : 0.29, h = floor === 1 ? 0.18 : 0.165, c = o.seat % COLS, row = Math.floor(o.seat / COLS), b = pos.length / 3;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const [dx, dz] = rot(sx * w, 0.0135, r);
        pos.push(p[0] + dx, p[1] + sy * h, p[2] + dz);
        uv.push((c + (sx + 1) / 2) / COLS, 1 - (row + (1 - sy) / 2) / ROWS);
      }
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const board = document.createElement("canvas");
    board.width = 1024;
    board.height = 576;
    const boardTex = new THREE.CanvasTexture(board);
    boardTex.colorSpace = THREE.SRGBColorSpace;
    return { geo, tex, ctx: canvas.getContext("2d")!, board: board.getContext("2d")!, boardTex };
  }, [SEATS, floor]);

  useEffect(() => {
    let alive = true;
    const draw = () => {
      if (!alive) return;
      const bySeat = new Map(staff.map((s) => [s.seat, s]));
      for (const o of SEATS) {
        const x = (o.seat % COLS) * SW, y = Math.floor(o.seat / COLS) * SH, s = bySeat.get(o.seat);
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y, SW, SH);
        ctx.clip();
        ctx.translate(x, y);
        if (s && s.status !== "offline" && s.status !== "paused") (s.kind === "human" ? editor : screen)(ctx, s);
        else {
          ctx.fillStyle = "#101216";
          ctx.fillRect(0, 0, SW, SH);
        }
        ctx.restore();
      }
      tex.needsUpdate = true;
      boardDraw(board, company, staff);
      boardTex.needsUpdate = true;
    };
    draw();
    void document.fonts.ready.then(draw);
    return () => void (alive = false);
  }, [staff, company, ctx, tex, board, boardTex, SEATS]);

  return (
    <>
      <mesh geometry={geo}>
        <meshBasicMaterial map={tex} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={floor === 1 ? [-12.22, 1.5, 0] : [3.4, 1.55, -11.04]} rotation-y={floor === 1 ? Math.PI / 2 : 0}>
        <planeGeometry args={floor === 1 ? [1.9, 1.06] : [2.1, 1.16]} />
        <meshBasicMaterial map={boardTex} toneMapped={false} />
      </mesh>
    </>
  );
}

const FONT = "'Golos Text', sans-serif";
function wrap(c: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number, max: number) {
  let line = "", n = 0;
  for (const word of text.split(/\s+/)) {
    if (c.measureText(`${line} ${word}`).width > w && line) {
      c.fillText(line, x, y + n++ * lh);
      line = word;
      if (n >= max) return;
    } else line = line ? `${line} ${word}` : word;
  }
  c.fillText(line, x, y + n * lh);
}
function screen(c: CanvasRenderingContext2D, s: StaffCard) {
  const d = DEPARTMENTS[s.department];
  c.fillStyle = "#f6f6f4";
  c.fillRect(0, 0, SW, SH);
  c.fillStyle = d.color;
  c.fillRect(0, 0, SW, 54);
  c.fillStyle = "#fff";
  c.font = `600 24px ${FONT}`;
  c.fillText(s.title.slice(0, 32), 22, 35);
  c.fillStyle = "#14161a";
  c.font = `600 26px ${FONT}`;
  c.fillText(STATUS[s.status].label, 22, 102);
  c.fillStyle = "#565b64";
  c.font = `400 21px ${FONT}`;
  wrap(c, s.now || "Новых поручений нет", 22, 138, SW - 44, 30, 4);
  c.fillStyle = "#dcdcd8";
  for (let i = 0; i < 3; i++) c.fillRect(22, 262 - i * 0, 120 + ((s.seat ?? 0) * 37 + i * 91) % 300, 8);
}
/** Экран разработчика: редактор кода с его текущей задачей. */
function editor(c: CanvasRenderingContext2D, s: StaffCard) {
  c.fillStyle = "#16181d";
  c.fillRect(0, 0, SW, SH);
  c.fillStyle = "#20232a";
  c.fillRect(0, 0, 118, SH);
  c.fillRect(0, 0, SW, 34);
  c.font = `500 17px ${FONT}`;
  c.fillStyle = "#e6e8ec";
  c.fillText((s.now || s.title).slice(0, 40), 132, 23);
  const tone = ["#c792ea", "#82aaff", "#c3e88d", "#f78c6c", "#89ddff", "#676e7b"];
  let seed = (s.seat ?? 0) * 97 + 13;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9; i++) {
    c.fillStyle = "#3a3f4b";
    c.fillRect(16, 52 + i * 26, 70 * (0.4 + rnd() * 0.6), 8);
  }
  for (let y = 0; y < 13; y++) {
    let x = 132 + Math.floor(rnd() * 4) * 22;
    c.fillStyle = "#4b5263";
    c.font = `400 13px ${FONT}`;
    c.fillText(String(y + 1), 124 - 22, 60 + y * 19);
    for (let k = 0; k < 2 + rnd() * 4 && x < SW - 30; k++) {
      const w = 20 + rnd() * 90;
      c.fillStyle = tone[Math.floor(rnd() * tone.length)];
      c.fillRect(x, 52 + y * 19, w, 9);
      x += w + 10;
    }
  }
}
function boardDraw(c: CanvasRenderingContext2D, company: string, staff: StaffCard[]) {
  c.fillStyle = "#14161a";
  c.fillRect(0, 0, 1024, 576);
  c.fillStyle = "#fff";
  c.font = `600 58px Geologica, ${FONT}`;
  c.fillText(company.slice(0, 26), 60, 120);
  c.font = `400 34px ${FONT}`;
  c.fillStyle = "#a9afb9";
  const n = (f: (s: StaffCard) => boolean) => staff.filter(f).length;
  const rows: [string, number][] = [["Работают сейчас", n((s) => s.status === "working")], ["Ждут решения", n((s) => s.status === "waiting")], ["Всего в штате", staff.length]];
  rows.forEach(([label, v], i) => {
    c.fillStyle = "#a9afb9";
    c.fillText(label, 60, 250 + i * 96);
    c.fillStyle = "#fff";
    c.fillText(String(v), 900, 250 + i * 96);
  });
}
