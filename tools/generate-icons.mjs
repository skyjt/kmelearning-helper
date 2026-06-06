import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "icons");
const SIZES = [16, 32, 48, 128];

fs.mkdirSync(OUT_DIR, { recursive: true });

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function mixColor(a, b, t) {
  return [
    Math.round(mix(a[0], b[0], t)),
    Math.round(mix(a[1], b[1], t)),
    Math.round(mix(a[2], b[2], t)),
    Math.round(mix(a[3], b[3], t))
  ];
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function writePng(filePath, width, height, rgba) {
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    rows[rowStart] = 0;
    rgba.copy(rows, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;

  fs.writeFileSync(filePath, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
    pngChunk("IEND")
  ]));
}

function blendPixel(buffer, width, x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= width || y >= width || alpha <= 0) return;
  const offset = (y * width + x) * 4;
  const sourceAlpha = clamp((color[3] / 255) * alpha);
  const destAlpha = buffer[offset + 3] / 255;
  const outAlpha = sourceAlpha + destAlpha * (1 - sourceAlpha);
  if (outAlpha <= 0) return;

  buffer[offset] = Math.round((color[0] * sourceAlpha + buffer[offset] * destAlpha * (1 - sourceAlpha)) / outAlpha);
  buffer[offset + 1] = Math.round((color[1] * sourceAlpha + buffer[offset + 1] * destAlpha * (1 - sourceAlpha)) / outAlpha);
  buffer[offset + 2] = Math.round((color[2] * sourceAlpha + buffer[offset + 2] * destAlpha * (1 - sourceAlpha)) / outAlpha);
  buffer[offset + 3] = Math.round(outAlpha * 255);
}

function roundedRectDistance(x, y, cx, cy, halfW, halfH, radius) {
  const qx = Math.abs(x - cx) - halfW + radius;
  const qy = Math.abs(y - cy) - halfH + radius;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

function rotatedRoundedRectDistance(x, y, cx, cy, halfW, halfH, radius, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  const rx = dx * cos + dy * sin;
  const ry = -dx * sin + dy * cos;
  return roundedRectDistance(rx, ry, 0, 0, halfW, halfH, radius);
}

function circleDistance(x, y, cx, cy, radius) {
  return Math.hypot(x - cx, y - cy) - radius;
}

function renderField(buffer, size, distance, colorFor, softness = 1.2) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = distance(x + 0.5, y + 0.5);
      const alpha = 1 - smoothstep(-softness, softness, d);
      if (alpha > 0) blendPixel(buffer, size, x, y, colorFor(x, y, d), alpha);
    }
  }
}

function triangleArea(ax, ay, bx, by, cx, cy) {
  return Math.abs((ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) / 2);
}

function pointInTriangle(x, y, points) {
  const [a, b, c] = points;
  const total = triangleArea(a[0], a[1], b[0], b[1], c[0], c[1]);
  const a1 = triangleArea(x, y, b[0], b[1], c[0], c[1]);
  const a2 = triangleArea(a[0], a[1], x, y, c[0], c[1]);
  const a3 = triangleArea(a[0], a[1], b[0], b[1], x, y);
  return Math.abs(total - a1 - a2 - a3) <= 0.7;
}

function fillTriangle(buffer, size, points, color) {
  const minX = Math.floor(Math.min(...points.map((p) => p[0])) - 1);
  const maxX = Math.ceil(Math.max(...points.map((p) => p[0])) + 1);
  const minY = Math.floor(Math.min(...points.map((p) => p[1])) - 1);
  const maxY = Math.ceil(Math.max(...points.map((p) => p[1])) + 1);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      let hits = 0;
      for (const ox of [0.25, 0.75]) {
        for (const oy of [0.25, 0.75]) {
          if (pointInTriangle(x + ox, y + oy, points)) hits += 1;
        }
      }
      if (hits) blendPixel(buffer, size, x, y, color, hits / 4);
    }
  }
}

function fillLine(buffer, size, points, width, color) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[index + 1];
    const minX = Math.floor(Math.min(x1, x2) - width);
    const maxX = Math.ceil(Math.max(x1, x2) + width);
    const minY = Math.floor(Math.min(y1, y2) - width);
    const maxY = Math.ceil(Math.max(y1, y2) + width);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const px = x + 0.5;
        const py = y + 0.5;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const t = clamp(((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy));
        const distance = Math.hypot(px - (x1 + dx * t), py - (y1 + dy * t)) - width / 2;
        const alpha = 1 - smoothstep(-0.8, 0.8, distance);
        if (alpha > 0) blendPixel(buffer, size, x, y, color, alpha);
      }
    }
  }
}

