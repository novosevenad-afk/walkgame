// エントリーポイント：地図・GPS・UI
import { player } from './player.js';
import { ITEMS, WEAPONS, ARMORS, SHOP_ITEMS, MONSTERS, BOSS } from './data.js';
import { monstersAround, spotsAround, areaKey, currentSlot, pruneDefeated, SPOT_TYPES } from './world.js';
import { distance, offset, randInt, escapeHtml } from './util.js';
import { startBattle } from './battle.js';
import { sfx, unlockAudio, setSound, soundEnabled, startBgm, stopBgm, setBgm, bgmOn } from './sound.js';

const $ = (id) => document.getElementById(id);
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

function showStatus() {
  const s = player.s;
  const st = player.stats;
  const next = player.nextExp;
  const spells = player.spells.map((sp) => `${sp.name}(MP${sp.mp})`).join('、') || 'なし';
  openModal(`${s.name}の つよさ`, `
    <div class="kv">
      <span>レベル</span><span>${s.lv}</span>
      <span>HP</span><span>${s.hp} / ${st.maxHp}</span>
      <span>MP</span><span>${s.mp} / ${st.maxMp}</span>
      <span>こうげき</span><span>${st.atk}</span>
      <span>しゅび</span><span>${st.def}</span>
      <span>すばやさ</span><span>${st.agi}</span>
      <span>けいけんち</span><span>${s.exp}</span>
      <span>つぎのレベルまで</span><span>${next === null ? '-' : next}</span>
      <span>ゴールド</span><span>${s.gold} G</span>
      <span>たおした かず</span><span>${s.wins}</span>
      <span>あるいた きょり</span><span>${(s.walked / 1000).toFixed(2)} km</span>
    </div>
    <div class="section-title">そうび</div>
    <div class="kv">
      <span>ぶき</span><span>${player.weapon.name} (+${player.weapon.atk})</span>
      <span>よろい</span><span>${player.armor.name} (+${player.armor.def})</span>
    </div>
    <div class="section-title">じゅもん</div>
    <div>${spells}</div>`);
}

function itemsHtml() {
  const ids = Object.keys(player.s.items).filter((id) => ITEMS[id]);
  if (!ids.length) return '<div>なにも もっていない。</div>';
  return ids.map((id) => `
    <div class="list-row">
      <div>${ITEMS[id].name} ×${player.s.items[id]}<small>${ITEMS[id].desc}</small></div>
      <button data-action="use" data-arg="${id}">つかう</button>
    </div>`).join('');
}

