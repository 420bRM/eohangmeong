/* ================= 배경음악 ================= */
// 어항멍 배경음악: 오디오 파일 없이 Web Audio 로만 만드는 생성형 음악
// createMusic(ac, dest) → { set(kind), volume(v), suspend(), resume(), kind }

export const MUSIC_KINDS = [['off','끔'],['musicbox','오르골'],['lofi','로파이'],['ambient','잔잔한']];

const LOOK = 0.6, TICK = 200;      // 미리 예약할 시간(초), 스케줄러 주기(ms)
const BUS = 0.3;                   // 볼륨 0.5 → 버스 0.15
const FADE = 1.5;                  // 교체 크로스페이드(초)

// 화음 (근음 기준 반음)
const CH = {
  maj7:[0,4,7,11], maj9:[0,4,7,11,14], m7:[0,3,7,10], m9:[0,3,7,10,14], m6:[0,3,7,9],
  d9:[0,4,10,14], d13:[0,4,10,14,21], sus:[0,5,7,10], sus2:[0,2,7,14], add9:[0,4,7,14], six9:[0,4,7,9,14]
};
const PENTA = [0,2,4,7,9];

const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const pick = (R, a) => a[(R() * a.length) | 0];
// 시드 난수
function rng32(seed){
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// m 을 [lo, lo+12) 안으로
const into = (m, lo) => { while (m < lo) m += 12; while (m >= lo + 12) m -= 12; return m; };
// 범위 안의 화음음 전부
function spread(root, ivs, lo, hi){
  const pcs = new Set(ivs.map(i => ((root + i) % 12 + 12) % 12)), out = [];
  for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) out.push(m);
  return out;
}
const nearest = (arr, m) => arr.reduce((b, x) => Math.abs(x - m) < Math.abs(b - m) ? x : b, arr[0]);

