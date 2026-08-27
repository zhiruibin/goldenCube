'use strict';

const fs = require('fs');
const zlib = require('zlib');

const OUT_W = 144;
const OUT_H = 144;
const SCALE = 4;
const W = OUT_W * SCALE;
const H = OUT_H * SCALE;

// ---------- PNG encoding ----------

// CRC-32 table (IEEE 802.3, reflected polynomial 0xEDB88320)
const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Each scanline is prefixed with filter byte 0 (None).
  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }

  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Pixel canvas ----------

const rgba = Buffer.alloc(W * H * 4);

// Source-over alpha compositing (sa/da blend).
function setPx(x, y, r, g, b, a) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || xi >= W || yi < 0 || yi >= H) return;

  const i = (yi * W + xi) * 4;
  const dr = rgba[i];
  const dg = rgba[i + 1];
  const db = rgba[i + 2];
  const da = rgba[i + 3];

  const outA = a + (da * (255 - a)) / 255; // sa + da * (1 - sa)
  if (outA <= 0) return;

  const inv = (255 - a) / 255;
  rgba[i]     = Math.min(255, Math.round((r * a + dr * da * inv) / outA));
  rgba[i + 1] = Math.min(255, Math.round((g * a + dg * da * inv) / outA));
  rgba[i + 2] = Math.min(255, Math.round((b * a + db * da * inv) / outA));
  rgba[i + 3] = Math.min(255, Math.round(outA));
}

// ---------- Primitives ----------

function fillRect(x, y, w, h, r, g, b, a) {
  x *= SCALE; y *= SCALE; w *= SCALE; h *= SCALE;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + w;
  const y1 = y0 + h;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      setPx(px, py, r, g, b, a);
    }
  }
}

function fillCircle(cx, cy, radius, r, g, b, a) {
  cx *= SCALE; cy *= SCALE; radius *= SCALE;
  const x0 = Math.floor(cx - radius);
  const x1 = Math.ceil(cx + radius);
  const y0 = Math.floor(cy - radius);
  const y1 = Math.ceil(cy + radius);
  const r2 = radius * radius;
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = px - cx;
      const dy = py - cy;
      if (dx * dx + dy * dy <= r2) setPx(px, py, r, g, b, a);
    }
  }
}

// Correct rounded-rectangle algorithm.
// Radius is clamped first so the inner core rectangle never inverts;
// each pixel is clamped to the nearest point on that core rectangle
// and tested against the corner circle centered at that point.
function roundedRect(x, y, w, h, radius, r, g, b, a) {
  x *= SCALE; y *= SCALE; w *= SCALE; h *= SCALE; radius *= SCALE;
  const rad = Math.min(radius, Math.floor((w - 1) / 2), Math.floor((h - 1) / 2));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = x0 + w - 1;
  const y1 = y0 + h - 1;
  const ix0 = x0 + rad; // core rectangle left  = x + rad
  const ix1 = x1 - rad; // core rectangle right = x + w - 1 - rad
  const iy0 = y0 + rad; // core rectangle top   = y + rad
  const iy1 = y1 - rad; // core rectangle bottom= y + h - 1 - rad

  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const nx = Math.max(ix0, Math.min(ix1, px));
      const ny = Math.max(iy0, Math.min(iy1, py));
      const dx = px - nx;
      const dy = py - ny;
      if (dx * dx + dy * dy <= rad * rad) setPx(px, py, r, g, b, a);
    }
  }
}

// ---------- Helpers ----------

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260811);

// ---------- Draw ----------

// 1. Vertical three-stop gradient background.
const stops = [
  [0,   [0x23, 0x23, 0x63]], // #232363
  [48,  [0x14, 0x14, 0x36]], // #141436
  [96,  [0x0a, 0x0a, 0x1e]], // #0a0a1e
  [144, [0x0a, 0x0a, 0x1e]], // #0a0a1e (end anchor)
];
for (let y = 0; y < OUT_H; y++) {
  let s = 0;
  while (s < stops.length - 2 && y >= stops[s + 1][0]) s++;
  const t = (y - stops[s][0]) / (stops[s + 1][0] - stops[s][0]);
  const c0 = stops[s][1];
  const c1 = stops[s + 1][1];
  fillRect(
    0, y, OUT_W, 1,
    Math.round(lerp(c0[0], c1[0], t)),
    Math.round(lerp(c0[1], c1[1], t)),
    Math.round(lerp(c0[2], c1[2], t)),
    255
  );
}

