// サウンド：WebAudio でその場で音を合成する（音声ファイル不要）。
//
// つなぎ方：
//   各パート → 曲のバス（dry / リバーブ送り / ディレイ送り）→ マスター → コンプレッサー → スピーカー
//   効果音   → 効果音バス（＋リバーブ送り）                 → マスター
// リバーブ（残響）とディレイ（やまびこ）は全体で1つずつ共有する。

let ctx = null;
let enabled = true;
let master = null;
let reverb = null;
let delay = null;
let sfxBus = null;
let sfxVerb = null;
let noiseBuf = null;

export function setSound(on) { enabled = on; }
export function soundEnabled() { return enabled; }

// 残響用のインパルス応答（減衰するノイズ）を作る
function makeImpulse(seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

function initGraph() {
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  // 最後にリミッターをかけて、音が割れないようにする
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -4;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.12;
  master = ctx.createGain();
  master.gain.value = 0.6;
  master.connect(comp).connect(limiter).connect(ctx.destination);

  reverb = ctx.createConvolver();
  reverb.buffer = makeImpulse(2.4, 2.6);
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.42;
  reverb.connect(verbOut).connect(master);

  delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.33;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 2600;
  const delayOut = ctx.createGain();
  delayOut.gain.value = 0.5;
  delay.connect(tone).connect(fb).connect(delay);
  tone.connect(delayOut).connect(master);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = 1;
  sfxBus.connect(master);
  sfxVerb = ctx.createGain();
  sfxVerb.gain.value = 0.25;
  sfxBus.connect(sfxVerb).connect(reverb);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

export function unlockAudio() {
  // iPhone: マナーモード（消音スイッチ）でも音が出るようにする（Safari 16.4以降）
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    initGraph();
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  // iPhone: タップ中に無音を1回鳴らすとオーディオが確実に使えるようになる
  const src = ctx.createBufferSource();
  src.buffer = ctx.createBuffer(1, 1, 22050);
  src.connect(ctx.destination);
  src.start(0);
}

export function audioRunning() { return !!ctx && ctx.state === 'running'; }

/* ---------- 音を作る部品 ---------- */

// シンセの1音。detune（セント）の数だけオシレーターを重ね、ローパスフィルターと音量の包絡をかける
function synth(out, t, dur, freq, o = {}) {
  const a = o.a ?? 0.005, d = o.d ?? 0.1, s = o.s ?? 0.6, r = o.r ?? 0.12;
  const vol = o.vol ?? 0.1;
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = o.ftype || 'lowpass';
  f.Q.value = o.q ?? 0.8;
  const cut = o.cut ?? 8000;
  if (o.cut0) {
    f.frequency.setValueAtTime(o.cut0, t);
    f.frequency.exponentialRampToValueAtTime(cut, t + (o.fdec ?? 0.2));
  } else {
    f.frequency.setValueAtTime(cut, t);
  }
  const end = t + dur + r;
  const n = (o.detune || [0]).length;
  for (const det of o.detune || [0]) {
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + (o.slideT ?? dur));
    osc.detune.value = det;
    if (o.vib) {
      const lfo = ctx.createOscillator();
      const lg = ctx.createGain();
      lfo.frequency.value = 5.5;
      lg.gain.setValueAtTime(0, t);
      lg.gain.linearRampToValueAtTime(freq * 0.007, t + Math.min(0.35, dur));
      lfo.connect(lg).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(end);
    }
    osc.connect(f);
    osc.start(t);
    osc.stop(end + 0.02);
  }
  const peak = vol / Math.sqrt(n);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.linearRampToValueAtTime(peak * s, t + a + d);
  g.gain.setValueAtTime(peak * s, t + Math.max(a + d, dur));
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  f.connect(g).connect(out);
}

// フィルターを通したノイズ
function noise(out, t, dur, o = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = o.ftype || 'bandpass';
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(o.f0 ?? 2000, t);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol ?? 0.1, t + (o.a ?? 0.002));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.02);
}

