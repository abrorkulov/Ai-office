// Поверхности и небо (Poly Haven, CC0) → WebP. node tools/assets/textures.mjs <исходники>
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
const [src] = process.argv.slice(2);
const OUT = "public/office/tex";
fs.mkdirSync(OUT, { recursive: true });
// [текстура, насыщенность, контраст, целевой средний цвет]: приводим к светлой палитре офиса
const LIST = [
  ["terrazzo_tiles", 0.25, 0.75, [178, 174, 167], 1024], ["herringbone_parquet", 0.7, 0.85, [188, 158, 125], 1024], ["oak_veneer_01", 0.8, 0.9, [208, 178, 143], 512],
  ["poly_wool_herringbone", 0.15, 1.15, [206, 204, 200], 512], ["brushed_concrete_04", 0.3, 0.8, [196, 193, 188], 512], ["white_plaster_02", 0, 1, null, 512],
];
for (const [id, sat, k, target, size] of LIST) {
  const d = path.join(src, "tex", id), f = (n) => ["jpg", "png"].map((e) => path.join(d, `${n}.${e}`)).find((x) => fs.existsSync(x));
  if (target) {
    const base = await sharp(f("Diffuse")).resize(size).modulate({ saturation: sat }).toBuffer();
    const st = await sharp(base).stats();
    await sharp(base).linear([k, k, k], target.map((t, i) => t - st.channels[i].mean * k)).webp({ quality: 82 }).toFile(path.join(OUT, `${id}.webp`));
  }
  if (/wool|plaster/.test(id)) await sharp(f("nor_gl")).resize(512).webp({ quality: 78 }).toFile(path.join(OUT, `${id}_n.webp`));
}

// Отражения: уменьшенная HDR. Вид из окон: обычная картинка.
globalThis.self ??= globalThis;
const { HDRLoader } = await import("three/examples/jsm/loaders/HDRLoader.js");
const THREE = await import("three");
const load = (f) => {
  const b = fs.readFileSync(f);
  return new HDRLoader().setDataType(THREE.FloatType).parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
};
{
  const h = load(path.join(src, "hdri", "photo_studio_loft_hall_1k.hdr")), w = 512, hh = 256, k = h.width / w;
  const body = Buffer.alloc(w * hh * 4);
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
    const c = [0, 0, 0];
    for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) for (let i = 0; i < 3; i++) c[i] += h.data[((y * k + dy) * h.width + x * k + dx) * 4 + i] / (k * k);
    const m = Math.max(...c);
    if (m < 1e-32) continue;
    let e = Math.ceil(Math.log2(m)), s = 256 / 2 ** e;
    if (m * s >= 256) { e++; s /= 2; }
    const o = (y * w + x) * 4;
    for (let i = 0; i < 3; i++) body[o + i] = Math.min(255, Math.floor(c[i] * s));
    body[o + 3] = e + 128;
  }
  fs.writeFileSync(path.join(OUT, "env.hdr"), Buffer.concat([Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${hh} +X ${w}\n`), body]));
}
{
  const h = load(path.join(src, "hdri", "modern_buildings_2.hdr")), px = Buffer.alloc(h.width * h.height * 3);
  for (let i = 0; i < h.width * h.height; i++) for (let c = 0; c < 3; c++) {
    const v = h.data[i * 4 + c] * 0.9;
    px[i * 3 + c] = Math.round(255 * Math.min(1, (v * (2.51 * v + 0.03)) / (v * (2.43 * v + 0.59) + 0.14)) ** (1 / 2.2));
  }
  await sharp(px, { raw: { width: h.width, height: h.height, channels: 3 } }).webp({ quality: 80 }).toFile(path.join(OUT, "city.webp"));
}
