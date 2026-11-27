// Poly Haven (CC0): glTF → одна сжатая библиотека мебели. node tools/assets/furniture.mjs <исходники>
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, flatten, getBounds, join, meshopt, prune, simplify, textureCompress, unpartition, weld } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from "meshoptimizer";

const [src] = process.argv.slice(2);
const OUT = "public/office/furniture";
fs.mkdirSync(OUT, { recursive: true });
await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });

// [имя, доля треугольников, размер текстур, допуск упрощения, какие узлы оставить]
const LIST = [
  ["modern_arm_chair_01", 0.45, 512], ["mid_century_lounge_chair", 0.7, 512],
  ["coffee_table_round_01", 0.8, 512], ["modern_coffee_table_01", 0.6, 512], ["side_table_01", 0.8, 512],
  ["modern_wooden_cabinet", 0.15, 512], ["drawer_cabinet", 0.15, 512], ["steel_frame_shelves_03", 0.6, 512],
  ["pachira_aquatica_01", 0.35, 512, 0.05, /_d$/], ["potted_plant_02", 0.12, 512, 0.05], ["potted_plant_04", 0.4, 256], ["potted_plant_01", 0.07, 512, 0.06],
  ["desk_lamp_arm_01", 0.28, 256, 0.004], ["modern_ceiling_lamp_01", 0.35, 256],
   ["binder_notebook", 0.15, 256, 0.05, /^binder_notebook_closed$/], ["standing_picture_frame_01", 1, 256],
];
const info = {};
for (const [name, ratio, size, error = 0.02, keep] of LIST) {
  const doc = await io.read(path.join(src, "ph", name, `${name}.gltf`));
  for (const m of doc.getRoot().listMaterials()) m.setName(`${name}:${m.getName()}`);
  if (keep) {
    const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh());
    const found = nodes.filter((n) => keep.test(n.getName()));
    if (found.length) nodes.forEach((n) => (found.includes(n) ? n.setTranslation([0, 0, 0]) : n.dispose()));
    else console.log(name, "узлы:", nodes.map((n) => n.getName()).join(", "));
  }
  await doc.transform(flatten(), dedup(), join({ keepNamed: false }), weld());
  if (ratio < 1) await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error, lockBorder: false }));
  await doc.transform(textureCompress({ encoder: sharp, targetFormat: "webp", resize: [size, size], quality: 80 }), prune(), unpartition(), meshopt({ encoder: MeshoptEncoder, level: "high" }));
  const file = path.join(OUT, `${name}.glb`);
  await io.write(file, doc);
  const b = getBounds(doc.getRoot().listScenes()[0]);
  let tris = 0;
  doc.getRoot().listMeshes().forEach((m) => m.listPrimitives().forEach((p) => (tris += p.getIndices().getCount() / 3)));
  info[name] = { tris, kb: Math.round(fs.statSync(file).size / 1024), min: b.min.map((x) => +x.toFixed(2)), max: b.max.map((x) => +x.toFixed(2)), prims: doc.getRoot().listMeshes().reduce((s, m) => s + m.listPrimitives().length, 0) };
  console.log(name.padEnd(28), JSON.stringify(info[name]));
}
console.log("итого КБ", Object.values(info).reduce((s, x) => s + x.kb, 0));
