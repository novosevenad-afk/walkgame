// ターン制バトル
import { player } from './player.js';
import { ITEMS } from './data.js';
import { rand, randInt, clamp, sleep, escapeHtml } from './util.js';
import { sfx } from './sound.js';

const $ = (id) => document.getElementById(id);
let msgLines = [];
let skipTyping = false;

function makeEnemy(mon, lv) {
  const base = mon.boss ? { ...mon, ...mon.scale(lv) } : { ...mon };
  for (const k of ['hp', 'atk', 'def', 'agi', 'exp', 'gold']) base[k] = Math.round(base[k]);
  if (base.skill && base.skill.power) base.skill = { ...base.skill, power: Math.round(base.skill.power) };
  base.maxHp = base.hp;
  return base;
}

function renderStatus() {
  const st = player.stats;
  const s = player.s;
  const low = s.hp <= st.maxHp / 4 ? 'low' : '';
  $('battle-status').innerHTML = `
    <div>${escapeHtml(s.name)}</div>
    <div class="${low}">HP <b class="${low}">${s.hp}</b></div>
    <div>MP <b>${s.mp}</b></div>
    <div>Lv <b>${s.lv}</b></div>`;
}

function renderEnemyHp(e) {
  $('enemy-hp').firstElementChild.style.width = `${(e.hp / e.maxHp) * 100}%`;
}

async function say(text, wait = 450) {
  msgLines.push('');
  if (msgLines.length > 4) msgLines.shift();
  const box = $('battle-msg');
  skipTyping = false;
  for (let i = 0; i < text.length; i++) {
    msgLines[msgLines.length - 1] = text.slice(0, i + 1);
    box.textContent = msgLines.join('\n');
    if (!skipTyping) await sleep(28);
  }
  msgLines[msgLines.length - 1] = text;
  box.textContent = msgLines.join('\n');
  await sleep(skipTyping ? 150 : wait);
}

function clearMsg() {
  msgLines = [];
  $('battle-msg').textContent = '';
}

function popDamage(n, color = '#fff') {
  const el = $('dmg-pop');
  el.textContent = n;
  el.style.color = color;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
}

function anim(el, cls, ms) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

// コマンド選択を待つ
function chooseCommand() {
  return new Promise((resolve) => {
    const cmds = $('battle-cmds');
    const sub = $('battle-sub');
    cmds.classList.remove('hidden');
    sub.classList.add('hidden');

    const done = (v) => {
      cmds.classList.add('hidden');
      sub.classList.add('hidden');
      cmds.onclick = null;
      sub.onclick = null;
      resolve(v);
    };

    const showSub = (entries) => {
      cmds.classList.add('hidden');
      sub.classList.remove('hidden');
      sub.innerHTML = entries.map((e, i) =>
        `<button class="cmd" data-i="${i}" ${e.disabled ? 'disabled' : ''}>${escapeHtml(e.label)}<small>${escapeHtml(e.note || '')}</small></button>`
      ).join('') + '<button class="cmd" data-i="back">もどる</button>';
      sub.onclick = (ev) => {
        const b = ev.target.closest('button');
        if (!b || b.disabled) return;
        sfx.cursor();
        if (b.dataset.i === 'back') {
          sub.classList.add('hidden');
          cmds.classList.remove('hidden');
          return;
        }
        done(entries[Number(b.dataset.i)].value);
      };
    };

    cmds.onclick = (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      sfx.cursor();
      const c = b.dataset.cmd;
      if (c === 'attack') done({ type: 'attack' });
      else if (c === 'run') done({ type: 'run' });
      else if (c === 'spell') {
        showSub(player.spells.map((sp) => ({
          label: sp.name, note: `MP${sp.mp}`, disabled: player.s.mp < sp.mp,
          value: { type: 'spell', spell: sp },
        })));
      } else if (c === 'item') {
        const ids = Object.keys(player.s.items).filter((id) => ITEMS[id] && ITEMS[id].type !== 'seed');
        showSub(ids.map((id) => ({
          label: ITEMS[id].name, note: `×${player.s.items[id]}`,
          value: { type: 'item', id },
        })));
      }
    };
  });
}

