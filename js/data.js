// ゲームデータ定義

// tier が高いほど強い。プレイヤーのレベルに応じて出現する tier が上がる
export const MONSTERS = [
  { id: 'puru', metal: true,    name: 'スクラップバグ',     icon: '🪲', tier: 1, hp: 8,   atk: 9,  def: 4,  agi: 3,  exp: 2,   gold: 3 },
  { id: 'kinoko',  name: '偵察ドローン',       icon: '🛸', tier: 1, hp: 12,  atk: 11, def: 6,  agi: 4,  exp: 4,   gold: 5,  skill: { type: 'heal', name: '自己修復プログラムを 起動した', rate: .15, power: 8 } },
  { id: 'koumori', name: 'ジャミングサテライト', icon: '🛰️', tier: 2, hp: 14,  atk: 13, def: 5,  agi: 14, exp: 5,   gold: 6 },
  { id: 'hebi', metal: true,    name: 'ワイヤースネーク',   icon: '🐍', tier: 2, hp: 20,  atk: 16, def: 8,  agi: 8,  exp: 8,   gold: 9,  skill: { type: 'double', name: 'ワイヤーを 連続で 打ちこんだ', rate: .2 } },
  { id: 'goblin',  name: 'ガードボット',       icon: '🤖', tier: 3, hp: 30,  atk: 22, def: 12, agi: 9,  exp: 14,  gold: 16 },
  { id: 'ookami', metal: true,  name: 'メカハウンド',       icon: '🐺', tier: 4, hp: 36,  atk: 28, def: 14, agi: 22, exp: 20,  gold: 18, skill: { type: 'double', name: '高速で 連続攻撃した', rate: .25 } },
  { id: 'sasori', metal: true,  name: 'アーマースコーピオン', icon: '🦂', tier: 4, hp: 40,  atk: 30, def: 32, agi: 10, exp: 26,  gold: 22 },
  { id: 'reisu',   name: 'ゴーストAI',         icon: '👾', tier: 5, hp: 45,  atk: 34, def: 20, agi: 18, exp: 34,  gold: 30, skill: { type: 'breath', name: 'EMPノイズを 放った', rate: .3, power: 22 } },
  { id: 'hone',    name: 'アサルトアーム',     icon: '🦾', tier: 6, hp: 62,  atk: 44, def: 30, agi: 16, exp: 48,  gold: 42 },
  { id: 'majin',   name: 'クラッシャー重機',   icon: '🚜', tier: 7, hp: 110, atk: 56, def: 52, agi: 4,  exp: 80,  gold: 60 },
  { id: 'kraken',  name: 'ガンシップ',         icon: '🚁', tier: 8, hp: 125, atk: 62, def: 40, agi: 14, exp: 100, gold: 80, skill: { type: 'double', name: '機銃を 乱射した', rate: .3 } },
  { id: 'ryu', metal: true,     name: 'メカドラゴン',       icon: '🐉', tier: 9, hp: 210, atk: 80, def: 60, agi: 25, exp: 180, gold: 150, skill: { type: 'breath', name: 'プラズマを 放射した', rate: .3, power: 60 } },
];

// まれに出現する強敵（暴走AI）。ステータスはプレイヤーのレベルで決まる
export const BOSS = {
  id: 'kage', name: '暴走AI オメガ', icon: '👁️', boss: true,
  scale(lv) {
    return {
      hp: 70 + lv * 28, atk: 14 + lv * 5.2, def: 8 + lv * 3, agi: 10 + lv * 2,
      exp: 20 + lv * 25, gold: 30 + lv * 20,
      skill: { type: 'breath', name: '全方位レーザーを 放った', rate: .3, power: 10 + lv * 4 },
    };
  },
};

// スキル（ID は fx.js の演出とセーブの互換のためそのまま）
export const SPELLS = [
  { id: 'heal',   name: 'リペア',           lv: 1,  mp: 3,  type: 'heal',   min: 25,  max: 35 },
  { id: 'fire',   name: 'ミサイル',         lv: 3,  mp: 3,  type: 'attack', min: 12,  max: 18, lvBonus: 1 },
  { id: 'thunder',name: 'EMPショック',      lv: 7,  mp: 6,  type: 'attack', min: 40,  max: 55, lvBonus: 2 },
  { id: 'hiheal', name: 'フルリペア',       lv: 9,  mp: 6,  type: 'heal',   min: 90,  max: 110 },
  { id: 'meteo',  name: '軌道爆撃', lv: 15, mp: 15, type: 'attack', min: 120, max: 160, lvBonus: 3 },
];

export const ITEMS = {
  herb:   { name: 'リペアキット',     desc: 'HPを 30ほど 回復', price: 8,   type: 'hp', power: 30 },
  potion: { name: 'ハイリペアキット', desc: 'HPを 100ほど 回復', price: 40, type: 'hp', power: 100 },
  ether:  { name: 'エネルギーセル',   desc: 'ENを 20 回復',      price: 60,  type: 'mp', power: 20 },
  seedA:  { name: 'パワーチップ',     desc: '攻撃力が 1 上がる',  price: 0,   type: 'seed', stat: 'atk' },
  seedD:  { name: 'アーマーチップ',   desc: '防御力が 1 上がる',  price: 0,   type: 'seed', stat: 'def' },
  seedH:  { name: 'コアチップ',       desc: '最大HPが 5 上がる', price: 0,   type: 'seed', stat: 'hp' },
};

export const WEAPONS = [
  { id: 'w0', name: '鉄パイプ',         atk: 2,  price: 0 },
  { id: 'w1', name: 'スチールブレード', atk: 8,  price: 60 },
  { id: 'w2', name: 'チェーンブレード', atk: 15, price: 260 },
  { id: 'w3', name: 'ヒートブレード',   atk: 26, price: 900 },
  { id: 'w4', name: 'プラズマブレード', atk: 40, price: 2800 },
  { id: 'w5', name: 'フォトンブレード', atk: 60, price: 7500 },
];

export const ARMORS = [
  { id: 'a0', name: 'スクラップ装甲', def: 2,  price: 0 },
  { id: 'a1', name: '軽量プレート',   def: 6,  price: 50 },
  { id: 'a2', name: 'チタン装甲',     def: 12, price: 220 },
  { id: 'a3', name: '複合装甲',       def: 21, price: 800 },
  { id: 'a4', name: 'シールド装甲',   def: 32, price: 2500 },
  { id: 'a5', name: 'フォトンアーマー', def: 46, price: 7000 },
];

export const SHOP_ITEMS = ['herb', 'potion', 'ether'];

// レベルごとの素のステータス
export function baseStats(lv) {
  const l = lv - 1;
  return {
    maxHp: 30 + l * 9,
    maxMp: 10 + l * 4,
    atk: 8 + l * 3,
    def: 4 + Math.floor(l * 2.5),
    agi: 6 + l * 2,
  };
}

// そのレベルに到達するのに必要な累計経験値
export function expForLevel(lv) {
  return lv <= 1 ? 0 : Math.floor(8 * Math.pow(lv - 1, 2.3));
}

export const MAX_LEVEL = 50;