function showItems() {
  openModal('どうぐ', itemsHtml(), (action, id) => {
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

function showBook() {
  const all = [...MONSTERS, BOSS];
  const found = all.filter((m) => player.s.book[m.id]).length;
  openModal(`モンスターずかん ${found}/${all.length}`, `<div class="book-grid">${all.map((m) => {
    const n = player.s.book[m.id] || 0;
    return `<div class="book-cell ${n ? '' : 'unknown'}"><span class="ic">${m.icon}</span>${n ? escapeHtml(m.name) : '？？？'}<br>${n ? `${n}ひき` : ''}</div>`;
  }).join('')}</div>`);
}

function showSettings() {
  const demo = player.s.demo;
  openModal('せってい', `
    <div class="list-row"><div>BGM<small>フィールドを あるくときの おんがく</small></div><button data-action="bgm">${bgmOn() ? 'ON' : 'OFF'}</button></div>
    <div class="list-row"><div>こうかおん</div><button data-action="sound">${soundEnabled() ? 'ON' : 'OFF'}</button></div>
    <div class="list-row"><div>いまのモード：${demo ? 'デモ' : 'GPS'}<small>${demo ? '地図タップ／十字キーで移動' : '実際に歩いて移動'}</small></div>
      <button data-action="mode">${demo ? 'GPSにする' : 'デモにする'}</button></div>
    <div class="list-row"><div>なまえを かえる</div><button data-action="rename">かえる</button></div>
    <div class="list-row"><div>データを けす<small>さいしょから やりなおします</small></div><button data-action="reset">けす</button></div>
    <p style="font-size:12px;opacity:.7;margin-top:12px">モンスターは10分ごとに入れかわります。<br>地図データ © OpenStreetMap contributors</p>`,
  (action) => {
    if (action === 'bgm') {
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
      const n = prompt('あたらしい なまえ（6もじまで）', player.s.name);
      if (n && n.trim()) {
        player.s.name = n.trim().slice(0, 6);
        player.save();
        updateHud();
        showSettings();
      }
    } else if (action === 'reset') {
      if (confirm('ほんとうに データを けしますか？')) {
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
  ({ status: showStatus, items: showItems, book: showBook, settings: showSettings })[b.dataset.open]();
});

/* ---------- スポット ---------- */
function spotRemaining(spot) {
  const cd = SPOT_TYPES[spot.type].cooldown;
  const used = player.s.spotUsed[spot.id];
  if (!cd || !used) return 0;
  return Math.max(0, used + cd - Date.now());
}

function useSpot(spot) {
  const T = SPOT_TYPES[spot.type];
  const remain = spotRemaining(spot);
  if (remain > 0) {
    toast(`${T.name}： あと ${Math.ceil(remain / 60000)}ふんで ふっかつ`);
    return;
  }
  if (spot.type === 'spring') {
    player.fullHeal();
    player.s.spotUsed[spot.id] = Date.now();
    sfx.heal();
    toast('いずみの みずを のんだ。 HPとMPが ぜんかいふく！');
  } else if (spot.type === 'chest') {
    player.s.spotUsed[spot.id] = Date.now();
    sfx.chest();
    const r = Math.random();
    const lv = player.s.lv;
    let msg;
    if (r < 0.45) {
      const g = randInt(5, 15) * lv;
      player.s.gold += g;
      msg = `${g}ゴールドを みつけた！`;
    } else if (r < 0.72) {
      const n = randInt(1, 2);
      player.addItem('herb', n);
      msg = `やくそうを ${n}こ みつけた！`;
    } else if (r < 0.84) {
      player.addItem('potion');
      msg = 'じょうやくそうを みつけた！';
    } else if (r < 0.93) {
      player.addItem('ether');
      msg = 'まほうのみずを みつけた！';
    } else {
      const id = ['seedA', 'seedD', 'seedH'][randInt(0, 2)];
      player.addItem(id);
      msg = `なんと ${ITEMS[id].name}を みつけた！`;
    }
    toast(`たからばこを あけた！ ${msg}`, 3000);
  } else if (spot.type === 'shop') {
    showShop();
  } else if (spot.type === 'church') {
    player.fullHeal();
    sfx.heal();
    const next = player.nextExp;
    openModal('きょうかい', `
      <p>かみの みまもりが ありますように。</p>
      <p>${escapeHtml(player.s.name)}が つぎの レベルになるには あと <b style="color:var(--accent)">${next === null ? '-' : next}</b> の けいけんちが ひつようです。</p>
      <p>ぼうけんを きろくし、 HPとMPを かいふくしました。</p>`);
  }
  player.save();
  updateHud();
  renderSpots();
}

function shopHtml() {
  const s = player.s;
  const row = (label, note, price, action, arg, disabled) => `
    <div class="list-row"><div>${label}<small>${note}</small></div>
    <button data-action="${action}" data-arg="${arg}" ${disabled ? 'disabled' : ''}>${price}G</button></div>`;
  let html = `<div>しょじきん： <b style="color:var(--accent)">${s.gold} G</b></div>`;
  html += '<div class="section-title">どうぐ</div>';
  html += SHOP_ITEMS.map((id) => row(ITEMS[id].name, `${ITEMS[id].desc}（もっている：${s.items[id] || 0}）`, ITEMS[id].price, 'buy', id, s.gold < ITEMS[id].price)).join('');
  html += '<div class="section-title">ぶき</div>';
  const wIdx = WEAPONS.findIndex((w) => w.id === s.weapon);
  html += WEAPONS.slice(1).map((w, i) => i + 1 <= wIdx
    ? `<div class="list-row"><div>${w.name}<small>こうげき+${w.atk}</small></div><span>${i + 1 === wIdx ? 'そうびちゅう' : '-'}</span></div>`
    : row(w.name, `こうげき+${w.atk}`, w.price, 'weapon', w.id, s.gold < w.price)).join('');
  html += '<div class="section-title">よろい</div>';
  const aIdx = ARMORS.findIndex((a) => a.id === s.armor);
  html += ARMORS.slice(1).map((a, i) => i + 1 <= aIdx
    ? `<div class="list-row"><div>${a.name}<small>しゅび+${a.def}</small></div><span>${i + 1 === aIdx ? 'そうびちゅう' : '-'}</span></div>`
    : row(a.name, `しゅび+${a.def}`, a.price, 'armor', a.id, s.gold < a.price)).join('');
  return html;
}

function showShop() {
  openModal('どうぐや「いらっしゃいませ！」', shopHtml(), (action, id) => {
    const s = player.s;
    if (action === 'buy') {
      const it = ITEMS[id];
      if (s.gold < it.price) return;
      s.gold -= it.price;
      player.addItem(id);
      toast(`${it.name}を かった！`);
    } else if (action === 'weapon' || action === 'armor') {
      const eq = (action === 'weapon' ? WEAPONS : ARMORS).find((x) => x.id === id);
      if (!eq || s.gold < eq.price) return;
      s.gold -= eq.price;
      s[action] = id;
      sfx.chest();
      toast(`${eq.name}を そうびした！`);
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
    icon: L.divIcon({ className: 'mk', html: '<div class="player-mk">🧙</div>', iconSize: [40, 40], iconAnchor: [20, 20] }),
    zIndexOffset: 1000,
    interactive: false,
  }).addTo(map);

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
  for (const sp of monstersAround(pos, player.s.lv)) {
    if (player.s.defeated[sp.id]) continue;
    const m = L.marker([sp.lat, sp.lng], { icon: icon(sp.mon.icon, sp.mon.boss ? 'boss' : '', sp.mon.boss ? 56 : 44) });
    m.on('click', (ev) => {
      L.DomEvent.stopPropagation(ev);
      tryBattle(sp);
    });
    monsterLayer.addLayer(m);
  }
}

function renderSpots() {
  spotLayer.clearLayers();
  for (const spot of spotsAround(pos)) {
    const used = spotRemaining(spot) > 0;
    const m = L.marker([spot.lat, spot.lng], { icon: icon(SPOT_TYPES[spot.type].icon, `spot ${used ? 'used' : ''}`) });
    m.on('click', (ev) => {
      L.DomEvent.stopPropagation(ev);
      const d = distance(pos, spot);
      if (d > RANGE) return toast(`${SPOT_TYPES[spot.type].name}： とおすぎる！ あと ${Math.ceil(d - RANGE)}m`);
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
  pruneDefeated(player.s.defeated, currentSlot());
  renderMonsters();
  renderSpots();
}

async function tryBattle(sp) {
  if (inBattle) return;
  const d = distance(pos, sp);
  if (d > RANGE) {
    toast(`${sp.mon.name}： とおすぎる！ あと ${Math.ceil(d - RANGE)}m ちかづこう`);
    return;
  }
  if (player.s.hp <= 0) player.fullHeal();
  inBattle = true;
  closeModal();
  stopBgm(0.15);
  const result = await startBattle(sp, updateHud);
  inBattle = false;
  if (document.visibilityState === 'visible') startBgm();
  if (result === 'win' || result === 'lose') refreshWorld(true);
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
}

function startGps() {
  if (!('geolocation' in navigator)) {
    $('hud-gps').textContent = 'GPS: つかえません';
    toast('この たんまつでは GPSが つかえません。デモモードを ためしてね', 4000);
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
        $('hud-gps').textContent = 'GPS: でんぱが よわい';
        return;
      }
      $('hud-gps').textContent = 'GPS: エラー';
      const msg = err.code === 1
        ? 'いちじょうほうが きょかされていません。せっていから きょかするか、デモモードで あそんでね'
        : 'いちじょうほうが とれません。そとに でてみてね';
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
  toast('デモモード：地図をタップするか 十字キーで いどう', 3500);
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

/* ---------- 起動 ---------- */
function boot(demo) {
  unlockAudio();
  const nameInput = $('name-input');
  if (!$('title-new').classList.contains('hidden')) {
    player.s.name = (nameInput.value.trim() || 'ゆうしゃ').slice(0, 6);
  }
  player.s.demo = demo;
  player.save();
  $('title').classList.add('hidden');
  onField = true;
  startBgm();
  updateHud();
  requestWakeLock();
  if (demo) startDemo();
  else startGps();

  // 10分ごとのモンスター入れかえを監視
  setInterval(() => {
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
  if (hasSave) $('btn-demo').textContent = player.s.demo ? 'GPSモードで あそぶ' : 'デモモードで あそぶ';
  if (hasSave && player.s.demo) $('btn-demo').onclick = () => boot(false);

  updateHud();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
