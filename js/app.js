(() => {
'use strict';
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const PI = Math.PI;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const rgb = (c, a) => a == null ? `rgb(${c[0]|0},${c[1]|0},${c[2]|0})` : `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;

/* ================= 설정 ================= */
const FILL_MIN = 0.5, FILL_MAX = 0.9;   // 물 높이 범위 (50% 아래로는 내려가지 않음)
let fillCur = 0.68;
const NW = 56;              // 수면 격자 수
const ZOOMS = [0.55, 1, 1.85];

let W = 0, H = 0, DPR = 1, CX = 0, CY = 0, D = 0, MIN = 1, ZP = 1, vign = null;
let psi = 0, psiV = 0, psiT = 0, level = 0, maxDepth = 1, xL = -100, xR = 100;
const eS = new Float32Array(NW), uS = new Float32Array(NW + 1), eOld = new Float32Array(NW), eV = new Float32Array(NW);
const rh = new Float32Array(NW), rv = new Float32Array(NW), hc = new Float32Array(NW), tmp = new Float32Array(NW + 1);
let zoom = 1, zoomT = 1, T = 0, last = performance.now();
let hasSensor = false, gxS = 0, gyS = 1, lastShake = -9, started = false;

const fish = {x:0,y:0,z:.5,vx:0,vy:0,vz:0,phi:0,pitch:0,phase:0,effort:.4,mode:'wander',timer:0,tx:0,ty:0,tz:.5,
  mouth:.2,blush:.3,sleepy:0,dizzy:0,kiss:0,chomp:0,awakeT:0,act:null,habitT:rand(12,22),hic:0,chaseB:null,faceHold:0,facePhi:0,nibLeaf:null,nextPeek:rand(20,40),nextNibble:rand(25,45),pecks:0,peckT:0,zzzT:0,called:false,nfx:0};
const bubbles = [], particles = [], foods = [], rings = [], hearts = [], zzz = [], drops = [], gdrops = [];
let bubbleTimer = 2, rippleTimer = 0, splashCD = 0;
const wdrops = [], streaks = [], bokeh = [], stars = [], leaves = [];
let snail = null, star = null, eventT = 40, eventIdx = 0, rainK = 0, lofiK = 1, dripT = 0;

/* ================= 저장 ================= */
const KEY = 'eohangmeong.v1';
const DAY_MS = 86400000;
const dayNum = d => Math.floor((d.getTime() - d.getTimezoneOffset()*60000) / DAY_MS);   // 현지 날짜 기준 일련번호
const save = {growth:0.15, aff:0, days:1, born:0, lastDay:'', name:'뽀글이', zoom:1, tod:0, rain:0, lofi:1, fill:0.68, smooth:1};
let dirty = false, isNewFish = true;
function persist(){ try { localStorage.setItem(KEY, JSON.stringify(save)); } catch(e){} dirty = false; }
(function load(){
  try { const s = localStorage.getItem(KEY); if (s){ Object.assign(save, JSON.parse(s)); isNewFish = false; } } catch(e){}
  const now = new Date(), today = now.toDateString(), tn = dayNum(now);
  save.fill = clamp(+save.fill || 0.68, FILL_MIN, FILL_MAX);
  save.name = String(save.name || '뽀글이').slice(0, 10);
  // 함께한 날은 처음 만난 날부터 달력으로 셈 (예전 저장본은 방문 일수로 추정)
  if (!save.born) save.born = tn - Math.max(0, (save.days | 0) - 1);
  // 성장은 찾아온 날마다 조금씩
  if (save.lastDay !== today){ if (save.lastDay) save.growth = Math.min(1, save.growth + 0.04); save.lastDay = today; }
  save.days = Math.max(1, tn - save.born + 1);
  persist();
})();
const sizeMul = () => 0.8 + save.growth * 0.6;
const fishLen = () => MIN * 0.17 * zoom * sizeMul();

/* ================= 좌표계 ================= */
// 2D 어항: 모든 것이 한 평면 (z는 그리는 순서에만 사용)
const proj = (x, y) => [x, y, 1];
const unproj = (x, y) => [x, y];
function toFrame(x, y){ const dx = x - CX, dy = y - CY, c = Math.cos(psi), s = Math.sin(psi); return [dx*c + dy*s, -dx*s + dy*c]; }
function toScreen(fx, fy){ const c = Math.cos(psi), s = Math.sin(psi); return [CX + fx*c - fy*s, CY + fx*s + fy*c]; }
function fVec(vx, vy){ const c = Math.cos(psi), s = Math.sin(psi); return [vx*c - vy*s, vx*s + vy*c]; }
const down = () => ({x:-Math.sin(psi), y:Math.cos(psi)});
const colX = i => xL + (xR - xL) * (i + 0.5) / NW;

const fc = document.createElement('canvas'), fg = fc.getContext('2d');
function resize(){
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight; MIN = Math.min(W, H);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  CX = W/2; CY = H/2; D = Math.hypot(W, H)/2 + 40; ZP = MIN * 0.55;
  const S = Math.ceil(MIN * 0.17 * 1.9 * 1.45 * 2.6 * DPR) + 8;
  if (fc.width < S){ fc.width = S; fc.height = S; }
  vign = ctx.createRadialGradient(CX, CY, MIN*0.38, CX, CY, Math.hypot(W, H)*0.62);
  vign.addColorStop(0, 'rgba(0,6,14,0)'); vign.addColorStop(1, 'rgba(0,6,14,.5)');
  genBokeh(); sizeBloom();
  computeLevel();
}
function clipArea(P, m){
  const out = [];
  for (let i = 0; i < P.length; i++){
    const A = P[i], B = P[(i+1) % P.length], ai = A[1] >= m, bi = B[1] >= m;
    if (ai) out.push(A);
    if (ai !== bi){ const t = (m - A[1]) / (B[1] - A[1]); out.push([A[0] + (B[0]-A[0])*t, m]); }
  }
  let ar = 0;
  for (let i = 0; i < out.length; i++){ const A = out[i], B = out[(i+1) % out.length]; ar += A[0]*B[1] - B[0]*A[1]; }
  return Math.abs(ar) / 2;
}
function computeLevel(){
  const c = Math.cos(psi), s = Math.sin(psi), hw = W/2, hh = H/2;
  const P = [[-hw,-hh],[hw,-hh],[hw,hh],[-hw,hh]].map(([x,y]) => [x*c + y*s, -x*s + y*c]);
  let lo = Infinity, hi = -Infinity;
  for (const p of P){ lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
  const target = fillCur * W * H; let a = lo, b = hi;
  for (let i = 0; i < 26; i++){ const m = (a+b)/2; if (clipArea(P, m) > target) a = m; else b = m; }
  level = (a+b)/2; maxDepth = Math.max(1, hi - level);
  let l = Infinity, r = -Infinity;
  for (let i = 0; i < 4; i++){
    const A = P[i], B = P[(i+1) % 4];
    if ((A[1]-level)*(B[1]-level) <= 0 && A[1] !== B[1]){ const x = A[0] + (B[0]-A[0])*(level-A[1])/(B[1]-A[1]); if (x < l) l = x; if (x > r) r = x; }
  }
  if (!(r > l + 10)){ l = -hw; r = hw; }
  xL = l; xR = r;
}

/* ================= 물: 큰 출렁임 + 잔물결 ================= */
// 큰 출렁임은 '물덩어리가 한쪽으로 몰렸다가 흘러 돌아오는' 흐름으로 계산 (얕은 물 방정식).
// 여러 진동이 겹쳐 떨리는 대신, 하나의 큰 물결이 부드럽게 넘실대며 벽에 부딪혀 돌아옴.
const SLOSH_T = 1.55;       // 보통 크기 어항에서 한 번 출렁이는 데 걸리는 시간(초)
function sloshStep(dt){
  const Lx = xR - xL, dx = Lx / NW;
  const c = 2 * Lx / (SLOSH_T / Math.sqrt(zoom)), Hd = 0.6 * Lx, g = c * c / Hd;
  const kdE = Math.min(0.3, 3200 * dt / (dx*dx)), kdU = Math.min(0.3, 2000 * dt / (dx*dx)), drag = 0.5;
  for (let f = 1; f < NW; f++) uS[f] += dt * (-g * (eS[f] - eS[f-1]) / dx - drag * uS[f]);
  uS[0] = 0; uS[NW] = 0;
  tmp.set(uS);
  for (let f = 1; f < NW; f++) uS[f] = tmp[f] + kdU * (tmp[f-1] - 2*tmp[f] + tmp[f+1]);
  for (let i = 0; i < NW; i++){
    tmp[i] = eS[i] - dt * Hd * (uS[i+1] - uS[i]) / dx;
  }
  for (let i = 0; i < NW; i++){ const l = tmp[i > 0 ? i-1 : 0], r = tmp[i < NW-1 ? i+1 : NW-1]; eS[i] = tmp[i] + kdE * (l - 2*tmp[i] + r); }
}
// 잔물결 (기포, 먹이, 쪼기): 느리고 금방 사라지는 작은 물결
function rippleStep(dt){
  const dx = (xR - xL) / NW, C = Math.pow(170 / dx, 2), damp = Math.exp(-2.4 * dt);
  for (let i = 0; i < NW; i++){ const l = rh[i > 0 ? i-1 : 1], r = rh[i < NW-1 ? i+1 : NW-2]; rv[i] = (rv[i] + C*(l + r - 2*rh[i])*dt) * damp; }
  for (let i = 0; i < NW; i++) rh[i] += rv[i] * dt;
}
function finishWaves(){
  let m = 0, mr = 0; for (let i = 0; i < NW; i++){ m += eS[i]; mr += rh[i]; } m /= NW; mr /= NW;
  const lim = 0.3 * (xR - xL);
  for (let i = 0; i < NW; i++){ eS[i] = clamp(eS[i] - m, -lim, lim); rh[i] = clamp(rh[i] - mr, -20, 20); hc[i] = -eS[i] + rh[i]; }
  for (let pass = 0; pass < 2; pass++){   // 화면용으로 한 번 더 매끈하게
    tmp.set(hc);
    for (let i = 0; i < NW; i++){ const l = tmp[i > 0 ? i-1 : 0], r = tmp[i < NW-1 ? i+1 : NW-1]; hc[i] = 0.25*l + 0.5*tmp[i] + 0.25*r; }
  }
}
function waveAt(fx){
  let u = (fx - xL) / (xR - xL) * NW - 0.5; u = clamp(u, 0, NW - 1);
  const i = Math.min(NW - 2, Math.floor(u)), t = u - i;
  return hc[i] * (1 - t) + hc[i+1] * t;
}
// 폰이 기울면 그 순간의 수면은 새 중력 기준으로 비스듬해짐 → 높이 차이로 넣으면 흘러내리며 출렁임
function injectTilt(dpsi){ const Lx = xR - xL; for (let i = 0; i < NW; i++) eS[i] += ((i + 0.5)/NW - 0.5) * Lx * dpsi; }
function pokeF(fx, imp){
  const c0 = (fx - xL) / (xR - xL) * NW - 0.5;
  for (let i = Math.max(0, Math.floor(c0 - 4)); i <= Math.min(NW - 1, Math.ceil(c0 + 4)); i++){ const d = i - c0; rv[i] += imp * 1.2 * Math.exp(-d*d/3); }
}
function poke(x, y, imp){ pokeF(toFrame(x, y)[0], imp); }
function surfYF(fx){ return level + waveAt(fx); }
function depthAt(x, y){ const f = toFrame(x, y); return f[1] - surfYF(f[0]); }
function inWater(x, y, m){ return x > m && x < W - m && y > m && y < H - m && depthAt(x, y) > m; }
function pickWaterPoint(m, minDepthFrac){
  const md = (minDepthFrac || 0) * maxDepth;
  for (let i = 0; i < 50; i++){ const x = rand(m, W - m), y = rand(m, H - m); const d = depthAt(x, y); if (d > m && d > md) return {x, y}; }
  const p = toScreen(0, level + maxDepth * 0.6); return {x:clamp(p[0], m, W - m), y:clamp(p[1], m, H - m)};
}

/* ================= 빛무늬 (애니메이션 타일) ================= */
const CN = 16, CS = 128, caus = [];
function genCaustic(time){
  const c = document.createElement('canvas'); c.width = c.height = CS;
  const g = c.getContext('2d'), img = g.createImageData(CS, CS), TAU = 6.28318530718, inten = 0.005;
  for (let y = 0; y < CS; y++) for (let x = 0; x < CS; x++){
    const px = (x/CS)*TAU - 250, py = (y/CS)*TAU - 250;
    let ix = px, iy = py, cc = 1;
    for (let n = 0; n < 5; n++){
      const t = time * (1 - 3.5/(n+1));
      const nx = px + Math.cos(t - ix) + Math.sin(t + iy), ny = py + Math.sin(t - iy) + Math.cos(t + ix);
      ix = nx; iy = ny;
      cc += 1 / Math.hypot(px / (Math.sin(ix + t)/inten), py / (Math.cos(iy + t)/inten));
    }
    cc /= 5; cc = 1.17 - Math.pow(cc, 1.4);
    const v = clamp(Math.pow(Math.abs(cc), 8), 0, 1), k = (y*CS + x) * 4;
    img.data[k] = 225; img.data[k+1] = 255; img.data[k+2] = 250; img.data[k+3] = v * 255;
  }
  g.putImageData(img, 0, 0);
  return ctx.createPattern(c, 'repeat');
}
caus.push(genCaustic(0.6));
function causFrame(t){
  const n = caus.length; if (n < 2) return [caus[0], caus[0], 0];
  const per = 2 * (n - 1), tt = t % per, f = tt < n - 1 ? tt : per - tt, i0 = Math.floor(f), i1 = Math.min(i0 + 1, n - 1);
  return [caus[i0], caus[i1], f - i0];
}
const rays = Array.from({length:5}, () => ({x:rand(-.7,.7), w:rand(.05,.14), sp:rand(.08,.2), ph:rand(0,6), amp:rand(20,60), a:rand(.05,.1)}));

/* ================= 하루의 빛 ================= */
const KEYS = {
  night:{top:[18,50,78], mid:[10,32,58], deep:[3,12,28], air:[5,10,20], caus:.12, rays:.05, mul:[128,146,205], band:.35, city:1, lamp:.75, win:0},
  dawn: {top:[70,150,172], mid:[34,100,132], deep:[10,40,74], air:[24,30,48], caus:.55, rays:.6, mul:[250,222,214], band:.8, city:.25, lamp:.25, win:.35},
  day:  {top:[46,172,172], mid:[24,128,146], deep:[7,56,88], air:[12,30,42], caus:1, rays:1, mul:[255,255,255], band:1, city:0, lamp:0, win:.6},
  dusk: {top:[70,138,168], mid:[34,86,128], deep:[16,30,70], air:[40,24,44], caus:.6, rays:.85, mul:[255,196,196], band:.85, city:.5, lamp:.5, win:.3},
  eve:  {top:[36,92,118], mid:[18,58,90], deep:[6,22,44], air:[10,14,28], caus:.3, rays:.2, mul:[166,166,214], band:.55, city:.9, lamp:.9, win:0}
};
const SCHED = [[0,'night'],[5,'night'],[6.5,'dawn'],[8.5,'day'],[16.5,'day'],[18.3,'dusk'],[19.8,'eve'],[21.5,'night'],[24,'night']];
const TOD_FIXED = [null, 6.7, 12, 18.3, 23.5];
const TOD_NAMES = ['지금', '새벽', '낮', '노을', '밤'];
function mixL(a, b, t){ const o = {}; for (const k in a) o[k] = Array.isArray(a[k]) ? a[k].map((v, i) => lerp(v, b[k][i], t)) : lerp(a[k], b[k], t); return o; }
function lightAt(h){
  for (let i = 0; i < SCHED.length - 1; i++){
    const [h0, k0] = SCHED[i], [h1, k1] = SCHED[i+1];
    if (h >= h0 && h <= h1) return mixL(KEYS[k0], KEYS[k1], smooth(0, 1, (h - h0) / (h1 - h0)));
  }
  return KEYS.night;
}
function effHour(){ if (save.tod) return TOD_FIXED[save.tod]; const d = new Date(); return d.getHours() + d.getMinutes()/60; }
const isNight = () => { const h = effHour(); return h >= 22 || h < 5.5; };
function phaseName(h){ return (h >= 21.5 || h < 5.5) ? '밤' : h < 8.2 ? '새벽' : h < 17 ? '낮' : h < 19.6 ? '노을' : '저녁'; }
let Lt = mixL(lightAt(effHour()), lightAt(effHour()), 0);

/* ================= 소리 ================= */
let AC = null, master = null, soundOn = false, lastBloop = 0, rainGain = null;
function initAudio(){
  AC = new (window.AudioContext || window.webkitAudioContext)();
  master = AC.createGain(); master.gain.value = 0; master.connect(AC.destination);
  const len = AC.sampleRate * 4, buf = AC.createBuffer(1, len, AC.sampleRate), d = buf.getChannelData(0);
  let l = 0; for (let i = 0; i < len; i++){ const w = Math.random()*2 - 1; l = (l + 0.02*w) / 1.02; d[i] = l * 3.5; }
  const src = AC.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 160;
  lfo.connect(lg).connect(lp.frequency);
  const g = AC.createGain(); g.gain.value = 0.28;
  src.connect(lp).connect(g).connect(master); src.start(); lfo.start();
  const rl = AC.sampleRate * 2, rb = AC.createBuffer(1, rl, AC.sampleRate), rd = rb.getChannelData(0);
  for (let i = 0; i < rl; i++) rd[i] = Math.random()*2 - 1;
  const rs = AC.createBufferSource(); rs.buffer = rb; rs.loop = true;
  const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 600;
  const lp2 = AC.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 3600;
  rainGain = AC.createGain(); rainGain.gain.value = 0;
  rs.connect(hp).connect(lp2).connect(rainGain).connect(master); rs.start();
  setRainAudio();
}
function setRainAudio(){ if (rainGain) rainGain.gain.setTargetAtTime(save.rain ? 0.085 : 0, AC.currentTime, 1.2); }
function drip(){
  if (!soundOn || !AC) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(), f = rand(1500, 2900);
  o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f*1.6, t + 0.03);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(rand(0.004, 0.011), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.07);
}
function bloop(pitch, vol){
  if (!soundOn || !AC || T - lastBloop < 0.08) return; lastBloop = T;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(240*pitch, t); o.frequency.exponentialRampToValueAtTime(760*pitch, t + 0.09);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.17);
}

/* ================= 생성 헬퍼 ================= */
function spawnBubble(x, y, z, r, delay){ if (bubbles.length < 90) bubbles.push({x, y, z, r, ph:rand(0,6), age:0, delay:delay||0}); }
function mouthWorld(){ const l = fishLen(); return {x:fish.x + Math.cos(fish.phi)*0.3*l, y:fish.y + 0.02*l, z:fish.z}; }
function breathe(n){ const m = mouthWorld(), l = fishLen(); for (let i = 0; i < n; i++) spawnBubble(m.x, m.y, m.z, l*rand(.022,.036), i*rand(.15,.3)); }
function addHeart(){ const m = mouthWorld(), p = proj(m.x, m.y, m.z); hearts.push({x:p[0], y:p[1] - fishLen()*0.2, t:0}); }
function setTarget(x, y, z){ fish.tx = x; fish.ty = y; fish.tz = z; }
function wanderTarget(){ const l = fishLen(), p = pickWaterPoint(l*0.6); setTarget(p.x, p.y, 0.5); fish.mode = 'wander'; }
function dropFood(x, y, n){
  for (let i = 0; i < n && foods.length < 14; i++){
    const z = 0.5, w = unproj(x + rand(-12,12), y + rand(-8,8));
    foods.push({x:w[0], y:w[1], z, vx:rand(-20,20), vy:rand(-20,0), wet:false, float:0, life:32, ph:rand(0,6)});
  }
}
function feed(){
  const n = 3 + (Math.random()*2 | 0), Lx = xR - xL;
  for (let i = 0; i < n; i++){
    const p = toScreen(rand(-.22,.22)*Lx, level - rand(30, 70));
    dropFood(clamp(p[0], 20, W - 20), clamp(p[1], 20, H - 20), 1);
  }
}
function shake(strong){
  { const Lx = xR - xL; for (let k = 1; k <= 3; k++){ const a = rand(-1, 1) * 0.07 * Lx / k; for (let i = 0; i < NW; i++) eS[i] += a * Math.cos(k * PI * (i + 0.5) / NW); } }
  for (let i = 0; i < NW; i++) rv[i] += rand(-120, 120);
  for (let i = 0; i < 14; i++){ const p = pickWaterPoint(10); spawnBubble(p.x, p.y, rand(.1,.9), rand(1.5,4.5)*zoom, rand(0,.4)); }
  const l = fishLen(), p = pickWaterPoint(l*.6);
  setTarget(p.x, p.y, 0.5); fish.mode = 'startle'; fish.timer = 1.1; fish.awakeT = 20;
  if (strong) fish.dizzy = 1.8;
  bloop(0.8, 0.05);
}

/* ================= 물고기 행동 ================= */
function nearestFood(){
  let best = null, bd = Infinity;
  for (const f of foods){ if (!f.wet) continue; const d = Math.hypot(f.x - fish.x, f.y - fish.y, (f.z - fish.z)*ZP); if (d < bd){ bd = d; best = f; } }
  return best;
}
function updateFish(dt){
  const l = fishLen(), dn = down(), night = isNight();
  fish.dizzy = Math.max(0, fish.dizzy - dt); fish.kiss = Math.max(0, fish.kiss - dt);
  fish.chomp = Math.max(0, fish.chomp - dt); fish.awakeT = Math.max(0, fish.awakeT - dt); fish.hic = Math.max(0, fish.hic - dt);
  if (fish.act){
    const a = fish.act; a.t += dt;
    if (a.k === 'hic') for (const tt of [0.15, 1.1, 2.05]) if (a.t - dt < tt && a.t >= tt){
      fish.vx -= dn.x*0.9*l; fish.vy -= dn.y*0.9*l; fish.hic = 0.3;
      const m = mouthWorld(); spawnBubble(m.x, m.y, m.z, l*0.03, 0); bloop(1.9, 0.02);
    }
    if (a.t >= a.d){ if (a.k === 'yawn') breathe(1); fish.act = null; }
  }
  let spd = 0.45 * l, face = null;
  const food = nearestFood();

  if (fish.mode === 'startle'){
    fish.timer -= dt; spd = 3 * l; if (fish.timer <= 0) wanderTarget();
  } else if (food){
    fish.mode = 'food'; setTarget(food.x, food.y, food.z); spd = 1.5 * l; fish.awakeT = Math.max(fish.awakeT, 15);
    const m = mouthWorld();
    if (Math.hypot(m.x - food.x, m.y - food.y, (m.z - food.z)*ZP) < 0.2*l + 5){
      foods.splice(foods.indexOf(food), 1);
      save.growth = Math.min(1, save.growth + 0.008); save.aff = Math.min(1, save.aff + 0.01); dirty = true;
      fish.chomp = 0.6; fish.blush = 1; breathe(2); bloop(1.3, 0.03);
    }
  } else if (fish.mode === 'chase'){
    const b = fish.chaseB; fish.timer -= dt;
    if (!b || bubbles.indexOf(b) < 0 || fish.timer <= 0) wanderTarget();
    else {
      setTarget(b.x, b.y, 0.5); spd = 1.25 * l;
      const m = mouthWorld();
      if (Math.hypot(m.x - b.x, m.y - b.y) < 0.14*l + b.r){
        bubbles.splice(bubbles.indexOf(b), 1); fish.chomp = 0.4; fish.blush = 1;
        rings.push({x:b.x, y:b.y, t:0, s:.25}); bloop(2.1, 0.02);
        fish.mode = 'rest'; fish.timer = 1.6; setTarget(fish.x, fish.y, fish.z);
      }
    }
  } else if (fish.mode === 'visit'){
    const sn = snail; fish.timer -= dt;
    if (!sn || fish.timer <= 0) wanderTarget();
    else {
      setTarget(sn.x + sn.hx*0.9*l, sn.y + sn.hy*0.9*l, 0.5); spd = 0.7 * l;
      if (!inWater(fish.tx, fish.ty, l*0.3)) wanderTarget();
      else if (Math.hypot(fish.tx - fish.x, fish.ty - fish.y) < 0.3*l){
        const dxf = toFrame(sn.x, sn.y)[0] - toFrame(fish.x, fish.y)[0];
        fish.facePhi = dxf >= 0 ? 0 : PI; fish.faceHold = 3.2; fish.blush = 1; breathe(2);
        fish.mode = 'rest'; fish.timer = 3.2; setTarget(fish.x, fish.y, fish.z);
      }
    }
  } else if (fish.mode === 'call' || fish.mode === 'peek'){
    spd = (fish.mode === 'call' ? 1.1 + save.aff*0.8 : 0.7) * l;
    fish.timer -= dt;
    if (!inWater(fish.tx, fish.ty, l*0.3) || fish.timer <= 0) wanderTarget();
    else if (Math.hypot(fish.tx - fish.x, fish.ty - fish.y) < 0.35*l && Math.abs(fish.tz - fish.z) < 0.1){
      if (fish.mode === 'call'){ save.aff = Math.min(1, save.aff + 0.02); dirty = true; addHeart(); fish.kiss = 1.4; }
      fish.mode = 'look'; fish.timer = rand(2.6, 3.6); breathe(2);
    }
  } else if (fish.mode === 'look'){
    face = PI/2; spd = 0.08 * l; setTarget(fish.x, fish.y, fish.z);
    fish.timer -= dt; if (fish.timer <= 0) wanderTarget();
  } else if (fish.mode === 'nibble'){
    spd = 0.7 * l;
    if (fish.nibLeaf){ if (leaves.indexOf(fish.nibLeaf) < 0) fish.nibLeaf = null; else fish.nfx = fish.nibLeaf.fx; }
    const sp = toScreen(fish.nfx, surfYF(fish.nfx) + 0.3*l); setTarget(clamp(sp[0], l, W - l), clamp(sp[1], l, H - l), fish.tz);
    fish.timer -= dt;
    const m = mouthWorld(), mf = toFrame(m.x, m.y);
    if (mf[1] - surfYF(mf[0]) < 0.2*l){
      fish.peckT -= dt;
      if (fish.peckT <= 0){
        fish.peckT = rand(.45, .75); fish.pecks--; fish.chomp = 0.35;
        pokeF(mf[0], -70); if (fish.nibLeaf) fish.nibLeaf.drift += rand(-7, 7);
        const sp2 = toScreen(mf[0], surfYF(mf[0])), pp = proj(sp2[0], sp2[1], m.z);
        rings.push({x:pp[0], y:pp[1], t:0, s:.45}); bloop(1.5, 0.02);
      }
    }
    if (fish.pecks <= 0 || fish.timer <= 0){ fish.nibLeaf = null; wanderTarget(); }
  } else if (fish.mode === 'sleep'){
    spd = 0.1 * l;
    if (!night || fish.awakeT > 0){ fish.mode = 'rest'; fish.timer = 2; }
    if (!inWater(fish.tx, fish.ty, l*0.4)){ const p = pickWaterPoint(l*.6, .55); setTarget(p.x, p.y, 0.5); }
    fish.zzzT -= dt;
    if (fish.zzzT <= 0){ fish.zzzT = 3.2; const p = proj(fish.x, fish.y, fish.z); zzz.push({x:p[0], y:p[1] - l*0.3, t:0}); }
  } else if (fish.mode === 'rest'){
    spd = 0.14 * l; fish.timer -= dt; if (fish.timer <= 0) wanderTarget();
    if (Math.random() < dt*0.22) breathe(1 + (Math.random()*3 | 0));
  } else {
    fish.mode = 'wander'; spd = (0.42 + 0.18*Math.sin(T*0.31)) * l;
    if (!inWater(fish.tx, fish.ty, l*0.35)) wanderTarget();
    if (Math.hypot(fish.tx - fish.x, fish.ty - fish.y) < 0.5*l && Math.abs(fish.tz - fish.z) < 0.12){
      if (Math.random() < 0.4){ fish.mode = 'rest'; fish.timer = rand(2.5, 6); setTarget(fish.x, fish.y, fish.z); } else wanderTarget();
    }
  }

  if (fish.mode === 'wander' || fish.mode === 'rest'){
    if (night && fish.awakeT <= 0){
      fish.mode = 'sleep'; const p = pickWaterPoint(l*.6, .55); setTarget(p.x, p.y, 0.5); fish.zzzT = 2;
    } else {
      fish.nextPeek -= dt; fish.nextNibble -= dt;
      if (fish.nextPeek <= 0){
        fish.nextPeek = rand(45, 90);
        const p = pickWaterPoint(l*.8); setTarget(lerp(p.x, CX, .4), p.y, 0.5); fish.mode = 'peek'; fish.timer = 12;
      } else if (fish.nextNibble <= 0){
        fish.nextNibble = rand(35, 70); const Lx = xR - xL;
        fish.nfx = rand(xL + .2*Lx, xR - .2*Lx); fish.tz = 0.5; fish.pecks = 3 + (Math.random()*3 | 0); fish.peckT = .3;
        fish.mode = 'nibble'; fish.timer = 12;
      }
      if (fish.mode === 'wander' || fish.mode === 'rest'){
        const lf = leaves.find(q => q.st === 'float' && !q.nib && q.t > 4 && q.kind !== 'winter');
        if (lf){ lf.nib = true; fish.nibLeaf = lf; fish.nfx = lf.fx; fish.pecks = 3 + (Math.random()*2 | 0); fish.peckT = .3; fish.mode = 'nibble'; fish.timer = 12; }
        else if (snail && !snail.visited && snail.t > 6 && inWater(snail.x, snail.y, l*0.5)){ snail.visited = true; fish.mode = 'visit'; fish.timer = 10; }
        else {
          fish.habitT -= dt;
          if (!fish.act && fish.habitT <= 0){
            fish.habitT = rand(22, 45);
            const eve = Lt.lamp > 0.4, r = Math.random();
            if (r < (eve ? 0.55 : 0.3)){ fish.act = {k:'yawn', t:0, d:1.9}; fish.mode = 'rest'; fish.timer = 2.6; setTarget(fish.x, fish.y, fish.z); }
            else if (r < (eve ? 0.75 : 0.6)) fish.act = {k:'hic', t:0, d:2.6};
            else {
              let b = bubbles.find(q => q.delay <= 0 && Math.hypot(q.x - fish.x, q.y - fish.y) < 4*l);
              if (!b){ const bx = fish.x + dn.x*1.6*l, by = fish.y + dn.y*1.6*l; if (inWater(bx, by, 8)){ spawnBubble(bx, by, 0.5, rand(2.6, 3.6)*zoom, 0); b = bubbles[bubbles.length - 1]; } }
              if (b){ fish.mode = 'chase'; fish.chaseB = b; fish.timer = 4; } else fish.act = {k:'hic', t:0, d:2.6};
            }
          }
        }
      }
    }
  }

  // 3D 조향
  const dx = fish.tx - fish.x, dy = fish.ty - fish.y, dzp = (fish.tz - fish.z) * ZP;
  const dist = Math.hypot(dx, dy, dzp) || 1, want = spd * Math.min(1, dist / (0.8*l));
  const k = Math.min(1, dt * (fish.mode === 'startle' ? 6 : 2.4));
  fish.vx += (dx/dist*want - fish.vx) * k; fish.vy += (dy/dist*want - fish.vy) * k;
  let vzp = fish.vz * ZP; vzp += (dzp/dist*want - vzp) * k;
  // 물 밖/벽 밀어내기
  const m = 0.42 * l, dep = depthAt(fish.x, fish.y);
  if (dep < m){ const p = (m - dep) * 8 * dt; fish.vx += dn.x*p; fish.vy += dn.y*p; }
  if (fish.x < m) fish.vx += (m - fish.x)*8*dt; if (fish.x > W - m) fish.vx -= (fish.x - (W - m))*8*dt;
  if (fish.y < m) fish.vy += (m - fish.y)*8*dt; if (fish.y > H - m) fish.vy -= (fish.y - (H - m))*8*dt;
  if (fish.z < 0.06) vzp += (0.06 - fish.z)*ZP*6*dt; if (fish.z > 0.94) vzp -= (fish.z - 0.94)*ZP*6*dt;
  const sp = Math.hypot(fish.vx, fish.vy, vzp), cap = 3.4 * l;
  if (sp > cap){ fish.vx *= cap/sp; fish.vy *= cap/sp; vzp *= cap/sp; }
  fish.vz = vzp / ZP;
  fish.x = clamp(fish.x + fish.vx*dt, 4, W - 4); fish.y = clamp(fish.y + fish.vy*dt, 4, H - 4); fish.z = clamp(fish.z + fish.vz*dt, 0.02, 0.98);

  // 방향: 0 = 오른쪽, π/2 = 나를 봄, π = 왼쪽 (돌 때 항상 이쪽을 보며 돔)
  const vd = -vzp, hs = Math.hypot(fish.vx, vd);
  let phiT = fish.phi, turnK = 5;
  if (face != null) phiT = face;
  else if (fish.faceHold > 0){ fish.faceHold -= dt; phiT = fish.facePhi; }
  else if (hs > 0.12*l){
    phiT = Math.atan2(Math.max(0, vd)*0.9, fish.vx);
    if (Math.abs(fish.vx) < 0.08*l && vd <= 0) phiT = fish.phi > PI/2 ? PI : 0;
  } else { phiT = fish.phi <= PI/2 ? 0 : PI; turnK = 0.8; }
  phiT = clamp(phiT, 0, PI);
  const dphi = phiT - fish.phi, maxR = 3.2 * dt;
  fish.phi += clamp(dphi * Math.min(1, dt*turnK), -maxR, maxR);
  const ptT = hs > 0.1*l ? clamp(Math.atan2(fish.vy, hs), -0.5, 0.5) : 0;
  fish.pitch += (ptT - fish.pitch) * Math.min(1, dt*3);
  const eT = clamp(0.22 + Math.hypot(fish.vx, fish.vy, vzp)/(0.9*l) + Math.abs(dphi)*0.35, 0.2, 1.4) * (fish.mode === 'sleep' ? 0.5 : 1);
  fish.effort += (eT - fish.effort) * Math.min(1, dt*3);
  fish.phase += dt * (3.5 + 7*fish.effort);
  const sleepT = fish.mode === 'sleep' ? 1 : 0;
  fish.sleepy += (sleepT - fish.sleepy) * Math.min(1, dt*1.2);
  const bT = fish.mode === 'look' ? 1 : 0.3 + save.aff*0.3;
  fish.blush += (bT - fish.blush) * Math.min(1, dt*1.5);
  let mo = 0.28 + 0.2*Math.sin(T*3.1);
  if (fish.chomp > 0) mo = 0.35 + 0.65*Math.abs(Math.sin(fish.chomp*16));
  if (fish.sleepy > 0.5) mo = 0.15 + 0.08*Math.sin(T*1.6);
  if (fish.hic > 0) mo = 0.75;
  fish.mouth += (mo - fish.mouth) * Math.min(1, dt*12);
}

/* ================= 업데이트 ================= */
function update(dt){
  zoom += (zoomT - zoom) * Math.min(1, dt*3.5);
  { const df = save.fill - fillCur;
    if (Math.abs(df) > 0.0005){ fillCur += df * Math.min(1, dt*1.1); if (Math.random() < dt*8) pokeF(rand(xL, xR), rand(-30, 30)); }
    else fillCur = save.fill; }
  // 중력 방향을 부드럽게 따라가며, 회전량을 출렁임으로 주입
  const dd = Math.atan2(Math.sin(psiT - psi), Math.cos(psiT - psi));
  psiV += (dd*81 - psiV*16) * dt; psiV = clamp(psiV, -10, 10);
  const dpsi = psiV * dt; psi += dpsi;
  computeLevel();
  injectTilt(dpsi);
  eOld.set(eS);
  {
    const Lx = xR - xL, c = 2 * Lx / (SLOSH_T / Math.sqrt(zoom));
    const steps = clamp(Math.ceil(dt / (0.45 * (Lx / NW) / c)), 1, 48);
    for (let i = 0; i < steps; i++){ sloshStep(dt / steps); rippleStep(dt / steps); }
  }
  for (let i = 0; i < NW; i++) eV[i] = dt > 0 ? (eS[i] - eOld[i]) / dt : 0;
  finishWaves();

  Lt = mixL(Lt, lightAt(effHour()), Math.min(1, dt*1.2));

  rippleTimer -= dt;
  if (rippleTimer < 0){ rippleTimer = rand(.5, 1.2); pokeF(rand(xL, xR), rand(-10, 10)); }

  updateFish(dt);

  const dn = down(), pr = {x:-dn.y, y:dn.x}, up = {x:-dn.x, y:-dn.y};
  updateAmbience(dt, dn, pr);

  // 물 튐: 벽을 타고 빠르게 솟는 곳에서 물방울 발생
  splashCD -= dt;
  if (splashCD <= 0){
    const vth = 230 * Math.sqrt(zoom), cand = [0, 1, NW - 2, NW - 1, (Math.random()*NW) | 0, (Math.random()*NW) | 0];
    for (const i of cand){
      if (eV[i] > vth && eS[i] > 5){
        const n = clamp(Math.round((eV[i] - vth) / 70), 1, 6);
        const s = toScreen(i === 0 ? xL + 2 : i === NW - 1 ? xR - 2 : colX(i), level + hc[i]);
        const inward = i < 3 ? 1 : i > NW - 4 ? -1 : 0;
        for (let q = 0; q < n && drops.length < 80; q++){
          const upv = eV[i] * rand(.35, .95), tv = rand(-70, 70) + inward*rand(20, 110);
          const v = fVec(tv, -upv);
          drops.push({x:s[0], y:s[1], vx:v[0], vy:v[1], r:rand(1, 2.6)*Math.sqrt(zoom), t:0, glassT:Math.random() < .35 ? rand(.08, .45) : 99});
        }
        splashCD = 0.06; break;
      }
    }
  }
  for (let i = drops.length - 1; i >= 0; i--){
    const d = drops[i]; d.t += dt;
    d.vx += dn.x*1600*dt; d.vy += dn.y*1600*dt; d.x += d.vx*dt; d.y += d.vy*dt;
    const out = d.x < 0 || d.x > W || d.y < 0 || d.y > H;
    if ((d.t > d.glassT || out) && depthAt(clamp(d.x, 2, W-2), clamp(d.y, 2, H-2)) < -4){
      if (!out || Math.random() < 0.6) addGlassDrop(clamp(d.x, 2, W-2), clamp(d.y, 2, H-2), d.r*rand(1, 1.6));
      drops.splice(i, 1); continue;
    }
    if (out){ drops.splice(i, 1); continue; }
    if (d.t > 0.05 && depthAt(d.x, d.y) > 0){ poke(d.x, d.y, -30*d.r); drops.splice(i, 1); }
  }
  for (let i = gdrops.length - 1; i >= 0; i--){
    const g = gdrops[i]; g.life -= dt;
    if (g.r > 2.3){
      g.mt -= dt; if (g.mt <= 0){ g.moving = !g.moving; g.mt = g.moving ? rand(.2, .9) : rand(.4, 2.6); }
      if (g.moving){ const s = (g.r - 2.1)*24; g.x += (dn.x*s + pr.x*rand(-6,6))*dt; g.y += (dn.y*s + pr.y*rand(-6,6))*dt; }
    }
    if (g.life <= 0 || depthAt(g.x, g.y) > -g.r || g.x < -5 || g.x > W+5 || g.y < -5 || g.y > H+5) gdrops.splice(i, 1);
  }

  bubbleTimer -= dt;
  if (bubbleTimer < 0){
    bubbleTimer = rand(4, 9);
    const p = toScreen(rand(-.35,.35)*(xR - xL), level + maxDepth - 12);
    const x = clamp(p[0], 10, W - 10), y = clamp(p[1], 10, H - 10), z = rand(.2,.85);
    if (depthAt(x, y) > 10){ const n = 4 + (Math.random()*4 | 0); for (let i = 0; i < n; i++) spawnBubble(x + rand(-4,4), y, z, rand(1.4,3.6)*zoom, i*rand(.12,.3)); }
  }
  for (let i = bubbles.length - 1; i >= 0; i--){
    const b = bubbles[i];
    if (b.delay > 0){ b.delay -= dt; continue; }
    b.age += dt;
    const rise = 28 + b.r*9, wob = Math.sin(b.age*5 + b.ph) * b.r * 5;
    b.x += (up.x*rise + pr.x*wob)*dt; b.y += (up.y*rise + pr.y*wob)*dt;
    if (depthAt(b.x, b.y) < b.r*0.5){ poke(b.x, b.y, -25 - b.r*6); if (Math.random() < .35) bloop(rand(1.1,1.8), 0.018); bubbles.splice(i, 1); continue; }
    if (b.x < -20 || b.x > W+20 || b.y < -20 || b.y > H+20) bubbles.splice(i, 1);
  }
  for (const p of particles){
    p.x += (p.vx + Math.sin(T*0.3 + p.ph)*3 + dn.x*2.5)*dt;
    p.y += (p.vy + Math.cos(T*0.27 + p.ph)*3 + dn.y*2.5)*dt;
    if (!inWater(p.x, p.y, 2)){ const q = pickWaterPoint(4); p.x = q.x; p.y = q.y; }
  }
  const fr = foodR();
  for (let i = foods.length - 1; i >= 0; i--){
    const f = foods[i], dep = depthAt(f.x, f.y);
    if (!f.wet){
      f.vx += dn.x*1400*dt; f.vy += dn.y*1400*dt;
      if (dep > 0){
        f.wet = true; f.float = rand(1, 1.8); f.vx *= 0.1; f.vy *= 0.1;
        poke(f.x, f.y, -150); const p = proj(f.x, f.y, f.z); rings.push({x:p[0], y:p[1], t:0, s:.5}); bloop(1.7, 0.03);
      }
    } else {
      const wob = Math.sin(T*2 + f.ph) * 6 * zoom;
      if (f.float > 0){ f.float -= dt; const w = (2*fr - dep) * 3; f.vx = dn.x*w + pr.x*wob*.4; f.vy = dn.y*w + pr.y*wob*.4; }
      else { const sink = 16*zoom; f.vx = dn.x*sink + pr.x*wob; f.vy = dn.y*sink + pr.y*wob; }
      f.life -= dt;
    }
    f.x = clamp(f.x + f.vx*dt, fr, W - fr); f.y = clamp(f.y + f.vy*dt, fr, H - fr);
    if (f.life <= 0) foods.splice(i, 1);
  }
  for (let i = rings.length - 1; i >= 0; i--){ rings[i].t += dt; if (rings[i].t > 1.2) rings.splice(i, 1); }
  for (let i = hearts.length - 1; i >= 0; i--){ const h = hearts[i]; h.t += dt; h.x += up.x*22*dt; h.y += up.y*22*dt; if (h.t > 1.8) hearts.splice(i, 1); }
  for (let i = zzz.length - 1; i >= 0; i--){ const h = zzz[i]; h.t += dt; h.x += (up.x*14 + pr.x*6)*dt; h.y += (up.y*14 + pr.y*6)*dt; if (h.t > 2.6) zzz.splice(i, 1); }
}
const foodR = () => 2.2*Math.sqrt(zoom) + 0.8;
function addGlassDrop(x, y, r){ if (gdrops.length < 45) gdrops.push({x, y, r:clamp(r, 1, 4.2), life:rand(25, 55), moving:false, mt:rand(.2, 1.5)}); }

/* ================= 물고기 그리기 (2.5D, 몸통 단면 합성) ================= */
const hY = s => 0.215 * Math.pow(Math.sin(PI*(0.06 + 0.9*s)), 0.8) * (1 - 0.3*s) + 0.004;
const tZ = s => hY(s) * 0.92;
const cyS = s => 0.018 * Math.sin(PI*s);
const NS = 26, sxA = new Float32Array(NS), syA = new Float32Array(NS), rxA = new Float32Array(NS), ryA = new Float32Array(NS), bA = new Float32Array(NS);

function renderFish(Lp){
  const S = Math.min(Math.floor(fc.width / DPR), Math.ceil(Lp * 2.6));
  fg.setTransform(1, 0, 0, 1, 0, 0); fg.clearRect(0, 0, Math.ceil(S*DPR) + 2, Math.ceil(S*DPR) + 2);
  fg.setTransform(DPR, 0, 0, DPR, S*DPR/2, S*DPR/2);
  const L = Lp, phi = fish.phi, cph = Math.cos(phi), sph = Math.sin(phi), ph = fish.phase;
  const eff = Math.min(1.2, fish.effort), A = 0.075 * eff, Lb = 0.6;
  fg.save();
  let rot = fish.pitch * cph; if (fish.dizzy > 0) rot += Math.sin(T*9) * 0.18 * Math.min(1, fish.dizzy);
  fg.rotate(rot);
  const act = fish.act, yawnK = act && act.k === 'yawn' ? Math.sin(PI*clamp(act.t/act.d, 0, 1)) : 0;
  const sl = Math.max(fish.sleepy, yawnK*0.65), hp = fish.hic > 0 ? Math.sin(PI*fish.hic/0.3)*0.07 : 0;
  const puff = (1 + 0.12*sph)*(1 + hp); fg.scale(puff*(1 + 0.04*yawnK), puff*(1 - 0.02*yawnK));

  // 척추(좌우로 물결치는 몸) → 화면 투영
  for (let i = 0; i < NS; i++){
    const s = i / (NS - 1), X = (0.5 - s) * Lb, arg = ph - 2.6*s;
    const Z = A * (0.08 + s*s) * Math.sin(arg);
    const dZ = A * (2*s*Math.sin(arg) - 2.6*(0.08 + s*s)*Math.cos(arg));
    const beta = Math.atan2(-dZ, Lb);
    bA[i] = beta;
    sxA[i] = (X*cph - Z*sph) * L; syA[i] = cyS(s) * L;
    ryA[i] = hY(s) * L; rxA[i] = tZ(s) * L * Math.abs(Math.sin(phi + beta));
  }
  for (let i = 0; i < NS; i++){
    const st = Math.max(i > 0 ? Math.abs(sxA[i] - sxA[i-1]) : 0, i < NS-1 ? Math.abs(sxA[i+1] - sxA[i]) : 0);
    rxA[i] = Math.max(rxA[i], st * 0.65, 0.004 * L);
  }
  const outline = [];
  if (Math.abs(cph) > 0.3){
    for (let i = 0; i < NS; i++) outline.push([sxA[i], syA[i] - ryA[i]]);
    for (let i = NS - 1; i >= 0; i--) outline.push([sxA[i], syA[i] + ryA[i]]);
    let ar = 0; for (let i = 0; i < outline.length; i++){ const a = outline[i], b = outline[(i+1) % outline.length]; ar += a[0]*b[1] - b[0]*a[1]; }
    if (ar < 0) outline.reverse();
  }
  const bodyPath = () => {
    fg.beginPath();
    for (let i = 0; i < NS; i++){ fg.moveTo(sxA[i] + rxA[i], syA[i]); fg.ellipse(sxA[i], syA[i], rxA[i], ryA[i], 0, 0, PI*2); }
    if (outline.length){
      const n = outline.length, mid = (a, b) => [(a[0] + b[0])/2, (a[1] + b[1])/2];
      fg.moveTo(...mid(outline[0], outline[1]));
      for (let i = 1; i <= n; i++){ const p = outline[i % n], q2 = outline[(i+1) % n]; fg.quadraticCurveTo(p[0], p[1], ...mid(p, q2)); }
      fg.closePath();
    }
  };
  const at = (arr, s) => { const u = s * (NS - 1), i = Math.min(NS - 2, Math.floor(u)), t = u - i; return arr[i]*(1-t) + arr[i+1]*t; };

  // 가슴지느러미 (양쪽, 깊이에 따라 앞/뒤)
  const pect = [];
  for (const side of [1, -1]){
    const s = 0.3, X = (0.5 - s)*Lb, Zb = side * tZ(s) * 0.85, Y = cyS(s) + 0.35*hY(s);
    const fl = Math.sin(T*(fish.effort < 0.35 ? 7 : 4) + (side > 0 ? 0 : 1.3));
    let fx = -0.8, fz = side*(0.45 + 0.3*fl), fy = 0.3; const nn = Math.hypot(fx, fz, fy); fx /= nn; fz /= nn; fy /= nn;
    const len = 0.15, tX = X + fx*len, tZv = Zb + fz*len;
    pect.push({bx:(X*cph - Zb*sph)*L, by:Y*L, tx:(tX*cph - tZv*sph)*L, ty:(Y + fy*len)*L, depth:X*sph + Zb*cph});
  }
  const drawPect = p => {
    const mx = (p.bx + p.tx)/2, my = (p.by + p.ty)/2, ddx = p.tx - p.bx, ddy = p.ty - p.by, dl = Math.hypot(ddx, ddy) || 1, w = 0.05*L;
    const nx = -ddy/dl*w, ny = ddx/dl*w;
    fg.fillStyle = 'rgba(255,170,110,.72)';
    fg.beginPath(); fg.moveTo(p.bx, p.by); fg.quadraticCurveTo(mx + nx, my + ny, p.tx, p.ty); fg.quadraticCurveTo(mx - nx*0.4, my - ny*0.4, p.bx, p.by); fg.fill();
  };
  for (const p of pect) if (p.depth <= 0) drawPect(p);

  // 꼬리: 금붕어 쌍꼬리. 좌우로 치면서 원근으로 좁아졌다 넓어지고, 정면에서는 나비처럼 벌어짐
  const bl = bA[NS-1], flap = 0.45 * eff * Math.sin(ph - 3.5);
  const tbx = sxA[NS-1], tby = syA[NS-1];
  const curl = Math.sin(ph - 3.4)*0.04, curl2 = Math.sin(ph - 3.9)*0.04;
  for (const splay of [0.34, -0.34]){
    let txs = Math.cos(phi + PI + bl + flap + splay);
    if (Math.abs(txs) < 0.06) txs = 0.06 * (txs < 0 ? -1 : 1);
    const P = (u, v) => [tbx + u*txs*L, tby + v*L];
    const p0 = P(0,-0.05), c1 = P(0.14,-0.13), c2 = P(0.3,-0.37+curl), p1 = P(0.52,-0.37+curl), c3 = P(0.37,-0.17+curl*.5), p2 = P(0.3,0),
          c4 = P(0.37,0.17+curl2*.5), p3 = P(0.52,0.36+curl2), c5 = P(0.3,0.36+curl2), c6 = P(0.14,0.13), p4 = P(0,0.05);
    const tg = fg.createLinearGradient(tbx, 0, tbx + 0.52*txs*L, 0);
    tg.addColorStop(0, 'rgba(255,112,40,.78)'); tg.addColorStop(.55, 'rgba(255,164,100,.5)'); tg.addColorStop(1, 'rgba(255,222,190,.22)');
    fg.fillStyle = tg; fg.beginPath(); fg.moveTo(...p0); fg.bezierCurveTo(...c1, ...c2, ...p1); fg.quadraticCurveTo(...c3, ...p2);
    fg.quadraticCurveTo(...c4, ...p3); fg.bezierCurveTo(...c5, ...c6, ...p4); fg.closePath(); fg.fill();
    fg.strokeStyle = 'rgba(255,236,214,.22)'; fg.lineWidth = Math.max(0.5, L*0.006);
    for (let k2 = -3; k2 <= 3; k2++){ const a0 = P(0.01, k2*0.012), a1 = P(0.22, k2*0.075), a2 = P(0.46, k2*0.115 + (k2 < 0 ? curl : curl2)); fg.beginPath(); fg.moveTo(...a0); fg.quadraticCurveTo(...a1, ...a2); fg.stroke(); }
  }

  // 등·배 지느러미
  const finPoly = (s0, s1, hmax, sign, alpha) => {
    const n = 8, base = [], tip = [];
    for (let i = 0; i <= n; i++){
      const s = s0 + (s1 - s0)*i/n, e = Math.pow(Math.sin(PI*i/n), 0.9);
      const bx = at(sxA, s), by = at(syA, s) + sign*at(ryA, s)*0.88;
      const wv = Math.sin(ph*0.8 - s*6)*0.015*L;
      base.push([bx, by]); tip.push([bx - 0.05*L*cph*e, by + sign*(hmax*e*L) + wv*e]);
    }
    fg.fillStyle = `rgba(255,128,56,${alpha})`;
    fg.beginPath(); fg.moveTo(...base[0]); for (const p of base) fg.lineTo(...p); for (let i = tip.length - 1; i >= 0; i--) fg.lineTo(...tip[i]); fg.closePath(); fg.fill();
  };
  finPoly(0.26, 0.62, 0.19, -1, 0.72);
  finPoly(0.6, 0.8, 0.11, 1, 0.66);
  finPoly(0.3, 0.42, 0.08, 1, 0.6);

  // 몸통
  bodyPath();
  const bg = fg.createLinearGradient(0, -0.22*L, 0, 0.22*L);
  bg.addColorStop(0, '#e8561c'); bg.addColorStop(.35, '#ff8434'); bg.addColorStop(.7, '#ffb867'); bg.addColorStop(1, '#ffe9c4');
  fg.fillStyle = bg; fg.fill();
  fg.save(); bodyPath(); fg.clip();
  const hx = at(sxA, 0.2);
  const hl = fg.createRadialGradient(hx, -0.1*L, 0, hx, -0.1*L, 0.32*L);
  hl.addColorStop(0, 'rgba(255,255,240,.45)'); hl.addColorStop(1, 'rgba(255,255,240,0)');
  fg.fillStyle = hl; fg.fillRect(-L, -L, 2*L, 2*L);
  const side = Math.abs(cph);
  if (side > 0.2){
    fg.strokeStyle = `rgba(255,238,200,${0.2*side})`; fg.lineWidth = Math.max(0.5, L*0.005);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++){
      const s = 0.36 + c*0.09, x = at(sxA, s), y = -0.09*L + r*0.085*L + (c%2)*0.04*L;
      fg.beginPath(); fg.arc(x, y, 0.045*L, cph > 0 ? -1.2 : PI - 1.2, cph > 0 ? 1.2 : PI + 1.2); fg.stroke();
    }
    const gx = at(sxA, 0.28);
    fg.strokeStyle = `rgba(170,60,15,${0.35*side})`; fg.lineWidth = Math.max(0.7, L*0.01);
    fg.beginPath(); fg.moveTo(gx, -0.13*L); fg.quadraticCurveTo(gx - 0.04*L*Math.sign(cph), 0.01*L, gx, 0.15*L); fg.stroke();
  }
  // 볼터치
  for (const sd of [1, -1]){
    const X = 0.1, Z = sd*tZ(0.2)*0.9, vis = 0.3*sph + sd*0.95*cph;
    if (vis <= 0) continue;
    fg.fillStyle = `rgba(255,105,120,${0.4*fish.blush*Math.min(1, vis)})`;
    fg.beginPath(); fg.ellipse((X*cph - Z*sph)*L, (cyS(0.2) + 0.045)*L, 0.048*L*clamp(0.4 + 0.6*vis, 0.3, 1), 0.03*L, 0, 0, PI*2); fg.fill();
  }
  // 눈 (멀리 있는 눈부터)
  const eyes = [];
  for (const sd of [1, -1]){
    const X = 0.19, Z = sd*tZ(0.18)*0.8, vis = 0.55*sph + sd*0.83*cph;
    eyes.push({x:(X*cph - Z*sph)*L, y:(cyS(0.18) - 0.055)*L, vis});
  }
  eyes.sort((a, b) => a.vis - b.vis);
  for (const e of eyes){
    if (e.vis < -0.12) continue;
    const r = 0.078*L, sq = clamp(0.45 + 0.55*e.vis, 0.35, 1);
    fg.fillStyle = '#fffaf2'; fg.beginPath(); fg.ellipse(e.x, e.y, r*sq, r, 0, 0, PI*2); fg.fill();
    fg.strokeStyle = 'rgba(140,50,20,.35)'; fg.lineWidth = Math.max(0.6, L*0.008); fg.stroke();
    if (fish.dizzy > 0){
      fg.strokeStyle = '#1a0c06'; fg.lineWidth = Math.max(0.8, L*0.011); fg.beginPath();
      for (let a = 0; a < 12; a += 0.3){ const rr = r*0.08*a*0.75, aa = a + T*10; const x = e.x + Math.cos(aa)*rr*sq, y = e.y + Math.sin(aa)*rr; a === 0 ? fg.moveTo(x, y) : fg.lineTo(x, y); }
      fg.stroke();
    } else {
      const lookF = fish.mode === 'look' ? 0 : 0.2*cph, px = e.x + lookF*r, py = e.y + 0.04*r;
      fg.fillStyle = '#1a0c06'; fg.beginPath(); fg.ellipse(px, py, 0.7*r*sq, 0.72*r, 0, 0, PI*2); fg.fill();
      fg.fillStyle = '#fff'; fg.beginPath(); fg.arc(px - 0.26*r*sq, py - 0.3*r, 0.25*r, 0, PI*2); fg.fill();
      fg.fillStyle = 'rgba(255,255,255,.9)'; fg.beginPath(); fg.arc(px + 0.22*r*sq, py + 0.26*r, 0.1*r, 0, PI*2); fg.fill();
    }
    if (sl > 0.02){
      fg.save(); fg.beginPath(); fg.ellipse(e.x, e.y, r*sq*1.06, r*1.06, 0, 0, PI*2); fg.clip();
      const lid = e.y - r*1.1 + 2.1*r*sl*0.62;
      fg.fillStyle = '#f27a30'; fg.fillRect(e.x - r*1.2, e.y - r*1.2, r*2.4, lid - (e.y - r*1.2));
      fg.strokeStyle = 'rgba(140,50,20,.55)'; fg.lineWidth = Math.max(0.7, L*0.01);
      fg.beginPath(); fg.moveTo(e.x - r*sq, lid); fg.quadraticCurveTo(e.x, lid + r*0.18*sl, e.x + r*sq, lid); fg.stroke();
      fg.restore();
    }
  }
  fg.restore(); // clip 해제

  // 입
  {
    const mx = 0.3*cph*L + (cph >= 0 ? 0.004 : -0.004)*L, my = (cyS(0) + 0.03)*L;
    const kiss = fish.kiss > 0 ? 1 : 0;
    const open = kiss ? 0.55 + 0.25*Math.sin(T*10) : Math.max(fish.mouth, yawnK*1.9);
    const rx = 0.026*L*(0.35 + 0.65*sph) * (kiss ? 0.85 : 1) * (1 + yawnK*0.9), ry = 0.024*L*(0.35 + 0.8*open);
    fg.fillStyle = 'rgba(115,30,22,.88)'; fg.beginPath(); fg.ellipse(mx, my, Math.max(rx, 0.006*L), ry, 0, 0, PI*2); fg.fill();
    fg.strokeStyle = kiss ? 'rgba(255,140,150,.95)' : 'rgba(255,196,160,.9)'; fg.lineWidth = Math.max(0.7, L*(kiss ? 0.014 : 0.009)); fg.stroke();
  }
  for (const p of pect) if (p.depth > 0) drawPect(p);

  // 깊이 안개
  fg.globalCompositeOperation = 'source-atop';
  fg.fillStyle = rgb(Lt.mid, 0.08); fg.fillRect(-S/2, -S/2, S, S);
  fg.globalCompositeOperation = 'source-over';
  fg.restore();
  return S;
}

/* ================= 로파이 분위기: 창밖 풍경, 비, 스탠드 불빛, 필름 질감, 드문 사건 ================= */
function genBokeh(){
  bokeh.length = 0; stars.length = 0;
  const pal = [[255,178,102],[255,196,130],[255,160,90],[130,170,255],[150,190,255],[255,140,170]], k = MIN / 390;
  for (let i = 0; i < 26; i++){
    const c = pal[Math.random() < 0.62 ? (Math.random()*3) | 0 : 3 + ((Math.random()*3) | 0)];
    bokeh.push({x:rand(-0.05, 1.05)*W, y:H*0.8*Math.pow(Math.random(), 1.5), r:rand(9, 30)*k, c, a:rand(.25, .6), tw:rand(.15, .5), ph:rand(0, 6)});
  }
  for (let i = 0; i < 34; i++) stars.push({x:rand(0, W), y:H*0.5*Math.pow(Math.random(), 1.3), r:rand(.4, 1.1), tw:rand(.2, .7), ph:rand(0, 6)});
}
const grainPats = [];
for (let n = 0; n < 2; n++){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4){ const v = 128 + (Math.random() - 0.5)*200; img.data[i] = img.data[i+1] = img.data[i+2] = v; img.data[i+3] = 255; }
  g.putImageData(img, 0, 0); grainPats.push(ctx.createPattern(c, 'repeat'));
}
const bc1 = document.createElement('canvas'), bx1 = bc1.getContext('2d'), bc2 = document.createElement('canvas'), bx2 = bc2.getContext('2d');
function sizeBloom(){ bc1.width = Math.max(8, Math.ceil(W/3)); bc1.height = Math.max(8, Math.ceil(H/3)); bc2.width = Math.max(4, Math.ceil(W/9)); bc2.height = Math.max(4, Math.ceil(H/9)); }
function season(){ const m = new Date().getMonth() + 1; return m >= 3 && m <= 5 ? 'spring' : m <= 8 && m >= 6 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'; }

function spawnSnail(){
  const dn = down(), dir = Math.random() < 0.5 ? 1 : -1, hx = -dn.y*dir, hy = dn.x*dir;
  const q = pickWaterPoint(40, 0.35); let x = q.x, y = q.y, n = 0;
  while (x > -30 && x < W + 30 && y > -30 && y < H + 30 && n++ < 400){ x -= hx*5; y -= hy*5; }
  snail = {x, y, hx, hy, ang:Math.atan2(dn.x, -dn.y), dir, t:0, trail:[], tl:0, visited:false};
}
function spawnLeaf(){
  for (let i = 0; i < 40; i++){
    const x = rand(0.12, 0.88)*W, y = rand(0, 0.5)*H;
    if (depthAt(x, y) < -40){ leaves.push({x, y, kind:season(), st:'fall', fx:0, drift:rand(-5, 5), ang:0, t:0, life:75, ph:rand(0, 6), a:1, nib:false}); return; }
  }
}
function spawnStar(){
  const dn = down(), pr = {x:-dn.y, y:dn.x};
  for (let i = 0; i < 40; i++){
    const x = rand(0.15, 0.85)*W, y = rand(0.02, 0.4)*H;
    if (depthAt(x, y) < -70){ const sd = Math.random() < 0.5 ? 1 : -1; let vx = pr.x*sd + dn.x*0.45, vy = pr.y*sd + dn.y*0.45; const n = Math.hypot(vx, vy); star = {x, y, vx:vx/n, vy:vy/n, t:0, d:1.5, len:0.42*MIN}; return; }
  }
}
const EVENTS = ['snail', 'leaf', 'star'];
function triggerEvent(kind){
  const nightSky = Lt.city > 0.45 && rainK < 0.3, opts = ['leaf', 'leaf'];
  if (!snail) opts.push('snail', 'snail'); if (nightSky) opts.push('star', 'star');
  const k = kind || opts[(Math.random()*opts.length) | 0];
  if (k === 'snail'){ if (!snail) spawnSnail(); } else if (k === 'star') spawnStar(); else spawnLeaf();
}

function updateAmbience(dt, dn, pr){
  rainK += ((save.rain ? 1 : 0) - rainK) * Math.min(1, dt*0.6);
  lofiK += ((save.lofi ? 1 : 0) - lofiK) * Math.min(1, dt*2);
  // 창에 내리는 비
  if (rainK > 0.02){
    const want = 80*rainK, rate = wdrops.length < want*0.5 ? 40 : 11;
    if (Math.random() < rate*rainK*dt && wdrops.length < 130)
      wdrops.push({x:rand(0, W), y:rand(0, H), r:(Math.random() < 0.65 ? rand(1.2, 2.6) : rand(2.8, 5.4))*(MIN/390), mv:false, mt:rand(.3, 2), life:rand(20, 45), sx:0, sy:0});
    while (streaks.length < 24){ const q = rand(-D, D), b = rand(-D, D); streaks.push({x:CX + dn.x*b + pr.x*q, y:CY + dn.y*b + pr.y*q, l:rand(18, 40), sp:rand(560, 760)}); }
    if (soundOn && rainK > 0.5){ dripT -= dt; if (dripT <= 0){ dripT = rand(0.15, 0.9); drip(); } }
  }
  for (let i = wdrops.length - 1; i >= 0; i--){
    const w = wdrops[i]; w.life -= dt;
    if (w.r > 2.3){
      w.mt -= dt;
      if (w.mt <= 0){ w.mv = !w.mv; w.mt = w.mv ? rand(.3, 1.2) : rand(.5, 2.5); if (w.mv){ w.sx = w.x; w.sy = w.y; } }
      if (w.mv){ const sp = (w.r - 2)*20; w.x += (dn.x*sp + pr.x*rand(-4, 4))*dt; w.y += (dn.y*sp + pr.y*rand(-4, 4))*dt; }
    }
    if (w.life <= 0 || (rainK < 0.05 && Math.random() < dt*0.5) || w.x < -10 || w.x > W + 10 || w.y < -10 || w.y > H + 10) wdrops.splice(i, 1);
  }
  for (const st of streaks){
    st.x += (dn.x + pr.x*0.12)*st.sp*dt; st.y += (dn.y + pr.y*0.12)*st.sp*dt;
    if ((st.x - CX)*dn.x + (st.y - CY)*dn.y > D){ const q = rand(-D, D), b = -D - rand(0, D*0.5); st.x = CX + dn.x*b + pr.x*q; st.y = CY + dn.y*b + pr.y*q; }
  }
  // 드문 사건
  eventT -= dt;
  if (eventT <= 0){ eventT = rand(110, 230); triggerEvent(); }
  if (star){ star.t += dt; if (star.t > star.d) star = null; }
  if (snail){
    const sn = snail, k = MIN/390; sn.t += dt;
    const sp = (6 + 2.2*Math.max(0, Math.sin(sn.t*1.4))) * k;
    sn.x += sn.hx*sp*dt; sn.y += sn.hy*sp*dt; sn.tl += sp*dt;
    if (sn.tl > 6*k){ sn.tl = 0; sn.trail.push({x:sn.x - Math.sin(sn.ang)*6*k - sn.hx*14*k, y:sn.y + Math.cos(sn.ang)*6*k - sn.hy*14*k}); if (sn.trail.length > 70) sn.trail.shift(); }
    if (sn.t > 5 && (sn.x < -60 || sn.x > W + 60 || sn.y < -60 || sn.y > H + 60)) snail = null;
  }
  for (let i = leaves.length - 1; i >= 0; i--){
    const lf = leaves[i]; lf.t += dt;
    if (lf.st === 'fall'){
      const sw = Math.sin(lf.t*1.6 + lf.ph);
      lf.x += (dn.x*38 + pr.x*sw*26)*dt; lf.y += (dn.y*38 + pr.y*sw*26)*dt; lf.ang = psi + sw*0.7;
      if (depthAt(lf.x, lf.y) >= -1){
        lf.st = 'float'; lf.fx = toFrame(lf.x, lf.y)[0]; lf.t = 0;
        poke(lf.x, lf.y, -50); rings.push({x:lf.x, y:lf.y, t:0, s:.35});
        if (lf.kind === 'winter') lf.life = 4;
      }
    } else {
      lf.fx += lf.drift*dt; lf.drift *= Math.exp(-dt*0.05);
      if (lf.fx < xL + 12){ lf.fx = xL + 12; lf.drift = Math.abs(lf.drift); } if (lf.fx > xR - 12){ lf.fx = xR - 12; lf.drift = -Math.abs(lf.drift); }
      lf.life -= dt; const p = toScreen(lf.fx, surfYF(lf.fx) - 1.5); lf.x = p[0]; lf.y = p[1];
      lf.ang = psi + Math.atan((waveAt(lf.fx + 5) - waveAt(lf.fx - 5)) / 10) + Math.sin(lf.t*0.7 + lf.ph)*0.08;
      lf.a = clamp(lf.life / (lf.kind === 'winter' ? 4 : 6), 0, 1);
    }
    if (lf.life <= 0 || lf.x < -40 || lf.x > W + 40 || lf.y < -60 || lf.y > H + 40) leaves.splice(i, 1);
  }
}

function drawBackdrop(dn, pr){
  const airC = Lt.air.map((v, i) => lerp(v, [16, 24, 38][i], rainK*0.5));
  const air = ctx.createLinearGradient(0, 0, W, H);
  air.addColorStop(0, rgb(airC.map(v => v*1.15))); air.addColorStop(1, rgb(airC.map(v => v*0.7)));
  ctx.fillStyle = air; ctx.fillRect(0, 0, W, H);
  if (Lt.win > 0.01){
    const g = ctx.createRadialGradient(W*0.62, -H*0.1, 0, W*0.62, -H*0.1, H*0.9);
    g.addColorStop(0, `rgba(210,232,240,${0.16*Lt.win*(1 - 0.5*rainK)})`); g.addColorStop(1, 'rgba(210,232,240,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  const sky = Lt.city*(1 - rainK);
  if (sky > 0.02) for (const st of stars){ ctx.fillStyle = `rgba(235,240,255,${0.5*sky*(0.55 + 0.45*Math.sin(T*st.tw + st.ph))})`; ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, PI*2); ctx.fill(); }
  if (Lt.city > 0.01){
    ctx.globalCompositeOperation = 'lighter';
    for (const b of bokeh){
      const a = b.a*Lt.city*(0.78 + 0.22*Math.sin(T*b.tw + b.ph))*0.55*(1 - 0.15*rainK), r = b.r*(1 + 0.4*rainK);
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      g.addColorStop(0, rgb(b.c, a)); g.addColorStop(0.55, rgb(b.c, a*0.55)); g.addColorStop(1, rgb(b.c, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, PI*2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  if (star){
    const u = clamp(star.t/star.d, 0, 1), e = 1 - Math.pow(1 - u, 2), a = Math.sin(PI*u);
    const hx = star.x + star.vx*star.len*e, hy = star.y + star.vy*star.len*e, tl = star.len*0.3;
    const g = ctx.createLinearGradient(hx - star.vx*tl, hy - star.vy*tl, hx, hy);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,250,235,${0.85*a})`);
    ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(hx - star.vx*tl, hy - star.vy*tl); ctx.lineTo(hx, hy); ctx.stroke();
    const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 6); hg.addColorStop(0, `rgba(255,255,240,${0.8*a})`); hg.addColorStop(1, 'rgba(255,255,240,0)');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(hx, hy, 6, 0, PI*2); ctx.fill();
  }
  if (rainK > 0.01){
    ctx.strokeStyle = `rgba(200,222,240,${0.14*rainK})`; ctx.lineWidth = 1.1; ctx.lineCap = 'round'; ctx.beginPath();
    for (const st of streaks){ ctx.moveTo(st.x, st.y); ctx.lineTo(st.x - (dn.x + pr.x*0.12)*st.l, st.y - (dn.y + pr.y*0.12)*st.l); }
    ctx.stroke();
  }
  for (const w of wdrops){
    const a = Math.min(1, w.life/3)*(0.4 + 0.6*rainK);
    if (w.mv){ ctx.strokeStyle = `rgba(180,205,225,${0.12*a})`; ctx.lineWidth = w.r*0.8; ctx.beginPath(); ctx.moveTo(w.sx, w.sy); ctx.lineTo(w.x, w.y); ctx.stroke(); }
    ctx.fillStyle = `rgba(0,8,16,${0.3*a})`; ctx.beginPath(); ctx.arc(w.x + dn.x*w.r*0.2, w.y + dn.y*w.r*0.2, w.r, 0, PI*2); ctx.fill();
    ctx.fillStyle = `rgba(170,200,225,${0.28*a})`; ctx.beginPath(); ctx.arc(w.x, w.y, w.r*0.85, 0, PI*2); ctx.fill();
    ctx.fillStyle = `rgba(255,236,210,${(0.35 + 0.35*Lt.city)*a})`; ctx.beginPath(); ctx.arc(w.x + dn.x*w.r*0.35, w.y + dn.y*w.r*0.35, w.r*0.3, 0, PI*2); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.55*a})`; ctx.beginPath(); ctx.arc(w.x - dn.x*w.r*0.4 - dn.y*w.r*0.25, w.y - dn.y*w.r*0.4 + dn.x*w.r*0.25, w.r*0.22, 0, PI*2); ctx.fill();
  }
}
function drawLamp(){
  if (Lt.lamp < 0.01) return;
  const lx = -W*0.08, ly = H*0.2, R = Math.hypot(W, H)*0.75, a = Lt.lamp;
  ctx.globalCompositeOperation = 'screen';
  const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
  g.addColorStop(0, `rgba(255,170,90,${0.36*a})`); g.addColorStop(0.3, `rgba(255,150,80,${0.14*a})`); g.addColorStop(1, 'rgba(255,140,70,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(CX, CY); ctx.rotate(psi);
  const warmLeft = toFrame(lx, ly)[0] < 0;
  const sg = ctx.createLinearGradient(warmLeft ? xL : xR, 0, warmLeft ? xR : xL, 0);
  sg.addColorStop(0, `rgba(255,200,140,${0.6*a})`); sg.addColorStop(0.5, `rgba(255,190,130,${0.15*a})`); sg.addColorStop(1, 'rgba(255,190,130,0)');
  frontLine(0); ctx.strokeStyle = sg; ctx.lineWidth = 2.2; ctx.stroke();
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}
function drawLeaf(lf){
  const k = (MIN/390)*Math.sqrt(zoom)*1.1;
  ctx.save(); ctx.translate(lf.x, lf.y); ctx.rotate(lf.ang); ctx.globalAlpha = lf.a;
  if (lf.st === 'float') ctx.scale(1, 0.4);
  ctx.scale(k, k);
  if (lf.kind === 'winter'){
    ctx.strokeStyle = 'rgba(240,248,255,.92)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = 0; i < 6; i++){ const a = i*PI/3, c = Math.cos(a), s2 = Math.sin(a); ctx.moveTo(0, 0); ctx.lineTo(c*7, s2*7); ctx.moveTo(c*4, s2*4); ctx.lineTo(c*4 + Math.cos(a + 0.8)*2.4, s2*4 + Math.sin(a + 0.8)*2.4); ctx.moveTo(c*4, s2*4); ctx.lineTo(c*4 + Math.cos(a - 0.8)*2.4, s2*4 + Math.sin(a - 0.8)*2.4); }
    ctx.stroke();
  } else {
    const col = lf.kind === 'spring' ? ['#ffd3e0', '#ff9dbb'] : lf.kind === 'summer' ? ['#9fd67e', '#4f9a4a'] : ['#f4a340', '#c8461e'];
    const g = ctx.createLinearGradient(-9, -4, 9, 4); g.addColorStop(0, col[0]); g.addColorStop(1, col[1]); ctx.fillStyle = g;
    ctx.beginPath();
    if (lf.kind === 'spring'){ ctx.moveTo(-8, 0); ctx.bezierCurveTo(-6, -6, 4, -7, 8, -2); ctx.lineTo(6, 0); ctx.lineTo(8, 2); ctx.bezierCurveTo(4, 7, -6, 6, -8, 0); }
    else { ctx.moveTo(-10, 0); ctx.bezierCurveTo(-5, -7.5, 5, -7, 10, 0); ctx.bezierCurveTo(5, 7, -5, 7.5, -10, 0); }
    ctx.fill();
    if (lf.kind !== 'spring'){
      ctx.strokeStyle = 'rgba(90,30,10,.35)'; ctx.lineWidth = 0.8; ctx.beginPath();
      ctx.moveTo(-13, 1); ctx.lineTo(9, 0); ctx.moveTo(-3, 0); ctx.lineTo(1, -3.8); ctx.moveTo(-3, 0); ctx.lineTo(1, 3.8); ctx.moveTo(3, 0); ctx.lineTo(6, -2.6); ctx.moveTo(3, 0); ctx.lineTo(6, 2.6); ctx.stroke();
    }
  }
  ctx.restore();
}
function drawSnail(sn){
  const k = MIN/390*1.3;
  if (sn.trail.length > 1){
    ctx.strokeStyle = 'rgba(220,240,245,.1)'; ctx.lineWidth = 3*k; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(sn.trail[0].x, sn.trail[0].y); for (const p of sn.trail) ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  const wig = Math.sin(sn.t*2.2), cr = 1 + 0.05*Math.max(0, Math.sin(sn.t*1.4));
  ctx.save(); ctx.translate(sn.x, sn.y); ctx.rotate(sn.ang); ctx.scale(k*sn.dir*cr, k);
  ctx.fillStyle = '#ecdcbc';
  ctx.beginPath(); ctx.moveTo(-17, 5); ctx.quadraticCurveTo(-4, 7.5, 12, 5); ctx.quadraticCurveTo(18, 3.5, 17.5, -2); ctx.quadraticCurveTo(16, -8, 10.5, -6.5); ctx.quadraticCurveTo(4, -2, -12, 1); ctx.quadraticCurveTo(-18, 2, -17, 5); ctx.fill();
  ctx.strokeStyle = '#ecdcbc'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(13.5, -5.5); ctx.quadraticCurveTo(15, -10, 16.5 + wig*0.8, -14); ctx.moveTo(11.5, -5.5); ctx.quadraticCurveTo(10.5, -10, 12 + wig*0.6, -13.6); ctx.stroke();
  ctx.fillStyle = '#2a1a10'; ctx.beginPath(); ctx.arc(16.5 + wig*0.8, -14.5, 1.6, 0, PI*2); ctx.arc(12 + wig*0.6, -14, 1.5, 0, PI*2); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(16 + wig*0.8, -15, 0.5, 0, PI*2); ctx.arc(11.5 + wig*0.6, -14.5, 0.5, 0, PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,70,40,.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(15.2, -1.5, 1.4, 0.2, PI - 0.4); ctx.stroke();
  ctx.fillStyle = 'rgba(255,140,140,.45)'; ctx.beginPath(); ctx.ellipse(13, -0.5, 1.6, 1, 0, 0, PI*2); ctx.fill();
  const sg = ctx.createRadialGradient(-5, -11, 1, -3, -7, 11); sg.addColorStop(0, '#e39a5a'); sg.addColorStop(1, '#8a4a22');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(-3, -7, 9.5, 0, PI*2); ctx.fill();
  ctx.strokeStyle = 'rgba(90,40,15,.55)'; ctx.lineWidth = 1.3; ctx.beginPath();
  for (let a = 0; a <= 4*PI; a += 0.15){ const r = 8.2*(1 - a/(4.6*PI)), x = -3 + Math.cos(a + 1)*r, y = -7 + Math.sin(a + 1)*r; a ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,240,220,.35)'; ctx.beginPath(); ctx.ellipse(-6.5, -12, 3, 1.6, -0.5, 0, PI*2); ctx.fill();
  ctx.restore();
}
function lofiPass(){
  if (lofiK < 0.01) return;
  const cg = ctx.createLinearGradient(0, 0, 0, H);
  cg.addColorStop(0, 'rgb(255,190,130)'); cg.addColorStop(1, 'rgb(40,110,125)');
  ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.24*lofiK; ctx.fillStyle = cg; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'saturation'; ctx.globalAlpha = 0.14*lofiK; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  bx1.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, bc1.width, bc1.height);
  bx2.drawImage(bc1, 0, 0, bc1.width, bc1.height, 0, 0, bc2.width, bc2.height);
  ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.15*lofiK; ctx.drawImage(bc2, 0, 0, bc2.width, bc2.height, 0, 0, W, H);
  const gt = (T/3) % 2, gi = Math.floor(gt), gf = gt - gi;
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.09*lofiK*(1 - gf); ctx.fillStyle = grainPats[gi]; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.09*lofiK*gf; ctx.fillStyle = grainPats[1 - gi]; ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
}

/* ================= 그리기 ================= */
const SX = new Float32Array(NW + 2), SY = new Float32Array(NW + 2);
function surfPts(){
  SX[0] = xL; SY[0] = level + hc[0];
  for (let i = 0; i < NW; i++){ SX[i+1] = colX(i); SY[i+1] = level + hc[i]; }
  SX[NW+1] = xR; SY[NW+1] = level + hc[NW-1];
}
function traceSurf(off, first){
  const n = NW + 2;
  first ? ctx.moveTo(SX[0], SY[0] + off) : ctx.lineTo(SX[0], SY[0] + off);
  for (let i = 1; i < n - 1; i++) ctx.quadraticCurveTo(SX[i], SY[i] + off, (SX[i] + SX[i+1])/2, (SY[i] + SY[i+1])/2 + off);
  ctx.lineTo(SX[n-1], SY[n-1] + off);
}
function traceSurfRev(off){
  const n = NW + 2;
  ctx.lineTo(SX[n-1], SY[n-1] + off);
  for (let i = n - 2; i >= 1; i--) ctx.quadraticCurveTo(SX[i], SY[i] + off, (SX[i] + SX[i-1])/2, (SY[i] + SY[i-1])/2 + off);
  ctx.lineTo(SX[0], SY[0] + off);
}
function waterPath(){
  ctx.beginPath(); ctx.moveTo(-D, level + maxDepth + D); ctx.lineTo(-D, SY[0]);
  traceSurf(0, false);
  ctx.lineTo(D, SY[NW+1]); ctx.lineTo(D, level + maxDepth + D); ctx.closePath();
}
function frontLine(off){ ctx.beginPath(); traceSurf(off || 0, true); }
function bandPath(bth){ ctx.beginPath(); traceSurf(0, true); traceSurfRev(bth); ctx.closePath(); }

function drawEntities(list){
  for (const it of list){
    if (it.k === 'p'){
      const p = it.o, [x, y, s] = proj(p.x, p.y, p.z);
      if (p.z < 0.12){
        const r = p.r*zoom*3.2*(1.3 - p.z*4);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(210,245,240,${p.a*0.35})`); g.addColorStop(1, 'rgba(210,245,240,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, PI*2); ctx.fill();
      } else { ctx.fillStyle = `rgba(210,245,240,${p.a*(1.1 - p.z*0.6)})`; ctx.beginPath(); ctx.arc(x, y, Math.max(0.4, p.r*zoom*s), 0, PI*2); ctx.fill(); }
    } else if (it.k === 'b'){
      const b = it.o, [x, y, s] = proj(b.x, b.y, b.z), r = b.r*s;
      ctx.strokeStyle = 'rgba(230,255,255,.55)'; ctx.lineWidth = Math.max(0.6, r*0.22); ctx.fillStyle = 'rgba(230,255,255,.08)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, PI*2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(x - r*0.35, y - r*0.35, r*0.25, 0, PI*2); ctx.fill();
    } else if (it.k === 'f'){
      const f = it.o, [x, y, s] = proj(f.x, f.y, f.z); drawPellet(x, y, foodR()*s);
    } else if (it.k === 'fish'){
      const [px, py, s] = proj(fish.x, fish.y, fish.z), Lp = fishLen()*s, S = renderFish(Lp);
      ctx.save(); ctx.translate(px, py); ctx.rotate(psi); ctx.drawImage(fc, 0, 0, S*DPR, S*DPR, -S/2, -S/2, S, S); ctx.restore();
    }
  }
}
function drawPellet(x, y, r){
  ctx.fillStyle = '#b8652f'; ctx.beginPath(); ctx.arc(x, y, r, 0, PI*2); ctx.fill();
  ctx.fillStyle = 'rgba(255,210,160,.6)'; ctx.beginPath(); ctx.arc(x - r*.3, y - r*.3, r*.35, 0, PI*2); ctx.fill();
}

