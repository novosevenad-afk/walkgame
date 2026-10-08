// エントリーポイント：地図・GPS・UI
import { player } from './player.js';
import { ITEMS, WEAPONS, ARMORS, SHOP_ITEMS, MONSTERS, BOSS } from './data.js';
import { monstersAround, spotsAround, areaKey, currentSlot, pruneDefeated, SPOT_TYPES } from './world.js';
import { distance, offset, randInt, escapeHtml } from './util.js';
import { startBattle } from './battle.js';
import { ensureRoads } from './roads.js';
import { sfx, unlockAudio, audioRunning, setSound, soundEnabled, startBgm, stopBgm, setBgm, bgmOn } from './sound.js';

const $ = (id) => document.getElementById(id);
const APP_VERSION = 'ver 3.4';  // 更新が届いているか確認できるようタイトルに表示
const RANGE = 60;                 // タップで反応する距離(m)
const DEMO_START = { lat: 35.681236, lng: 139.767125 }; // 東京駅
const L = window.L;

let map, playerMarker, rangeCircle;
let pos = null;
let lastWalkPos = null;
let follow = true;
let inBattle = false;
let onField = false; // タイトル画面を抜けてフィールドにいるか
let currentKey = '';
let monsterLayer, spotLayer;
let currentMonsters = [];  // いま地図に出ているモンスター
let currentSpots = [];     // いま地図に出ているスポット
let gpsWatchId = null;
let gpsFixed = false;

/* ---------- HUD ---------- */
function updateHud() {
  const s = player.s;
  const st = player.stats;
  $('hud-name').textContent = s.name;
  $('hud-lv').textContent = s.lv;
  $('hud-gold').textContent = s.gold;
  $('hud-hp').textContent = `${s.hp}/${st.maxHp}`;
  $('hud-mp').textContent = `${s.mp}/${st.maxMp}`;
  const hpBar = $('hud-hpbar');
  hpBar.style.width = `${(s.hp / st.maxHp) * 100}%`;
  hpBar.classList.toggle('low', s.hp <= st.maxHp / 4);
  $('hud-mpbar').style.width = `${(s.mp / Math.max(1, st.maxMp)) * 100}%`;
  $('hud-walk').textContent = s.walked >= 1000 ? `${(s.walked / 1000).toFixed(2)}k` : Math.floor(s.walked);
}

let toastTimer;
function toast(msg, ms = 2200) {
  if (inBattle) return;
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  t.style.animation = 'none';
  void t.offsetWidth;
  t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}

/* ---------- モーダル ---------- */
let modalHandler = null;
function openModal(title, html, handler = null) {
  $('modal-title').textContent = title;
  $('modal-content').innerHTML = html;
  modalHandler = handler;
  $('modal').classList.remove('hidden');
}
function closeModal() {
  $('modal').classList.add('hidden');
  modalHandler = null;
}
$('modal-close').onclick = () => { sfx.cursor(); closeModal(); };
$('modal').addEventListener('click', (ev) => {
  if (ev.target.id === 'modal') return closeModal();
  const b = ev.target.closest('[data-action]');
  if (b && !b.disabled && modalHandler) {
    sfx.cursor();
    modalHandler(b.dataset.action, b.dataset.arg);
  }
});

// 持っている装備の一覧（付け替えボタン付き）
function equipRows(kind) {
  const list = kind === 'weapon' ? WEAPONS : ARMORS;
  const key = kind === 'weapon' ? 'atk' : 'def';
  const label = kind === 'weapon' ? '攻撃' : '防御';
  const cur = kind === 'weapon' ? player.weapon : player.armor;
  return list.filter((eq) => player.owns(kind, eq.id)).map((eq) => {
    const on = eq.id === cur.id;
    const d = eq[key] - cur[key];
    const diff = on || !d ? '' : ` <span class="${d > 0 ? 'diff-up' : 'diff-down'}">(${d > 0 ? '+' : ''}${d})</span>`;
    return `<div class="list-row"><div>${eq.name}<small>${label}+${eq[key]}${diff}</small></div>
      <button data-action="equip-${kind}" data-arg="${eq.id}" class="${on ? 'on' : ''}" ${on ? 'disabled' : ''}>${on ? '装備中' : '装備'}</button></div>`;
  }).join('');
}