export function createMusic(ac, dest){
  let vol = 0.5, kind = 'off', cur = null, layers = [], timer = 0, susp = false, broken = false;
  let NB = null, CB = null, rev = null, bus = null;
  const offline = typeof OfflineAudioContext !== 'undefined' && ac instanceof OfflineAudioContext;
  const alive = () => !broken && ac && ac.state !== 'closed';
  const now = () => ac.currentTime;
  let hasPan = false;

  // 공용 버스: 레이어 → bus → 전체 로우패스 → dest
  try {
    hasPan = typeof ac.createStereoPanner === 'function';
    bus = ac.createGain(); bus.gain.value = vol * BUS;
    const top = ac.createBiquadFilter(); top.type = 'lowpass'; top.frequency.value = 7500; top.Q.value = 0.5;
    bus.connect(top); top.connect(dest || ac.destination);
  } catch (e){ broken = true; }

  /* ---------- 공용 재료 ---------- */
  // 화이트 노이즈 (브러시·하이햇)
  function noise(){
    if (!NB){
      const n = (ac.sampleRate * 2) | 0; NB = ac.createBuffer(1, n, ac.sampleRate);
      const d = NB.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    return NB;
  }
  // 바이닐 지글거림: 드문 톡톡 + 아주 옅은 히스
  function crackle(){
    if (!CB){
      const sr = ac.sampleRate, len = (sr * 7.3) | 0, R = Math.random;
      CB = ac.createBuffer(2, len, sr);
      for (let c = 0; c < 2; c++){
        const d = CB.getChannelData(c); let lp = 0;
        for (let i = 0; i < len; i++){ lp += ((R() * 2 - 1) - lp) * 0.3; d[i] = lp * 0.006; }
        const n = (7.3 * 2) | 0;
        for (let k = 0; k < n; k++){
          const at = (R() * (len - 400)) | 0, L = 6 + ((R() * 30) | 0), a = Math.pow(R(), 2.5) * 0.45 + 0.03;
          for (let j = 0; j < L; j++) d[at + j] += (R() * 2 - 1) * a * Math.exp(-j / (L * 0.3)) * Math.min(1, j / 3);
        }
        for (let i = 0; i < 256; i++){ const w = i / 256; d[i] *= w; d[len - 1 - i] *= w; } // 이음매 부드럽게
      }
    }
    return CB;
  }
  // 잔향 (처음 쓸 때 만듦)
  function reverb(){
    if (!rev){
      const sr = ac.sampleRate, len = (sr * 2.2) | 0, b = ac.createBuffer(2, len, sr), pre = sr * 0.015;
      for (let c = 0; c < 2; c++){
        const d = b.getChannelData(c); let lp = 0;
        for (let i = 0; i < len; i++){
          const x = i / len; lp += ((Math.random() * 2 - 1) - lp) * (0.55 - 0.45 * x); // 뒤로 갈수록 어둡게
          d[i] = lp * Math.pow(1 - x, 2.6) * (i < pre ? i / pre : 1);
        }
      }
      rev = ac.createConvolver(); rev.buffer = b;
      const g = ac.createGain(); g.gain.value = 0.5; rev.connect(g); g.connect(bus);
    }
    return rev;
  }

  /* ---------- 노트 헬퍼 ---------- */
  function osc(type, f, t, end, det){
    const o = ac.createOscillator(); o.type = type; o.frequency.value = f;
    if (det) o.detune.value = det;
    o.start(t); o.stop(end); return o;
  }
  // 타격 엔벨로프: 부드러운 어택 → 지수 감쇠 → 0
  function pluck(p, t, a, peak, dur){
    p.setValueAtTime(0, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.exponentialRampToValueAtTime(peak * 0.001 + 1e-7, t + a + dur);
    p.linearRampToValueAtTime(0, t + a + dur + 0.02);
  }
  function outNode(L, pan){
    if (!hasPan || !pan) return L.in;
    const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(L.in); return p;
  }
  // 동시발음 제한
  function room(L, t, end){
    L.voices = L.voices.filter(e => e > t);
    if (L.voices.length >= L.cap) return false;
    L.voices.push(end); return true;
  }
  // 오르골/첼레스타: 사인 + 비정수배 배음, 빠른 감쇠, 작은 핑
  function mbNote(L, t, m, v, pan){
    const f = mtof(m), dur = clamp(3.2 - (m - 60) * 0.07, 0.9, 3.4), end = t + dur + 0.06;
    if (!room(L, t, end)) return;
    const out = outNode(L, pan);
    const parts = [[1, 1, dur], [2, 0.2, dur * 0.35], [4.17, 0.08, dur * 0.12], [7.3, 0.035, 0.045]];
    for (const [r, a, d] of parts){
      const fr = f * r; if (fr > 9000) continue;
      const g = ac.createGain(); pluck(g.gain, t, r > 5 ? 0.002 : 0.004, a * v, d);
      const o = osc('sine', fr, t, t + d + 0.05); o.connect(g); g.connect(out);
    }
  }
  // 종소리 (잔잔한)
  function bell(L, t, m, v, pan){
    const f = mtof(m), end = t + 4.6;
    if (!room(L, t, end)) return;
    const out = outNode(L, pan);
    for (const [r, a, d] of [[1, 1, 4.2], [2.76, 0.26, 1.3], [5.4, 0.08, 0.45]]){
      const fr = f * r; if (fr > 9000) continue;
      const g = ac.createGain(); pluck(g.gain, t, 0.01, a * v, d);
      const o = osc('sine', fr, t, t + d + 0.05); o.connect(g); g.connect(out);
    }
  }

  /* ---------- 장르별 생성기 ---------- */
  const BUILD = {
    /* 오르골: 70BPM 8분음표 아르페지오/멜로디 */
    musicbox(L, t0){
      const R = L.R; L.lp.frequency.value = 5600; L.send.gain.value = 0.45; L.cap = 18; L.lvl = 1.6;
      const PROGS = [
        [[0,'maj7'],[9,'m7'],[5,'maj7'],[7,'sus']],
        [[0,'add9'],[5,'maj7'],[0,'add9'],[7,'sus']],
        [[0,'maj7'],[4,'m7'],[5,'maj7'],[2,'m7'],[9,'m7'],[5,'maj7'],[7,'sus'],[7,'d9']],
        [[5,'maj7'],[0,'maj7'],[5,'maj7'],[9,'m7'],[2,'m7'],[7,'sus']],
        [[0,'six9'],[9,'m7'],[2,'m7'],[7,'sus']]
      ];
      const SP = 60 / 70 / 2;
      const s = { key: 60 + pick(R, [0, 2, 3, 5, -2, -4]), prog: pick(R, PROGS), ci: 0, bar: 0, step: 0, bpc: 2,
        dens: 0.45, mode: 'arp', pat: 0, ai: 2, dir: 1, k: 0, mel: 79, sparse: false, rest: false,
        pool: [72], scale: [72], bass: 48, five: 7 };
      function chord(){
        const [d, ty] = s.prog[s.ci], root = s.key + d;
        s.pool = spread(root, CH[ty], 69, 88);
        s.scale = spread(s.key, PENTA, 69, 91);
        s.bass = into(root, 46);
        s.five = CH[ty].includes(7) ? 7 : 12;
        s.ai = clamp(s.ai, 0, s.pool.length - 1);
      }
      function arpNext(){
        const p = s.pool, n = p.length;
        if (s.pat === 0){ s.ai += s.dir; if (s.ai >= n - 1){ s.ai = n - 1; s.dir = -1; } else if (s.ai <= 0){ s.ai = 0; s.dir = 1; } }
        else if (s.pat === 1){ s.ai += (s.k++ & 1) ? -1 : 2; if (s.ai >= n) s.ai = (R() * 3) | 0; }
        else s.ai = clamp(s.ai + pick(R, [-2, -1, 1, 1, 2]), 0, n - 1);
        s.ai = clamp(s.ai, 0, n - 1);
        return p[s.ai];
      }
      function melNext(strong){
        const sc = s.scale; let i = sc.indexOf(nearest(sc, s.mel));
        i = clamp(i + pick(R, [-2, -1, -1, 0, 1, 1, 2]), 0, sc.length - 1);
        let m = sc[i];
        if (strong && R() < 0.7) m = nearest(s.pool, m);
        s.mel = m + (m > 85 && R() < 0.5 ? -5 : m < 73 && R() < 0.5 ? 5 : 0); // 가운데로 살짝
        return m;
      }
      function cycle(){
        s.dens = clamp(s.dens + (R() - 0.5) * 0.35, 0.3, 0.85);
        s.sparse = R() < 0.22;                          // 가끔 듬성듬성한 구간
        s.mode = R() < 0.55 ? 'arp' : 'mel'; s.pat = (R() * 3) | 0;
        if (R() < 0.35) s.prog = pick(R, PROGS);
        if (R() < 0.12) s.key += s.key > 61 ? -5 : 5;   // 가끔 4·5도 전조
        s.bpc = s.prog.length > 4 ? 1 : (R() < 0.6 ? 2 : 1);
      }
      chord();
      function step(t){
        if (s.step === 0){
          if (s.bar === 0) chord();
          s.rest = !(s.ci === 0 && s.bar === 0) && R() < 0.06; // 가끔 한 마디 쉼
        }
        const tt = t + (R() - 0.5) * 0.012;
        if (s.step === 0 && R() < (s.sparse || s.rest ? 0.55 : 0.9)) mbNote(L, tt, s.bass, 0.17, -0.2);
        if (!s.rest){
          if (s.step === 4 && !s.sparse && R() < 0.3) mbNote(L, tt, s.bass + s.five, 0.12, -0.15);
          const strong = (s.step & 1) === 0;
          const p = s.sparse ? (s.step === 0 || s.step === 4 ? 0.5 : strong ? 0.1 : 0.04) : s.dens * (strong ? 1 : 0.7);
          if (R() < p){
            const m = s.mode === 'arp' ? arpNext() : melNext(strong);
            mbNote(L, tt, m, (strong ? 0.2 : 0.15) * (0.8 + R() * 0.35), clamp((m - 79) / 18 + (R() - 0.5) * 0.25, -0.6, 0.6));
          }
        }
        if (++s.step === 8){ s.step = 0; if (++s.bar >= s.bpc){ s.bar = 0; if (++s.ci >= s.prog.length){ s.ci = 0; cycle(); } } }
        return SP;
      }
      L.tracks.push({ next: t0, step });
    },

    /* 로파이: 72BPM 스윙, 7·9화음 일렉피아노 + 서브베이스 + 브러시 */
    lofi(L, t0){
      const R = L.R; L.lp.frequency.value = 5000; L.send.gain.value = 0.2; L.cap = 32; L.lvl = 0.6;
      // 건반 버스: 로우패스 + 느린 트레몰로
      const ep = ac.createBiquadFilter(); ep.type = 'lowpass'; ep.frequency.value = 1800; ep.Q.value = 0.4;
      const trem = ac.createGain(); trem.gain.value = 0.86;
      const lfo = ac.createOscillator(); lfo.frequency.value = 3.1;
      const lg = ac.createGain(); lg.gain.value = 0.12;
      lfo.connect(lg); lg.connect(trem.gain); ep.connect(trem); trem.connect(L.in); lfo.start(t0);
      // 바이닐
      const cr = ac.createBufferSource(); cr.buffer = crackle(); cr.loop = true;
      const chp = ac.createBiquadFilter(); chp.type = 'highpass'; chp.frequency.value = 700;
      const cg = ac.createGain(); cg.gain.value = 0.3;
      cr.connect(chp); chp.connect(cg); cg.connect(L.in); cr.start(t0, R() * 5);
      L.persist.push(lfo, cr);

      const PROGS = [
        [[2,'m9'],[7,'d13'],[0,'maj9'],[9,'m9']],
        [[0,'maj9'],[9,'m9'],[2,'m9'],[7,'d13']],
        [[5,'maj9'],[4,'m7'],[2,'m9'],[0,'maj9']],
        [[0,'maj9'],[4,'m7'],[5,'maj9'],[5,'m6']],
        [[2,'m9'],[7,'d13'],[0,'maj9'],[9,'m9'],[2,'m9'],[7,'d9'],[4,'m7'],[9,'d9']],
        [[5,'maj9'],[7,'d13'],[4,'m7'],[9,'m9'],[2,'m9'],[7,'d13'],[0,'six9'],[0,'six9']]
      ];
      // 한 마디 컴핑: [8분 위치, 세기, 길이(8분)]
      const COMP = [[[0,1,8]], [[0,1,3],[3,.7,5]], [[0,1,4],[4,.7,4]], [[0,1,5],[5,.6,3]], [[0,1,3],[3,.65,3],[6,.55,2]], [[1,.9,7]]];
      const BEAT = 60 / 72, SW = 0.57;
      const s = { key: 50 + pick(R, [0, 1, 3, 5, -2]), prog: pick(R, PROGS), ci: 0, bar: 0, step: 0, bpc: 1,
        sec: 'keys', voic: [], mean: 62, bass: 40, five: 7, comp: COMP[0], lead: 74, lscale: [] };

      // 루트 생략 클로즈 보이싱, 앞 화음과 가깝게
      function voice(root, ivs){
        const tones = ivs.length >= 4 ? ivs.filter(i => i !== 0) : ivs;
        const pcs = [...new Set(tones.map(i => (root + i) % 12))], n = pcs.length;
        let best = null, bs = 1e9;
        for (let r = 0; r < n; r++){
          const arr = [into(pcs[r], 53)];
          for (let k = 1; k < n; k++) arr.push(into(pcs[(r + k) % n], arr[k - 1] + 1));
          const mean = arr.reduce((a, b) => a + b, 0) / n, sc = Math.abs(mean - s.mean) + (arr[n - 1] > 76 ? 20 : 0);
          if (sc < bs){ bs = sc; best = arr; }
        }
        s.mean = (best.reduce((a, b) => a + b, 0) / n) * 0.5 + 31;
        return best;
      }
      function chord(){
        const [d, ty] = s.prog[s.ci], root = s.key + d;
        s.voic = voice(root, CH[ty]);
        s.bass = into(root, 36);
        s.five = CH[ty].includes(7) ? 7 : 12;
        s.lscale = spread(s.key, PENTA, 67, 81);
      }
      function epNote(t, m, v, hold){
        const f = mtof(m), end = t + hold + 0.7;
        if (!room(L, t, end)) return;
        const g = ac.createGain(), p = g.gain;
        p.setValueAtTime(0, t); p.linearRampToValueAtTime(v, t + 0.014);
        p.exponentialRampToValueAtTime(v * 0.3, t + 0.014 + hold);
        p.linearRampToValueAtTime(0, t + hold + 0.62);
        osc('triangle', f, t, end, -6).connect(g); osc('sine', f, t, end, 6).connect(g);
        g.connect(ep);
        const gb = ac.createGain(); pluck(gb.gain, t, 0.006, v * 0.3, 0.3); // 건반 '팅'
        osc('sine', f * 2, t, t + 0.4).connect(gb); gb.connect(ep);
      }
      function bassNote(t, m, v, hold){
        const f = mtof(m), end = t + hold + 0.35;
        if (!room(L, t, end)) return;
        const g = ac.createGain(), p = g.gain;
        p.setValueAtTime(0, t); p.linearRampToValueAtTime(v, t + 0.03);
        p.exponentialRampToValueAtTime(v * 0.35, t + 0.03 + hold);
        p.linearRampToValueAtTime(0, t + hold + 0.3);
        osc('sine', f, t, end).connect(g);
        const g2 = ac.createGain(); g2.gain.value = 0.22; osc('triangle', f, t, end, 3).connect(g2); g2.connect(g);
        g.connect(L.in);
      }
      function kick(t, v){
        const end = t + 0.45; if (!room(L, t, end)) return;
        const o = osc('sine', 120, t, end); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
        const g = ac.createGain(); pluck(g.gain, t, 0.005, v, 0.38); o.connect(g); g.connect(L.in);
      }
      function noiseHit(t, v, f, q, a, d, pan){
        const end = t + a + d + 0.05; if (!room(L, t, end)) return;
        const src = ac.createBufferSource(); src.buffer = noise();
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
        const g = ac.createGain(); pluck(g.gain, t, a, v, d);
        src.connect(bp); bp.connect(g); g.connect(outNode(L, pan));
        src.start(t, R() * 1.5, a + d + 0.04);
      }
      function hit(t, vs, len){
        const hold = Math.max(0.25, len * BEAT / 2 - 0.06), n = s.voic.length, up = R() < 0.75;
        s.voic.forEach((m, i) => { const k = up ? i : n - 1 - i; epNote(t + k * (0.01 + R() * 0.008), m, 0.07 * vs * (0.85 + R() * 0.25), hold); });
      }
      function cycle(){
        const r = R(); s.sec = r < 0.58 ? 'full' : r < 0.82 ? 'keys' : 'thin';
        if (R() < 0.35) s.prog = pick(R, PROGS);
        if (R() < 0.1) s.key += s.key > 51 ? -5 : 5;
        s.bpc = s.prog.length > 4 ? 1 : (R() < 0.35 ? 2 : 1);
      }
      function step(t){
        if (s.step === 0){
          if (s.bar === 0) chord();
          s.comp = s.sec === 'thin' ? (s.bar > 0 && R() < 0.5 ? [] : R() < 0.7 ? COMP[0] : COMP[5])
            : pick(R, s.sec === 'full' ? COMP : COMP.slice(0, 4));
        }
        let hitNow = false;
        for (const [st, vs, len] of s.comp) if (st === s.step){ hit(t, vs, len); hitNow = true; }
        if (s.sec === 'full'){
          if (s.step === 0 || (s.step === 5 && R() < 0.4) || (s.step === 3 && R() < 0.15)) kick(t, s.step === 0 ? 0.55 : 0.4);
          if (s.step === 2 || s.step === 6) noiseHit(t + 0.006, 0.12 * (0.85 + R() * 0.3), 2000, 0.5, 0.01, 0.2, -0.1);
          if (R() < 0.85) noiseHit(t + (R() - 0.5) * 0.008, ((s.step & 1) ? 0.07 : 0.045) * (0.7 + R() * 0.5), 6000, 0.8, 0.004, 0.07, 0.25);
        }
        if (s.sec !== 'thin'){
          if (s.step === 0) bassNote(t, s.bar === 0 ? s.bass : s.bass + pick(R, [0, s.five]), 0.3, BEAT * 1.7);
          else if (s.step === 5 && R() < (s.sec === 'full' ? 0.4 : 0.2)) bassNote(t, s.bass + pick(R, [s.five, 12, 0]), 0.22, BEAT * 0.9);
          // 아주 가끔 멜로디 한 음
          if (!hitNow && s.step > 1 && R() < 0.09){
            const sc = s.lscale; let i = sc.indexOf(nearest(sc, s.lead));
            i = clamp(i + pick(R, [-2, -1, 1, 2]), 0, sc.length - 1); s.lead = sc[i];
            epNote(t, s.lead, 0.045 * (0.8 + R() * 0.3), BEAT * 0.8);
          }
        }
        const d = BEAT * ((s.step & 1) ? 1 - SW : SW);
        if (++s.step === 8){ s.step = 0; if (++s.bar >= s.bpc){ s.bar = 0; if (++s.ci >= s.prog.length){ s.ci = 0; cycle(); } } }
        return d;
      }
      L.tracks.push({ next: t0, step });
    },

    /* 잔잔한: 느린 패드(8~16초 화음) + 가끔 높은 종 */
    ambient(L, t0){
      const R = L.R; L.lp.frequency.value = 4200; L.send.gain.value = 0.6; L.cap = 36; L.lvl = 1.8;
      const pf = ac.createBiquadFilter(); pf.type = 'lowpass'; pf.frequency.value = 750; pf.Q.value = 0.9; pf.connect(L.in);
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.027;
      const lg = ac.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(pf.frequency); lfo.start(t0);
      L.persist.push(lfo);
      const PROGS = [
        [[0,'maj9'],[5,'maj7'],[9,'m9'],[7,'sus2']],
        [[0,'add9'],[2,'add9'],[9,'m7'],[5,'maj7']],
        [[0,'maj7'],[4,'m7'],[5,'maj9'],[0,'sus2'],[9,'m9'],[5,'maj7']],
        [[9,'m9'],[5,'maj7'],[0,'add9'],[7,'sus2']],
        [[0,'six9'],[5,'maj9'],[0,'six9'],[10,'add9'],[5,'maj9']]
      ];
      const s = { key: 48 + pick(R, [2, 3, 5, 7, -1]), prog: pick(R, PROGS), ci: -1, gap: false, bellP: 0.35, bpool: [] };
      function padNote(t, m, v, dur, sub){
        const rel = 5, att = 3.2 + R() * 1.2, end = t + dur + rel + 0.05;
        if (!room(L, t, end)) return;
        const g = ac.createGain(), p = g.gain;
        p.setValueAtTime(0, t); p.linearRampToValueAtTime(v, t + att);
        p.setValueAtTime(v, t + dur); p.linearRampToValueAtTime(0, t + dur + rel);
        const f = mtof(m), det = 4 + R() * 5;
        const a = osc('sawtooth', f, t, end, -det), b = osc('sawtooth', f, t, end, det);
        if (hasPan){
          const pa = ac.createStereoPanner(), pb = ac.createStereoPanner(); pa.pan.value = -0.5; pb.pan.value = 0.5;
          a.connect(pa); pa.connect(g); b.connect(pb); pb.connect(g);
        } else { a.connect(g); b.connect(g); }
        if (sub) osc('sine', f, t, end).connect(g);
        g.connect(pf);
      }
      function padStep(t){
        if (s.ci >= 0 && !s.gap && R() < 0.08){ s.gap = true; return 5 + R() * 4; } // 숨 고르기
        s.gap = false;
        if (++s.ci >= s.prog.length){
          s.ci = 0;
          if (R() < 0.4) s.prog = pick(R, PROGS);
          s.bellP = clamp(s.bellP + (R() - 0.5) * 0.2, 0.15, 0.55);
          if (R() < 0.15) s.key = into(s.key + pick(R, [5, -5, 2, -2]), 45);
        }
        const [d, ty] = s.prog[s.ci], root = into(s.key + d, 43), ivs = CH[ty];
        // 펼친 보이싱: 2~5도는 한 옥타브 위로
        let up = ivs.filter(i => i % 12).map(i => root + (i % 12) + ((i % 12) <= 5 ? 12 : 0));
        up = [...new Set(up)].sort((a, b) => a - b);
        if (up.length > 3) up = up.filter(m => m !== root + 7);
        const thin = R() < 0.15, dur = 8 + R() * 8;
        if (thin) up = [root + 7, root + 14];
        const v = thin ? 0.032 : 0.042;
        pf.frequency.setTargetAtTime(480 + R() * 650, t, 3);
        padNote(t, root, v * 0.9, dur, true);
        for (const m of up) padNote(t + R() * 0.8, m, v, dur, false);
        s.bpool = spread(root, ivs, 74, 91);
        return dur;
      }
      function bellStep(t){
        if (s.bpool.length && R() < (s.gap ? 0.5 : s.bellP)){
          const n = R() < 0.25 ? 2 + ((R() * 2) | 0) : 1;
          let i = (R() * s.bpool.length) | 0, tt = t;
          for (let k = 0; k < n; k++){
            bell(L, tt, s.bpool[i], (0.05 + R() * 0.03) * (k ? 0.75 : 1), (R() - 0.5) * 1.1);
            tt += 0.3 + R() * 0.35; i = clamp(i + pick(R, [-1, 1, 1, 2]), 0, s.bpool.length - 1);
          }
        }
        return 1.6 + R() * 3.2;
      }
      L.tracks.push({ next: t0, step: padStep }, { next: t0 + 3.5, step: bellStep });
    }
  };

  /* ---------- 레이어 / 스케줄러 ---------- */
  function newLayer(k){
    const t = now() + 0.05;
    const L = { k, dead: false, R: rng32((Math.random() * 4294967296) >>> 0), tracks: [], persist: [], voices: [], cap: 16, lvl: 1 };
    L.in = ac.createGain();
    L.lp = ac.createBiquadFilter(); L.lp.type = 'lowpass'; L.lp.Q.value = 0.6;
    L.g = ac.createGain(); L.g.gain.value = 0;
    L.send = ac.createGain();
    L.in.connect(L.lp); L.lp.connect(L.g); L.g.connect(bus); L.g.connect(L.send); L.send.connect(reverb());
    BUILD[k](L, t);
    L.g.gain.setValueAtTime(0, t); L.g.gain.setTargetAtTime(L.lvl, t, FADE / 3.3); // 부드럽게 들어옴 (장르별 음량 맞춤)
    return L;
  }
  function retire(L){
    L.dead = true;
    try {
      const t = now(); L.g.gain.setTargetAtTime(0, t, FADE / 5);
      for (const n of L.persist) n.stop(t + FADE * 2.5);
    } catch (e){}
    const endAt = now() + FADE * 2.4;
    const drop = () => {
      if (alive() && now() < endAt) return void setTimeout(drop, 500); // 오디오 시간이 아직이면 대기
      try { L.g.disconnect(); L.send.disconnect(); } catch (e){}
      layers = layers.filter(x => x !== L);
    };
    setTimeout(drop, FADE * 2.4 * 1000 + 100);
  }
  function pump(until){
    const t = now();
    for (const L of layers){
      if (L.dead) continue;
      for (const tr of L.tracks){
        if (!offline && tr.next < t) tr.next = t + 0.05; // 늦었으면 건너뜀
        let guard = 0;
        while (tr.next < until && guard++ < 200) tr.next += tr.step(tr.next);
      }
    }
  }
  function tick(){
    try {
      if (!alive()){ stopTimer(); return; }
      if (susp) return;
      if (!layers.length){ stopTimer(); return; }
      pump(now() + LOOK);
    } catch (e){}
  }
  function startTimer(){ if (!timer && !offline && !susp) timer = setInterval(tick, TICK); }
  function stopTimer(){ if (timer){ clearInterval(timer); timer = 0; } }

  return {
    get kind(){ return kind; },
    set(k){
      if (k !== 'off' && !BUILD[k]) k = 'off';
      if (k === kind) return;
      kind = k;
      if (!alive()) return;
      try {
        if (cur){ retire(cur); cur = null; }
        if (k === 'off') return;
        cur = newLayer(k); layers.push(cur);
        if (offline){
          // 오프라인 렌더: 전체 구간을 미리 예약 (트랙 순서가 맞도록 조금씩)
          const end = ac.length / ac.sampleRate;
          for (let u = now() + LOOK; u < end + LOOK; u += LOOK) pump(u);
        } else if (!susp){ pump(now() + LOOK); startTimer(); }
      } catch (e){}
    },
    volume(v){
      vol = clamp(+v || 0, 0, 1);
      try { if (alive() && !susp) bus.gain.setTargetAtTime(vol * BUS, now(), 0.15); } catch (e){}
    },
    suspend(){
      if (susp) return; susp = true; stopTimer();
      try { if (alive()) bus.gain.setTargetAtTime(0, now(), 0.2); } catch (e){}
    },
    resume(){
      if (!susp) return; susp = false;
      try {
        if (!alive()) return;
        const t = now();
        bus.gain.setTargetAtTime(vol * BUS, t, 0.4);
        for (const L of layers) for (const tr of L.tracks) if (tr.next < t + 0.1) tr.next = t + 0.1;
        if (layers.length){ pump(t + LOOK); startTimer(); }
      } catch (e){}
    }
  };
}