function draw(){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  surfPts();
  const dn = down(), pr = {x:-dn.y, y:dn.x};
  drawBackdrop(dn, pr);
  const bth = 9 + 5*zoom;
  // 물 (뒤 풍경이 살짝 비침)
  ctx.save();
  ctx.translate(CX, CY); ctx.rotate(psi);
  waterPath();
  const wg = ctx.createLinearGradient(0, level, 0, level + maxDepth);
  wg.addColorStop(0, rgb(Lt.top, 0.86)); wg.addColorStop(.2, rgb(Lt.top.map((v, i) => (v + Lt.mid[i])/2), 0.9)); wg.addColorStop(.6, rgb(Lt.mid, 0.94)); wg.addColorStop(1, rgb(Lt.deep, 0.97));
  ctx.fillStyle = wg; ctx.fill(); ctx.clip();

  // 빛무늬 (흐린 날엔 약하게)
  const CT = T * (REDUCED ? 0.15 : 0.35), MT = T * (REDUCED ? 0.4 : 1);
  const [pa, pb, fr] = causFrame(CT);
  const sc = 1.6*zoom*1.25, tile = CS*sc;
  ctx.globalCompositeOperation = 'lighter';
  const drawPat = (pat, a, s2, dx, dy) => { if (a < 0.005) return; ctx.globalAlpha = a; pat.setTransform(new DOMMatrix([s2, 0, 0, s2, dx, dy])); ctx.fillStyle = pat; ctx.fillRect(-D, level - 40, 2*D, maxDepth + 80); };
  const ca = 0.13*Lt.caus*(1 - 0.5*rainK);
  drawPat(pa, ca*(1 - fr), sc, (MT*3.5) % tile, (MT*2) % tile);
  drawPat(pb, ca*fr, sc, (MT*3.5) % tile, (MT*2) % tile);
  const sc2 = sc*1.35, tile2 = CS*sc2, [pc, pd, fr2] = causFrame(CT + 7.3);
  drawPat(pc, ca*0.7*(1 - fr2), sc2, (-MT*2.5) % tile2, (MT*3) % tile2);
  drawPat(pd, ca*0.7*fr2, sc2, (-MT*2.5) % tile2, (MT*3) % tile2);
  ctx.globalAlpha = 1;
  for (const r of rays){
    const x = r.x*W*0.6 + Math.sin(T*r.sp*0.5 + r.ph)*r.amp*0.6, top = level + waveAt(x) - 2, len = maxDepth*0.9, w = r.w*W, sk = Math.sin(T*0.1 + r.ph)*30;
    const a = r.a*Lt.rays*(1 - 0.6*rainK); if (a < 0.004) continue;
    const g = ctx.createLinearGradient(0, top, 0, top + len);
    g.addColorStop(0, `rgba(210,255,248,${a})`); g.addColorStop(1, 'rgba(210,255,248,0)');
    ctx.fillStyle = g; ctx.beginPath();
    ctx.moveTo(x - w/2, top); ctx.lineTo(x + w/2, top); ctx.lineTo(x + w*0.9 + sk, top + len); ctx.lineTo(x - w*0.9 + sk, top + len); ctx.closePath(); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  const fgd = ctx.createLinearGradient(0, level + maxDepth*0.2, 0, level + maxDepth);
  fgd.addColorStop(0, rgb(Lt.deep, 0)); fgd.addColorStop(1, rgb(Lt.deep, 0.55));
  ctx.fillStyle = fgd; ctx.fillRect(-D, level, 2*D, maxDepth + 40);

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const list = [];
  for (const p of particles) list.push({k:'p', z:p.z, o:p});
  for (const b of bubbles) if (b.delay <= 0) list.push({k:'b', z:b.z, o:b});
  for (const f of foods) if (f.wet) list.push({k:'f', z:f.z, o:f});
  list.push({k:'fish', z:fish.z});
  list.sort((a, b) => b.z - a.z);
  drawEntities(list.filter(i => i.z > 0.5));

  // 수면 밑면 (전반사로 빛나는 얇은 띠)
  ctx.save(); ctx.translate(CX, CY); ctx.rotate(psi);
  bandPath(bth);
  const bgr = ctx.createLinearGradient(0, level - 4, 0, level + bth + 8);
  bgr.addColorStop(0, `rgba(205,250,245,${0.5*Lt.band})`); bgr.addColorStop(1, `rgba(120,210,215,${0.2*Lt.band})`);
  ctx.fillStyle = bgr; ctx.fill();
  ctx.save(); bandPath(bth); ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  drawPat(pa, 0.22*Lt.caus*Lt.band*(1 - 0.5*rainK), sc*0.7, (MT*4) % (CS*sc*0.7), (MT*1) % (CS*sc*0.7));
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  for (const lf of leaves) if (lf.st === 'float' && lf.kind !== 'winter'){
    const y = surfYF(lf.fx) + 3.5, rx = 10*(MIN/390)*Math.sqrt(zoom)*1.1;
    ctx.fillStyle = `rgba(20,40,40,${0.28*lf.a})`; ctx.beginPath(); ctx.ellipse(lf.fx, y, rx, 2.4, 0, 0, PI*2); ctx.fill();
  }
  {
    const Lp = fishLen(), ff = toFrame(fish.x, fish.y);
    const by = surfYF(ff[0]) + bth, dist = ff[1] - by;
    const a = 0.45*clamp(1 - dist/(1.3*Lp), 0, 1)*Lt.band;
    if (a > 0.01){
      const S = renderFish(Lp);
      ctx.globalAlpha = a; ctx.translate(ff[0], by - dist*0.55); ctx.scale(1, -0.55);
      ctx.drawImage(fc, 0, 0, S*DPR, S*DPR, -S/2, -S/2, S, S); ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  frontLine(bth); ctx.strokeStyle = `rgba(200,250,245,${0.22*Lt.band})`; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();

  drawEntities(list.filter(i => i.z <= 0.5));
  for (const r of rings){
    const a = 1 - r.t/1.2; ctx.strokeStyle = `rgba(220,255,250,${a*.45})`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(r.x, r.y, (6 + r.t*90*r.s)*Math.sqrt(zoom), 0, PI*2); ctx.stroke();
  }
  // 시간대 색조 (물속만: 창밖 불빛은 그대로 밝게)
  if (Lt.mul[0] < 250 || Lt.mul[1] < 250 || Lt.mul[2] < 250){
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = rgb(Lt.mul); ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();

  // 수면선
  const nk = 0.45 + 0.55*Lt.band;
  ctx.save(); ctx.translate(CX, CY); ctx.rotate(psi);
  frontLine(-1); ctx.strokeStyle = `rgba(170,240,235,${0.14*nk})`; ctx.lineWidth = 7; ctx.stroke();
  frontLine(0); ctx.strokeStyle = `rgba(230,255,252,${0.7*nk})`; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.restore();

  for (const lf of leaves) drawLeaf(lf);
  if (snail) drawSnail(snail);
  for (const d of drops){
    ctx.strokeStyle = 'rgba(225,255,252,.8)'; ctx.lineWidth = d.r; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.vx*0.018, d.y - d.vy*0.018); ctx.stroke();
  }
  for (const f of foods) if (!f.wet){ const [x, y, s] = proj(f.x, f.y, f.z); drawPellet(x, y, foodR()*s); }

  drawLamp();

  for (const g of gdrops){
    const a = Math.min(1, g.life/4), r = g.r, ux = -dn.x, uy = -dn.y;
    ctx.fillStyle = `rgba(0,12,22,${0.28*a})`; ctx.beginPath(); ctx.arc(g.x + ux*r*0.18, g.y + uy*r*0.18, r, 0, PI*2); ctx.fill();
    ctx.fillStyle = `rgba(200,240,240,${0.2*a})`; ctx.beginPath(); ctx.arc(g.x, g.y, r*0.9, 0, PI*2); ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.85*a})`; ctx.beginPath(); ctx.arc(g.x + ux*r*0.35 - dn.y*r*0.3, g.y + uy*r*0.35 + dn.x*r*0.3, r*0.28, 0, PI*2); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.3*a})`; ctx.lineWidth = Math.max(0.5, r*0.25);
    ctx.beginPath(); ctx.arc(g.x, g.y, r*0.62, Math.atan2(dn.y, dn.x) - 0.8, Math.atan2(dn.y, dn.x) + 0.8); ctx.stroke();
  }

  ctx.textAlign = 'center';
  ctx.font = `${Math.round(14 + 8*zoom)}px sans-serif`;
  for (const h of hearts){ const a = h.t < .2 ? h.t/.2 : 1 - (h.t - .2)/1.6; ctx.fillStyle = `rgba(255,150,170,${Math.max(0, a)})`; ctx.fillText('♥', h.x, h.y); }
  for (const h of zzz){ const a = h.t < .3 ? h.t/.3 : 1 - (h.t - .3)/2.3; ctx.font = `italic ${Math.round((9 + h.t*5)*Math.sqrt(zoom))}px sans-serif`; ctx.fillStyle = `rgba(210,230,255,${Math.max(0, a)*0.8})`; ctx.fillText('z', h.x, h.y); }

  const gl = ctx.createLinearGradient(0, 0, W*0.6, H*0.5);
  gl.addColorStop(0, 'rgba(255,255,255,.06)'); gl.addColorStop(.35, 'rgba(255,255,255,.015)'); gl.addColorStop(.5, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl; ctx.fillRect(0, 0, W, H);
  lofiPass();
  ctx.fillStyle = vign; ctx.fillRect(0, 0, W, H);
}

/* ================= 루프 ================= */
let metaTimer = 0, saveTimer = 0, causT = 0;
function loop(now){
  requestAnimationFrame(loop);
  const raw = (now - last)/1000;
  if (!save.smooth && raw < 1/30 - 0.004) return;   // 절전: 초당 30장
  const dt = clamp(raw, 0, 0.05); last = now; T += dt;
  update(dt); draw();
  if (caus.length < CN){ causT += dt; if (causT > 0.05){ causT = 0; caus.push(genCaustic(0.6 + caus.length*0.2)); } }
  metaTimer -= dt; if (metaTimer < 0){ metaTimer = 1; updateMeta(); }
  saveTimer -= dt; if (saveTimer < 0){ saveTimer = 3; if (dirty) persist(); }
}

/* ================= 센서 ================= */
function orientAngle(){ return (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (window.orientation || 0); }
const sens = {
  perm:'none', ori:0, mot:0, flip:0, votes:0, lastMotG:-9, lastOri:-9, oriX:0, oriY:1, lastRR:0,
  inFrame:(() => { try { return window.self !== window.top; } catch(e){ return true; } })(),
  isIOS:/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
};
function toScreenVec(x, y){ const a = -orientAngle()*PI/180, c = Math.cos(a), s = Math.sin(a); return [x*c - y*s, x*s + y*c]; }
function setGravity(sx, sy){
  hasSensor = true;
  gxS += (sx - gxS)*0.25; gyS += (sy - gyS)*0.25;
  if (Math.hypot(gxS, gyS) > 0.18) psiT = Math.atan2(gyS, gxS) - PI/2;
}
function onOri(e){
  if (e.beta == null || e.gamma == null) return;
  sens.ori++; sens.lastOri = T;
  const b = e.beta*PI/180, g = e.gamma*PI/180;
  const [sx, sy] = toScreenVec(Math.cos(b)*Math.sin(g), Math.sin(b));
  sens.oriX = sx; sens.oriY = sy;
  if (T - sens.lastMotG > 0.5) setGravity(sx, sy);
}
function onMotion(e){
  const g = e.accelerationIncludingGravity;
  if (g && g.x != null && g.y != null){
    sens.mot++;
    let [sx, sy] = toScreenVec(-g.x/9.81, g.y/9.81);
    if (!sens.flip){
      if (T - sens.lastOri < 0.3 && Math.hypot(sens.oriX, sens.oriY) > 0.3 && Math.hypot(sx, sy) > 0.3){
        sens.votes += (sx*sens.oriX + sy*sens.oriY) > 0 ? 1 : -1;
        if (Math.abs(sens.votes) >= 8) sens.flip = sens.votes > 0 ? 1 : -1;
      } else if (sens.mot > 40 && sens.ori === 0) sens.flip = sens.isIOS ? -1 : 1;
    }
    if (sens.flip){ sx *= sens.flip; sy *= sens.flip; sens.lastMotG = T; setGravity(sx, sy); }
  }
  const a = e.acceleration; if (!a || a.x == null) return;
  const m = Math.hypot(a.x, a.y, a.z || 0);
  if (m > 14 && T - lastShake > 0.9){ lastShake = T; shake(m > 22); }
  const [lx] = toScreenVec(a.x, -a.y);
  psiV += clamp(lx, -12, 12) * 0.01;
}
/* ================= 입력 ================= */
let pd = null;
cv.addEventListener('pointerdown', e => { pd = {x:e.clientX, y:e.clientY, lx:e.clientX, moved:false}; try { cv.setPointerCapture(e.pointerId); } catch(_){} });
cv.addEventListener('pointermove', e => {
  if (!pd) return;
  if (!pd.moved && Math.hypot(e.clientX - pd.x, e.clientY - pd.y) > 12) pd.moved = true;
  if (pd.moved && !hasSensor) psiT -= (e.clientX - pd.lx)*0.006;
  pd.lx = e.clientX;
});
cv.addEventListener('pointerup', e => { if (pd && !pd.moved) tap(e.clientX, e.clientY); pd = null; showUI(); });
cv.addEventListener('pointercancel', () => { pd = null; });
function tap(x, y){
  if (!started) return;
  if (!panel.hidden){ openPanel(false); return; }
  if (depthAt(x, y) < 0){ dropFood(x, y, 1 + (Math.random()*2 | 0)); return; }
  rings.push({x, y, t:0, s:1}); bloop(1, 0.02);
  const l = fishLen();
  if (fish.mode === 'sleep' || fish.sleepy > 0.3) fish.awakeT = 25;
  if (fish.mode === 'look'){ addHeart(); fish.kiss = 1.2; fish.timer = Math.max(fish.timer, 2); save.aff = Math.min(1, save.aff + 0.01); dirty = true; return; }
  const w = unproj(x, y);
  if (inWater(w[0], w[1], l*0.25)){ setTarget(w[0], w[1], 0.5); fish.mode = 'call'; fish.timer = 8; }
}
window.addEventListener('keydown', e => {
  if (e.target && (e.target.id === 'fname' || e.target.id === 'fill')) return;
  if (e.key === 'ArrowUp'){ setFill(save.fill*100 + 5); return; }
  if (e.key === 'ArrowDown'){ setFill(save.fill*100 - 5); return; }
  if (e.key === 'ArrowLeft') psiT += 0.25;
  else if (e.key === 'ArrowRight') psiT -= 0.25;
  else if (e.key === 's' || e.key === 'S') shake(true);
  else if (e.key === 'f' || e.key === 'F') feed();
  else if (e.key === 't' || e.key === 'T') cycleTod();
  else if (e.key === 'r' || e.key === 'R') setMood('rain', save.rain ? 0 : 1);
  else if (e.key === 'l' || e.key === 'L') setMood('lofi', save.lofi ? 0 : 1);
  else if (e.key === 'e' || e.key === 'E'){ triggerEvent(EVENTS[eventIdx % 3]); eventIdx++; }
});

/* ================= UI ================= */
const ui = document.getElementById('ui'), hint = document.getElementById('hint');
let uiTimer = 0;
function showUI(){
  ui.classList.remove('idle'); clearTimeout(uiTimer);
  uiTimer = setTimeout(function idle(){ if (document.activeElement.id === 'fname' || !panel.hidden){ uiTimer = setTimeout(idle, 3000); return; } ui.classList.add('idle'); }, 6000);
}
function say(text, ms){ hint.textContent = text; hint.classList.remove('off'); clearTimeout(say.t); say.t = setTimeout(() => hint.classList.add('off'), ms); }
// 받침에 따라 조사 고르기: josa('뽀글이', '이', '가')
function josa(word, a, b){
  const c = word.charCodeAt(word.length - 1);
  if (c >= 0xAC00 && c <= 0xD7A3) return word + ((c - 0xAC00) % 28 ? a : b);
  return word + b;
}

const segBtns = [...document.querySelectorAll('.seg button')];
function setZoom(i){ zoomT = ZOOMS[i]; segBtns.forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-pressed', k === i); }); save.zoom = i; dirty = true; }
segBtns.forEach((b, i) => b.addEventListener('click', () => { setZoom(i); showUI(); }));
setZoom(clamp(save.zoom | 0, 0, 2)); zoom = zoomT;

document.getElementById('feed').addEventListener('click', () => { feed(); showUI(); });
const sndBtn = document.getElementById('snd'), sndWave = document.getElementById('wave');
sndBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  try { if (!AC) initAudio(); AC.resume(); master.gain.setTargetAtTime(soundOn ? 0.9 : 0, AC.currentTime, 0.4); } catch(e){ soundOn = false; }
  sndBtn.setAttribute('aria-pressed', soundOn); sndBtn.setAttribute('aria-label', soundOn ? '물소리 끄기' : '물소리 켜기');
  sndWave.setAttribute('opacity', soundOn ? '1' : '.3');
  showUI();
});
const ICONS = {
  rain:'<path d="M4.5 9.5a3 3 0 0 1 .4-6 4 4 0 0 1 7.4 1.4A2.4 2.4 0 0 1 12 9.5z" fill="currentColor"/><path d="M5.5 11.5l-.8 2M8.5 11.5l-.8 2M11.5 11.5l-.8 2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
  sun:'<circle cx="8" cy="8" r="3.2" fill="currentColor"/><g stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M8 1.2v1.6M8 13.2v1.6M1.2 8h1.6M13.2 8h1.6M3.2 3.2l1.1 1.1M11.7 11.7l1.1 1.1M3.2 12.8l1.1-1.1M11.7 4.3l1.1-1.1"/></g>',
  moon:'<path d="M11.8 10.6A5.2 5.2 0 0 1 5.4 4.2a5.2 5.2 0 1 0 6.4 6.4z" fill="currentColor"/>',
  horizon:'<path d="M3.5 10.5a4.5 4.5 0 0 1 9 0z" fill="currentColor"/><path d="M1.5 12.5h13" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><path d="M8 2.5v2M3.4 4.6l1.2 1.2M12.6 4.6l-1.2 1.2" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'
};
const moodBtn = document.getElementById('mood'), panel = document.getElementById('panel'), moodIcon = document.getElementById('moodIcon');
let moodKey = '';
function updateMood(){
  const ph = phaseName(effHour()), k = save.rain ? 'rain' : (ph === '밤' || ph === '저녁') ? 'moon' : ph === '낮' ? 'sun' : 'horizon';
  if (k !== moodKey){ moodKey = k; moodIcon.innerHTML = ICONS[k]; }
}
function refreshPanel(){
  fillIn.value = Math.round(save.fill*100); fillVal.textContent = Math.round(save.fill*100) + '%';
  panel.querySelectorAll('.pseg').forEach(g => {
    const k = g.dataset.k, v = save[k];
    g.querySelectorAll('button').forEach(b => { const on = +b.dataset.v === +v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
  });
  refreshInstall();
}
const fillIn = document.getElementById('fill'), fillVal = document.getElementById('fillVal');
function setFill(p){
  p = clamp(Math.round(p), FILL_MIN*100, FILL_MAX*100);
  save.fill = p / 100; dirty = true; fillIn.value = p; fillVal.textContent = p + '%';
}
fillIn.addEventListener('input', () => { setFill(+fillIn.value); showUI(); });
function openPanel(o){ panel.hidden = !o; moodBtn.setAttribute('aria-expanded', o); if (o) refreshPanel(); }
function setMood(k, v){
  if (k === 'tod'){ save.tod = v; if (!isNight()) fish.awakeT = 0; }
  else if (k === 'rain'){ save.rain = v; setRainAudio(); }
  else if (k === 'lofi') save.lofi = v;
  else if (k === 'smooth') save.smooth = v;
  else return;
  dirty = true; refreshPanel(); updateMood();
}
function cycleTod(){ setMood('tod', (save.tod + 1) % TOD_NAMES.length); }
moodBtn.addEventListener('click', () => { openPanel(panel.hidden); showUI(); });
panel.addEventListener('click', e => { const b = e.target.closest('.pseg button'); if (!b) return; setMood(b.parentElement.dataset.k, +b.dataset.v); showUI(); });

/* ---- 설치 (PWA) ---- */
const installBtn = document.getElementById('install'), installNote = document.getElementById('installNote');
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; refreshInstall(); });
window.addEventListener('appinstalled', () => { installEvt = null; refreshInstall(); say('홈 화면에 어항이 생겼습니다.', 4000); });
function refreshInstall(){
  const row = document.getElementById('installRow');
  if (standalone()){ row.hidden = true; return; }
  if (installEvt){ row.hidden = false; installBtn.hidden = false; installNote.hidden = true; return; }
  if (sens.isIOS){ row.hidden = false; installBtn.hidden = true; installNote.hidden = false; return; }
  row.hidden = true;
}
installBtn.addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt();
  try { await installEvt.userChoice; } catch(e){}
  installEvt = null; refreshInstall();
});