function statusHtml() {
  const s = player.s;
  const st = player.stats;
  const next = player.nextExp;
  const spells = player.spells.map((sp) => `${sp.name}(EN${sp.mp})`).join('、') || 'なし';
  return `
    <div class="kv">
      <span>レベル</span><span>${s.lv}</span>
      <span>HP</span><span>${s.hp} / ${st.maxHp}</span>
      <span>EN</span><span>${s.mp} / ${st.maxMp}</span>
      <span>攻撃力</span><span>${st.atk}</span>
      <span>防御力</span><span>${st.def}</span>
      <span>機動力</span><span>${st.agi}</span>
      <span>経験値</span><span>${s.exp}</span>
      <span>次のレベルまで</span><span>${next === null ? '-' : next}</span>
      <span>クレジット</span><span>${s.gold} C</span>
      <span>撃破数</span><span>${s.wins}</span>
      <span>移動距離</span><span>${(s.walked / 1000).toFixed(2)} km</span>
    </div>
    <div class="section-title">装備（タップで付け替え）</div>
    <div class="sub-head">武器</div>
    ${equipRows('weapon')}
    <div class="sub-head">装甲</div>
    ${equipRows('armor')}
    <p class="note">買った装備は なくならず、いつでも 付け替えられます。新しい装備は パーツショップ 🔧 で。</p>
    <div class="section-title">スキル</div>
    <div>${spells}</div>`;
}

function showStatus() {
  openModal(`${player.s.name} 機体`, statusHtml(), (action, id) => {
    const kind = action === 'equip-weapon' ? 'weapon' : action === 'equip-armor' ? 'armor' : null;
    if (!kind) return;
    const eq = player.equip(kind, id);
    if (!eq) return;
    sfx.chest();
    player.save();
    updateHud();
    toast(`${eq.name}を 装備した！`);
    const box = $('modal-content');
    const y = box.scrollTop;
    box.innerHTML = statusHtml();
    box.scrollTop = y;
  });
}

function itemsHtml() {
  const ids = Object.keys(player.s.items).filter((id) => ITEMS[id]);
  if (!ids.length) return '<div>何も 持っていない。</div>';
  return ids.map((id) => `
    <div class="list-row">
      <div>${ITEMS[id].name} ×${player.s.items[id]}<small>${ITEMS[id].desc}</small></div>
      <button data-action="use" data-arg="${id}">使う</button>
    </div>`).join('');
}

function showItems() {
  openModal('アイテム', itemsHtml(), (action, id) => {
    if (action !== 'use') return;
    const r = player.useItem(id);
    if (r) {
      if (r.ok) sfx.heal();
      toast(`${ITEMS[id] ? ITEMS[id].name : ''} … ${r.msg}`);
      player.save();
      updateHud();
    }
    $('modal-content').innerHTML = itemsHtml();
  });
}

function showMenu() {
  openModal('メニュー', `
    <div class="list-row"><div>エネミー図鑑<small>撃破した 敵マシンの 記録</small></div><button data-action="book">開く</button></div>
    <div class="list-row"><div>設定<small>BGM・効果音・モード・データ</small></div><button data-action="settings">開く</button></div>`,
  (action) => {
    if (action === 'book') showBook();
    else if (action === 'settings') showSettings();
  });
}

const MENU_BACK = '<button class="cmd menu-back" data-action="menu">◀ メニューに もどる</button>';

function showBook() {
  const all = [...MONSTERS, BOSS];
  const found = all.filter((m) => player.s.book[m.id]).length;
  openModal(`エネミー図鑑 ${found}/${all.length}`, `${MENU_BACK}<div class="book-grid">${all.map((m) => {
    const n = player.s.book[m.id] || 0;
    return `<div class="book-cell ${n ? '' : 'unknown'}"><span class="ic ${m.metal && n ? 'metal' : ''}">${m.icon}</span>${n ? escapeHtml(m.name) : '？？？'}<br>${n ? `${n}機` : ''}</div>`;
  }).join('')}</div>`, (action) => { if (action === 'menu') showMenu(); });
}

