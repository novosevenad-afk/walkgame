// 位置ベースのモンスター・スポット生成
// 緯度経度をグリッドに区切り、セルID＋時間帯をシードにして決定的に生成する。
// そのため同じ場所・同じ時間帯なら誰が見ても同じモンスターがいる。
import { MONSTERS, BOSS } from './data.js';
import { seededRng, clamp } from './util.js';

const MON_CELL = 0.0012;   // 約130m
const MON_RADIUS = 3;      // 周囲 ±3 セル
const SPOT_CELL = 0.0025;  // 約270m
const SPOT_RADIUS = 2;
export const SLOT_MS = 10 * 60 * 1000; // 10分でモンスターが入れ替わる

export function currentSlot(now = Date.now()) {
  return Math.floor(now / SLOT_MS);
}

function cellOf(pos, size) {
  return { x: Math.floor(pos.lng / size), y: Math.floor(pos.lat / size) };
}

// プレイヤーのレベルから出現する tier の範囲を決める
function tierRange(lv) {
  const max = clamp(1 + Math.floor(lv / 2), 1, 9);
  return { min: Math.max(1, max - 3), max };
}

export function monstersAround(pos, lv, slot = currentSlot()) {
  const c = cellOf(pos, MON_CELL);
  const { min, max } = tierRange(lv);
  const pool = MONSTERS.filter((m) => m.tier >= min && m.tier <= max);
  const list = [];
  for (let dx = -MON_RADIUS; dx <= MON_RADIUS; dx++) {
    for (let dy = -MON_RADIUS; dy <= MON_RADIUS; dy++) {
      const cx = c.x + dx, cy = c.y + dy;
      const rng = seededRng(`m:${cx}:${cy}:${slot}`);
      const r = rng();
      const count = r < 0.6 ? 0 : r < 0.93 ? 1 : 2;
      for (let i = 0; i < count; i++) {
        const lat = (cy + rng()) * MON_CELL;
        const lng = (cx + rng()) * MON_CELL;
        // 強い個体ほど出にくい重み付け
        const weights = pool.map((m) => 1 + (max - m.tier) * 0.6);
        let pick = rng() * weights.reduce((a, b) => a + b, 0);
        let mon = pool[0];
        for (let k = 0; k < pool.length; k++) {
          pick -= weights[k];
          if (pick <= 0) { mon = pool[k]; break; }
        }
        list.push({ id: `${cx}:${cy}:${slot}:${i}`, lat, lng, mon });
      }
      // まれにボス
      if (rng() < 0.008) {
        list.push({
          id: `${cx}:${cy}:${slot}:boss`,
          lat: (cy + rng()) * MON_CELL,
          lng: (cx + rng()) * MON_CELL,
          mon: BOSS,
        });
      }
    }
  }
  return list;
}

export const SPOT_TYPES = {
  spring: { icon: '🔋', name: '充電ステーション', cooldown: 3 * 60 * 1000 },
  chest:  { icon: '📦', name: '補給コンテナ',     cooldown: 30 * 60 * 1000 },
  shop:   { icon: '🔧', name: 'パーツショップ',   cooldown: 0 },
  church: { icon: '📡', name: '司令部',           cooldown: 0 },
};

// スポットは時間で変わらない固定配置
export function spotsAround(pos) {
  const c = cellOf(pos, SPOT_CELL);
  const list = [];
  for (let dx = -SPOT_RADIUS; dx <= SPOT_RADIUS; dx++) {
    for (let dy = -SPOT_RADIUS; dy <= SPOT_RADIUS; dy++) {
      const cx = c.x + dx, cy = c.y + dy;
      const rng = seededRng(`s:${cx}:${cy}`);
      const r = rng();
      let type = null;
      if (r < 0.28) type = 'spring';
      else if (r < 0.62) type = 'chest';
      else if (r < 0.76) type = 'shop';
      else if (r < 0.82) type = 'church';
      if (!type) continue;
      list.push({
        id: `${cx}:${cy}`,
        type,
        lat: (cy + 0.15 + rng() * 0.7) * SPOT_CELL,
        lng: (cx + 0.15 + rng() * 0.7) * SPOT_CELL,
      });
    }
  }
  return list;
}

// 現在のセルキー（このキーが変わったら再生成する）
export function areaKey(pos, slot = currentSlot()) {
  const m = cellOf(pos, MON_CELL);
  const s = cellOf(pos, SPOT_CELL);
  return `${m.x}:${m.y}:${s.x}:${s.y}:${slot}`;
}

// 古いスロットの撃破記録を掃除
export function pruneDefeated(defeated, slot = currentSlot()) {
  for (const key of Object.keys(defeated)) {
    const parts = key.split(':');
    const s = Number(parts[2]);
    if (!(s >= slot - 1)) delete defeated[key];
  }
}
