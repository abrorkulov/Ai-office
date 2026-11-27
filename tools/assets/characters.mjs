// Microsoft Rocketbox (MIT): FBX + TGA → сжатые GLB. node tools/assets/characters.mjs <исходники> [имя]
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import * as THREE from "three";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { meshopt } from "@gltf-transform/functions";
import { MeshoptEncoder, MeshoptDecoder } from "meshoptimizer";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { readFbx, readTga } from "./fbx.mjs";

const [src, only] = process.argv.slice(2);
const OUT = "public/office/people";
fs.mkdirSync(OUT, { recursive: true });
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
const save = async (doc, file) => {
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: "high" }));
  await io.write(file, doc);
  console.log(file, Math.round(fs.statSync(file).size / 1024) + " КБ");
};
const webp = async (file, size, { alpha = false, q = 82 } = {}) => {
  const t = readTga(file);
  let s = sharp(t.data, { raw: { width: t.width, height: t.height, channels: 4 } }).resize(size, size, { kernel: "lanczos3" });
  if (!alpha) s = s.removeAlpha();
  return s.webp({ quality: q, effort: 6 }).toBuffer();
};
const TYPE = { 1: "SCALAR", 2: "VEC2", 3: "VEC3", 4: "VEC4", 16: "MAT4" };

async function character(name) {
  const dir = path.join(src, "rb", name);
  const o = readFbx(path.join(dir, `${name}.fbx`));
  o.updateMatrixWorld(true);
  let mesh;
  o.traverse((n) => n.isSkinnedMesh && (!mesh || n.geometry.attributes.position.count > mesh.geometry.attributes.position.count) && (mesh = n));
  const doc = new Document();
  const buf = doc.createBuffer();
  const acc = (arr, n) => doc.createAccessor().setArray(arr).setType(TYPE[n]).setBuffer(buf);
  const root = doc.createNode("root").setScale([0.01, 0.01, 0.01]);
  doc.createScene().addChild(root);
  const nodes = new Map();
  const visit = (b, parent) => {
    const n = doc.createNode(b.name).setTranslation(b.position.toArray()).setRotation(b.quaternion.toArray()).setScale(b.scale.toArray());
    parent.addChild(n);
    nodes.set(b.name, n);
    b.children.forEach((c) => c.isBone && visit(c, n));
  };
  o.children.filter((c) => c.name === "Bip01").forEach((b) => visit(b, root));
  const skin = doc.createSkin().setSkeleton(nodes.get(mesh.skeleton.bones[0].name));
  mesh.skeleton.bones.forEach((b) => skin.addJoint(nodes.get(b.name)));
  const ibm = new Float32Array(mesh.skeleton.bones.length * 16);
  mesh.skeleton.boneInverses.forEach((m, i) => m.toArray(ibm, i * 16));
  skin.setInverseBindMatrices(acc(ibm, 16));
  const out = doc.createMesh(name);
  const g = mesh.geometry;
  g.deleteAttribute("color");
  g.applyMatrix4(mesh.bindMatrix); // у сетки может быть свой сдвиг
  const mats = [mesh.material].flat();
  const files = fs.readdirSync(dir);
  for (let mi = 0; mi < mats.length; mi++) {
    const groups = g.groups.filter((x) => x.materialIndex === mi);
    if (!groups.length) continue;
    const part = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(g.attributes)) {
      const A = a.array.constructor, n = a.itemSize, arr = new A(groups.reduce((s, x) => s + x.count, 0) * n);
      let p = 0;
      for (const x of groups) {
        arr.set(a.array.slice(x.start * n, (x.start + x.count) * n), p);
        p += x.count * n;
      }
      part.setAttribute(k, new THREE.BufferAttribute(arr, n));
    }
    const m = mergeVertices(part, 1e-3);
    const kind = /opacity/i.test(mats[mi].name) ? "opacity" : /head/i.test(mats[mi].name) ? "head" : "body";
    const find = (s) => {
      const f = files.find((x) => new RegExp(`_${kind}_${s}\\.tga$`, "i").test(x));
      return f && path.join(dir, f);
    };
    const mat = doc.createMaterial(kind).setRoughnessFactor(kind === "head" ? 0.62 : 0.85).setMetallicFactor(0);
    const tex = (b, n) => doc.createTexture(n).setImage(new Uint8Array(b)).setMimeType("image/webp");
    const color = find("color"), normal = find("normal");
    if (color) mat.setBaseColorTexture(tex(await webp(color, kind === "opacity" ? 512 : 1024, { alpha: kind === "opacity" }), kind));
    if (normal && kind !== "opacity") mat.setNormalTexture(tex(await webp(normal, kind === "head" ? 512 : 1024, { q: 78 }), kind + "_n"));
    if (kind === "opacity") mat.setAlphaMode("MASK").setAlphaCutoff(0.4).setDoubleSided(true);
    const w = m.attributes.skinWeight, jn = m.attributes.skinIndex;
    const weights = new Float32Array(w.count * 4), joints = new Uint8Array(w.count * 4);
    for (let i = 0; i < w.count; i++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += w.array[i * 4 + k];
      for (let k = 0; k < 4; k++) {
        weights[i * 4 + k] = w.array[i * 4 + k] / (s || 1);
        joints[i * 4 + k] = weights[i * 4 + k] ? jn.array[i * 4 + k] : 0;
      }
    }
    const prim = doc
      .createPrimitive()
      .setMaterial(mat)
      .setIndices(acc(w.count > 65535 ? new Uint32Array(m.index.array) : new Uint16Array(m.index.array), 1))
      .setAttribute("POSITION", acc(new Float32Array(m.attributes.position.array), 3))
      .setAttribute("NORMAL", acc(new Float32Array(m.attributes.normal.array), 3))
      .setAttribute("TEXCOORD_0", acc(Float32Array.from(m.attributes.uv.array, (v, i) => (i % 2 ? 1 - v : v)), 2))
      .setAttribute("JOINTS_0", acc(joints, 4))
      .setAttribute("WEIGHTS_0", acc(weights, 4));
    out.addPrimitive(prim);
  }
  root.addChild(doc.createNode("mesh").setMesh(out).setSkin(skin));
  doc.createExtension(ALL_EXTENSIONS.find((e) => e.EXTENSION_NAME === "EXT_texture_webp")).setRequired(true);
  await save(doc, path.join(OUT, `${name}.glb`));
}