function showSettings() {
  const demo = player.s.demo;
  openModal('設定', `
    ${MENU_BACK}
    <div class="list-row"><div>BGM<small>フィールドと 戦闘の 音楽</small></div><button data-action="bgm">${bgmOn() ? 'ON' : 'OFF'}</button></div>
    <div class="list-row"><div>効果音</div><button data-action="sound">${soundEnabled() ? 'ON' : 'OFF'}</button></div>
    <div class="list-row"><div>今のモード：${demo ? 'デモ' : 'GPS'}<small>${demo ? '地図タップ／十字キーで移動' : '実際に歩いて移動'}</small></div>
      <button data-action="mode">${demo ? 'GPSにする' : 'デモにする'}</button></div>
    <div class="list-row"><div>パイロット名を 変える</div><button data-action="rename">変える</button></div>
    <div class="list-row"><div>データを 消す<small>最初から やり直します</small></div><button data-action="reset">消す</button></div>
    <p style="font-size:12px;opacity:.7;margin-top:12px">敵マシンは10分ごとに入れかわります。<br>地図データ © OpenStreetMap contributors</p>`,
  (action) => {
    if (action === 'menu') {
      showMenu();
    } else if (action === 'bgm') {
      setBgm(!bgmOn());
      try { localStorage.setItem('walkquest-bgm', bgmOn() ? '1' : '0'); } catch (e) { /* ignore */ }
      if (bgmOn()) startBgm();
      showSettings();
    } else if (action === 'sound') {
      setSound(!soundEnabled());
      try { localStorage.setItem('walkquest-sound', soundEnabled() ? '1' : '0'); } catch (e) { /* ignore */ }
      showSettings();
    } else if (action === 'mode') {
      player.s.demo = !player.s.demo;
      player.save();
      location.reload();
    } else if (action === 'rename') {
      const n = prompt('新しい パイロット名（6文字まで）', player.s.name);
      if (n && n.trim()) {
        player.s.name = n.trim().slice(0, 6);
        player.save();
        updateHud();
        showSettings();
      }
    } else if (action === 'reset') {
      if (confirm('本当に データを 消しますか？')) {
        player.reset();
        location.reload();
      }
    }
  });
}

$('nav').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || inBattle) return;
  sfx.cursor();
  ({ status: showStatus, items: showItems, menu: showMenu, walk: toggleWalkMode })[b.dataset.open]();
});

/* ---------- スポット ---------- */
function spotRemaining(spot) {
  const cd = SPOT_TYPES[spot.type].cooldown;
  const used = player.s.spotUsed[spot.id];
  if (!cd || !used) return 0;
  return Math.max(0, used + cd - Date.now());
}

function useSpot(spot, { auto = false } = {}) {
  const T = SPOT_TYPES[spot.type];
  const remain = spotRemaining(spot);
  if (remain > 0) {
    toast(`${T.name}： あと ${Math.ceil(remain / 60000)}分で 使えます`);
    return;
  }
  if (spot.type === 'spring') {
    player.fullHeal();
    player.s.spotUsed[spot.id] = Date.now();
    sfx.heal();
    toast('充電ステーションで フル充電！ HPとENが 全回復！');
  } else if (spot.type === 'chest') {
    player.s.spotUsed[spot.id] = Date.now();
    sfx.chest();
    const r = Math.random();
    const lv = player.s.lv;
    let msg;
    if (r < 0.45) {
      const g = randInt(5, 15) * lv;
      player.s.gold += g;
      msg = `${g}クレジットを 見つけた！`;
    } else if (r < 0.72) {
      const n = randInt(1, 2);
      player.addItem('herb', n);
      msg = `リペアキットを ${n}個 見つけた！`;
    } else if (r < 0.84) {
      player.addItem('potion');
      msg = 'ハイリペアキットを 見つけた！';
    } else if (r < 0.93) {
      player.addItem('ether');
      msg = 'エネルギーセルを 見つけた！';
    } else {
      const id = ['seedA', 'seedD', 'seedH'][randInt(0, 2)];
      player.addItem(id);
      msg = `なんと ${ITEMS[id].name}を 見つけた！`;
    }
    toast(`補給コンテナを 開けた！ ${msg}`, 3000);
  } else if (spot.type === 'shop') {
    showShop();
  } else if (spot.type === 'church' && auto) {
    // ウォークモード：画面を開かずに回復だけする
    player.fullHeal();
    sfx.heal();
    toast('司令部で 整備を 受けた。 HPとENが 全回復！');
  } else if (spot.type === 'church') {
    player.fullHeal();
    sfx.heal();
    const next = player.nextExp;
    openModal('司令部', `
      <p>こちら司令部。 よく 戻った。</p>
      <p>${escapeHtml(player.s.name)}が 次の レベルになるには あと <b style="color:var(--accent)">${next === null ? '-' : next}</b> の 経験値が 必要だ。</p>
      <p>戦闘データを 記録し、 機体を 修理した（HPとEN 全回復）。</p>`);
  }
  player.save();
  updateHud();
  renderSpots();
}