function physicalDamage(atk, def) {
  const base = (atk - def / 2) / 2;
  if (base < 1) return randInt(0, 1);
  return Math.max(1, Math.round(base * rand(0.85, 1.15)));
}

export async function startBattle(spawn, onUpdate) {
  const s = player.s;
  const e = makeEnemy(spawn.mon, s.lv);
  const battle = $('battle');
  const icon = $('enemy-icon');

  battle.classList.toggle('boss', !!e.boss);
  battle.classList.remove('hidden');
  icon.className = '';
  icon.textContent = e.icon;
  $('enemy-name').textContent = e.name;
  renderEnemyHp(e);
  renderStatus();
  clearMsg();
  $('battle-cmds').classList.add('hidden');
  $('battle-sub').classList.add('hidden');
  battle.onclick = () => { skipTyping = true; };

  sfx.encounter();
  if (navigator.vibrate) navigator.vibrate(e.boss ? [100, 60, 200] : 80);
  await say(e.boss ? `${e.name}が すがたを あらわした！` : `${e.name}が あらわれた！`, 600);

  let result = null;
  while (!result) {
    const cmd = await chooseCommand();
    const st = player.stats;
    const playerFirst = st.agi * rand(0.5, 1) >= e.agi * rand(0.5, 1);

    const playerAct = async () => {
      if (cmd.type === 'attack') {
        await say(`${s.name}の こうげき！`, 200);
        if (Math.random() < 1 / 32 + clamp((e.agi - st.agi) / 400, 0, 0.1)) {
          sfx.miss();
          await say(`ミス！ ${e.name}は ひらりと かわした！`);
          return;
        }
        let dmg;
        if (Math.random() < 1 / 24) {
          dmg = Math.round(st.atk * rand(0.95, 1.05));
          battle.classList.add('flash');
          setTimeout(() => battle.classList.remove('flash'), 300);
          await say('かいしんの いちげき！', 200);
        } else {
          dmg = physicalDamage(st.atk, e.def);
        }
        await hitEnemy(dmg);
      } else if (cmd.type === 'spell') {
        const sp = cmd.spell;
        s.mp -= sp.mp;
        renderStatus();
        sfx.spell();
        await say(`${s.name}は ${sp.name}を となえた！`, 250);
        if (sp.type === 'heal') {
          const r = player.heal(randInt(sp.min, sp.max));
          sfx.heal();
          renderStatus();
          await say(`HPが ${r.hp} かいふくした！`);
        } else {
          const dmg = Math.round(rand(sp.min, sp.max) + s.lv * (sp.lvBonus || 0));
          battle.classList.add('flash');
          setTimeout(() => battle.classList.remove('flash'), 300);
          await hitEnemy(dmg);
        }
      } else if (cmd.type === 'item') {
        await say(`${s.name}は ${ITEMS[cmd.id].name}を つかった！`, 250);
        const r = player.useItem(cmd.id);
        if (r && r.ok) sfx.heal();
        renderStatus();
        await say(r ? r.msg : 'しかし なにも おこらなかった。');
      }
    };

    const hitEnemy = async (dmg) => {
      sfx.hit();
      anim(icon, 'hit', 350);
      popDamage(dmg);
      e.hp = Math.max(0, e.hp - dmg);
      renderEnemyHp(e);
      await say(`${e.name}に ${dmg}の ダメージ！`);
    };

    const hitPlayer = async (dmg) => {
      sfx.damage();
      anim(battle, 'shake', 300);
      if (navigator.vibrate) navigator.vibrate(50);
      s.hp = Math.max(0, s.hp - dmg);
      renderStatus();
      await say(`${s.name}は ${dmg}の ダメージを うけた！`);
    };

    const enemyAttackOnce = async () => {
      if (Math.random() < 1 / 40) {
        sfx.miss();
        await say(`${s.name}は ひらりと みをかわした！`);
        return;
      }
      await hitPlayer(physicalDamage(e.atk, st.def));
    };

    const enemyAct = async () => {
      anim(icon, 'act', 400);
      const sk = e.skill;
      if (sk && Math.random() < sk.rate) {
        if (sk.type === 'heal' && e.hp < e.maxHp) {
          const h = Math.min(e.maxHp - e.hp, sk.power);
          e.hp += h;
          renderEnemyHp(e);
          await say(`${e.name}は ${sk.name}`, 250);
          await say(`${e.name}の キズが ${h} かいふくした！`);
          return;
        }
        if (sk.type === 'breath') {
          await say(`${e.name}は ${sk.name}！`, 250);
          await hitPlayer(Math.round(sk.power * rand(0.85, 1.15)));
          return;
        }
        if (sk.type === 'double') {
          await say(`${e.name}は ${sk.name}！`, 250);
          await enemyAttackOnce();
          if (s.hp > 0) await enemyAttackOnce();
          return;
        }
      }
      await say(`${e.name}の こうげき！`, 200);
      await enemyAttackOnce();
    };

    if (cmd.type === 'run') {
      const chance = e.boss ? 0.25 : clamp(0.55 + (st.agi - e.agi) / 50, 0.2, 0.95);
      await say(`${s.name}は にげだした！`, 250);
      if (Math.random() < chance) {
        sfx.run();
        await say('うまく にげきれた！');
        result = 'run';
        break;
      }
      await say('しかし まわりこまれてしまった！');
      await enemyAct();
    } else if (playerFirst) {
      await playerAct();
      if (e.hp > 0) await enemyAct();
    } else {
      await enemyAct();
      if (s.hp > 0) await playerAct();
    }

    if (e.hp <= 0) result = 'win';
    else if (s.hp <= 0) result = 'lose';
    onUpdate && onUpdate();
  }

  if (result === 'win') {
    icon.className = 'dead';
    sfx.win();
    await say(`${e.name}を やっつけた！`, 500);
    s.gold += e.gold;
    s.wins++;
    s.book[e.id] = (s.book[e.id] || 0) + 1;
    s.defeated[spawn.id] = true;
    await say(`${e.exp}ポイントの けいけんちを かくとく！`, 300);
    await say(`${e.gold}ゴールドを てにいれた！`, 300);
    const drop = rollDrop(e);
    if (drop) {
      player.addItem(drop);
      await say(`${e.name}は ${ITEMS[drop].name}を おとしていった！`, 300);
    }
    const ups = player.gainExp(e.exp);
    for (const up of ups) {
      sfx.levelup();
      renderStatus();
      await say(`${s.name}は レベル${up.lv}に あがった！`, 700);
      await say(`さいだいHP+${up.hp} MP+${up.mp} こうげき+${up.atk} しゅび+${up.def}`, 500);
      for (const sp of up.newSpells) await say(`${sp.name}の じゅもんを おぼえた！`, 500);
    }
  } else if (result === 'lose') {
    sfx.lose();
    await say(`${s.name}は ちからつきた…`, 900);
    s.gold = Math.floor(s.gold / 2);
    player.fullHeal();
    await say('きょうかいで いきかえった。 しょじきんが はんぶんに なった…', 900);
  }

  await sleep(400);
  battle.onclick = null;
  battle.classList.add('hidden');
  player.save();
  onUpdate && onUpdate();
  return result;
}

function rollDrop(e) {
  const r = Math.random();
  if (e.boss) return ['seedA', 'seedD', 'seedH'][randInt(0, 2)];
  if (r < 0.03) return ['seedA', 'seedD', 'seedH'][randInt(0, 2)];
  if (r < 0.06) return 'ether';
  if (r < 0.16) return 'herb';
  return null;
}