// Движения: только повороты костей (длины костей у всех свои) и положение таза.
const CLIPS = { work: "work_table", work2: "work_mid", sit: "sit_table_idle_neutral_01", look: "sit_table_idle_look_around", relax: "sit_table_idle_relaxed_01", stretch: "sit_table_idle_stretch arms", think: "sit_table_gestic_thoughtful", chair: "sit_chair_idle_relaxed_01", stand: "idle_neutral_01", phone: "cell_phone_talk_01", drink: "drink_idle", talk: "gestic_talk_neutral_01" };
const FPS = 15, MAX = 12, BLEND = 0.8;
async function motions(sex) {
  const doc = new Document();
  const buf = doc.createBuffer();
  const acc = (arr, n) => doc.createAccessor().setArray(arr).setType(TYPE[n]).setBuffer(buf);
  const root = doc.createNode("root").setScale([0.01, 0.01, 0.01]);
  doc.createScene().addChild(root);
  const bones = new Map();
  for (const [id, file] of Object.entries(CLIPS)) {
    const f = path.join(src, "anim", `${sex}_${file}.max.fbx`);
    if (!fs.existsSync(f)) {
      console.log("нет", f);
      continue;
    }
    const o = readFbx(f), clip = o.animations[0];
    if (!bones.size) {
      const visit = (b, p) => {
        const n = doc.createNode(b.name).setTranslation(b.position.toArray()).setRotation(b.quaternion.toArray());
        p.addChild(n);
        bones.set(b.name, n);
        b.children.forEach((c) => visit(c, n));
      };
      o.children.filter((c) => c.name === "Bip01").forEach((c) => visit(c, root));
    }
    const len = Math.min(clip.duration, MAX), n = Math.round((len - BLEND) * FPS), k = Math.round(BLEND * FPS);
    const times = acc(Float32Array.from({ length: n + 1 }, (_, i) => i / FPS), 1);
    const anim = doc.createAnimation(id);
    for (const t of clip.tracks) {
      const dot = t.name.lastIndexOf("."), bone = t.name.slice(0, dot), prop = t.name.slice(dot + 1);
      const node = bones.get(bone);
      if (!node || prop === "scale" || /Footsteps|Nub/.test(bone) || (prop === "position" && bone !== "Bip01")) continue;
      const size = prop === "position" ? 3 : 4, it = t.createInterpolant();
      const at = (s) => Array.from(it.evaluate(Math.min(s, clip.duration)));
      const first = at(0);
      const arr = new Float32Array((n + 1) * size);
      for (let i = 0; i <= n; i++) {
        let v = at(i / FPS);
        // хвост плавно переходит в начало: шва на повторе не видно
        if (i > n - k) {
          const a = (i - (n - k)) / k, w = a * a * (3 - 2 * a);
          v = size === 4 ? new THREE.Quaternion(...v).slerp(new THREE.Quaternion(...first), w).toArray() : v.map((x, j) => x + (first[j] - x) * w);
        }
        arr.set(v, i * size);
      }
      // неподвижные дорожки хранить незачем
      let still = true;
      for (let i = size; i < arr.length && still; i++) if (Math.abs(arr[i] - arr[i % size]) > 1e-4) still = false;
      const s = doc.createAnimationSampler().setInput(still ? acc(new Float32Array([0]), 1) : times).setOutput(acc(still ? arr.slice(0, size) : arr, size)).setInterpolation("LINEAR");
      anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(prop === "position" ? "translation" : "rotation").setSampler(s));
    }
    const hip = clip.tracks.find((t) => t.name === "Bip01.position");
    console.log(sex, id, clip.duration.toFixed(1), "таз", Array.from(hip.values.slice(0, 3)).map((x) => x.toFixed(0)).join());
  }
  await save(doc, path.join(OUT, `motion-${sex}.glb`));
}
for (const n of fs.readdirSync(path.join(src, "rb"))) if (!only || only === n) await character(n);
if (!only || only === "motions") {
  await motions("f");
  await motions("m");
}