const SHOP_TABS = [['items', 'アイテム'], ['weapon', '武器'], ['armor', '防具']];
let shopTab = 'items';  // 最後に見ていたタブ（開き直しても同じタブを出す）

function shopHtml() {
  const s = player.s;
  const row = (label, note, price, action, arg, disabled) => `
    <div class="list-row"><div>${label}<small>${note}</small></div>
    <button data-action="${action}" data-arg="${arg}" ${disabled ? 'disabled' : ''}>${price}C</button></div>`;
  const equipList = (kind, list, key, label) => list.slice(1).map((eq) => (player.owns(kind, eq.id)
    ? `<div class="list-row"><div>${eq.name}<small>${label}+${eq[key]}</small></div><span>${s[kind] === eq.id ? '装備中' : '所持'}</span></div>`
    : row(eq.name, `${label}+${eq[key]}`, eq.price, kind, eq.id, s.gold < eq.price))).join('');

  let html = `<div>所持クレジット： <b style="color:var(--accent)">${s.gold} C</b></div>`;
  html += `<div class="tabs" role="tablist">${SHOP_TABS.map(([id, label]) =>
    `<button role="tab" aria-selected="${id === shopTab}" class="${id === shopTab ? 'on' : ''}" data-action="tab" data-arg="${id}">${label}</button>`).join('')}</div>`;
  html += '<div class="tab-body" role="tabpanel">';
  if (shopTab === 'items') {
    html += SHOP_ITEMS.map((id) => row(ITEMS[id].name, `${ITEMS[id].desc}（所持：${s.items[id] || 0}）`, ITEMS[id].price, 'buy', id, s.gold < ITEMS[id].price)).join('');
  } else {
    html += shopTab === 'weapon' ? equipList('weapon', WEAPONS, 'atk', '攻撃') : equipList('armor', ARMORS, 'def', '防御');
    html += '<p class="note">買った装備は なくなりません。「機体」から いつでも 付け替えられます。</p>';
  }
  return html + '</div>';
}

function showShop() {
  openModal('パーツショップ「いらっしゃい！」', shopHtml(), (action, id) => {
    const s = player.s;
    if (action === 'tab') {
      shopTab = id;
    } else if (action === 'buy') {
      const it = ITEMS[id];
      if (s.gold < it.price) return;
      s.gold -= it.price;
      player.addItem(id);
      toast(`${it.name}を 買った！`);
    } else if (action === 'weapon' || action === 'armor') {
      const eq = player.buyEquip(action, id);
      if (!eq) return;
      sfx.chest();
      toast(`${eq.name}を 買って 装備した！`);
    }
    player.save();
    updateHud();
    $('modal-content').innerHTML = shopHtml();
  });
}

