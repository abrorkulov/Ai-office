// Чтение FBX и TGA в Node без браузера.
import fs from "node:fs";
globalThis.window ??= globalThis;
globalThis.document ??= { createElementNS: () => ({ addEventListener() {}, removeEventListener() {}, style: {} }) };
const { FBXLoader } = await import("three/examples/jsm/loaders/FBXLoader.js");

export function readFbx(file) {
  const b = fs.readFileSync(file);
  return new FBXLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.length), "");
}

/** TGA без сжатия и с RLE, 24/32 бита → RGBA, строки сверху вниз. */
export function readTga(file) {
  const b = fs.readFileSync(file);
  const idLen = b[0], type = b[2], w = b.readUInt16LE(12), h = b.readUInt16LE(14), bpp = b[16], top = !!(b[17] & 0x20);
  if (![2, 10].includes(type) || ![24, 32].includes(bpp) || !w || !h || w > 8192 || h > 8192) throw new Error(`Неподдерживаемый TGA: ${file}`);
  const px = bpp / 8, out = Buffer.alloc(w * h * 4);
  let p = 18 + idLen, n = 0;
  const put = (o) => {
    const y = Math.floor(n / w), i = ((top ? y : h - 1 - y) * w + (n % w)) * 4;
    out[i] = b[o + 2]; out[i + 1] = b[o + 1]; out[i + 2] = b[o]; out[i + 3] = px === 4 ? b[o + 3] : 255;
    n++;
  };
  while (n < w * h) {
    if (type === 2) { put(p); p += px; continue; }
    const head = b[p++], count = (head & 127) + 1;
    for (let i = 0; i < count && n < w * h; i++) { put(p); if (!(head & 128)) p += px; }
    if (head & 128) p += px;
  }
  return { data: out, width: w, height: h };
}
