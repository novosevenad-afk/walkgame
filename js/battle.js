// ターン制バトル
import { player } from './player.js';
import { ITEMS } from './data.js';
import { rand, randInt, clamp, sleep, escapeHtml } from './util.js';
import { sfx, stopBgm } from './sound.js';
import { slashFx, spellFx, healFx, clawFx, breathFx } from './fx.js';

const $ = (id) => document.getElementById(id);
let msgLines = [];
let skipTyping = false;
let autoMode = false;
let guarding = false;

// ステータスカードの顔（12x12 ドット）
const PORTRAIT = [
  '....hhhh....',
  '..hhhhhhhh..',
  '.hhhhyyhhhh.',
  '.hhhhhhhhhh.',
  '.hbbbbbbbbh.',
  '.bbssssssbb.',
  '.bskssssksb.',
  '.bssssssssb.',
  '..sssmmsss..',
  '...ssssss...',
  '..caaaaaac..',
  '.ccayyyyacc.',
];
const PORTRAIT_COLORS = {
  h: '#a9b6c8', y: '#f5c542', b: '#7a4520', s: '#f2c79b', k: '#1a1a2a', m: '#c46a5a', c: '#2f5fb3', a: '#d5dde8',
};

function drawPortrait(canvas) {
  canvas.width = 12;
  canvas.height = 12;
  const g = canvas.getContext('2d');
  PORTRAIT.forEach((row, y) => [...row].forEach((ch, x) => {
    if (!PORTRAIT_COLORS[ch]) return;
    g.fillStyle = PORTRAIT_COLORS[ch];
    g.fillRect(x, y, 1, 1);
  }));
}

function makeEnemy(mon, lv) {
  const base = mon.boss ? { ...mon, ...mon.scale(lv) } : { ...mon };
  for (const k of ['hp', 'atk', 'def', 'agi', 'exp', 'gold']) base[k] = Math.round(base[k]);
  if (base.skill && base.skill.power) base.skill = { ...base.skill, power: Math.round(base.skill.power) };
  base.maxHp = base.hp;
  return base;
}

function buildStatusCard() {
  $('battle-party').innerHTML = `
    <div class="pcard">
      <span class="pbadge" hidden>🛡️</span>
      <div class="pcard-top">
        <canvas aria-hidden="true"></canvas>
        <div class="pstat">
          <div class="num"><span>HP</span><b data-k="hp"></b></div>
          <div class="gauge"><i data-k="hpbar"></i></div>
          <div class="num"><span>MP</span><b data-k="mp"></b></div>
          <div class="gauge mp"><i data-k="mpbar"></i></div>
        </div>
      </div>
      <div class="plabel"><span>ゆうしゃ</span><span data-k="lv"></span></div>
      <div class="pname">${escapeHtml(player.s.name)}</div>
    </div>`;
  drawPortrait($('battle-party').querySelector('canvas'));
}