// ベルの音（基音＋高い倍音）
function bell(out, t, freq, vol = 0.06, len = 1.2) {
  synth(out, t, 0.02, freq, { type: 'sine', vol, a: 0.002, d: 0.05, s: 0.6, r: len });
  synth(out, t, 0.02, freq * 2.76, { type: 'sine', vol: vol * 0.35, a: 0.002, d: 0.03, s: 0.4, r: len * 0.5 });
  synth(out, t, 0.02, freq * 5.4, { type: 'sine', vol: vol * 0.15, a: 0.001, d: 0.02, s: 0.3, r: len * 0.25 });
}

/* ---------- ドラム ---------- */

const drum = {
  kick(out, t, v = 1) {
    synth(out, t, 0.02, 160, { type: 'sine', vol: 0.95 * v, a: 0.001, d: 0.08, s: 0.5, r: 0.3, slide: 42, slideT: 0.14 });
    noise(out, t, 0.012, { ftype: 'highpass', f0: 3000, vol: 0.18 * v });
  },
  snare(out, t, v = 1) {
    noise(out, t, 0.2, { ftype: 'bandpass', f0: 1900, q: 0.7, vol: 0.4 * v });
    noise(out, t, 0.12, { ftype: 'highpass', f0: 6000, vol: 0.12 * v });
    synth(out, t, 0.02, 200, { type: 'triangle', vol: 0.35 * v, a: 0.001, d: 0.06, s: 0.3, r: 0.08, slide: 150, slideT: 0.08 });
  },
  clap(out, t, v = 1) {
    for (const dt of [0, 0.011, 0.023]) noise(out, t + dt, 0.03, { ftype: 'bandpass', f0: 1300, q: 1.4, vol: 0.32 * v });
    noise(out, t + 0.03, 0.22, { ftype: 'bandpass', f0: 1200, q: 1.1, vol: 0.18 * v });
  },
  hat(out, t, v = 1) { noise(out, t, 0.045, { ftype: 'highpass', f0: 8500, vol: 0.13 * v }); },
  open(out, t, v = 1) { noise(out, t, 0.28, { ftype: 'highpass', f0: 7500, vol: 0.11 * v }); },
  shaker(out, t, v = 1) { noise(out, t, 0.05, { ftype: 'bandpass', f0: 7000, q: 1.5, vol: 0.06 * v, a: 0.015 }); },
};

/* ---------- 効果音 ---------- */

const now = () => ctx.currentTime;
const on = () => !!ctx && enabled;

