// プレイヤー状態とセーブデータ
import { baseStats, expForLevel, MAX_LEVEL, WEAPONS, ARMORS, ITEMS, SPELLS } from './data.js';

const SAVE_KEY = 'walkquest-save-v1';

function defaultState() {
  return {
    name: 'アイアン',
    lv: 1,
    exp: 0,
    hp: 30,
    mp: 10,
    gold: 20,
    weapon: 'w0',
    armor: 'a0',
    ownedWeapons: ['w0'],  // 買った武器（付け替えても消えない）
    ownedArmors: ['a0'],   // 買った装甲
    bonus: { atk: 0, def: 0, hp: 0 },
    items: { herb: 3 },
    book: {},         // モンスターID -> 倒した数
    defeated: {},     // スポーンID -> true（同じ個体と再戦しない）
    spotUsed: {},     // スポットID -> 使用時刻
    walked: 0,        // 歩いた距離(m)
    walkMode: false,  // ウォークモード（近づいた敵と自動で戦う）
    wins: 0,
    demo: false,
    demoPos: null,
  };
}

export const player = {
  s: defaultState(),

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        this.s = Object.assign(defaultState(), JSON.parse(raw));
        // 以前のセーブには所持装備の記録がないので、最初の装備と今の装備を持っていることにする
        this.s.ownedWeapons = [...new Set(['w0', ...this.s.ownedWeapons, this.s.weapon])];
        this.s.ownedArmors = [...new Set(['a0', ...this.s.ownedArmors, this.s.armor])];
        return true;
      }
    } catch (e) {
      console.warn('load failed', e);
    }
    return false;
  },

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.s));
    } catch (e) {
      console.warn('save failed', e);
    }
  },

  reset() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    this.s = defaultState();
  },

  get weapon() { return WEAPONS.find((w) => w.id === this.s.weapon) || WEAPONS[0]; },
  get armor() { return ARMORS.find((a) => a.id === this.s.armor) || ARMORS[0]; },

  get stats() {
    const b = baseStats(this.s.lv);
    return {
      maxHp: b.maxHp + this.s.bonus.hp,
      maxMp: b.maxMp,
      atk: b.atk + this.weapon.atk + this.s.bonus.atk,
      def: b.def + this.armor.def + this.s.bonus.def,
      agi: b.agi,
    };
  },

  get spells() { return SPELLS.filter((sp) => sp.lv <= this.s.lv); },

  get nextExp() {
    return this.s.lv >= MAX_LEVEL ? null : expForLevel(this.s.lv + 1) - this.s.exp;
  },

  // 経験値を加算し、上がったレベルの情報を返す
  gainExp(n) {
    this.s.exp += n;
    const ups = [];
    while (this.s.lv < MAX_LEVEL && this.s.exp >= expForLevel(this.s.lv + 1)) {
      const before = this.stats;
      const learnedBefore = this.spells.length;
      this.s.lv++;
      const after = this.stats;
      ups.push({
        lv: this.s.lv,
        hp: after.maxHp - before.maxHp,
        mp: after.maxMp - before.maxMp,
        atk: after.atk - before.atk,
        def: after.def - before.def,
        newSpells: this.spells.slice(learnedBefore),
      });
      this.s.hp += after.maxHp - before.maxHp;
      this.s.mp += after.maxMp - before.maxMp;
    }
    return ups;
  },

  heal(hp, mp = 0) {
    const st = this.stats;
    const h0 = this.s.hp, m0 = this.s.mp;
    this.s.hp = Math.min(st.maxHp, this.s.hp + hp);
    this.s.mp = Math.min(st.maxMp, this.s.mp + mp);
    return { hp: this.s.hp - h0, mp: this.s.mp - m0 };
  },

  fullHeal() {
    const st = this.stats;
    this.s.hp = st.maxHp;
    this.s.mp = st.maxMp;
  },

  // kind: 'weapon' | 'armor'
  owned(kind) { return kind === 'weapon' ? this.s.ownedWeapons : this.s.ownedArmors; },
  owns(kind, id) { return this.owned(kind).includes(id); },

  // 装備を買って手持ちに加え、そのまま装備する
  buyEquip(kind, id) {
    const eq = (kind === 'weapon' ? WEAPONS : ARMORS).find((x) => x.id === id);
    if (!eq || this.owns(kind, id) || this.s.gold < eq.price) return null;
    this.s.gold -= eq.price;
    this.owned(kind).push(id);
    this.s[kind] = id;
    return eq;
  },

  // 持っている装備に付け替える
  equip(kind, id) {
    if (!this.owns(kind, id)) return null;
    this.s[kind] = id;
    return (kind === 'weapon' ? WEAPONS : ARMORS).find((x) => x.id === id);
  },

  addItem(id, n = 1) {
    this.s.items[id] = (this.s.items[id] || 0) + n;
  },

  // どうぐを使う。結果メッセージを返す（使えなければ null）
  useItem(id) {
    const it = ITEMS[id];
    if (!it || !this.s.items[id]) return null;
    const st = this.stats;
    let msg;
    if (it.type === 'hp') {
      if (this.s.hp >= st.maxHp) return { ok: false, msg: 'HPは 満タンだ。' };
      const r = this.heal(it.power);
      msg = `HPが ${r.hp} 回復した！`;
    } else if (it.type === 'mp') {
      if (this.s.mp >= st.maxMp) return { ok: false, msg: 'ENは 満タンだ。' };
      const r = this.heal(0, it.power);
      msg = `ENが ${r.mp} 回復した！`;
    } else if (it.type === 'seed') {
      if (it.stat === 'hp') {
        this.s.bonus.hp += 5;
        this.s.hp += 5;
        msg = '最大HPが 5 上がった！';
      } else {
        this.s.bonus[it.stat] += 1;
        msg = `${it.stat === 'atk' ? '攻撃力' : '防御力'}が 1 上がった！`;
      }
    }
    this.s.items[id]--;
    if (this.s.items[id] <= 0) delete this.s.items[id];
    return { ok: true, msg };
  },
};