function renderStatus() {
  const st = player.stats;
  const s = player.s;
  const card = $('battle-party');
  const q = (k) => card.querySelector(`[data-k="${k}"]`);
  const low = s.hp <= st.maxHp / 4;
  q('hp').textContent = s.hp;
  q('hp').classList.toggle('low', low);
  q('mp').textContent = s.mp;
  q('lv').textContent = `Lv${s.lv}`;
  q('hpbar').style.width = `${(s.hp / st.maxHp) * 100}%`;
  q('hpbar').classList.toggle('low', low);
  q('mpbar').style.width = `${(s.mp / Math.max(1, st.maxMp)) * 100}%`;
  card.querySelector('.pbadge').hidden = !guarding;
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

// オートバトルの行動：HPが少なければ回復、それ以外はこうげき
function autoPick() {
  const st = player.stats;
  if (player.s.hp < st.maxHp * 0.35) {
    const heal = player.spells.filter((sp) => sp.type === 'heal' && sp.mp <= player.s.mp).pop();
    if (heal) return { type: 'spell', spell: heal };
    const item = ['potion', 'herb'].find((id) => player.s.items[id]);
    if (item) return { type: 'item', id: item };
  }
  return { type: 'attack' };
}

function setAuto(on) {
  autoMode = on;
  const b = $('btn-auto');
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.querySelector('span').textContent = on ? 'オートちゅう（タップでとめる）' : 'オートバトル';
}

// コマンド選択を待つ
function chooseCommand() {
  return new Promise((resolve) => {
    const msg = $('battle-msg');
    const cmds = $('battle-cmds');
    const sub = $('battle-sub');
    const run = $('btn-run');
    const auto = $('btn-auto');
    let autoTimer = null;

    const showCmds = () => {
      msg.hidden = true;
      cmds.classList.remove('hidden');
      sub.classList.add('hidden');
    };

    const done = (v) => {
      clearTimeout(autoTimer);
      cmds.classList.add('hidden');
      sub.classList.add('hidden');
      msg.hidden = false;
      cmds.onclick = null;
      sub.onclick = null;
      run.onclick = null;
      run.disabled = true;
      auto.onclick = toggleAuto;
      resolve(v);
    };

    const scheduleAuto = () => {
      clearTimeout(autoTimer);
      if (autoMode) autoTimer = setTimeout(() => done(autoPick()), 350);
    };

    function toggleAuto() {
      sfx.cursor();
      setAuto(!autoMode);
      if (cmds.onclick) scheduleAuto();
    }

    const showSub = (entries) => {
      clearTimeout(autoTimer);
      cmds.classList.add('hidden');
      sub.classList.remove('hidden');
      sub.innerHTML = (entries.length ? '' : '<div class="sub-empty">つかえるものが ない。</div>') + entries.map((e, i) =>
        `<button class="sub-item" data-i="${i}" ${e.disabled ? 'disabled' : ''}><span>${escapeHtml(e.label)}</span><small>${escapeHtml(e.note || '')}</small></button>`
      ).join('') + '<button class="sub-item back" data-i="back">もどる</button>';
      sub.onclick = (ev) => {
        const b = ev.target.closest('button');
        if (!b || b.disabled) return;
        sfx.cursor();
        if (b.dataset.i === 'back') { showCmds(); return; }
        done(entries[Number(b.dataset.i)].value);
      };
    };

    showCmds();
    run.disabled = false;
    run.onclick = () => { sfx.cursor(); done({ type: 'run' }); };
    auto.onclick = toggleAuto;
    cmds.onclick = (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      sfx.cursor();
      const c = b.dataset.cmd;
      if (c === 'attack') done({ type: 'attack' });
      else if (c === 'guard') done({ type: 'guard' });
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
    scheduleAuto();
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
  guarding = false;
  setAuto(false);
  buildStatusCard();
  renderEnemyHp(e);
  renderStatus();
  clearMsg();
  $('battle-msg').hidden = false;
  $('battle-cmds').classList.add('hidden');
  $('battle-sub').classList.add('hidden');
  $('btn-run').disabled = true;
  battle.onclick = () => { skipTyping = true; };

  sfx.encounter();
  if (navigator.vibrate) navigator.vibrate(e.boss ? [100, 60, 200] : 80);
  await say(e.boss ? `${e.name}が すがたを あらわした！` : `${e.name}が あらわれた！`, 600);

  let result = null;
  while (!result) {
    const cmd = await chooseCommand();
    const st = player.stats;
    // ぼうぎょは必ず先に行動する
    const playerFirst = cmd.type === 'guard' || st.agi * rand(0.5, 1) >= e.agi * rand(0.5, 1);

    const playerAct = async () => {
      if (cmd.type === 'guard') {
        guarding = true;
        renderStatus();
        await say(`${s.name}は みを まもっている。`);
      } else if (cmd.type === 'attack') {
        await say(`${s.name}の こうげき！`, 200);
        if (Math.random() < 1 / 32 + clamp((e.agi - st.agi) / 400, 0, 0.1)) {
          await slashFx({ miss: true });
          sfx.miss();
          await say(`ミス！ ${e.name}は ひらりと かわした！`);
          return;
        }
        let dmg;
        if (Math.random() < 1 / 24) {
          dmg = Math.round(st.atk * rand(0.95, 1.05));
          await say('かいしんの いちげき！', 150);
          await slashFx({ crit: true });
          battle.classList.add('flash');
          setTimeout(() => battle.classList.remove('flash'), 300);
        } else {
          dmg = physicalDamage(st.atk, e.def);
          await slashFx();
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
          healFx();
          renderStatus();
          await say(`HPが ${r.hp} かいふくした！`);
        } else {
          const dmg = Math.round(rand(sp.min, sp.max) + s.lv * (sp.lvBonus || 0));
          await spellFx(sp.id);
          await hitEnemy(dmg);
        }
      } else if (cmd.type === 'item') {
        await say(`${s.name}は ${ITEMS[cmd.id].name}を つかった！`, 250);
        const r = player.useItem(cmd.id);
        if (r && r.ok) { sfx.heal(); healFx(); }
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
      if (guarding) dmg = Math.ceil(dmg / 2);
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
      await clawFx();
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
          healFx('enemy');
          await say(`${e.name}は ${sk.name}`, 250);
          await say(`${e.name}の キズが ${h} かいふくした！`);
          return;
        }
        if (sk.type === 'breath') {
          await say(`${e.name}は ${sk.name}！`, 250);
          await breathFx(sk.name);
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

    guarding = false;
    renderStatus();
    if (e.hp <= 0) result = 'win';
    else if (s.hp <= 0) result = 'lose';
    onUpdate && onUpdate();
  }

  // 勝ち・負け・にげるの瞬間はせんとう曲を止めて、ファンファーレを聞かせる
  stopBgm(0.1);
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