export const sfx = {
  // カーソル：短く柔らかい電子音
  cursor() {
    if (!on()) return;
    synth(sfxBus, now(), 0.03, 1320, { type: 'triangle', vol: 0.07, a: 0.001, d: 0.03, s: 0.3, r: 0.05 });
    synth(sfxBus, now() + 0.025, 0.03, 1760, { type: 'sine', vol: 0.04, a: 0.001, d: 0.03, s: 0.3, r: 0.05 });
  },
  // 敵出現：上昇するサイレン＋衝撃音
  encounter() {
    if (!on()) return;
    const t = now();
    synth(sfxBus, t, 0.35, 220, { type: 'sawtooth', detune: [-12, 12], vol: 0.12, a: 0.01, cut0: 600, cut: 4000, fdec: 0.35, slide: 880, slideT: 0.35, r: 0.15 });
    for (let i = 0; i < 3; i++) synth(sfxBus, t + 0.38 + i * 0.09, 0.05, 1568, { type: 'square', vol: 0.05, a: 0.002, d: 0.04, s: 0.4, r: 0.06, cut: 3000 });
    drum.kick(sfxBus, t + 0.36, 0.9);
    noise(sfxBus, t + 0.36, 0.5, { ftype: 'lowpass', f0: 1500, f1: 200, vol: 0.2 });
  },
  // 命中：衝撃＋金属の響き
  hit() {
    if (!on()) return;
    const t = now();
    noise(sfxBus, t, 0.14, { ftype: 'bandpass', f0: 2500, f1: 600, q: 0.8, vol: 0.35 });
    synth(sfxBus, t, 0.02, 120, { type: 'sine', vol: 0.5, a: 0.001, d: 0.06, s: 0.4, r: 0.12, slide: 50, slideT: 0.12 });
    synth(sfxBus, t, 0.02, 1800, { type: 'square', detune: [0, 37], vol: 0.04, a: 0.001, d: 0.02, s: 0.4, r: 0.25, cut: 5000 });
  },
  // 被弾：重い衝撃＋ひずんだノイズ
  damage() {
    if (!on()) return;
    const t = now();
    synth(sfxBus, t, 0.05, 90, { type: 'sawtooth', detune: [-20, 20], vol: 0.3, a: 0.001, d: 0.1, s: 0.4, r: 0.25, cut0: 1800, cut: 200, fdec: 0.25, slide: 40, slideT: 0.3 });
    noise(sfxBus, t, 0.3, { ftype: 'lowpass', f0: 3000, f1: 300, vol: 0.35 });
    drum.kick(sfxBus, t, 0.8);
  },
  // スキル発動：上昇するシンセスイープ＋きらめき
  spell() {
    if (!on()) return;
    const t = now();
    synth(sfxBus, t, 0.35, 330, { type: 'sawtooth', detune: [-8, 8], vol: 0.08, a: 0.02, cut0: 400, cut: 6000, fdec: 0.35, slide: 990, slideT: 0.35, r: 0.2 });
    [1319, 1760, 2093, 2637].forEach((f, i) => bell(sfxBus, t + 0.1 + i * 0.05, f, 0.035, 0.5));
  },
  // 回復：明るいベルのアルペジオ
  heal() {
    if (!on()) return;
    const t = now();
    [523, 659, 784, 1047, 1319].forEach((f, i) => bell(sfxBus, t + i * 0.07, f, 0.05, 1.2));
    synth(sfxBus, t, 0.6, 523, { type: 'triangle', detune: [-6, 6], vol: 0.05, a: 0.1, r: 0.6 });
  },
  // 勝利ファンファーレ：金管風の和音
  win() {
    if (!on()) return;
    const t = now();
    const brass = (time, notes, dur) => notes.forEach((f) => synth(sfxBus, time, dur, f, { type: 'sawtooth', detune: [-9, 9], vol: 0.06, a: 0.03, d: 0.1, s: 0.75, r: 0.35, cut0: 800, cut: 3500, fdec: 0.12 }));
    brass(t, [392, 523, 659], 0.1);
    brass(t + 0.14, [392, 523, 659], 0.1);
    brass(t + 0.28, [392, 523, 659], 0.1);
    brass(t + 0.44, [415, 523, 698], 0.18);
    brass(t + 0.66, [466, 587, 784], 0.18);
    brass(t + 0.9, [523, 659, 784, 1047], 0.9);
    drum.kick(sfxBus, t + 0.9, 0.8);
    noise(sfxBus, t + 0.9, 1.2, { ftype: 'highpass', f0: 6000, vol: 0.06 });
  },
  // レベルアップ：駆け上がるベル＋和音
  levelup() {
    if (!on()) return;
    const t = now();
    [523, 659, 784, 1047, 1319, 1568, 2093].forEach((f, i) => bell(sfxBus, t + i * 0.07, f, 0.05, 1));
    [523, 659, 784].forEach((f) => synth(sfxBus, t + 0.5, 0.7, f * 2, { type: 'sawtooth', detune: [-10, 10], vol: 0.035, a: 0.05, cut: 3000, r: 0.6 }));
  },
  // ミス：空を切る音
  miss() {
    if (!on()) return;
    noise(sfxBus, now(), 0.18, { ftype: 'bandpass', f0: 600, f1: 2400, q: 2, vol: 0.15 });
    synth(sfxBus, now(), 0.08, 330, { type: 'triangle', vol: 0.05, r: 0.08, slide: 220, slideT: 0.1 });
  },
  // 撤退：下降スイープ＋風切り音
  run() {
    if (!on()) return;
    const t = now();
    synth(sfxBus, t, 0.3, 880, { type: 'square', vol: 0.05, cut: 2500, slide: 220, slideT: 0.3, r: 0.1 });
    noise(sfxBus, t, 0.4, { ftype: 'bandpass', f0: 3000, f1: 400, q: 1.5, vol: 0.15 });
  },
  // 入手・装備：きらきらした和音
  chest() {
    if (!on()) return;
    const t = now();
    [784, 988, 1175, 1568].forEach((f, i) => bell(sfxBus, t + i * 0.06, f, 0.05, 0.9));
    synth(sfxBus, t + 0.24, 0.3, 1568, { type: 'square', vol: 0.02, cut: 4000, r: 0.3 });
  },
  // 全滅：沈んでいく和音
  lose() {
    if (!on()) return;
    const t = now();
    [220, 262, 311].forEach((f) => synth(sfxBus, t, 1.4, f, { type: 'sawtooth', detune: [-14, 14], vol: 0.06, a: 0.05, cut0: 2000, cut: 250, fdec: 1.4, slide: f * 0.7, slideT: 1.5, r: 0.8 }));
    drum.kick(sfxBus, t, 1);
    noise(sfxBus, t, 1.2, { ftype: 'lowpass', f0: 800, f1: 100, vol: 0.2 });
  },
  // 剣を振る：風切り音＋ヒートブレードのうなり
  swing() {
    if (!on()) return;
    const t = now();
    noise(sfxBus, t, 0.2, { ftype: 'bandpass', f0: 500, f1: 3500, q: 2.2, vol: 0.3 });
    synth(sfxBus, t, 0.15, 110, { type: 'sawtooth', detune: [-15, 15], vol: 0.06, cut: 900, slide: 220, slideT: 0.15, r: 0.08 });
  },
  // 爆発（ミサイル・ブレス）
  fire() {
    if (!on()) return;
    const t = now();
    noise(sfxBus, t, 0.7, { ftype: 'lowpass', f0: 2500, f1: 120, vol: 0.45 });
    noise(sfxBus, t + 0.05, 0.4, { ftype: 'bandpass', f0: 900, f1: 300, vol: 0.2 });
    synth(sfxBus, t, 0.05, 70, { type: 'sine', vol: 0.6, a: 0.001, d: 0.15, s: 0.4, r: 0.4, slide: 32, slideT: 0.5 });
  },
  // 電撃（EMP・軌道爆撃）
  thunder() {
    if (!on()) return;
    const t = now();
    for (let i = 0; i < 6; i++) noise(sfxBus, t + i * 0.03 + Math.random() * 0.02, 0.05, { ftype: 'highpass', f0: 3000, vol: 0.22 });
    noise(sfxBus, t, 0.8, { ftype: 'lowpass', f0: 3000, f1: 90, vol: 0.4 });
    synth(sfxBus, t, 0.3, 55, { type: 'sawtooth', detune: [-25, 25], vol: 0.15, cut: 400, r: 0.4 });
  },
  // 敵のひっかき：金属がこすれる音
  claw() {
    if (!on()) return;
    const t = now();
    [0, 0.06, 0.12].forEach((s) => {
      noise(sfxBus, t + s, 0.1, { ftype: 'bandpass', f0: 4500, f1: 2000, q: 4, vol: 0.2 });
      synth(sfxBus, t + s, 0.06, 2400, { type: 'square', detune: [0, 50], vol: 0.025, cut: 6000, r: 0.08, slide: 1600, slideT: 0.08 });
    });
  },
};