/* ---- 새 물고기 ---- */
document.getElementById('reset').addEventListener('click', () => {
  if (!confirm(`${josa(save.name, '을', '를')} 떠나보내고 새 물고기를 들일까요?\n함께한 날과 친밀도가 처음으로 돌아갑니다.`)) return;
  try { localStorage.removeItem(KEY); } catch(e){}
  location.reload();
});

/* ---- 이름 ---- */
const fname = document.getElementById('fname');
fname.textContent = save.name;
fname.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); fname.blur(); } });
fname.addEventListener('paste', e => {
  e.preventDefault();
  const t = (e.clipboardData || window.clipboardData).getData('text').replace(/\s+/g, ' ').trim().slice(0, 10);
  document.execCommand('insertText', false, t);
});
fname.addEventListener('blur', () => { const v = fname.textContent.replace(/\s+/g, ' ').trim().slice(0, 10) || '뽀글이'; fname.textContent = v; save.name = v; persist(); showUI(); });

const fday = document.getElementById('fday'), fheart = document.getElementById('fheart');
function updateMeta(){
  save.days = Math.max(1, dayNum(new Date()) - save.born + 1);
  fday.textContent = `함께한 지 ${save.days}일째`;
  const n = Math.round(save.aff * 5);
  fheart.textContent = '♥'.repeat(n) + '♡'.repeat(5 - n);
  fheart.setAttribute('aria-label', `친밀도 5칸 중 ${n}칸`);
  updateMood();
}