function renderIcon(size) {
  const scale = 4;
  const canvas = size * scale;
  const buffer = Buffer.alloc(canvas * canvas * 4);

  const bgStart = [45, 118, 255, 255];
  const bgEnd = [33, 211, 181, 255];
  const bgWarm = [255, 178, 94, 255];

  renderField(
    buffer,
    canvas,
    (x, y) => roundedRectDistance(x, y, canvas / 2, canvas / 2 + canvas * 0.03, canvas * 0.39, canvas * 0.39, canvas * 0.2),
    () => [8, 18, 40, 85],
    canvas * 0.03
  );

  renderField(
    buffer,
    canvas,
    (x, y) => roundedRectDistance(x, y, canvas / 2, canvas / 2, canvas * 0.42, canvas * 0.42, canvas * 0.2),
    (x, y) => {
      const diagonal = clamp((x + y) / (canvas * 1.8));
      const base = mixColor(bgStart, bgEnd, diagonal);
      const glow = 1 - clamp(Math.hypot(x - canvas * 0.78, y - canvas * 0.2) / (canvas * 0.7));
      return mixColor(base, bgWarm, glow * 0.22);
    },
    1.1
  );

  renderField(
    buffer,
    canvas,
    (x, y) => circleDistance(x, y, canvas * 0.21, canvas * 0.18, canvas * 0.24),
    () => [255, 255, 255, 45],
    canvas * 0.04
  );

  const pageWhite = [255, 255, 255, 232];
  renderField(
    buffer,
    canvas,
    (x, y) => rotatedRoundedRectDistance(x, y, canvas * 0.39, canvas * 0.52, canvas * 0.18, canvas * 0.25, canvas * 0.045, -0.12),
    (x, y) => mixColor(pageWhite, [217, 255, 247, 235], clamp((y - canvas * 0.32) / (canvas * 0.48))),
    1
  );
  renderField(
    buffer,
    canvas,
    (x, y) => rotatedRoundedRectDistance(x, y, canvas * 0.61, canvas * 0.52, canvas * 0.18, canvas * 0.25, canvas * 0.045, 0.12),
    (x, y) => mixColor(pageWhite, [226, 239, 255, 235], clamp((y - canvas * 0.32) / (canvas * 0.48))),
    1
  );

  renderField(
    buffer,
    canvas,
    (x, y) => roundedRectDistance(x, y, canvas * 0.5, canvas * 0.53, canvas * 0.018, canvas * 0.24, canvas * 0.02),
    () => [38, 117, 185, 95],
    0.9
  );

  fillLine(buffer, canvas, [[canvas * 0.3, canvas * 0.44], [canvas * 0.44, canvas * 0.41]], canvas * 0.028, [55, 126, 190, 65]);
  fillLine(buffer, canvas, [[canvas * 0.31, canvas * 0.56], [canvas * 0.44, canvas * 0.54]], canvas * 0.024, [55, 126, 190, 55]);
  fillLine(buffer, canvas, [[canvas * 0.57, canvas * 0.43], [canvas * 0.69, canvas * 0.46]], canvas * 0.024, [55, 126, 190, 55]);

  fillTriangle(buffer, canvas, [
    [canvas * 0.57, canvas * 0.49],
    [canvas * 0.57, canvas * 0.66],
    [canvas * 0.72, canvas * 0.575]
  ], [30, 114, 240, 230]);

  renderField(
    buffer,
    canvas,
    (x, y) => circleDistance(x, y, canvas * 0.69, canvas * 0.31, canvas * 0.14),
    (x, y) => mixColor([255, 147, 86, 255], [255, 92, 122, 255], clamp((x + y - canvas * 0.8) / (canvas * 0.5))),
    1
  );
  fillLine(buffer, canvas, [
    [canvas * 0.625, canvas * 0.31],
    [canvas * 0.675, canvas * 0.36],
    [canvas * 0.765, canvas * 0.24]
  ], canvas * 0.045, [255, 255, 255, 245]);

  const output = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let yy = 0; yy < scale; yy += 1) {
        for (let xx = 0; xx < scale; xx += 1) {
          const offset = (((y * scale + yy) * canvas) + (x * scale + xx)) * 4;
          r += buffer[offset];
          g += buffer[offset + 1];
          b += buffer[offset + 2];
          a += buffer[offset + 3];
        }
      }
      const target = (y * size + x) * 4;
      const samples = scale * scale;
      output[target] = Math.round(r / samples);
      output[target + 1] = Math.round(g / samples);
      output[target + 2] = Math.round(b / samples);
      output[target + 3] = Math.round(a / samples);
    }
  }
  return output;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="bg" x1="18" x2="110" y1="15" y2="116" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2D76FF"/>
      <stop offset=".72" stop-color="#21D3B5"/>
      <stop offset="1" stop-color="#FFB25E"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="8" stdDeviation="6" flood-color="#081228" flood-opacity=".25"/>
    </filter>
  </defs>
  <rect x="10" y="10" width="108" height="108" rx="26" fill="url(#bg)" filter="url(#shadow)"/>
  <circle cx="27" cy="25" r="30" fill="#fff" opacity=".15"/>
  <g opacity=".95">
    <rect x="30" y="38" width="31" height="56" rx="6" fill="#fff" transform="rotate(-7 45.5 66)"/>
    <rect x="67" y="38" width="31" height="56" rx="6" fill="#EAF4FF" transform="rotate(7 82.5 66)"/>
    <rect x="62" y="38" width="4" height="58" rx="2" fill="#2875B9" opacity=".35"/>
    <path d="M74 62v19l17-9.5z" fill="#1E72F0"/>
    <path d="M33 56l18-4M35 71l17-3M73 55l16 4" stroke="#377EBE" stroke-width="3.4" stroke-linecap="round" opacity=".25"/>
  </g>
  <circle cx="88" cy="40" r="18" fill="#FF6A73"/>
  <path d="M80 40l6 6 12-15" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`;

fs.writeFileSync(path.join(OUT_DIR, "icon.svg"), svg);

for (const size of SIZES) {
  writePng(path.join(OUT_DIR, `icon-${size}.png`), size, size, renderIcon(size));
}

console.log(`Generated ${SIZES.length} PNG icons and icons/icon.svg`);
