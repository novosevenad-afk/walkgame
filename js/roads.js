// 道路データ（OpenStreetMap）を Overpass API から取ってきて、敵を道路の上に置くために使う。
// 取得した道路は端末に保存して使い回す。取れなかったときは何もしない（元の位置のまま）。

const TILE = 0.01;            // 道路を取りに行く単位（約1km四方）
const NEED = 0.006;           // 現在地から何度の範囲の道路を用意するか（敵の出現範囲より少し広く）
const BUCKET = 0.001;         // 近い道路を探すための区画（約100m）
const MAX_SNAP_M = 120;       // これより遠い道路には寄せない
const RETRY_MS = 60 * 1000;   // 取得に失敗したら1分は再試行しない
// 道路データは量が多いので、セーブデータ（localStorage）とは別の Cache Storage に保存する
const ROAD_CACHE = 'walkquest-roads-v1';
const CACHE_TTL = 14 * 24 * 60 * 60 * 1000; // 2週間
const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

const loaded = new Set();          // 道路を読み込み済みのタイル
const pending = new Map();         // 取得中のタイル -> Promise
const failedAt = new Map();        // 取得に失敗したタイル -> 時刻
const index = new Map();           // 区画キー -> [[lat1, lng1, lat2, lng2], ...]

async function cacheGet(key) {
  try {
    const c = await caches.open(ROAD_CACHE);
    const res = await c.match(`./roads/${key}`);
    if (!res) return null;
    const data = await res.json();
    if (Date.now() - data.t > CACHE_TTL) { c.delete(`./roads/${key}`); return null; }
    return data.w;
  } catch (e) {
    return null;
  }
}

async function cachePut(key, ways) {
  try {
    const c = await caches.open(ROAD_CACHE);
    await c.put(`./roads/${key}`, new Response(JSON.stringify({ t: Date.now(), w: ways }), { headers: { 'Content-Type': 'application/json' } }));
  } catch (e) { /* 保存できなくても遊べるので無視 */ }
}

// 道路の線分を区画に登録する
function addTile(key, ways) {
  if (loaded.has(key)) return;
  loaded.add(key);
  for (const w of ways) {
    for (let i = 0; i + 3 < w.length; i += 2) {
      const seg = [w[i] / 1e5, w[i + 1] / 1e5, w[i + 2] / 1e5, w[i + 3] / 1e5];
      const y0 = Math.floor(Math.min(seg[0], seg[2]) / BUCKET), y1 = Math.floor(Math.max(seg[0], seg[2]) / BUCKET);
      const x0 = Math.floor(Math.min(seg[1], seg[3]) / BUCKET), x1 = Math.floor(Math.max(seg[1], seg[3]) / BUCKET);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const k = `${x}:${y}`;
          if (!index.has(k)) index.set(k, []);
          index.get(k).push(seg);
        }
      }
    }
  }
}

async function fetchTile(tx, ty) {
  const s = ty * TILE, w = tx * TILE, n = s + TILE, e = w + TILE;
  // 歩いて行ける道路だけ（高速道路・工事中などは除く）
  const q = `[out:json][timeout:20];way["highway"]["highway"!~"^(motorway|motorway_link|construction|proposed|raceway|bus_guideway|platform)$"]["area"!="yes"](${s},${w},${n},${e});out skel geom qt;`;
  let lastErr;
  for (const url of ENDPOINTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const res = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(q)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // 座標は 1e5 倍した整数で持つ（約1m 精度、保存サイズを小さくするため）
      return (json.elements || [])
        .filter((el) => el.type === 'way' && el.geometry && el.geometry.length > 1)
        .map((el) => el.geometry.flatMap((g) => [Math.round(g.lat * 1e5), Math.round(g.lon * 1e5)]));
    } catch (err) {
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function loadTile(tx, ty) {
  const key = `${tx}:${ty}`;
  if (loaded.has(key)) return null;
  if (pending.has(key)) return pending.get(key);
  if (Date.now() - (failedAt.get(key) || 0) < RETRY_MS) return null;
  const p = (async () => {
    const cached = await cacheGet(key);
    if (cached) { addTile(key, cached); return true; }
    const ways = await fetchTile(tx, ty);
    addTile(key, ways);
    cachePut(key, ways);
    return true;
  })()
    .catch((err) => {
      console.warn('road fetch failed', key, err);
      failedAt.set(key, Date.now());
      return false;
    })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

// 現在地のまわりの道路を用意する。新しく読み込めたら onLoaded() を呼ぶ
export function ensureRoads(pos, onLoaded) {
  const tx0 = Math.floor((pos.lng - NEED) / TILE), tx1 = Math.floor((pos.lng + NEED) / TILE);
  const ty0 = Math.floor((pos.lat - NEED) / TILE), ty1 = Math.floor((pos.lat + NEED) / TILE);
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      const p = loadTile(tx, ty);
      if (p) p.then((ok) => { if (ok && onLoaded) onLoaded(); });
    }
  }
}

// 一番近い道路上の点を返す（近くに道路がなければ null）
export function nearestRoadPoint(p) {
  const kx = Math.cos((p.lat * Math.PI) / 180) * 111320; // 経度1度あたりの m
  const ky = 110540;                                     // 緯度1度あたりの m
  const r = Math.ceil(MAX_SNAP_M / ky / BUCKET) + 1;
  const bx = Math.floor(p.lng / BUCKET), by = Math.floor(p.lat / BUCKET);
  let best = null;
  let bestD = MAX_SNAP_M * MAX_SNAP_M;
  const seen = new Set();
  for (let y = by - r; y <= by + r; y++) {
    for (let x = bx - r; x <= bx + r; x++) {
      const list = index.get(`${x}:${y}`);
      if (!list) continue;
      for (const seg of list) {
        if (seen.has(seg)) continue;
        seen.add(seg);
        // 現在地を原点にした平面（m）で、線分への最近点を求める
        const ax = (seg[1] - p.lng) * kx, ay = (seg[0] - p.lat) * ky;
        const bx2 = (seg[3] - p.lng) * kx, by2 = (seg[2] - p.lat) * ky;
        const dx = bx2 - ax, dy = by2 - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
        const qx = ax + dx * t, qy = ay + dy * t;
        const d = qx * qx + qy * qy;
        if (d < bestD) { bestD = d; best = { lat: p.lat + qy / ky, lng: p.lng + qx / kx }; }
      }
    }
  }
  return best;
}

export function roadsReady() { return index.size > 0; }