/* ---- 화면 켜짐 유지, 저장 ---- */
let wakeLock = null;
async function wake(){ try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch(e){} }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && started) wake(); if (document.visibilityState === 'hidden' && dirty) persist(); });
window.addEventListener('pagehide', () => { if (dirty) persist(); });

/* ---- 시작 ---- */
if (!isNewFish){
  document.getElementById('startMsg').innerHTML = `${josa(save.name, '이', '가')} 기다리고 있었습니다.<br>함께한 지 ${save.days}일째입니다.`;
  document.getElementById('go').textContent = '어항 보러 가기';
}
document.getElementById('go').addEventListener('click', async () => {
  const hasDO = typeof DeviceOrientationEvent !== 'undefined', hasDM = typeof DeviceMotionEvent !== 'undefined';
  if (!hasDO && !hasDM) sens.perm = 'unsupported';
  else if (hasDO && typeof DeviceOrientationEvent.requestPermission === 'function'){
    try { const r = await DeviceOrientationEvent.requestPermission(); sens.perm = r === 'granted' ? 'granted' : 'denied'; }
    catch(e){ sens.perm = 'error'; }
    try { if (hasDM && typeof DeviceMotionEvent.requestPermission === 'function') await DeviceMotionEvent.requestPermission(); } catch(e){}
  } else sens.perm = 'granted';
  window.addEventListener('deviceorientation', onOri);
  window.addEventListener('devicemotion', onMotion);
  started = true;
  document.getElementById('start').classList.add('gone');
  wake(); showUI();
  if (isNewFish){
    say('폰을 기울이면 물이 출렁입니다. 물 위를 톡 치면 먹이, 물속을 톡 치면 다가옵니다.', 7000);
    setTimeout(() => say('오른쪽 위 분위기 버튼에서 비를 내리거나 시간대를 바꿀 수 있습니다. 이름을 눌러 바꿀 수도 있습니다.', 7000), 12500);
  }
  setTimeout(() => {
    if (hasSensor) return;
    const fine = matchMedia('(pointer: fine)').matches;
    if (sens.perm === 'denied') say('기울기 권한이 꺼져 있어 화면을 좌우로 끌어 기울입니다. 어항을 다시 열면 권한을 다시 물어봅니다.', 9000);
    else say(fine
      ? '기울기 센서가 없어 좌우로 끌어 기울입니다. 키보드: ←→ 기울기, ↑↓ 물 높이, F 먹이, S 흔들기, R 비, T 시간대.'
      : '기울기 신호가 없어 대신 화면을 좌우로 끌면 기울어집니다.', 9000);
  }, 3000);
});

/* ================= 시작 ================= */
window.addEventListener('resize', resize);
rainK = save.rain ? 1 : 0; lofiK = save.lofi ? 1 : 0; fillCur = save.fill;
resize(); finishWaves();
{ const p = pickWaterPoint(fishLen()*0.6); fish.x = p.x; fish.y = p.y; wanderTarget(); }
for (let i = 0; i < 55; i++){ const p = pickWaterPoint(4); particles.push({x:p.x, y:p.y, z:rand(.55,1), r:rand(.5,1.4), a:rand(.1,.35), vx:rand(-3,3), vy:rand(-3,3), ph:rand(0,6)}); }
updateMeta(); refreshInstall();
requestAnimationFrame(t => { last = t; loop(t); });

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost'))
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
})();
