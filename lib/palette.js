// Album-art color extraction — browser only (canvas), imported from client
// components. No dependency: coarse RGB bucketing beats k-means for 32×32.

const CACHE = "lyra_pal:";

export async function extractPalette(url, slug) {
  try {
    const hit = localStorage.getItem(CACHE + slug);
    if (hit) return JSON.parse(hit);
  } catch {}

  // mzstatic serves CORS headers, so the canvas stays untainted; if that ever
  // changes, decode()/getImageData throws and the caller keeps its default
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  await img.decode();

  const n = 32;
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;

  // 4-bit buckets scored by population × saturation — vivid areas win over
  // large flat backgrounds, but a dominant background still places
  const buckets = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 24 || min > 235) continue; // near-black/white carries no hue
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0, s: 0 };
    e.r += r; e.g += g; e.b += b; e.n += 1;
    e.s += max ? (max - min) / max : 0;
    buckets.set(key, e);
  }

  const top = [...buckets.values()]
    .map((e) => ({ c: [e.r / e.n, e.g / e.n, e.b / e.n], score: e.n * (0.35 + e.s / e.n) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  // pick 3 mutually distant colors — three shades of the same blue would
  // collapse the ambient gradient into one blob
  const dist = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const picked = [];
  for (const t of top) {
    if (picked.length >= 3) break;
    if (picked.every((p) => dist(t.c, p) > 2800)) picked.push(t.c);
  }
  if (picked.length === 0) throw new Error("no color");
  while (picked.length < 3) picked.push(picked[picked.length - 1]);

  const hex = picked.map(
    (p) => "#" + p.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")
  );
  try {
    localStorage.setItem(CACHE + slug, JSON.stringify(hex));
  } catch {}
  return hex;
}