// 2. Random white stars (radius 0.6-2.0px, alpha 0.5-1.0).
for (let i = 0; i < 16; i++) {
  const sx = rand() * OUT_W;
  const sy = rand() * OUT_H;
  const sr = 0.6 + rand() * 1.4;
  const sa = Math.round(128 + rand() * 127);
  fillCircle(sx, sy, sr, 255, 255, 255, sa);
}

// 3. Central pale gold halo.
fillCircle(72, 74, 52, 0xff, 0xd3, 0x5c, 0x10);

// 4. Gold T-shaped tile.
const block = 26;
const gap = 6;
const radius = 7;
const cols = 3;
const rows = 3;
const gx0 = (OUT_W - (cols * block + (cols - 1) * gap)) / 2; // (144-90)/2 = 27
const gy0 = (OUT_H - (rows * block + (rows - 1) * gap)) / 2; // (144-58)/2 = 43
const cells = [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]];

for (const [col, row] of cells) {
  const cx = gx0 + col * (block + gap);
  const cy = gy0 + row * (block + gap);

  // Base tile color.
  roundedRect(cx, cy, block, block, radius, 0xff, 0xd3, 0x5c, 255);

  // Top highlight.
  roundedRect(
    cx + 2, cy + 2,
    block - 4, Math.round((block - 4) * 0.4),
    radius - 2,
    0xff, 0xf2, 0xc4, 150
  );

  // Bottom shadow.
  roundedRect(
    cx + 2, cy + Math.round((block - 4) * 0.62),
    block - 4, Math.round((block - 4) * 0.38),
    radius - 2,
    0xc9, 0x8a, 0x1e, 110
  );
}

// 5. Bright center sparkle on the middle tile.
const mid = cells[1]; // [1, 0]
const sparkX = gx0 + mid[0] * (block + gap) + block / 2;
const sparkY = gy0 + mid[1] * (block + gap) + block / 2;
fillCircle(sparkX, sparkY, 3.2, 255, 255, 255, 220);
fillCircle(sparkX, sparkY, 1.2, 255, 255, 255, 255);

// ---------- Write ----------

function downsample(src, srcW, srcH, dstW, dstH) {
  const scale = srcW / dstW;
  const dst = Buffer.alloc(dstW * dstH * 4);
  const total = scale * scale;
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = Math.floor(dx * scale);
      const y0 = Math.floor(dy * scale);
      const x1 = Math.min(srcW, x0 + scale);
      const y1 = Math.min(srcH, y0 + scale);
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let aSum = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const si = (sy * srcW + sx) * 4;
          const a = src[si + 3];
          if (a === 0) continue;
          rSum += src[si] * a;
          gSum += src[si + 1] * a;
          bSum += src[si + 2] * a;
          aSum += a;
        }
      }
      const di = (dy * dstW + dx) * 4;
      if (aSum === 0) {
        dst[di] = 0;
        dst[di + 1] = 0;
        dst[di + 2] = 0;
        dst[di + 3] = 0;
      } else {
        dst[di] = Math.round(rSum / aSum);
        dst[di + 1] = Math.round(gSum / aSum);
        dst[di + 2] = Math.round(bSum / aSum);
        dst[di + 3] = Math.round(aSum / total);
      }
    }
  }
  return dst;
}

const png144 = encodePNG(OUT_W, OUT_H, downsample(rgba, W, H, OUT_W, OUT_H));
const pngHD = encodePNG(W, H, rgba);
fs.mkdirSync('assets/images', { recursive: true });
fs.writeFileSync('assets/images/icon-144.png', png144);
fs.writeFileSync('assets/images/icon-576.png', pngHD);
console.log(`assets/images/icon-144.png written (${png144.length} bytes)`);
console.log(`assets/images/icon-576.png written (${pngHD.length} bytes)`);