/* ---------- BGM ----------
 * 曲は「和音の進行」「メロディ（1文字＝8分音符）」「ドラムのパターン（1文字＝16分音符）」から組み立てる。
 * パッド・アルペジオ・ベースは和音の進行から自動で作る。
 * メロディ：「-」は前の音をのばす、「.」は休符、「|」は小節の区切り（読み飛ばす）。 */

const CHORDS = {
  Am: ['A', 'C', 'E'], F: ['F', 'A', 'C'], C: ['C', 'E', 'G'], G: ['G', 'B', 'D'],
  E: ['E', 'G#', 'B'], Em: ['E', 'G', 'B'], Dm: ['D', 'F', 'A'],
};
const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const midiOf = (name, oct) => (oct + 1) * 12 + NOTE_INDEX[name];
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
function noteFreq(token) {
  const m = token.match(/^([A-G]#?)(\d)$/);
  return hz(midiOf(m[1], Number(m[2])));
}

const TRACKS = {
  // フィールド：夜の街を進むシンセウェーブ（Aマイナー）
  field: {
    tempo: 108,
    chords: 'Am F C G | Am F C E | F G Em Am | Dm F G E',
    melody: `
      A4 - C5 - E5 - D5 C5 | C5 - - A4 F4 - A4 - | G4 - C5 - E5 - G5 - | F5 - E5 - D5 - - - |
      A4 - C5 - E5 - A5 - | G5 - F5 - E5 - C5 - | E5 - D5 - C5 - G4 - | G#4 - B4 - E5 - - - |
      A5 - - G5 F5 - E5 - | D5 - - E5 F5 - G5 - | E5 - G5 - B5 - A5 G5 | A5 - - - E5 - . . |
      F5 - E5 - D5 - A4 - | C5 - D5 - F5 - A5 - | G5 - F5 - D5 - B4 - | G#4 - B4 - E5 - - . |`,
    drums: {
      kick: 'x.........x.....',
      snare: '........x.......',
      hat: '..x...x...x...x.',
      shaker: 'xxxxxxxxxxxxxxxx',
      open: '..............x.',
    },
    bass: 'x.....x.x.....x.',       // x=根音 o=1オクターブ上
    arp: '0 1 2 1 0 1 2 3 0 1 2 1 0 1 2 3', // 和音の何番目か（3=1オクターブ上の根音）
    arpEvery: 1,                    // 16分音符ごと
    lead: { type: 'sawtooth', detune: [-7, 7], vol: 0.085, a: 0.03, d: 0.25, s: 0.7, r: 0.3, cut: 2600, q: 1, vib: true, rev: 0.45, dly: 0.28 },
    pad: { type: 'sawtooth', detune: [-12, 0, 12], vol: 0.05, a: 0.6, d: 0.5, s: 0.8, r: 1.2, cut: 900, oct: 4, rev: 0.7 },
    arpV: { type: 'square', vol: 0.03, a: 0.002, d: 0.08, s: 0.2, r: 0.12, cut: 2800, oct: 5, rev: 0.35, dly: 0.45 },
    bassV: { type: 'sawtooth', detune: [-5, 5], vol: 0.16, a: 0.004, d: 0.15, s: 0.5, r: 0.12, cut0: 1400, cut: 380, fdec: 0.18, oct: 2 },
    drumV: { vol: 0.75, rev: 0.18 },
  },
  // 戦闘：疾走するダークシンセ（Aマイナー、4つ打ち）
  battle: {
    tempo: 152,
    chords: 'Am Am F E | Am Dm E Am | F G Em Am | Dm E F E',
    melody: `
      A4 - C5 - E5 - A5 - | G#5 - A5 - E5 - C5 - | F5 - E5 - D5 - C5 - | B4 - G#4 - E4 - - . |
      A4 A4 C5 A4 E5 - D5 C5 | D5 - F5 - A5 - G5 F5 | E5 - G#5 - B5 - A5 G#5 | A5 - - - E5 - . . |
      F5 - A5 - C6 - A5 - | G5 - B5 - D6 - B5 - | E5 - G5 - B5 - A5 G5 | A5 - E5 - C5 - A4 - |
      D5 D5 F5 D5 A5 - F5 D5 | E5 E5 G#5 E5 B5 - G#5 E5 | F5 - E5 - D5 - C5 - | B4 - C5 - D5 - E5 - |`,
    drums: {
      kick: 'x...x...x...x..x',
      snare: '....x.......x...',
      clap: '....x.......x...',
      hat: 'xxxxxxxxxxxxxxxx',
      open: '..x...x...x...x.',
    },
    bass: 'xoxoxoxoxoxoxoxo',
    arp: '0 1 2 3 2 1 0 1 2 3 2 1 0 2 1 3',
    arpEvery: 1,
    lead: { type: 'sawtooth', detune: [-10, 10], vol: 0.09, a: 0.006, d: 0.12, s: 0.75, r: 0.12, cut0: 5000, cut: 3000, fdec: 0.1, q: 2, vib: true, rev: 0.3, dly: 0.2 },
    pad: { type: 'sawtooth', detune: [-15, 0, 15], vol: 0.035, a: 0.15, d: 0.3, s: 0.8, r: 0.5, cut: 1200, oct: 4, rev: 0.5 },
    arpV: { type: 'square', vol: 0.028, a: 0.001, d: 0.06, s: 0.15, r: 0.06, cut: 3600, oct: 5, rev: 0.2, dly: 0.25 },
    bassV: { type: 'sawtooth', detune: [-8, 8], vol: 0.15, a: 0.002, d: 0.08, s: 0.4, r: 0.06, cut0: 2200, cut: 450, fdec: 0.09, q: 3, oct: 2 },
    drumV: { vol: 0.85, rev: 0.12 },
  },
};

function parseMelody(str) {
  const tokens = str.trim().split(/\s+/).filter((t) => t !== '|');
  const events = [];
  let last = null;
  tokens.forEach((t, i) => {
    if (t === '-') { if (last) last.len += 2; }
    else if (t === '.') last = null;
    else { last = { step: i * 2, freq: noteFreq(t), len: 2 }; events.push(last); }
  });
  return { events, length: tokens.length * 2 };
}

// 曲を「16分音符ごとに鳴らすもの」の表にする
function compile(tr) {
  const mel = parseMelody(tr.melody);
  const length = mel.length;
  const steps = Array.from({ length }, () => []);
  const chords = tr.chords.split(/[\s|]+/).filter(Boolean);
  const chordAt = (step) => CHORDS[chords[Math.floor(step / 16) % chords.length]];

  for (const ev of mel.events) steps[ev.step].push({ part: 'lead', freq: ev.freq, len: ev.len });

  const arp = tr.arp.split(/\s+/);
  for (let i = 0; i < length; i++) {
    const s16 = i % 16;
    const ch = chordAt(i);
    // パッド：小節のはじめに和音を鳴らす
    if (s16 === 0) ch.forEach((n) => steps[i].push({ part: 'pad', freq: hz(midiOf(n, tr.pad.oct)), len: 16 }));
    // ベース
    const b = tr.bass[s16];
    if (b === 'x' || b === 'o') {
      let len = 1;
      while (s16 + len < 16 && tr.bass[s16 + len] === '.') len++;
      steps[i].push({ part: 'bass', freq: hz(midiOf(ch[0], tr.bassV.oct + (b === 'o' ? 1 : 0))), len });
    }
    // アルペジオ
    if (s16 % tr.arpEvery === 0) {
      const k = arp[(s16 / tr.arpEvery) % arp.length];
      if (k !== '.') {
        const idx = Number(k);
        const name = ch[idx % 3];
        let midi = midiOf(name, tr.arpV.oct) + (idx >= 3 ? 12 : 0);
        if (NOTE_INDEX[name] < NOTE_INDEX[ch[0]]) midi += 12; // 和音を下から順に並べる
        steps[i].push({ part: 'arp', freq: hz(midi), len: tr.arpEvery });
      }
    }
    // ドラム
    for (const [kind, pat] of Object.entries(tr.drums)) {
      if (pat[s16] === 'x') steps[i].push({ part: 'drum', kind, vel: kind === 'hat' && s16 % 4 !== 2 ? 0.6 : 1 });
    }
  }
  return { steps, length, stepSec: 60 / tr.tempo / 4, tr };
}
const SONGS = Object.fromEntries(Object.entries(TRACKS).map(([k, t]) => [k, compile(t)]));

let bgmEnabled = true;
let bgmTimer = null;
let bgmName = null;
let bgmSong = null;
let bgmStep = 0;
let bgmNext = 0;
let song = null; // 再生中の曲のバスとパート

export function bgmOn() { return bgmEnabled; }
export function bgmPlaying() { return bgmName; }
export function setBgm(v) {
  bgmEnabled = v;
  if (!v) stopBgm();
}

// 曲ごとのバス（dry / リバーブ送り / ディレイ送り）と、パートごとのチャンネルを作る
function makeSong(tr) {
  const dry = ctx.createGain();
  const wet = ctx.createGain();
  const echo = ctx.createGain();
  dry.connect(master);
  wet.connect(reverb);
  echo.connect(delay);
  const chan = (opt) => {
    const out = ctx.createGain();
    out.connect(dry);
    if (opt.rev) { const s = ctx.createGain(); s.gain.value = opt.rev; out.connect(s).connect(wet); }
    if (opt.dly) { const s = ctx.createGain(); s.gain.value = opt.dly; out.connect(s).connect(echo); }
    return out;
  };
  return {
    buses: [dry, wet, echo],
    lead: chan(tr.lead), pad: chan(tr.pad), arp: chan(tr.arpV), bass: chan(tr.bassV), drum: chan(tr.drumV),
  };
}

function playStep(ev, t) {
  const tr = bgmSong.tr;
  const sec = bgmSong.stepSec;
  if (ev.part === 'drum') drum[ev.kind](song.drum, t, ev.vel * tr.drumV.vol);
  else if (ev.part === 'lead') synth(song.lead, t, ev.len * sec * 0.95, ev.freq, tr.lead);
  else if (ev.part === 'pad') synth(song.pad, t, ev.len * sec, ev.freq, tr.pad);
  else if (ev.part === 'arp') synth(song.arp, t, ev.len * sec * 0.6, ev.freq, tr.arpV);
  else if (ev.part === 'bass') synth(song.bass, t, ev.len * sec * 0.85, ev.freq, tr.bassV);
}

// 少し先までの音をまとめて予約する（タイマーのズレで音が乱れないように）
function scheduleBgm() {
  while (bgmNext < ctx.currentTime + 0.25) {
    for (const ev of bgmSong.steps[bgmStep]) playStep(ev, bgmNext);
    bgmStep = (bgmStep + 1) % bgmSong.length;
    bgmNext += bgmSong.stepSec;
  }
}

// name: 'field'（フィールド）または 'battle'（戦闘）。ちがう曲が流れていたら切り替える
export function startBgm(name = 'field') {
  if (!ctx || !bgmEnabled || !SONGS[name]) return;
  if (bgmTimer && bgmName === name) return;
  if (bgmTimer) stopBgm(0.12);
  bgmName = name;
  bgmSong = SONGS[name];
  song = makeSong(bgmSong.tr);
  const fadeIn = name === 'battle' ? 0.15 : 1.2;
  for (const b of song.buses) {
    b.gain.setValueAtTime(0.0001, ctx.currentTime);
    b.gain.exponentialRampToValueAtTime(1, ctx.currentTime + fadeIn);
  }
  bgmStep = 0;
  bgmNext = ctx.currentTime + 0.08;
  scheduleBgm();
  bgmTimer = setInterval(scheduleBgm, 50);
}

export function stopBgm(fade = 0.25) {
  if (!bgmTimer) return;
  clearInterval(bgmTimer);
  bgmTimer = null;
  bgmName = null;
  const old = song;
  song = null;
  const t = ctx.currentTime;
  for (const b of old.buses) {
    b.gain.cancelScheduledValues(t);
    b.gain.setValueAtTime(b.gain.value, t);
    b.gain.linearRampToValueAtTime(0, t + fade);
  }
  setTimeout(() => old.buses.forEach((b) => b.disconnect()), (fade + 0.5) * 1000);
}