/* ---------- 地図とマーカー ---------- */
function icon(html, cls = '', size = 44) {
  return L.divIcon({
    className: 'mk',
    html: `<div class="mk-inner ${cls}">${html}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function initMap(start) {
  map = L.map('map', {
    zoomControl: false,
    attributionControl: true,
    minZoom: 14,
    maxZoom: 19,
  }).setView([start.lat, start.lng], 17);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);

  spotLayer = L.layerGroup().addTo(map);
  monsterLayer = L.layerGroup().addTo(map);

  rangeCircle = L.circle([start.lat, start.lng], {
    radius: RANGE, color: '#facc15', weight: 2, dashArray: '6 6', fillOpacity: 0.06, interactive: false,
  }).addTo(map);

  playerMarker = L.marker([start.lat, start.lng], {
    icon: L.divIcon({ className: 'mk', html: '<div class="player-mk">🤖</div>', iconSize: [40, 40], iconAnchor: [20, 20] }),
    zIndexOffset: 1000,
    interactive: false,
  }).addTo(map);
  playerMarker.getElement().querySelector('.player-mk').classList.toggle('walk', !!player.s.walkMode);

  map.on('dragstart', () => { follow = false; });
  map.on('click', (ev) => {
    if (player.s.demo && !inBattle) walkTo({ lat: ev.latlng.lat, lng: ev.latlng.lng });
  });
  $('btn-center').onclick = () => {
    follow = true;
    if (pos) map.setView([pos.lat, pos.lng], Math.max(map.getZoom(), 17));
  };
}

function renderMonsters() {
  monsterLayer.clearLayers();
  currentMonsters = monstersAround(pos, player.s.lv).filter((sp) => !player.s.defeated[sp.id]);
  for (const sp of currentMonsters) {
    const m = L.marker([sp.lat, sp.lng], { icon: icon(sp.mon.icon, sp.mon.boss ? 'boss' : sp.mon.metal ? 'metal' : '', sp.mon.boss ? 56 : 44) });
    m.on('click', (ev) => {
      L.DomEvent.stopPropagation(ev);
      tryBattle(sp);
    });
    monsterLayer.addLayer(m);
  }
}

function renderSpots() {
  spotLayer.clearLayers();
  currentSpots = spotsAround(pos);
  for (const spot of currentSpots) {
    const used = spotRemaining(spot) > 0;
    const m = L.marker([spot.lat, spot.lng], { icon: icon(SPOT_TYPES[spot.type].icon, `spot ${used ? 'used' : ''}`) });
    m.on('click', (ev) => {
      L.DomEvent.stopPropagation(ev);
      const d = distance(pos, spot);
      if (d > RANGE) return toast(`${SPOT_TYPES[spot.type].name}： 遠すぎる！ あと ${Math.ceil(d - RANGE)}m`);
      useSpot(spot);
    });
    spotLayer.addLayer(m);
  }
}

function refreshWorld(force = false) {
  if (!pos || !map) return;
  const key = areaKey(pos);
  if (!force && key === currentKey) return;
  currentKey = key;
  // まわりの道路を用意し、届いたら敵を道路の上に置き直す
  ensureRoads(pos, () => { if (!inBattle) refreshWorld(true); });
  pruneDefeated(player.s.defeated, currentSlot());
  renderMonsters();
  renderSpots();
}

async function tryBattle(sp, { auto = false } = {}) {
  if (inBattle) return;
  const d = distance(pos, sp);
  if (d > RANGE) {
    toast(`${sp.mon.name}： 射程外！ あと ${Math.ceil(d - RANGE)}m 近づこう`);
    return;
  }
  if (player.s.hp <= 0) player.fullHeal();
  inBattle = true;
  cancelAnimationFrame(walkAnim);  // デモで移動中ならその場で止まる
  closeModal();
  startBgm('battle');
  const result = await startBattle(sp, updateHud, { auto });
  inBattle = false;
  if (document.visibilityState === 'visible') startBgm('field');
  if (result === 'run') fledFrom.add(sp.id);
  if (result === 'win' || result === 'lose') refreshWorld(true);
  // ウォークモード：少し間をあけてから次のエンカウントを探す
  encounterReadyAt = Date.now() + WALK_COOLDOWN;
  setTimeout(walkTick, WALK_COOLDOWN + 100);
}

/* ---------- ウォークモード ---------- */
const WALK_COOLDOWN = 4000;  // バトル後、次に自動で戦うまでの時間(ms)
const fledFrom = new Set();  // にげた敵とは自動で戦わない
let encounterReadyAt = 0;
let lowHpWarned = false;

function setWalkMode(on) {
  player.s.walkMode = on;
  player.save();
  const b = $('btn-walk');
  b.setAttribute('aria-pressed', on ? 'true' : 'false');
  b.querySelector('.walk-state').textContent = on ? 'ON' : 'OFF';
  const mk = playerMarker && playerMarker.getElement() && playerMarker.getElement().querySelector('.player-mk');
  if (mk) mk.classList.toggle('walk', on);
}

function needsHeal() {
  const st = player.stats;
  return player.s.hp < st.maxHp || player.s.mp < st.maxMp;
}

// 近くの宝箱を開け、HP・MPが減っていれば回復スポットを使う（使ったら true）
function checkWalkSpots() {
  if (!player.s.walkMode || inBattle || !pos || !onField) return false;
  if (!$('modal').classList.contains('hidden')) return false;
  for (const spot of currentSpots) {
    if (distance(pos, spot) > RANGE || spotRemaining(spot) > 0) continue;
    const heal = spot.type === 'spring' || spot.type === 'church';
    if (spot.type === 'chest' || (heal && needsHeal())) {
      useSpot(spot, { auto: true });
      return true;
    }
  }
  return false;
}

// ウォークモードの1回ぶんの処理：スポットを先に使い、なければ敵を探す
function walkTick() {
  if (checkWalkSpots()) {
    // 知らせを読めるよう少し待ってから続きを処理する
    setTimeout(walkTick, 1800);
    return;
  }
  checkWalkEncounter();
}

// 近くにモンスターがいたら自動でバトルを始める
function checkWalkEncounter() {
  if (!player.s.walkMode || inBattle || !pos || !onField) return;
  if (!$('modal').classList.contains('hidden')) return;
  if (Date.now() < encounterReadyAt) return;
  if (player.s.hp <= player.stats.maxHp * 0.3) {
    if (!lowHpWarned) {
      toast('ウォークモード：HPが 少ないので 戦闘を 避けています。充電ステーションで 回復しよう', 4500);
      lowHpWarned = true;
    }
    return;
  }
  lowHpWarned = false;
  let best = null;
  let bestD = Infinity;
  for (const sp of currentMonsters) {
    if (sp.mon.boss || player.s.defeated[sp.id] || fledFrom.has(sp.id)) continue;
    const d = distance(pos, sp);
    if (d <= RANGE && d < bestD) { best = sp; bestD = d; }
  }
  if (best) tryBattle(best, { auto: true });
}

function toggleWalkMode() {
  const on = !player.s.walkMode;
  setWalkMode(on);
  toast(on
    ? 'ウォークモード ON：敵との 戦闘・補給・回復を 自動で 行います'
    : 'ウォークモード OFF', 3200);
  if (on) setTimeout(walkTick, 1500);
}

/* ---------- 位置更新 ---------- */
function setPosition(p, accuracy = 0) {
  if (lastWalkPos) {
    const d = distance(lastWalkPos, p);
    // GPSのブレを除外しつつ歩行距離を加算
    if (accuracy <= 40 && d >= 3 && d < 150) {
      player.s.walked += d;
      lastWalkPos = p;
    } else if (d >= 150) {
      lastWalkPos = p;
    }
  } else {
    lastWalkPos = p;
  }
  pos = p;
  playerMarker.setLatLng([p.lat, p.lng]);
  rangeCircle.setLatLng([p.lat, p.lng]);
  if (follow) map.panTo([p.lat, p.lng], { animate: !player.s.demo });
  refreshWorld();
  updateHud();
  walkTick();
}

function startGps() {
  if (!('geolocation' in navigator)) {
    $('hud-gps').textContent = 'GPS: 使えません';
    toast('この 端末では GPSが 使えません。デモモードを ためしてね', 4000);
    return;
  }
  gpsWatchId = navigator.geolocation.watchPosition(
    (p) => {
      const acc = Math.round(p.coords.accuracy);
      $('hud-gps').textContent = `GPS: ±${acc}m`;
      const np = { lat: p.coords.latitude, lng: p.coords.longitude };
      gpsFixed = true;
      if (!map) initMap(np);
      setPosition(np, acc);
    },
    (err) => {
      if (gpsFixed && err.code !== 1) {
        $('hud-gps').textContent = 'GPS: 電波が 弱い';
        return;
      }
      $('hud-gps').textContent = 'GPS: エラー';
      const msg = err.code === 1
        ? '位置情報が 許可されていません。設定から 許可するか、デモモードで 遊んでね'
        : '位置情報が 取れません。外に 出てみてね';
      toast(msg, 5000);
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 },
  );
}

/* ---------- デモモード ---------- */
let walkAnim = null;
function walkTo(target) {
  cancelAnimationFrame(walkAnim);
  const from = { ...pos };
  const d = distance(from, target);
  const dur = Math.min(6000, Math.max(300, d * 50)); // 秒速20mの速歩き
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    setPosition({ lat: from.lat + (target.lat - from.lat) * k, lng: from.lng + (target.lng - from.lng) * k });
    if (k < 1) walkAnim = requestAnimationFrame(step);
    else { player.s.demoPos = pos; player.save(); }
  };
  walkAnim = requestAnimationFrame(step);
}

function setupDpad() {
  const dpad = $('dpad');
  dpad.classList.remove('hidden');
  let timer = null;
  const move = (dir) => {
    if (inBattle) return;
    const v = { n: [4, 0], s: [-4, 0], e: [0, 4], w: [0, -4] }[dir];
    follow = true;
    setPosition(offset(pos, v[0], v[1]));
  };
  const stop = () => {
    clearInterval(timer);
    timer = null;
    if (pos) { player.s.demoPos = pos; player.save(); }
  };
  dpad.addEventListener('pointerdown', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    ev.preventDefault();
    cancelAnimationFrame(walkAnim);
    move(b.dataset.dir);
    clearInterval(timer);
    timer = setInterval(() => move(b.dataset.dir), 100);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => dpad.addEventListener(e, stop));
}

function startDemo() {
  const start = player.s.demoPos || DEMO_START;
  $('hud-gps').textContent = 'デモモード';
  initMap(start);
  setPosition(start);
  setupDpad();
  toast('デモモード：地図をタップするか 十字キーで 移動', 3500);
}

/* ---------- 画面を消さない ---------- */
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* ignore */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wakeLock !== null) requestWakeLock();
  // 画面を閉じている間は止め、フィールドに戻ったら再開
  if (document.visibilityState === 'hidden') stopBgm(0.05);
  else if (onField && !inBattle) { unlockAudio(); startBgm(); }
});

// iPhone はアプリ切替などで音が止まると、画面に触れるまで再開できないため、タッチのたびに確認する
document.addEventListener('pointerdown', () => {
  if (!onField) return;
  if (!audioRunning()) unlockAudio();
  if (!inBattle) startBgm();
}, { passive: true });

/* ---------- 起動 ---------- */
function boot(demo) {
  unlockAudio();
  const nameInput = $('name-input');
  if (!$('title-new').classList.contains('hidden')) {
    player.s.name = (nameInput.value.trim() || 'アイアン').slice(0, 6);
  }
  player.s.demo = demo;
  player.save();
  $('title').classList.add('hidden');
  onField = true;
  setWalkMode(!!player.s.walkMode);
  startBgm();
  updateHud();
  requestWakeLock();
  if (demo) startDemo();
  else startGps();

  // 10分ごとのモンスター入れかえを監視
  setInterval(() => {
    walkTick();
    if (!inBattle) refreshWorld();
    if (!inBattle && spotLayer) renderSpots();
  }, 30000);
}

function init() {
  try { setSound(localStorage.getItem('walkquest-sound') !== '0'); } catch (e) { /* ignore */ }
  try { setBgm(localStorage.getItem('walkquest-bgm') !== '0'); } catch (e) { /* ignore */ }
  const hasSave = player.load();
  if (!hasSave) $('title-new').classList.remove('hidden');
  else $('btn-start').textContent = player.s.demo ? '▶ つづきから（デモ）' : '▶ つづきから';

  $('btn-start').onclick = () => boot(hasSave ? player.s.demo : false);
  $('btn-demo').onclick = () => boot(true);
  if (hasSave) $('btn-demo').textContent = player.s.demo ? 'GPSモードで 遊ぶ' : 'デモモードで 遊ぶ';
  if (hasSave && player.s.demo) $('btn-demo').onclick = () => boot(false);

  updateHud();

  $('app-version').textContent = APP_VERSION;

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // 新しい版が入ったら、タイトル画面にいるうちに1回だけ読み直して最新を表示する
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded || onField) return;
      reloaded = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => reg.update()).catch(() => {});
  }
}

init();
