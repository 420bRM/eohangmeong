// 어항멍 v2: 물리, 생물, 돌봄, 화면
import {SPECIES, SPECIES_ORDER, DECOR, DECOR_ORDER, FLOORS, FLOOR_ORDER, BACKGROUNDS, BG_ORDER, ITEMS, ITEM_ORDER, REWARD, ACHIEVEMENTS, NAMES, FIRST_NAME, LIMITS} from './data.js?v=2.0.1';
import {drawCritter, drawDecor, decorSize, drawFloor, drawThumb} from './critters.js?v=2.0.1';
import {createMusic, MUSIC_KINDS} from './music.js?v=2.0.1';

const VERSION = '2.0.1';
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const PI = Math.PI;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const rand = (a, b) => a + Math.random() * (b - a);
const lerp = (a, b, t) => a + (b - a) * t;
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const rgb = (c, a) => a == null ? `rgb(${c[0]|0},${c[1]|0},${c[2]|0})` : `rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
const pick = arr => arr[(Math.random() * arr.length) | 0];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmt = n => Math.round(n).toLocaleString('ko-KR');
// 같은 씨앗이면 같은 값을 내는 난수
function rng(seed){ let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const strSeed = s => { let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// 받침에 따라 조사 고르기: josa('뽀글이', '이', '가')
function josa(word, a, b){
  const c = word.charCodeAt(word.length - 1);
  if (c >= 0xAC00 && c <= 0xD7A3) return word + ((c - 0xAC00) % 28 ? a : b);
  return word + b;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'})[c]);

/* ================= 설정 ================= */
const FILL_MIN = 0.5, FILL_MAX = 0.9;   // 물 높이 범위 (50% 아래로는 내려가지 않음)
let fillCur = 0.68;
const NW = 56;              // 수면 격자 수
const ZOOMS = [0.55, 1, 1.85], ZOOM_MIN = 0.45, ZOOM_MAX = 2.2;

let W = 0, H = 0, DPR = 1, CX = 0, CY = 0, D = 0, MIN = 1, ZP = 1, vign = null, SK = 1;
let psi = 0, psiV = 0, psiT = 0, level = 0, maxDepth = 1, xL = -100, xR = 100;
const eS = new Float32Array(NW), uS = new Float32Array(NW + 1), eOld = new Float32Array(NW), eV = new Float32Array(NW);
const rh = new Float32Array(NW), rv = new Float32Array(NW), hc = new Float32Array(NW), tmp = new Float32Array(NW + 1);
let zoom = 1, zoomT = 1, T = 0, last = performance.now();
let hasSensor = false, gxS = 0, gyS = 1, lastShake = -9, started = false;

let creatures = [];          // 지금 어항의 생물 (움직임 상태 + 저장 데이터 d)
let sel = null;              // 고른 생물 (이름표에 보임)
let decos = [];              // 지금 어항의 장식 (저장 데이터 d + 마리모 굴림 상태)
let floorH = 0;              // 바닥 띠 높이 (px)
let tank = null;             // 지금 보는 어항 (저장 데이터)
let editMode = false;        // 꾸미기: 장식 옮기기
const bubbles = [], particles = [], foods = [], rings = [], hearts = [], zzz = [], drops = [], gdrops = [], pops = [];
let bubbleTimer = 2, rippleTimer = 0, splashCD = 0, flowK = 0;
const wdrops = [], streaks = [], bokeh = [], stars = [], leaves = [], flies = [];
let snail = null, star = null, eventT = 40, eventIdx = 0, rainK = 0, dripT = 0;

/* ================= 저장 ================= */
const KEY = 'eohangmeong.v2', OLD_KEY = 'eohangmeong.v1';   // 1.x 저장본은 옮길 때만 읽음
const DAY_MS = 86400000, HOUR_MS = 3600000;
const dayNum = d => Math.floor((d.getTime() - d.getTimezoneOffset()*60000) / DAY_MS);   // 현지 날짜 기준 일련번호
const todayN = () => dayNum(new Date());
const MW = 18, MH = 32;      // 유리 이끼 격자
const FULL_HOURS = 30;       // 포만도가 1에서 0이 되는 시간
const MOSS_DAY = 0.32;       // 하루에 끼는 이끼 양 (평균)
let mossA = new Float32Array(MW*MH), mossDirty = true;

function newCreature(sp, name, extra){
  const S = SPECIES[sp];
  return Object.assign({id:uid(), sp, name, growth:0.3, aff:0, born:todayN(), variant:(Math.random()*(S.variants || (S.colors ? S.colors.length : 1))) | 0}, extra || {});
}
function newTank(name){
  return {id:uid(), name, bg:'city', floor:'sand', decor:[], creatures:[], sel:null, full:0.7, moss:'', seen:Date.now()};
}
function defaults(){
  return {
    v:2, pearls:0, born:todayN(), streak:0,
    tanks:[newTank('첫 번째 어항')], cur:0,
    inv:{}, owned:{bg:['city'], floor:['none', 'sand'], items:[]},
    dex:{}, ach:{}, stats:{eaten:0, cleans:0, babies:0},
    daily:{dn:0, visit:false, clean:false, feed:false, from:null},
    set:{zoom:1, tod:0, rain:0, fill:0.68, smooth:1, music:'off', orient:'portrait', awake:1},
    queue:[], intro:false
  };
}
let G = defaults(), dirty = false, isNew = true, resetting = false;
function persist(){
  if (resetting) return;
  if (tank) { tank.moss = packMoss(); tank.seen = Date.now(); }
  try { localStorage.setItem(KEY, JSON.stringify(G)); } catch(e){}
  dirty = false;
}
// 1.x 저장본(물고기 한 마리)을 새 구조로 옮김
function migrate(o){
  if (o && o.v === 2) return sanitize(o);
  const g = defaults();
  if (!o) return g;
  const tn = todayN();
  g.born = o.born || tn - Math.max(0, (o.days | 0) - 1);
  const f = newCreature('goldfish', String(o.name || FIRST_NAME).slice(0, 10), {growth:Math.max(0.35, +o.growth || 0), aff:+o.aff || 0, born:g.born, variant:0});
  g.tanks[0].creatures.push(f); g.tanks[0].sel = f.id;
  g.dex.goldfish = 1;
  for (const k of ['zoom', 'tod', 'rain', 'fill', 'smooth']) if (o[k] != null) g.set[k] = o[k];
  g.set.zoom = [0.55, 1, 1.85][o.zoom | 0] || 1;
  g.daily.dn = o.lastDay ? tn : 0;
  g.queue.push({t:'2.0 업데이트 선물', d:'친구를 들이고 어항을 꾸밀 수 있게 되었습니다.', p:REWARD.welcome + Math.min(1000, ((o.days | 0) * 20))});
  g.intro = false;
  return g;
}

/* ---- 하루가 바뀔 때 ---- */
function rollDay(){
  const tn = todayN(), prev = G.daily.dn;
  if (prev && tn <= prev) return false;   // 같은 날이거나 시계가 뒤로 감
  if (G.born > tn) G.born = tn;
  const gap = prev ? tn - prev : 0;
  G.streak = gap === 1 ? G.streak + 1 : 1;
  G.daily = {dn:tn, visit:false, clean:false, feed:false, from:null};
  if (prev){
    const days = clamp(gap, 1, 3);
    for (const t of G.tanks){
      for (const c of t.creatures) c.growth = Math.min(1, c.growth + 0.03*days);
      breed(t);
    }
  }
  dirty = true;
  return true;
}
// 번식: 다 자란 같은 종이 둘 이상이고 어항이 깨끗하고 배부르면 가끔 새끼가 태어남
function breed(t){
  if (t.creatures.length >= LIMITS.creatures) return;
  if (t.full < 0.35 || mossMeanPacked(t.moss) > 0.45) return;
  const by = {};
  for (const c of t.creatures) if (c.growth >= 0.6) (by[c.sp] = by[c.sp] || []).push(c);
  for (const sp in by){
    if (by[sp].length < 2 || Math.random() > 0.3 || t.creatures.length >= LIMITS.creatures) continue;
    const mom = by[sp][0];
    const baby = newCreature(sp, freeName(), {growth:0.05, variant:Math.random() < 0.7 ? mom.variant : (Math.random()*3) | 0, baby:1});
    t.creatures.push(baby); G.stats.babies++;
    G.queue.push({t:'새끼가 태어났습니다', d:`${t.name}에 ${SPECIES[sp].name} 새끼 ${josa(baby.name, '이', '가')} 태어났습니다.`, p:50});
    break;
  }
}
function freeName(){
  const used = new Set(); for (const t of G.tanks) for (const c of t.creatures) used.add(c.name);
  const free = NAMES.filter(n => !used.has(n));
  return free.length ? pick(free) : pick(NAMES) + (2 + (Math.random()*98 | 0));
}

/* ---- 자리를 비운 동안 ---- */
function catchUp(t, now){
  const h = Math.max(0, (now - (t.seen || now)) / HOUR_MS);
  t.seen = now;
  if (h <= 0) return;
  const floor = G.owned.items.includes('feeder') ? 0.5 : 0;
  t.full = clamp(Math.max(t.full - h / FULL_HOURS, floor), 0, 1);
  const a = unpackMoss(t.moss), rate = mossRates(t), k = mossSlow(t);
  for (let i = 0; i < a.length; i++) a[i] = Math.min(1, a[i] + rate[i] * MOSS_DAY / 24 * h * k);
  t.moss = packMoss(a);
}

/* ---- 이끼 격자 ---- */
function unpackMoss(s){
  const a = new Float32Array(MW*MH);
  if (s){ try { const b = atob(s); for (let i = 0; i < a.length && i < b.length; i++) a[i] = b.charCodeAt(i) / 255; } catch(e){} }
  return a;
}
function packMoss(a){
  a = a || mossA;
  let s = ''; for (let i = 0; i < a.length; i++) s += String.fromCharCode(Math.round(clamp(a[i], 0, 1) * 255));
  return btoa(s);
}
function mossMeanPacked(s){ const a = unpackMoss(s); let m = 0; for (const v of a) m += v; return m / a.length; }
// 칸마다 이끼가 끼는 빠르기 (가장자리와 몇몇 얼룩에서 빨리 낌)
const rateCache = {};
function mossRates(t){
  if (rateCache[t.id]) return rateCache[t.id];
  const r = rng(strSeed(t.id)), a = new Float32Array(MW*MH), blobs = [];
  for (let i = 0; i < 7; i++) blobs.push([r()*MW, r()*MH, 2 + r()*5]);
  let sum = 0;
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++){
    const e = Math.min(x + .5, MW - x - .5, (y + .5)*0.6, (MH - y - .5)*0.6);
    let v = 0.25 + 0.9*Math.exp(-e/2.2);
    for (const [bx, by, br] of blobs){ const d = Math.hypot(x - bx, (y - by)*0.6); v += 0.8*Math.exp(-d*d/(br*br)); }
    v *= 0.75 + 0.5*r();
    a[y*MW + x] = v; sum += v;
  }
  const m = sum / a.length; for (let i = 0; i < a.length; i++) a[i] /= m;
  return rateCache[t.id] = a;
}
// 청소 도우미만큼 이끼가 느리게 낌
function mossSlow(t){
  let k = G.owned.items.includes('cleaner') ? 0.5 : 0;
  for (const c of t.creatures) k += SPECIES[c.sp].clean || 0;
  return 1 - Math.min(0.75, k);
}


// 저장본 검사: 모르는 생물·장식·배경은 버리고 빠진 값은 채움 (새 버전 백업이나 망가진 값으로 앱이 멈추지 않도록)
function sanitize(o){
  const d = defaults(), g = Object.assign(d, o);
  g.v = 2; g.pearls = Math.max(0, Math.floor(+g.pearls) || 0); g.born = Math.min(+g.born || todayN(), todayN()); g.streak = +g.streak || 0;
  g.set = Object.assign(defaults().set, o.set && typeof o.set === 'object' ? o.set : {});
  for (const k of ['inv', 'dex', 'ach']) if (!g[k] || typeof g[k] !== 'object') g[k] = {};
  g.stats = Object.assign({eaten:0, cleans:0, babies:0}, g.stats && typeof g.stats === 'object' ? g.stats : {});
  g.owned = Object.assign({bg:['city'], floor:['none', 'sand'], items:[]}, g.owned && typeof g.owned === 'object' ? g.owned : {});
  for (const k of ['bg', 'floor', 'items']) if (!Array.isArray(g.owned[k])) g.owned[k] = [];
  g.owned.bg = [...new Set(['city', ...g.owned.bg.filter(k => BACKGROUNDS[k])])];
  g.owned.floor = [...new Set(['none', 'sand', ...g.owned.floor.filter(k => FLOORS[k])])];
  g.owned.items = g.owned.items.filter(k => ITEMS[k]);
  for (const k in g.inv) if (!DECOR[k] || !(g.inv[k] > 0)) delete g.inv[k];
  g.daily = Object.assign(defaults().daily, g.daily && typeof g.daily === 'object' ? g.daily : {});
  g.queue = (Array.isArray(g.queue) ? g.queue : []).filter(q => q && typeof q === 'object').map(q => ({t:String(q.t || ''), d:String(q.d || ''), p:Math.max(0, Math.floor(+q.p) || 0)}));
  g.tanks = (Array.isArray(g.tanks) ? g.tanks : []).filter(t => t && typeof t === 'object').slice(0, LIMITS.tanks).map(t => {
    const nt = Object.assign(newTank('어항'), t);
    nt.id = String(nt.id); nt.name = String(nt.name || '어항').slice(0, 12);
    if (!BACKGROUNDS[nt.bg]) nt.bg = 'city';
    if (!FLOORS[nt.floor]) nt.floor = 'sand';
    nt.full = clamp(+nt.full || 0, 0, 1); nt.seen = +nt.seen || Date.now(); nt.moss = typeof nt.moss === 'string' ? nt.moss : '';
    nt.creatures = (Array.isArray(nt.creatures) ? nt.creatures : []).filter(c => c && SPECIES[c.sp]).slice(0, LIMITS.creatures).map(c => Object.assign(newCreature(c.sp, '이름'), c, {
      id:String(c.id || uid()), name:String(c.name || FIRST_NAME).slice(0, 10), growth:clamp(+c.growth || 0, 0, 1), aff:clamp(+c.aff || 0, 0, 1), born:Math.min(+c.born || todayN(), todayN()), variant:Math.abs(c.variant | 0)}));
    nt.decor = (Array.isArray(nt.decor) ? nt.decor : []).filter(d => d && DECOR[d.k]).slice(0, LIMITS.decor).map(d => ({k:d.k, x:clamp(+d.x || 0.5, 0.04, 0.96), seed:d.seed | 0, z:+d.z || 0.25}));
    return nt;
  });
  if (!g.tanks.length) g.tanks.push(newTank('첫 번째 어항'));
  return g;
}
function readSave(){
  for (const k of [KEY, OLD_KEY]){
    try { const s = localStorage.getItem(k); if (s){ const o = JSON.parse(s); if (o && typeof o === 'object'){ isNew = false; return o; } } } catch(e){}
  }
  return null;
}
(function load(){
  const o = readSave();
  try { G = migrate(o); } catch(e){ try { localStorage.setItem('eohangmeong.broken', JSON.stringify(o)); } catch(_){} G = defaults(); }
  try {
  if (!G.tanks.length) G.tanks.push(newTank('첫 번째 어항'));
  G.cur = clamp(G.cur | 0, 0, G.tanks.length - 1);
  G.set.fill = clamp(+G.set.fill || 0.68, FILL_MIN, FILL_MAX);
  // 첫 물고기
  if (!G.tanks.some(t => t.creatures.length) && isNew){
    const f = newCreature('goldfish', FIRST_NAME, {variant:0});
    G.tanks[0].creatures.push(f); G.tanks[0].sel = f.id; G.dex.goldfish = 1;
    G.queue.push({t:'환영 선물', d:'진주로 친구와 장식을 들일 수 있습니다.', p:REWARD.welcome});
  }
  const now = Date.now();
  for (const t of G.tanks) catchUp(t, now);
  rollDay();
  } catch(e){
    // 그래도 읽지 못하면 원본을 따로 남겨 두고 새로 시작
    try { localStorage.setItem('eohangmeong.broken', JSON.stringify(o)); } catch(_){}
    G = defaults(); G.tanks[0].creatures.push(newCreature('goldfish', FIRST_NAME, {variant:0}));
  }
})();

/* ================= 좌표계 ================= */
// 2D 어항: 모든 것이 한 평면 (z는 그리는 순서에만 사용)
const proj = (x, y) => [x, y, 1];
const unproj = (x, y) => [x, y];
function toFrame(x, y){ const dx = x - CX, dy = y - CY, c = Math.cos(psi), s = Math.sin(psi); return [dx*c + dy*s, -dx*s + dy*c]; }
function toScreen(fx, fy){ const c = Math.cos(psi), s = Math.sin(psi); return [CX + fx*c - fy*s, CY + fx*s + fy*c]; }
function fVec(vx, vy){ const c = Math.cos(psi), s = Math.sin(psi); return [vx*c - vy*s, vx*s + vy*c]; }
const down = () => ({x:-Math.sin(psi), y:Math.cos(psi)});
const colX = i => xL + (xR - xL) * (i + 0.5) / NW;
let QUAL = 0;   // 화질 단계 (느린 기기에서 자동으로 낮춤)
const sizeMul = g => 0.6 + 0.8*g;
const fishLen = f => MIN * 0.17 * zoom * SPECIES[f.d.sp].size * sizeMul(f.d.growth);
const floorTop = () => H - floorH;

const fc = document.createElement('canvas'), fg = fc.getContext('2d');
const dc = document.createElement('canvas'), dg = dc.getContext('2d');      // 장식 한 겹 (물 밖, 물속 두 번 씀)
const mc = document.createElement('canvas'), mg = mc.getContext('2d');      // 이끼
mc.width = MW; mc.height = MH;
function resize(){
  DPR = Math.min([2, 1.5, 1][QUAL], window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight; MIN = Math.min(W, H); SK = MIN / 390;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  CX = W/2; CY = H/2; D = Math.hypot(W, H)/2 + 40; ZP = MIN * 0.55;
  const S = Math.ceil(MIN * 0.17 * ZOOM_MAX * 1.45 * 2.9 * DPR) + 8;
  if (fc.width < S){ fc.width = S; fc.height = S; }
  vign = ctx.createRadialGradient(CX, CY, MIN*0.38, CX, CY, Math.hypot(W, H)*0.62);
  vign.addColorStop(0, 'rgba(0,6,14,0)'); vign.addColorStop(1, 'rgba(0,6,14,.5)');
  floorH = tank && tank.floor !== 'none' ? Math.round(30 * SK) : 0;
  genBokeh();
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
function effHour(){ if (G.set.tod) return TOD_FIXED[G.set.tod]; const d = new Date(); return d.getHours() + d.getMinutes()/60; }
const isNight = () => { const h = effHour(); return h >= 22 || h < 5.5; };
function phaseName(h){ return (h >= 21.5 || h < 5.5) ? '밤' : h < 8.2 ? '새벽' : h < 17 ? '낮' : h < 19.6 ? '노을' : '저녁'; }
let Lt = mixL(lightAt(effHour()), lightAt(effHour()), 0);

/* ================= 소리 ================= */
let AC = null, master = null, soundOn = false, lastBloop = 0, rainGain = null, music = null;
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
  try { music = createMusic(AC, master); music.set(G.set.music); } catch(e){ music = null; }
}
function setRainAudio(){ if (rainGain) rainGain.gain.setTargetAtTime(G.set.rain ? 0.085 : 0, AC.currentTime, 1.2); }
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

// 유리 닦는 뽀득 소리
function squeak(){
  if (!soundOn || !AC) return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain(), f = rand(900, 1500);
  o.type = 'triangle'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f*rand(1.15, 1.4), t + 0.07);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.012, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(g).connect(master); o.start(t); o.stop(t + 0.1);
}
// 진주 받는 소리
function chime(){
  if (!soundOn || !AC) return;
  const t = AC.currentTime;
  [0, 0.09, 0.18].forEach((d, i) => {
    const o = AC.createOscillator(), g = AC.createGain(), f = [1046.5, 1318.5, 1568][i];
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.03, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.5);
    o.connect(g).connect(master); o.start(t + d); o.stop(t + d + 0.55);
  });
}
function setSound(on){
  soundOn = on;
  try { if (!AC) initAudio(); AC.resume(); master.gain.setTargetAtTime(soundOn ? 0.9 : 0, AC.currentTime, 0.4); if (music){ soundOn ? music.resume() : music.suspend(); } } catch(e){ soundOn = false; }
  sndBtn.setAttribute('aria-pressed', soundOn); sndBtn.setAttribute('aria-label', soundOn ? '소리 끄기' : '소리 켜기');
  sndWave.setAttribute('opacity', soundOn ? '1' : '.3');
}
function setMusic(k){
  G.set.music = k; dirty = true;
  if (k !== 'off' && !soundOn) setSound(true);
  if (music) music.set(k);
}

/* ================= 생성 헬퍼 ================= */
function spawnBubble(x, y, z, r, delay){ if (bubbles.length < 90) bubbles.push({x, y, z, r, ph:rand(0,6), age:0, delay:delay||0}); }
function mouthWorld(fish){ const l = fishLen(fish); return {x:fish.x + Math.cos(fish.phi)*0.3*l, y:fish.y + 0.02*l, z:fish.z}; }
function breathe(fish, n){ const m = mouthWorld(fish), l = fishLen(fish); for (let i = 0; i < n; i++) spawnBubble(m.x, m.y, m.z, l*rand(.022,.036), i*rand(.15,.3)); }
function addHeart(fish){ const m = mouthWorld(fish), p = proj(m.x, m.y, m.z); hearts.push({x:p[0], y:p[1] - fishLen(fish)*0.2, t:0}); }
function setTarget(fish, x, y, z){ fish.tx = x; fish.ty = y; fish.tz = z; }
// 돌아다닐 곳 고르기: 바닥을 좋아하는 종은 깊은 곳, 무리 짓는 종은 친구 곁
function wanderTarget(fish){
  const l = fishLen(fish), S = SPECIES[fish.d.sp];
  let p = pickWaterPoint(l*0.6, S.depth === 'deep' ? 0.62 : 0);
  if (S.school){
    const mates = creatures.filter(c => c !== fish && c.d.sp === fish.d.sp);
    if (mates.length && Math.random() < 0.8){
      const m = pick(mates), q = {x:m.tx + rand(-1.4, 1.4)*l, y:m.ty + rand(-0.9, 0.9)*l};
      if (inWater(q.x, q.y, l*0.5)) p = q;
    }
  }
  setTarget(fish, p.x, p.y, 0.5); fish.mode = 'wander';
}
function dropFood(x, y, n){
  for (let i = 0; i < n && foods.length < 18; i++){
    const z = 0.5, w = unproj(x + rand(-12,12), y + rand(-8,8));
    foods.push({x:w[0], y:w[1], z, vx:rand(-20,20), vy:rand(-20,0), wet:false, float:0, life:32, ph:rand(0,6)});
  }
}
function feed(){
  const swimmers = creatures.filter(c => SPECIES[c.d.sp].kind !== 'crawler').length;
  const n = 2 + Math.min(6, swimmers) + (Math.random()*2 | 0), Lx = xR - xL;
  for (let i = 0; i < n; i++){
    const p = toScreen(rand(-.25,.25)*Lx, level - rand(30, 70));
    dropFood(clamp(p[0], 20, W - 20), clamp(p[1], 20, H - 20), 1);
  }
}
function shake(strong){
  { const Lx = xR - xL; for (let k = 1; k <= 3; k++){ const a = rand(-1, 1) * 0.07 * Lx / k; for (let i = 0; i < NW; i++) eS[i] += a * Math.cos(k * PI * (i + 0.5) / NW); } }
  for (let i = 0; i < NW; i++) rv[i] += rand(-120, 120);
  for (let i = 0; i < 14; i++){ const p = pickWaterPoint(10); spawnBubble(p.x, p.y, rand(.1,.9), rand(1.5,4.5)*zoom, rand(0,.4)); }
  for (const fish of creatures){
    if (SPECIES[fish.d.sp].kind === 'crawler'){ fish.hold = 0; continue; }
    const l = fishLen(fish), p = pickWaterPoint(l*.6);
    setTarget(fish, p.x, p.y, 0.5); fish.mode = 'startle'; fish.timer = 1.1; fish.awakeT = 20;
    if (strong) fish.dizzy = 1.8;
  }
  bloop(0.8, 0.05);
}

/* ================= 물고기 행동 ================= */
function nearestFood(fish){
  let best = null, bd = Infinity;
  for (const f of foods){ if (!f.wet) continue; const d = Math.hypot(f.x - fish.x, f.y - fish.y, (f.z - fish.z)*ZP); if (d < bd){ bd = d; best = f; } }
  return best;
}
function updateFish(fish, dt){
  const l = fishLen(fish), dn = down(), night = isNight(), S = SPECIES[fish.d.sp], isFish = S.kind === 'fish';
  fish.dizzy = Math.max(0, fish.dizzy - dt); fish.kiss = Math.max(0, fish.kiss - dt);
  fish.chomp = Math.max(0, fish.chomp - dt); fish.awakeT = Math.max(0, fish.awakeT - dt); fish.hic = Math.max(0, fish.hic - dt);
  if (fish.act){
    const a = fish.act; a.t += dt;
    if (a.k === 'hic') for (const tt of [0.15, 1.1, 2.05]) if (a.t - dt < tt && a.t >= tt){
      fish.vx -= dn.x*0.9*l; fish.vy -= dn.y*0.9*l; fish.hic = 0.3;
      const m = mouthWorld(fish); spawnBubble(m.x, m.y, m.z, l*0.03, 0); bloop(1.9, 0.02);
    }
    if (a.t >= a.d){ if (a.k === 'yawn') breathe(fish, 1); fish.act = null; }
  }
  let spd = 0.45 * l, face = null;
  const food = nearestFood(fish);

  if (fish.mode === 'startle'){
    fish.timer -= dt; spd = 3 * l; if (fish.timer <= 0) wanderTarget(fish);
  } else if (food){
    fish.mode = 'food'; setTarget(fish, food.x, food.y, food.z); spd = 1.5 * l; fish.awakeT = Math.max(fish.awakeT, 15);
    const m = mouthWorld(fish);
    if (Math.hypot(m.x - food.x, m.y - food.y, (m.z - food.z)*ZP) < 0.2*l + 5){
      foods.splice(foods.indexOf(food), 1);
      fish.chomp = 0.6; fish.blush = 1; breathe(fish, 2); bloop(1.3, 0.03);
      onEat(fish);
    }
  } else if (fish.mode === 'chase'){
    const b = fish.chaseB; fish.timer -= dt;
    if (!b || bubbles.indexOf(b) < 0 || fish.timer <= 0) wanderTarget(fish);
    else {
      setTarget(fish, b.x, b.y, 0.5); spd = 1.25 * l;
      const m = mouthWorld(fish);
      if (Math.hypot(m.x - b.x, m.y - b.y) < 0.14*l + b.r){
        bubbles.splice(bubbles.indexOf(b), 1); fish.chomp = 0.4; fish.blush = 1;
        rings.push({x:b.x, y:b.y, t:0, s:.25}); bloop(2.1, 0.02);
        fish.mode = 'rest'; fish.timer = 1.6; setTarget(fish, fish.x, fish.y, fish.z);
      }
    }
  } else if (fish.mode === 'visit'){
    const sn = snail; fish.timer -= dt;
    if (!sn || fish.timer <= 0) wanderTarget(fish);
    else {
      setTarget(fish, sn.x + sn.hx*0.9*l, sn.y + sn.hy*0.9*l, 0.5); spd = 0.7 * l;
      if (!inWater(fish.tx, fish.ty, l*0.3)) wanderTarget(fish);
      else if (Math.hypot(fish.tx - fish.x, fish.ty - fish.y) < 0.3*l){
        const dxf = toFrame(sn.x, sn.y)[0] - toFrame(fish.x, fish.y)[0];
        fish.facePhi = dxf >= 0 ? 0 : PI; fish.faceHold = 3.2; fish.blush = 1; breathe(fish, 2);
        fish.mode = 'rest'; fish.timer = 3.2; setTarget(fish, fish.x, fish.y, fish.z);
      }
    }
  } else if (fish.mode === 'call' || fish.mode === 'peek'){
    spd = (fish.mode === 'call' ? 1.1 + fish.d.aff*0.8 : 0.7) * l;
    fish.timer -= dt;
    if (!inWater(fish.tx, fish.ty, l*0.3) || fish.timer <= 0) wanderTarget(fish);
    else if (Math.hypot(fish.tx - fish.x, fish.ty - fish.y) < 0.35*l && Math.abs(fish.tz - fish.z) < 0.1){
      if (fish.mode === 'call'){ fish.d.aff = Math.min(1, fish.d.aff + 0.02); dirty = true; addHeart(fish); fish.kiss = 1.4; }
      fish.mode = 'look'; fish.timer = rand(2.6, 3.6); breathe(fish, 2);
    }
  } else if (fish.mode === 'air'){
    // 수면에 올라가 숨 쉬기 (거북이, 개구리)
    const sp = toScreen(fish.nfx, surfYF(fish.nfx) + 0.22*l); setTarget(fish, clamp(sp[0], l, W - l), clamp(sp[1], l, H - l), 0.5);
    spd = 0.8 * l; fish.timer -= dt;
    const mf = toFrame(fish.x, fish.y);
    if (mf[1] - surfYF(mf[0]) < 0.4*l){
      if (!fish.atAir){ fish.atAir = true; fish.timer = Math.min(fish.timer, rand(3, 6)); pokeF(mf[0], -60); bloop(1.2, 0.02); }
      spd = 0.12 * l;
    }
    if (fish.timer <= 0){ fish.atAir = false; breathe(fish, 2); wanderTarget(fish); }
  } else if (fish.mode === 'look'){
    face = isFish ? PI/2 : null; spd = 0.08 * l; setTarget(fish, fish.x, fish.y, fish.z);
    fish.timer -= dt; if (fish.timer <= 0) wanderTarget(fish);
  } else if (fish.mode === 'nibble'){
    spd = 0.7 * l;
    if (fish.nibLeaf){ if (leaves.indexOf(fish.nibLeaf) < 0) fish.nibLeaf = null; else fish.nfx = fish.nibLeaf.fx; }
    const sp = toScreen(fish.nfx, surfYF(fish.nfx) + 0.3*l); setTarget(fish, clamp(sp[0], l, W - l), clamp(sp[1], l, H - l), fish.tz);
    fish.timer -= dt;
    const m = mouthWorld(fish), mf = toFrame(m.x, m.y);
    if (mf[1] - surfYF(mf[0]) < 0.2*l){
      fish.peckT -= dt;
      if (fish.peckT <= 0){
        fish.peckT = rand(.45, .75); fish.pecks--; fish.chomp = 0.35;
        pokeF(mf[0], -70); if (fish.nibLeaf) fish.nibLeaf.drift += rand(-7, 7);
        const sp2 = toScreen(mf[0], surfYF(mf[0])), pp = proj(sp2[0], sp2[1], m.z);
        rings.push({x:pp[0], y:pp[1], t:0, s:.45}); bloop(1.5, 0.02);
      }
    }
    if (fish.pecks <= 0 || fish.timer <= 0){ fish.nibLeaf = null; wanderTarget(fish); }
  } else if (fish.mode === 'sleep'){
    spd = 0.1 * l;
    if (!night || fish.awakeT > 0){ fish.mode = 'rest'; fish.timer = 2; }
    if (!inWater(fish.tx, fish.ty, l*0.4)){ const p = pickWaterPoint(l*.6, .55); setTarget(fish, p.x, p.y, 0.5); }
    fish.zzzT -= dt;
    if (fish.zzzT <= 0){ fish.zzzT = 3.2; const p = proj(fish.x, fish.y, fish.z); zzz.push({x:p[0], y:p[1] - l*0.3, t:0}); }
  } else if (fish.mode === 'rest'){
    spd = 0.14 * l; fish.timer -= dt; if (fish.timer <= 0) wanderTarget(fish);
    if (Math.random() < dt*0.22) breathe(fish, 1 + (Math.random()*3 | 0));
  } else {
    fish.mode = 'wander'; spd = (0.42 + 0.18*Math.sin(T*0.31)) * l;
    if (!inWater(fish.tx, fish.ty, l*0.35)) wanderTarget(fish);
    if (Math.hypot(fish.tx - fish.x, fish.ty - fish.y) < 0.5*l && Math.abs(fish.tz - fish.z) < 0.12){
      if (Math.random() < 0.4){ fish.mode = 'rest'; fish.timer = rand(2.5, 6); setTarget(fish, fish.x, fish.y, fish.z); } else wanderTarget(fish);
    }
  }

  if (fish.mode === 'wander' || fish.mode === 'rest'){
    if (night && fish.awakeT <= 0){
      fish.mode = 'sleep'; const p = pickWaterPoint(l*.6, .55); setTarget(fish, p.x, p.y, 0.5); fish.zzzT = 2;
    } else {
      fish.nextPeek -= dt; fish.nextNibble -= dt * (tank.full < 0.25 && isFish ? 3 : 1); fish.airT -= dt;
      if (S.air && fish.airT <= 0){
        fish.airT = rand(35, 80); const Lx = xR - xL;
        fish.nfx = clamp(toFrame(fish.x, fish.y)[0], xL + .15*Lx, xR - .15*Lx); fish.atAir = false; fish.mode = 'air'; fish.timer = 14;
      } else if (fish.nextPeek <= 0){
        fish.nextPeek = rand(45, 90);
        const p = pickWaterPoint(l*.8); setTarget(fish, lerp(p.x, CX, .4), p.y, 0.5); fish.mode = 'peek'; fish.timer = 12;
      } else if (fish.nextNibble <= 0 && isFish){
        fish.nextNibble = rand(35, 70); const Lx = xR - xL;
        fish.nfx = rand(xL + .2*Lx, xR - .2*Lx); fish.tz = 0.5; fish.pecks = 3 + (Math.random()*3 | 0); fish.peckT = .3;
        fish.mode = 'nibble'; fish.timer = 12;
      }
      if (fish.mode === 'wander' || fish.mode === 'rest'){
        const lf = isFish && leaves.find(q => q.st === 'float' && !q.nib && q.t > 4 && q.kind !== 'winter');
        if (lf){ lf.nib = true; fish.nibLeaf = lf; fish.nfx = lf.fx; fish.pecks = 3 + (Math.random()*2 | 0); fish.peckT = .3; fish.mode = 'nibble'; fish.timer = 12; }
        else if (snail && !snail.visited && snail.t > 6 && inWater(snail.x, snail.y, l*0.5)){ snail.visited = true; fish.mode = 'visit'; fish.timer = 10; }
        else {
          fish.habitT -= dt;
          if (!fish.act && fish.habitT <= 0 && !isFish){ fish.habitT = rand(22, 45); fish.mode = 'rest'; fish.timer = rand(4, 9); setTarget(fish, fish.x, fish.y, fish.z); }
          else if (!fish.act && fish.habitT <= 0){
            fish.habitT = rand(22, 45);
            const eve = Lt.lamp > 0.4, r = Math.random();
            if (r < (eve ? 0.55 : 0.3)){ fish.act = {k:'yawn', t:0, d:1.9}; fish.mode = 'rest'; fish.timer = 2.6; setTarget(fish, fish.x, fish.y, fish.z); }
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

  spd *= S.speed * (tank.full < 0.15 && fish.mode === 'wander' ? 0.7 : 1);
  // 3D 조향
  const dx = fish.tx - fish.x, dy = fish.ty - fish.y, dzp = (fish.tz - fish.z) * ZP;
  const dist = Math.hypot(dx, dy, dzp) || 1, want = spd * Math.min(1, dist / (0.8*l)) * (S.depth === 'deep' && fish.mode === 'wander' ? 0.6 + 0.4*Math.max(0, Math.sin(T*0.7 + fish.seed)) : 1);
  const k = Math.min(1, dt * (fish.mode === 'startle' ? 6 : 2.4));
  fish.vx += (dx/dist*want - fish.vx) * k; fish.vy += (dy/dist*want - fish.vy) * k;
  let vzp = fish.vz * ZP; vzp += (dzp/dist*want - vzp) * k;
  // 물 밖/벽 밀어내기
  const m = 0.42 * l, dep = depthAt(fish.x, fish.y);
  if (dep < m){ const p = (m - dep) * 8 * dt; fish.vx += dn.x*p; fish.vy += dn.y*p; }
  if (fish.x < m) fish.vx += (m - fish.x)*8*dt; if (fish.x > W - m) fish.vx -= (fish.x - (W - m))*8*dt;
  const fl = floorTop() - (isFish ? m : 0.25*l);
  if (fish.y < m) fish.vy += (m - fish.y)*8*dt; if (fish.y > fl) fish.vy -= (fish.y - fl)*8*dt;
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
  const bT = fish.mode === 'look' ? 1 : 0.3 + fish.d.aff*0.3;
  fish.blush += (bT - fish.blush) * Math.min(1, dt*1.5);
  let mo = 0.28 + 0.2*Math.sin(T*3.1);
  if (fish.chomp > 0) mo = 0.35 + 0.65*Math.abs(Math.sin(fish.chomp*16));
  if (fish.sleepy > 0.5) mo = 0.15 + 0.08*Math.sin(T*1.6);
  if (fish.hic > 0) mo = 0.75;
  fish.mouth += (mo - fish.mouth) * Math.min(1, dt*12);
}

/* ================= 생물 상태 ================= */
function makeRuntime(d){
  const p = W ? pickWaterPoint(40, SPECIES[d.sp].depth === 'deep' ? 0.6 : 0) : {x:CX, y:CY};
  return {d, x:p.x, y:p.y, z:.5, vx:0, vy:0, vz:0, phi:Math.random() < .5 ? 0 : PI, pitch:0, phase:rand(0, 6), effort:.4, mode:'wander', timer:0, tx:p.x, ty:p.y, tz:.5,
    mouth:.2, blush:.3, sleepy:0, dizzy:0, kiss:0, chomp:0, awakeT:0, act:null, habitT:rand(12, 30), hic:0, chaseB:null, faceHold:0, facePhi:0, nibLeaf:null,
    nextPeek:rand(25, 70), nextNibble:rand(25, 70), pecks:0, peckT:0, zzzT:0, nfx:0, airT:rand(15, 50), atAir:false, seed:rand(0, 6),
    hold:rand(0, 2), hx:1, hy:0, ang:0, dir:1, trail:[], tl:0, t:0, pet:0};
}

/* ---- 유리·바닥을 기어다니는 생물 (새우, 달팽이): 이끼를 먹음 ---- */
function updateCrawler(c, dt){
  const S = SPECIES[c.d.sp], l = fishLen(c), dn = down(), isSnail = c.d.sp === 'snail';
  c.t += dt; c.chomp = Math.max(0, c.chomp - dt); c.pet = Math.max(0, c.pet - dt);
  // 물 밖이면 물 쪽으로 미끄러짐
  if (depthAt(c.x, c.y) < l*0.3){ c.x += dn.x*90*SK*dt; c.y += dn.y*90*SK*dt; c.hold = 0.5; }
  c.hold -= dt;
  if (c.hold > 0){ c.effort += (0 - c.effort)*Math.min(1, dt*4); if (!isSnail) c.mouth = 0.5 + 0.5*Math.sin(T*9 + c.seed); }
  else {
    const dx = c.tx - c.x, dy = c.ty - c.y, dist = Math.hypot(dx, dy);
    const spd = (isSnail ? 7 : (c.dash > 0 ? 70 : 16)) * SK * (0.6 + 0.4*sizeMul(c.d.growth)) * zoom;
    c.dash = Math.max(0, (c.dash || 0) - dt);
    if (dist < 4 || !inWater(c.tx, c.ty, l*0.4)){
      // 이끼가 많은 곳을 골라 감
      let best = null, bv = -1;
      for (let i = 0; i < 6; i++){
        const r = (isSnail ? 2.5 : 4) * l, q = i < 4 ? {x:c.x + rand(-r, r), y:c.y + rand(-r, r)} : pickWaterPoint(l);
        if (!inWater(q.x, q.y, l*0.5)) continue;
        const v = mossAt(q.x, q.y) + Math.random()*0.15; if (v > bv){ bv = v; best = q; }
      }
      if (best){ c.tx = best.x; c.ty = best.y; }
      c.hold = isSnail ? rand(0, 1.5) : rand(0.8, 3.5);
      if (!isSnail && Math.random() < 0.35) c.dash = 0.35;
    } else {
      const k = Math.min(spd*dt, dist) / dist;
      c.x += dx*k; c.y += dy*k;
      const hx = dx/dist, hy = dy/dist;
      c.hx += (hx - c.hx)*Math.min(1, dt*(isSnail ? 1.5 : 6)); c.hy += (hy - c.hy)*Math.min(1, dt*(isSnail ? 1.5 : 6));
      c.effort += ((c.dash > 0 ? 1.2 : 0.5) - c.effort)*Math.min(1, dt*5);
    }
  }
  // 먹이가 가까우면 먹으러 감
  if (!isSnail){
    for (const f of foods) if (f.wet && Math.hypot(f.x - c.x, f.y - c.y) < 3*l){
      c.tx = f.x; c.ty = f.y; c.hold = Math.min(c.hold, 0);
      if (Math.hypot(f.x - c.x, f.y - c.y) < 0.4*l + 4){ foods.splice(foods.indexOf(f), 1); c.chomp = 0.5; onEat(c); }
      break;
    }
  }
  c.phase += dt*(2 + 10*c.effort);
  // 이끼 먹기
  eatMoss(c.x, c.y, (S.clean || 0.2) * (isSnail ? 1.6 : 1.1) * dt * (c.hold > 0 || isSnail ? 1 : 0.4));
}
function drawCrawler(c){
  const l = fishLen(c);
  if (c.d.sp === 'snail'){
    const hd = Math.atan2(c.hy, c.hx), up = {x:-down().x, y:-down().y};
    // 껍데기가 위(중력 반대)를 향하도록 뒤집기
    const perp = {x:Math.sin(hd), y:-Math.cos(hd)}, flip = perp.x*up.x + perp.y*up.y < 0;
    c.dir = flip ? -1 : 1; c.ang = flip ? hd + PI : hd;
    drawSnail(c, l / (34 * SK * 1.3) * 1.15);
  } else {
    const hd = Math.atan2(c.hy, c.hx), right = c.hx >= 0;
    drawCritter(ctx, 'shrimp', {x:c.x, y:c.y, L:l, face:right ? 1 : -1, rot:right ? hd : hd - PI, t:T, phase:c.phase, effort:c.effort, mode:c.hold > 0 ? 'walk' : 'swim', sleepy:0, mouth:c.mouth || 0, blush:0.4 + 0.6*c.pet, variant:c.d.variant});
  }
}

/* ================= 돌봄 ================= */
function onEat(c){
  c.d.growth = Math.min(1, c.d.growth + 0.006); c.d.aff = Math.min(1, c.d.aff + 0.008);
  tank.full = Math.min(1, tank.full + 0.045); G.stats.eaten++; dirty = true;
  if (!G.daily.feed && tank.full >= 0.95){
    G.daily.feed = true;
    reward('배불리 먹었습니다', `${tank.name} 친구들이 배불리 먹었습니다.`, REWARD.feed);
  }
}
// 이끼: 격자 값 0..1
const mossI = (x, y) => clamp((y / H * MH) | 0, 0, MH - 1)*MW + clamp((x / W * MW) | 0, 0, MW - 1);
const mossAt = (x, y) => mossA[mossI(x, y)];
function cleanliness(){ let m = 0; for (let i = 0; i < mossA.length; i++) m += mossA[i]; return 1 - m / mossA.length; }
function eatMoss(x, y, amt){
  if (amt <= 0) return 0;
  const cx = x / W * MW, cy = y / H * MH, r = 1.25;
  let got = 0;
  for (let j = Math.floor(cy - r); j <= Math.ceil(cy + r); j++){
    if (j < 0 || j >= MH) continue;
    for (let i = Math.floor(cx - r); i <= Math.ceil(cx + r); i++){
      if (i < 0 || i >= MW) continue;
      const d = Math.hypot(i + .5 - cx, (j + .5 - cy)*0.9); if (d >= r) continue;
      const k = j*MW + i, v = mossA[k], nv = Math.max(0, v - amt*(1 - d/r));
      if (nv !== v){ mossA[k] = nv; got += v - nv; }
    }
  }
  if (got > 0) mossDirty = true;
  return got;
}
let rubbedTotal = 0, rubSqueak = 0;
function rub(x, y, distPx){
  if (G.daily.from == null) G.daily.from = cleanliness();
  const got = eatMoss(x, y, distPx / (30*SK) * 0.55);
  if (got > 0){
    rubbedTotal += got; dirty = true;
    rubSqueak -= distPx; if (rubSqueak < 0){ rubSqueak = 90*SK; squeak(); }
    if (Math.random() < 0.25) pops.push({x:x + rand(-14, 14), y:y + rand(-14, 14), t:0, k:'spark'});
  }
  const cl = cleanliness();
  if (cl >= 0.97 && !G.daily.clean && G.daily.from != null && G.daily.from <= 0.95){
    G.daily.clean = true; G.stats.cleans++;
    for (let i = 0; i < 14; i++) pops.push({x:rand(0.1, 0.9)*W, y:rand(0.1, 0.9)*H, t:-rand(0, .6), k:'spark'});
    reward('유리를 깨끗이 닦았습니다', '오늘의 청소를 마쳤습니다.', REWARD.clean);
  }
}
// 이끼가 조금씩 낌
let mossT = 0;
function growMoss(dt){
  mossT += dt; if (mossT < 2) return;
  const r = mossRates(tank), k = mossSlow(tank) * MOSS_DAY / 24 / 3600 * mossT;
  for (let i = 0; i < mossA.length; i++) mossA[i] = Math.min(1, mossA[i] + r[i]*k);
  const floor = G.owned.items.includes('feeder') ? 0.5 : 0;
  tank.full = Math.max(floor, tank.full - mossT / 3600 / FULL_HOURS);
  // 자동 먹이통: 배가 고파지면 먹이를 떨어뜨림
  if (G.owned.items.includes('feeder') && tank.full < 0.55 && foods.length < 3 && creatures.length && started) feed();
  mossT = 0; mossDirty = true;
}
// 이끼 그림 (얼룩지게)
const MHW = 72, MHH = 128, mhc = document.createElement('canvas'), mhg = mhc.getContext('2d');
mhc.width = MHW; mhc.height = MHH;
let mossImg = mhg.createImageData(MHW, MHH), mossNoise = new Float32Array(MHW*MHH);
// 부드러운 얼룩 무늬 (여러 크기의 격자 잡음을 겹침)
function seedMossNoise(){
  const r = rng(strSeed(tank.id) ^ 0x9e37), oct = [[6, 10, .5], [12, 22, .3], [30, 54, .2]];
  mossNoise.fill(0);
  for (const [gw, gh, wt] of oct){
    const g = new Float32Array((gw + 1)*(gh + 1)); for (let i = 0; i < g.length; i++) g[i] = r();
    for (let y = 0; y < MHH; y++){
      const fy = y / MHH * gh, y0 = fy | 0, ty = fy - y0, sy = ty*ty*(3 - 2*ty);
      for (let x = 0; x < MHW; x++){
        const fx = x / MHW * gw, x0 = fx | 0, tx = fx - x0, sx = tx*tx*(3 - 2*tx), i = y0*(gw + 1) + x0;
        mossNoise[y*MHW + x] += wt*((g[i]*(1 - sx) + g[i + 1]*sx)*(1 - sy) + (g[i + gw + 1]*(1 - sx) + g[i + gw + 2]*sx)*sy);
      }
    }
  }
}
let mossVisible = true;
function renderMoss(){
  if (!mossDirty) return; mossDirty = false;
  let mx = 0; for (let i = 0; i < mossA.length; i++) if (mossA[i] > mx) mx = mossA[i];
  mossVisible = mx > 0.12; if (!mossVisible) return;
  const d = mossImg.data;
  for (let y = 0; y < MHH; y++){
    const gy = clamp((y + .5) / MHH * MH - .5, 0, MH - 1), y0 = Math.min(MH - 2, gy | 0), fy = gy - y0;
    for (let x = 0; x < MHW; x++){
      const gx = clamp((x + .5) / MHW * MW - .5, 0, MW - 1), x0 = Math.min(MW - 2, gx | 0), fx = gx - x0;
      const a = mossA[y0*MW + x0], b = mossA[y0*MW + x0 + 1], c = mossA[(y0 + 1)*MW + x0], e = mossA[(y0 + 1)*MW + x0 + 1];
      const v = (a*(1 - fx) + b*fx)*(1 - fy) + (c*(1 - fx) + e*fx)*fy, n = mossNoise[y*MHW + x];
      const al = smooth(0.2, 0.75, v*1.1 + (n - 0.5)*0.9) * 0.78, k = (y*MHW + x)*4;
      d[k] = 62 + n*50; d[k+1] = 96 + n*60 - v*24; d[k+2] = 40 + n*22; d[k+3] = al*255;
    }
  }
  mhg.putImageData(mossImg, 0, 0);
}

/* ================= 보상 ================= */
function reward(t, d, p){ G.queue.push({t, d, p}); dirty = true; if (started) showReward(); }
function statOf(k){
  if (k === 'days') return todayN() - G.born + 1;
  if (k === 'dex') return Object.keys(G.dex).length;
  if (k === 'decor') return G.tanks.reduce((n, t) => n + t.decor.length, 0);
  if (k === 'tanks') return G.tanks.length;
  return G.stats[k] || 0;
}
function checkAch(){
  for (const a of ACHIEVEMENTS){
    if (G.ach[a.id] || statOf(a.stat) < a.goal) continue;
    G.ach[a.id] = 1; reward('업적 달성', a.name, a.reward);
  }
}
function petCreature(c){
  c.pet = 1.2; c.blush = 1; c.kiss = 1.2;
  if (SPECIES[c.d.sp].kind !== 'crawler'){ addHeart(c); c.timer = Math.max(c.timer, 2); }
  else { const p = proj(c.x, c.y, .5); hearts.push({x:p[0], y:p[1] - fishLen(c)*0.4, t:0}); }
  c.d.aff = Math.min(1, c.d.aff + 0.01); dirty = true;
  // 쓰다듬기 진주는 하루 20개까지
  G.daily.pets = (G.daily.pets || 0) + 1;
  if (G.daily.pets % 5 === 0 && G.daily.pets <= 50) G.pearls += REWARD.pet;
}

/* ================= 어항 불러오기 ================= */
function loadTank(i){
  if (tank){ tank.moss = packMoss(); tank.seen = Date.now(); }
  G.cur = clamp(i, 0, G.tanks.length - 1); tank = G.tanks[G.cur];
  catchUp(tank, Date.now());
  mossA = unpackMoss(tank.moss); seedMossNoise(); mossDirty = true; G.daily.from = G.daily.clean ? G.daily.from : null;
  floorH = tank.floor !== 'none' ? Math.round(30 * SK) : 0;
  foods.length = 0; bubbles.length = 0; hearts.length = 0; zzz.length = 0;
  creatures = tank.creatures.map(makeRuntime);
  sel = creatures.find(c => c.d.id === tank.sel) || creatures[0] || null;
  decos = tank.decor.map(d => ({d, v:0}));
  for (const c of creatures) G.dex[c.d.sp] = 1;
  genBokeh(); refreshChip();
  dirty = true;
}
function addCreature(sp){
  const d = newCreature(sp, freeName());
  tank.creatures.push(d); G.dex[sp] = 1;
  const c = makeRuntime(d), Lx = xR - xL, p = toScreen(rand(-.2, .2)*Lx, level - 40);
  c.x = clamp(p[0], 30, W - 30); c.y = clamp(p[1], 30, H - 30);   // 위에서 퐁당
  c.mode = 'startle'; c.timer = 1.2; setTarget(c, c.x, c.y + 0.25*H, .5);
  poke(c.x, c.y, -260); rings.push({x:c.x, y:c.y + 30, t:0, s:1}); bloop(0.9, 0.05);
  creatures.push(c); selectCreature(c);
  dirty = true; return c;
}
function selectCreature(c){ sel = c; tank.sel = c ? c.d.id : null; refreshChip(); dirty = true; }

/* ================= 업데이트 ================= */
function update(dt){
  zoom += (zoomT - zoom) * Math.min(1, dt*3.5);
  { const df = G.set.fill - fillCur;
    if (Math.abs(df) > 0.0005){ fillCur += df * Math.min(1, dt*1.1); if (Math.random() < dt*8) pokeF(rand(xL, xR), rand(-30, 30)); }
    else fillCur = G.set.fill; }
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

  for (const c of creatures) SPECIES[c.d.sp].kind === 'crawler' ? updateCrawler(c, dt) : updateFish(c, dt);
  growMoss(dt);
  // 물 흐름 (수초가 흔들리는 방향)
  { let u = 0; for (let i = 1; i < NW; i++) u += uS[i]; u /= NW; const fx = fVec(u, 0)[0] / (120*SK); flowK += (clamp(fx, -1, 1) - flowK)*Math.min(1, dt*3); }
  updateDecos(dt);

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
    f.x = clamp(f.x + f.vx*dt, fr, W - fr); f.y = clamp(f.y + f.vy*dt, fr, floorTop() + floorH*0.25 - fr);
    if (f.life <= 0) foods.splice(i, 1);
  }
  for (let i = rings.length - 1; i >= 0; i--){ rings[i].t += dt; if (rings[i].t > 1.2) rings.splice(i, 1); }
  for (let i = hearts.length - 1; i >= 0; i--){ const h = hearts[i]; h.t += dt; h.x += up.x*22*dt; h.y += up.y*22*dt; if (h.t > 1.8) hearts.splice(i, 1); }
  for (let i = pops.length - 1; i >= 0; i--){ pops[i].t += dt; if (pops[i].t > 0.9) pops.splice(i, 1); }
  for (let i = zzz.length - 1; i >= 0; i--){ const h = zzz[i]; h.t += dt; h.x += (up.x*14 + pr.x*6)*dt; h.y += (up.y*14 + pr.y*6)*dt; if (h.t > 2.6) zzz.splice(i, 1); }
}
const foodR = () => 2.2*Math.sqrt(zoom) + 0.8;
function addGlassDrop(x, y, r){ if (gdrops.length < 45) gdrops.push({x, y, r:clamp(r, 1, 4.2), life:rand(25, 55), moving:false, mt:rand(.2, 1.5)}); }

/* ================= 물고기 그리기 (2.5D, 몸통 단면 합성) ================= */
let BH = 1;   // 몸 높이 배율 (어종마다)
const hY = s => (0.215 * Math.pow(Math.sin(PI*(0.06 + 0.9*s)), 0.8) * (1 - 0.3*s)) * BH + 0.004;
// 꼬리 모양: 갈래 수, 길이·폭 배율, 가운데 홈 깊이
const TAILS = {twin:{sp:[0.34, -0.34], u:1, v:1, notch:0.3}, fan:{sp:[0], u:1.05, v:1.3, notch:0.42}, veil:{sp:[0], u:1.75, v:1.45, notch:0.62},
  fork:{sp:[0], u:0.7, v:0.95, notch:0.12}, angel:{sp:[0], u:0.75, v:1.1, notch:0.1}};
// 지느러미: [시작, 끝, 높이, 방향(-1 등 / 1 배), 진하기]
const FINS = {twin:[[0.26, 0.62, 0.19, -1, .72], [0.6, 0.8, 0.11, 1, .66], [0.3, 0.42, 0.08, 1, .6]],
  fan:[[0.42, 0.66, 0.12, -1, .7], [0.55, 0.8, 0.09, 1, .6]],
  veil:[[0.32, 0.8, 0.3, -1, .78], [0.3, 0.92, 0.42, 1, .74], [0.2, 0.3, 0.14, 1, .6]],
  fork:[[0.4, 0.55, 0.09, -1, .6], [0.55, 0.75, 0.08, 1, .5]],
  angel:[[0.12, 0.62, 0.62, -1, .62], [0.22, 0.7, 0.58, 1, .58], [0.18, 0.24, 0.5, 1, .55]]};
const tZ = s => hY(s) * 0.92;
const cyS = s => 0.018 * Math.sin(PI*s);
const NS = 26, sxA = new Float32Array(NS), syA = new Float32Array(NS), rxA = new Float32Array(NS), ryA = new Float32Array(NS), bA = new Float32Array(NS);

function renderFish(fish, Lp){
  const SPC = SPECIES[fish.d.sp], C = SPC.colors[fish.d.variant % SPC.colors.length], TL = TAILS[SPC.tail], EB = SPC.eyeBig || 1;
  BH = SPC.bodyH;
  const S = Math.min(Math.floor(fc.width / DPR), Math.ceil(Lp * (SPC.tail === 'veil' || SPC.tallFins ? 2.9 : 2.6)));
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
    fg.fillStyle = `rgba(${C.pect},.72)`;
    fg.beginPath(); fg.moveTo(p.bx, p.by); fg.quadraticCurveTo(mx + nx, my + ny, p.tx, p.ty); fg.quadraticCurveTo(mx - nx*0.4, my - ny*0.4, p.bx, p.by); fg.fill();
  };
  for (const p of pect) if (p.depth <= 0) drawPect(p);

  // 꼬리: 금붕어 쌍꼬리. 좌우로 치면서 원근으로 좁아졌다 넓어지고, 정면에서는 나비처럼 벌어짐
  const bl = bA[NS-1], flap = 0.45 * eff * Math.sin(ph - 3.5);
  const tbx = sxA[NS-1], tby = syA[NS-1];
  const curl = Math.sin(ph - 3.4)*0.04, curl2 = Math.sin(ph - 3.9)*0.04;
  for (const splay of TL.sp){
    let txs = Math.cos(phi + PI + bl + flap + splay);
    if (Math.abs(txs) < 0.06) txs = 0.06 * (txs < 0 ? -1 : 1);
    const P = (u, v) => [tbx + u*TL.u*txs*L, tby + v*TL.v*L];
    const p0 = P(0,-0.05), c1 = P(0.14,-0.13), c2 = P(0.3,-0.37+curl), p1 = P(0.52,-0.37+curl), c3 = P(0.37,-0.17+curl*.5), p2 = P(TL.notch,0),
          c4 = P(0.37,0.17+curl2*.5), p3 = P(0.52,0.36+curl2), c5 = P(0.3,0.36+curl2), c6 = P(0.14,0.13), p4 = P(0,0.05);
    const tg = fg.createLinearGradient(tbx, 0, tbx + 0.52*TL.u*txs*L, 0);
    tg.addColorStop(0, C.tail[0]); tg.addColorStop(.55, C.tail[1]); tg.addColorStop(1, C.tail[2]);
    fg.fillStyle = tg; fg.beginPath(); fg.moveTo(...p0); fg.bezierCurveTo(...c1, ...c2, ...p1); fg.quadraticCurveTo(...c3, ...p2);
    fg.quadraticCurveTo(...c4, ...p3); fg.bezierCurveTo(...c5, ...c6, ...p4); fg.closePath(); fg.fill();
    fg.strokeStyle = `rgba(${C.ray},.22)`; fg.lineWidth = Math.max(0.5, L*0.006);
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
    fg.fillStyle = `rgba(${C.fin},${alpha})`;
    fg.beginPath(); fg.moveTo(...base[0]); for (const p of base) fg.lineTo(...p); for (let i = tip.length - 1; i >= 0; i--) fg.lineTo(...tip[i]); fg.closePath(); fg.fill();
  };
  for (const f of FINS[SPC.tail]) finPoly(...f);

  // 몸통
  bodyPath();
  const bg = fg.createLinearGradient(0, -0.22*BH*L, 0, 0.22*BH*L);
  bg.addColorStop(0, C.body[0]); bg.addColorStop(.35, C.body[1]); bg.addColorStop(.7, C.body[2]); bg.addColorStop(1, C.body[3]);
  fg.fillStyle = bg; fg.fill();
  fg.save(); bodyPath(); fg.clip();
  const hx = at(sxA, 0.2);
  const hl = fg.createRadialGradient(hx, -0.1*L, 0, hx, -0.1*L, 0.32*L);
  hl.addColorStop(0, 'rgba(255,255,240,.45)'); hl.addColorStop(1, 'rgba(255,255,240,0)');
  fg.fillStyle = hl; fg.fillRect(-L, -L, 2*L, 2*L);
  const side = Math.abs(cph);
  // 무늬
  if (SPC.pattern === 'neon' && side > 0.05){
    fg.fillStyle = 'rgba(225,35,55,.85)'; fg.beginPath(); fg.moveTo(at(sxA, 0.42), 0.012*L);
    for (let q = 0.42; q <= 0.96; q += 0.06) fg.lineTo(at(sxA, q), 0.012*L);
    for (let q = 0.96; q >= 0.42; q -= 0.06) fg.lineTo(at(sxA, q), at(ryA, q) + 0.01*L);
    fg.closePath(); fg.fill();
    fg.strokeStyle = `rgba(70,215,255,${0.6 + 0.3*Math.sin(T*2 + fish.seed)})`; fg.lineWidth = 0.045*L; fg.lineCap = 'round';
    fg.beginPath(); fg.moveTo(at(sxA, 0.18), -0.02*L); for (let q = 0.24; q <= 0.9; q += 0.06) fg.lineTo(at(sxA, q), -0.02*L + 0.01*L*q); fg.stroke();
  } else if (SPC.pattern === 'bars' && side > 0.05){
    fg.fillStyle = 'rgba(38,34,28,.55)';
    for (const q of [0.2, 0.45, 0.7]){ const x = at(sxA, q), w = 0.035*L*Math.max(0.3, side); fg.fillRect(x - w/2, -0.6*L, w, 1.2*L); }
  }
  if (side > 0.2){
    fg.strokeStyle = `rgba(${C.scale},${0.2*side})`; fg.lineWidth = Math.max(0.5, L*0.005);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++){
      const s = 0.36 + c*0.09, x = at(sxA, s), y = -0.09*L + r*0.085*L + (c%2)*0.04*L;
      fg.beginPath(); fg.arc(x, y, 0.045*L, cph > 0 ? -1.2 : PI - 1.2, cph > 0 ? 1.2 : PI + 1.2); fg.stroke();
    }
    const gx = at(sxA, 0.28);
    fg.strokeStyle = `rgba(${C.gill},${0.35*side})`; fg.lineWidth = Math.max(0.7, L*0.01);
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
    const r = 0.078*L*EB*(SPC.size < 0.7 ? 1.15 : 1), sq = clamp(0.45 + 0.55*e.vis, 0.35, 1);
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
      fg.fillStyle = C.lid; fg.fillRect(e.x - r*1.2, e.y - r*1.2, r*2.4, lid - (e.y - r*1.2));
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
    fg.strokeStyle = kiss ? 'rgba(255,140,150,.95)' : `rgba(${C.mouth},.9)`; fg.lineWidth = Math.max(0.7, L*(kiss ? 0.014 : 0.009)); fg.stroke();
  }
  for (const p of pect) if (p.depth > 0) drawPect(p);

  // 깊이 안개
  fg.globalCompositeOperation = 'source-atop';
  fg.fillStyle = rgb(Lt.mid, 0.08); fg.fillRect(-S/2, -S/2, S, S);
  fg.globalCompositeOperation = 'source-over';
  fg.restore();
  return S;
}

/* ================= 분위기: 창밖 풍경, 비, 스탠드 불빛, 드문 사건 ================= */
// 창밖 배경 테마별 빛망울 색
const BOKEH_PAL = {
  city:  [[255,178,102],[255,196,130],[255,160,90],[130,170,255],[150,190,255],[255,140,170]],
  forest:[[170,220,120],[210,235,140],[140,200,110],[255,236,160],[190,230,150],[120,180,100]],
  sea:   [[150,200,255],[190,220,255],[255,220,170],[130,180,240],[210,235,255],[255,200,150]],
  cafe:  [[255,190,110],[255,210,140],[255,170,90],[255,225,170],[255,150,80],[255,200,120]],
  space: [[150,130,255],[110,200,255],[255,140,220],[180,160,255],[120,230,230],[255,180,240]]
};
const theme = () => (tank && tank.bg) || 'city';
function genBokeh(){
  bokeh.length = 0; stars.length = 0; flies.length = 0;
  const th = theme(), pal = BOKEH_PAL[th] || BOKEH_PAL.city, k = MIN / 390;
  const n = th === 'space' ? 10 : th === 'sea' ? 14 : 26;
  for (let i = 0; i < n; i++){
    const c = pal[Math.random() < 0.62 ? (Math.random()*3) | 0 : 3 + ((Math.random()*3) | 0)];
    const y = th === 'sea' ? H*(0.36 + 0.08*Math.random()) : H*0.8*Math.pow(Math.random(), 1.5);
    bokeh.push({x:rand(-0.05, 1.05)*W, y, r:rand(9, 30)*k*(th === 'forest' ? 1.6 : th === 'sea' ? 0.5 : 1), c, a:rand(.25, .6), tw:rand(.15, .5), ph:rand(0, 6)});
  }
  const ns = th === 'space' ? 160 : 34;
  for (let i = 0; i < ns; i++) stars.push({x:rand(0, W), y:(th === 'space' ? H : H*0.5)*Math.pow(Math.random(), th === 'space' ? 1 : 1.3), r:rand(.4, th === 'space' ? 1.5 : 1.1), tw:rand(.2, .7), ph:rand(0, 6)});
  if (th === 'forest') for (let i = 0; i < 14; i++) flies.push({x:rand(0, W), y:rand(0.05, 0.6)*H, ph:rand(0, 6), sp:rand(.2, .6)});
}
// 테마 풍경 (창밖)
function drawScenery(th){
  const night = Lt.city, day = 1 - night;
  if (th === 'sea'){
    const hz = H*0.42;
    const sky = ctx.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, rgb(lerpC([120, 180, 230], [8, 14, 34], night), 0.55*(1 - 0.4*rainK))); sky.addColorStop(1, rgb(lerpC([250, 214, 190], [24, 34, 66], night), 0.55*(1 - 0.4*rainK)));
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, hz);
    const sea = ctx.createLinearGradient(0, hz, 0, H);
    sea.addColorStop(0, rgb(lerpC([60, 130, 180], [12, 26, 52], night), 0.6)); sea.addColorStop(1, rgb(lerpC([20, 60, 100], [4, 10, 24], night), 0.6));
    ctx.fillStyle = sea; ctx.fillRect(0, hz, W, H - hz);
    // 해·달과 물빛 길
    const mx = W*0.68, my = hz - H*0.12;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(mx, my, 0, mx, my, 40*SK);
    g.addColorStop(0, `rgba(255,248,225,${0.75 - 0.3*rainK})`); g.addColorStop(0.3, `rgba(255,240,210,${0.3 - 0.15*rainK})`); g.addColorStop(1, 'rgba(255,240,210,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(mx, my, 40*SK, 0, PI*2); ctx.fill();
    for (let i = 0; i < 18; i++){
      const y = hz + 4 + i*i*1.6*SK, w = (6 + i*2.5)*SK*(0.6 + 0.4*Math.sin(T*1.3 + i*1.7));
      ctx.fillStyle = `rgba(255,240,210,${(0.32 - i*0.015)*(1 - 0.5*rainK)})`; ctx.fillRect(mx - w/2 + Math.sin(T*0.8 + i)*4*SK, y, w, 1.6*SK);
    }
    ctx.globalCompositeOperation = 'source-over';
  } else if (th === 'space'){
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, r, c] of [[0.25, 0.22, 0.5, [80, 40, 140]], [0.8, 0.5, 0.45, [20, 90, 120]], [0.4, 0.75, 0.4, [120, 30, 90]]]){
      const g = ctx.createRadialGradient(x*W, y*H, 0, x*W, y*H, r*MIN*1.2);
      g.addColorStop(0, rgb(c, 0.22)); g.addColorStop(1, rgb(c, 0)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = 'source-over';
    const px = W*0.74, py = H*0.17, pr = 46*SK;
    const pg = ctx.createRadialGradient(px - pr*0.4, py - pr*0.4, pr*0.1, px, py, pr);
    pg.addColorStop(0, '#f2c98a'); pg.addColorStop(0.6, '#c4744a'); pg.addColorStop(1, '#3a1c22');
    ctx.save(); ctx.translate(px, py); ctx.rotate(-0.35);
    ctx.strokeStyle = 'rgba(240,210,170,.45)'; ctx.lineWidth = 5*SK; ctx.beginPath(); ctx.ellipse(0, 0, pr*1.8, pr*0.42, 0, PI, PI*2); ctx.stroke();
    ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(0, 0, pr, 0, PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, pr*1.8, pr*0.42, 0, 0, PI); ctx.stroke();
    ctx.restore();
  } else if (th === 'cafe'){
    // 전구 줄
    for (let row = 0; row < 2; row++){
      const y0 = H*(0.06 + row*0.13), sag = H*0.05, x0 = -W*0.05, x1 = W*1.05;
      ctx.strokeStyle = 'rgba(20,14,10,.55)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i <= 24; i++){ const u = i/24, x = lerp(x0, x1, u), y = y0 + sag*4*u*(1 - u); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i < 9; i++){
        const u = i/9 + (row ? 0.05 : 0), x = lerp(x0, x1, u), y = y0 + sag*4*u*(1 - u) + 6*SK, a = 0.55 + 0.45*night, fl = 0.85 + 0.15*Math.sin(T*3 + i*2.1 + row);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 22*SK);
        g.addColorStop(0, `rgba(255,214,150,${0.8*a*fl})`); g.addColorStop(0.2, `rgba(255,190,110,${0.35*a*fl})`); g.addColorStop(1, 'rgba(255,170,90,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 22*SK, 0, PI*2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }
}
const lerpC = (a, b, t) => a.map((v, i) => lerp(v, b[i], t));
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
  rainK += ((G.set.rain ? 1 : 0) - rainK) * Math.min(1, dt*0.6);
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

const AIR_TINT = {forest:[[14, 30, 20], .45], cafe:[[40, 24, 16], .45], space:[[4, 5, 14], .8], sea:[[10, 22, 36], .3]};
function drawBackdrop(dn, pr){
  const th = theme(), tint = AIR_TINT[th];
  let airC = Lt.air.map((v, i) => lerp(v, [16, 24, 38][i], rainK*0.5));
  if (tint) airC = airC.map((v, i) => lerp(v, tint[0][i], tint[1]));
  const air = ctx.createLinearGradient(0, 0, W, H);
  air.addColorStop(0, rgb(airC.map(v => v*1.15))); air.addColorStop(1, rgb(airC.map(v => v*0.7)));
  ctx.fillStyle = air; ctx.fillRect(0, 0, W, H);
  if (Lt.win > 0.01){
    const g = ctx.createRadialGradient(W*0.62, -H*0.1, 0, W*0.62, -H*0.1, H*0.9);
    g.addColorStop(0, `rgba(210,232,240,${0.16*Lt.win*(1 - 0.5*rainK)})`); g.addColorStop(1, 'rgba(210,232,240,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }
  drawScenery(th);
  const sky = (th === 'space' ? 1 : th === 'cafe' ? 0 : Lt.city)*(1 - rainK);
  if (sky > 0.02) for (const st of stars){ ctx.fillStyle = `rgba(235,240,255,${0.5*sky*(0.55 + 0.45*Math.sin(T*st.tw + st.ph))})`; ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, PI*2); ctx.fill(); }
  // 빛망울: 도시·바다는 밤에, 숲은 낮에, 카페·우주는 늘
  const bk = th === 'forest' ? 0.35 + 0.65*(1 - Lt.city) : th === 'cafe' ? 0.6 + 0.4*Lt.city : th === 'space' ? 0.7 : Lt.city;
  if (bk > 0.01){
    ctx.globalCompositeOperation = 'lighter';
    for (const b of bokeh){
      const a = b.a*bk*(0.78 + 0.22*Math.sin(T*b.tw + b.ph))*0.55*(1 - 0.15*rainK), r = b.r*(1 + 0.4*rainK);
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, r);
      g.addColorStop(0, rgb(b.c, a)); g.addColorStop(0.55, rgb(b.c, a*0.55)); g.addColorStop(1, rgb(b.c, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, PI*2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  // 반딧불이 (숲, 밤)
  if (flies.length && Lt.city > 0.2){
    ctx.globalCompositeOperation = 'lighter';
    for (const f of flies){
      const x = f.x + Math.sin(T*f.sp + f.ph)*30*SK, y = f.y + Math.cos(T*f.sp*1.3 + f.ph)*20*SK, a = Lt.city*Math.max(0, Math.sin(T*1.7*f.sp + f.ph*3))*(1 - rainK);
      if (a < 0.02) continue;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 9*SK); g.addColorStop(0, `rgba(230,255,150,${0.9*a})`); g.addColorStop(1, 'rgba(200,255,120,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 9*SK, 0, PI*2); ctx.fill();
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
function drawSnail(sn, km, g){
  g = g || ctx;
  const k = MIN/390*1.3*(km || 1);
  if (sn.trail.length > 1){
    g.strokeStyle = 'rgba(220,240,245,.1)'; g.lineWidth = 3*k; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(sn.trail[0].x, sn.trail[0].y); for (const p of sn.trail) g.lineTo(p.x, p.y); g.stroke();
  }
  const wig = Math.sin(sn.t*2.2), cr = 1 + 0.05*Math.max(0, Math.sin(sn.t*1.4));
  g.save(); g.translate(sn.x, sn.y); g.rotate(sn.ang); g.scale(k*sn.dir*cr, k);
  g.fillStyle = '#ecdcbc';
  g.beginPath(); g.moveTo(-17, 5); g.quadraticCurveTo(-4, 7.5, 12, 5); g.quadraticCurveTo(18, 3.5, 17.5, -2); g.quadraticCurveTo(16, -8, 10.5, -6.5); g.quadraticCurveTo(4, -2, -12, 1); g.quadraticCurveTo(-18, 2, -17, 5); g.fill();
  g.strokeStyle = '#ecdcbc'; g.lineWidth = 1.8; g.lineCap = 'round';
  g.beginPath(); g.moveTo(13.5, -5.5); g.quadraticCurveTo(15, -10, 16.5 + wig*0.8, -14); g.moveTo(11.5, -5.5); g.quadraticCurveTo(10.5, -10, 12 + wig*0.6, -13.6); g.stroke();
  g.fillStyle = '#2a1a10'; g.beginPath(); g.arc(16.5 + wig*0.8, -14.5, 1.6, 0, PI*2); g.arc(12 + wig*0.6, -14, 1.5, 0, PI*2); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(16 + wig*0.8, -15, 0.5, 0, PI*2); g.arc(11.5 + wig*0.6, -14.5, 0.5, 0, PI*2); g.fill();
  g.strokeStyle = 'rgba(120,70,40,.6)'; g.lineWidth = 0.8; g.beginPath(); g.arc(15.2, -1.5, 1.4, 0.2, PI - 0.4); g.stroke();
  g.fillStyle = 'rgba(255,140,140,.45)'; g.beginPath(); g.ellipse(13, -0.5, 1.6, 1, 0, 0, PI*2); g.fill();
  const sg = g.createRadialGradient(-5, -11, 1, -3, -7, 11); sg.addColorStop(0, '#e39a5a'); sg.addColorStop(1, '#8a4a22');
  g.fillStyle = sg; g.beginPath(); g.arc(-3, -7, 9.5, 0, PI*2); g.fill();
  g.strokeStyle = 'rgba(90,40,15,.55)'; g.lineWidth = 1.3; g.beginPath();
  for (let a = 0; a <= 4*PI; a += 0.15){ const r = 8.2*(1 - a/(4.6*PI)), x = -3 + Math.cos(a + 1)*r, y = -7 + Math.sin(a + 1)*r; a ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  g.fillStyle = 'rgba(255,240,220,.35)'; g.beginPath(); g.ellipse(-6.5, -12, 3, 1.6, -0.5, 0, PI*2); g.fill();
  g.restore();
}

/* ================= 장식 ================= */
const decoY = () => H - floorH*0.62;     // 장식이 놓이는 높이 (모래에 살짝 묻힘)
const decoS = () => SK*Math.sqrt(zoom);
function updateDecos(dt){
  const dn = down();
  for (const o of decos){
    if (!DECOR[o.d.k] || !DECOR[o.d.k].rolls) continue;
    // 마리모는 기울인 쪽으로 굴러감
    const wet = depthAt(o.d.x*W, decoY() - 12*SK) > 0;
    o.v += dn.x * (wet ? 0.28 : 0.9) * dt;
    o.v *= Math.exp(-dt*(wet ? 1.4 : 0.7));
    o.d.x += o.v*dt;
    if (o.d.x < 0.05){ o.d.x = 0.05; o.v = Math.abs(o.v)*0.35; }
    if (o.d.x > 0.95){ o.d.x = 0.95; o.v = -Math.abs(o.v)*0.35; }
    o.rot = (o.rot || 0) + o.v*W*dt/(13*decoS());
    if (Math.abs(o.v) > 0.002) dirty = true;
  }
}
// 장식 층은 바닥 쪽 띠만 그림 (화면 전체보다 훨씬 가벼움)
let decoTop = 0, decoFrame = 0, decoHas = false;
function decoBand(){
  let h = floorH + 6;
  for (const o of decos){ const sz = decorSize(o.d.k) || {w:40, h:60}; h = Math.max(h, (sz.h + 24)*decoS() + floorH); }
  return Math.min(H, Math.ceil(h));
}
function renderDecorLayer(){
  if (!floorH && !decos.length){ decoHas = false; return false; }
  // 수초 흔들림은 느리므로 두 장에 한 번만 다시 그림
  if (decoHas && (decoFrame++ & 1) && !editMode) return true;
  const bh = decoBand(), ph = Math.ceil(bh*DPR);
  if (dc.height !== ph || dc.width !== cv.width){ dc.width = cv.width; dc.height = ph; }
  decoTop = H - bh;
  dg.setTransform(1, 0, 0, 1, 0, 0); dg.clearRect(0, 0, dc.width, dc.height);
  dg.setTransform(DPR, 0, 0, DPR, 0, -decoTop*DPR);
  const dn = down(), up = {x:-dn.x, y:-dn.y}, wet = (px, py) => depthAt(px, py) > 0, y = decoY(), s = decoS();
  const back = decos.filter(o => (o.d.z || 0) < 0.5), front = decos.filter(o => (o.d.z || 0) >= 0.5);
  for (const o of back) drawDecor(dg, o.d.k, {x:o.d.x*W, y, s, t:o.rot != null ? o.rot*4 + T*0.3 : T, up, wet, flow:flowK, seed:o.d.seed});
  if (floorH) drawFloor(dg, tank.floor, {W, H, h:floorH, s:SK, seed:strSeed(tank.id) & 0xffff});
  for (const o of front) drawDecor(dg, o.d.k, {x:o.d.x*W, y, s, t:o.rot != null ? o.rot*4 + T*0.3 : T, up, wet, flow:flowK, seed:o.d.seed});
  decoHas = true;
  return true;
}
const blitDeco = () => ctx.drawImage(dc, 0, 0, dc.width, dc.height, 0, decoTop, W, dc.height / DPR);
// 장식 놓기 / 치우기
function placeDecor(k){
  if (tank.decor.length >= LIMITS.decor) return false;
  const d = {k, x:freeSpot(), seed:(Math.random()*1e6) | 0, z:Math.random() < 0.5 ? 0.25 : 0.75};
  tank.decor.push(d); decos.push({d, v:0});
  dirty = true; return d;
}
function freeSpot(){
  let best = 0.5, bd = -1;
  for (let i = 0; i < 24; i++){
    const x = rand(0.1, 0.9); let m = 1;
    for (const o of decos) m = Math.min(m, Math.abs(o.d.x - x));
    if (m > bd){ bd = m; best = x; }
  }
  return best;
}
function removeDecor(d){
  const i = tank.decor.indexOf(d); if (i < 0) return;
  tank.decor.splice(i, 1); decos = decos.filter(o => o.d !== d);
  G.inv[d.k] = (G.inv[d.k] || 0) + 1; dirty = true;
}
function decoAt(x, y){
  const s = decoS(), yb = decoY();
  let hit = null, best = Infinity;
  for (const o of decos){
    const sz = decorSize(o.d.k) || {w:40, h:40}, cx = o.d.x*W;
    const w = Math.max(44, sz.w*s), h = Math.max(44, sz.h*s);
    if (x > cx - w/2 && x < cx + w/2 && y > yb - h && y < yb + floorH){
      const dd = Math.abs(x - cx); if (dd < best){ best = dd; hit = o; }
    }
  }
  return hit;
}
function drawEditOverlay(){
  const s = decoS(), yb = decoY();
  ctx.save();
  ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5;
  for (const o of decos){
    const sz = decorSize(o.d.k) || {w:40, h:40}, cx = o.d.x*W, w = Math.max(44, sz.w*s), h = Math.max(44, sz.h*s);
    const on = drag && drag.o === o;
    ctx.strokeStyle = on ? 'rgba(255,190,120,.95)' : 'rgba(230,255,250,.7)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - w/2, yb - h, w, h + 6, 10) : ctx.rect(cx - w/2, yb - h, w, h + 6); ctx.stroke();
  }
  ctx.restore();
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
    } else if (it.k === 'c'){
      drawCreature(it.o);
    }
  }
}
function drawCreature(c){
  const K = SPECIES[c.d.sp].kind;
  if (K === 'crawler'){ drawCrawler(c); return; }
  const Lp = fishLen(c);
  if (K === 'fish'){
    const S = renderFish(c, Lp);
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(psi); ctx.drawImage(fc, 0, 0, S*DPR, S*DPR, -S/2, -S/2, S, S); ctx.restore();
    return;
  }
  const cph = Math.cos(c.phi), sg = cph >= 0 ? 1 : -1;
  const nearFloor = c.y > floorTop() - 0.5*Lp;
  const mode = c.mode === 'air' && c.atAir ? 'surface' : c.effort < 0.32 ? (nearFloor && c.d.sp === 'axolotl' ? 'walk' : 'rest') : 'swim';
  drawCritter(ctx, c.d.sp, {x:c.x, y:c.y, L:Lp, face:cph, rot:psi + c.pitch*sg*0.6 + (c.dizzy > 0 ? Math.sin(T*9)*0.15 : 0), t:T, phase:c.phase, effort:c.effort, mode,
    sleepy:c.sleepy, mouth:c.chomp > 0 ? 0.4 + 0.6*Math.abs(Math.sin(c.chomp*16)) : c.mouth*0.4, blush:c.blush, variant:c.d.variant});
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
  // 바닥과 장식 (물 밖으로 드러난 부분)
  const hasDeco = renderDecorLayer();
  if (hasDeco) blitDeco();
  const bth = 9 + 5*zoom;
  // 물 (뒤 풍경이 살짝 비침)
  ctx.save();
  ctx.translate(CX, CY); ctx.rotate(psi);
  waterPath();
  const wg = ctx.createLinearGradient(0, level, 0, level + maxDepth);
  wg.addColorStop(0, rgb(Lt.top, 0.86)); wg.addColorStop(.2, rgb(Lt.top.map((v, i) => (v + Lt.mid[i])/2), 0.9)); wg.addColorStop(.6, rgb(Lt.mid, 0.94)); wg.addColorStop(1, rgb(Lt.deep, 0.97));
  ctx.fillStyle = wg; ctx.fill(); ctx.clip();
  // 물에 잠긴 장식
  if (hasDeco){ ctx.save(); ctx.setTransform(DPR, 0, 0, DPR, 0, 0); blitDeco(); ctx.fillStyle = rgb(Lt.mid, 0.16); ctx.fillRect(0, decoTop, W, H - decoTop); ctx.restore(); }

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
  creatures.forEach((c, i) => list.push({k:'c', z:SPECIES[c.d.sp].kind === 'crawler' ? 0.2 : 0.5 - i*0.001, o:c}));
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
  // 수면에 비친 물고기 (가까운 몇 마리만)
  for (const fish of creatures){
    if (SPECIES[fish.d.sp].kind !== 'fish' || QUAL > 1) continue;
    const Lp = fishLen(fish), ff = toFrame(fish.x, fish.y);
    const by = surfYF(ff[0]) + bth, dist = ff[1] - by;
    const a = 0.45*clamp(1 - dist/(1.3*Lp), 0, 1)*Lt.band;
    if (a > 0.01){
      const S = renderFish(fish, Lp);
      ctx.save(); ctx.globalAlpha = a; ctx.translate(ff[0], by - dist*0.55); ctx.scale(1, -0.55);
      ctx.drawImage(fc, 0, 0, S*DPR, S*DPR, -S/2, -S/2, S, S); ctx.restore();
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

  // 유리에 낀 이끼
  renderMoss(); if (mossVisible){ ctx.imageSmoothingEnabled = true; ctx.drawImage(mhc, 0, 0, W, H); }
  for (const p of pops){
    if (p.t < 0) continue;
    const a = Math.sin(PI*clamp(p.t/0.9, 0, 1)), r = (3 + 7*p.t)*SK;
    ctx.strokeStyle = `rgba(255,255,240,${0.85*a})`; ctx.lineWidth = 1.4; ctx.beginPath();
    ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r); ctx.stroke();
  }
  if (editMode) drawEditOverlay();

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
  ctx.fillStyle = vign; ctx.fillRect(0, 0, W, H);
}

/* ================= 루프 ================= */
const PERF = {u:0, d:0, n:0};
let frAvg = 1/60, qualT = 0;
let metaTimer = 0, saveTimer = 0, causT = 0, slowTimer = 0;
function loop(now){
  requestAnimationFrame(loop);
  const raw = (now - last)/1000;
  if (!G.set.smooth && raw < 1/30 - 0.004) return;   // 절전: 초당 30장
  const dt = clamp(raw, 0, 0.05); last = now; T += dt;
  const t0 = performance.now(); update(dt); const t1 = performance.now(); draw(); const t2 = performance.now();
  PERF.u += t1 - t0; PERF.d += t2 - t1; PERF.n++;
  if (caus.length < CN){ causT += dt; if (causT > 0.05){ causT = 0; caus.push(genCaustic(0.6 + caus.length*0.2)); } }
  metaTimer -= dt; if (metaTimer < 0){ metaTimer = 1; updateMeta(); }
  slowTimer -= dt;
  if (slowTimer < 0){
    slowTimer = 5;
    if (rollDay()){ for (const d of tank.creatures) if (!creatures.some(c => c.d === d)) creatures.push(makeRuntime(d)); if (started) dailyVisit(); }
    if (started) checkAch();
  }
  // 느리면 화질을 한 단계씩 낮춤 (선명도 → 수면 반사)
  frAvg += (raw - frAvg)*0.05;
  if (started && frAvg > 0.026 && QUAL < 2 && T - qualT > 4){ QUAL++; qualT = T; frAvg = 1/60; resize(); }
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
// 한 손가락: 톡(먹이·부르기·쓰다듬기), 끌기(이끼 닦기, 센서가 없으면 기울이기). 두 손가락: 확대·축소
const ptrs = new Map();
let pd = null, pinch = null, drag = null;
cv.addEventListener('pointerdown', e => {
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  try { cv.setPointerCapture(e.pointerId); } catch(_){}
  if (ptrs.size === 2){
    const [a, b] = [...ptrs.values()];
    pinch = {d:Math.hypot(a.x - b.x, a.y - b.y) || 1, z:zoomT}; pd = null; drag = null; return;
  }
  if (ptrs.size > 2) return;
  const x = e.clientX, y = e.clientY;
  pd = {x, y, lx:x, ly:y, moved:false, rub:started && !editMode && !clockOn && mossAt(x, y) > 0.06};
  if (editMode){ const o = decoAt(x, y); if (o) drag = {o, dx:o.d.x*W - x}; }
});
cv.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.set(e.pointerId, {x:e.clientX, y:e.clientY});
  if (pinch && ptrs.size >= 2){
    const [a, b] = [...ptrs.values()];
    zoomT = clamp(pinch.z * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d, ZOOM_MIN, ZOOM_MAX);
    G.set.zoom = zoomT; dirty = true; refreshZoomSeg(); return;
  }
  if (!pd) return;
  const x = e.clientX, y = e.clientY, mv = Math.hypot(x - pd.lx, y - pd.ly);
  if (!pd.moved && Math.hypot(x - pd.x, y - pd.y) > 10) pd.moved = true;
  if (pd.moved){
    if (drag){ drag.o.d.x = clamp((x + drag.dx) / W, 0.04, 0.96); drag.o.v = 0; dirty = true; }
    else if (pd.rub || (started && !editMode && mossAt(x, y) > 0.06 && hasSensor)){ pd.rub = true; rub(x, y, mv); }
    else if (!hasSensor && !editMode) psiT -= (x - pd.lx)*0.006;
  }
  pd.lx = x; pd.ly = y;
});
function endPtr(e, cancel){
  ptrs.delete(e.pointerId);
  if (pinch){ if (ptrs.size < 2) pinch = null; pd = null; return; }
  if (pd && !pd.moved && !cancel) tap(e.clientX, e.clientY);
  pd = null; drag = null;
  if (!cancel) showUI();
}
cv.addEventListener('pointerup', e => endPtr(e, false));
cv.addEventListener('pointercancel', e => endPtr(e, true));
cv.addEventListener('wheel', e => { e.preventDefault(); zoomT = clamp(zoomT * Math.exp(-e.deltaY*0.0015), ZOOM_MIN, ZOOM_MAX); G.set.zoom = zoomT; dirty = true; refreshZoomSeg(); }, {passive:false});

function creatureAt(x, y){
  let best = null, bd = Infinity;
  for (const c of creatures){
    const d = Math.hypot(c.x - x, c.y - y), r = Math.max(26, 0.5*fishLen(c));
    if (d < r && d < bd){ bd = d; best = c; }
  }
  return best;
}
function tap(x, y){
  if (!started) return;
  if (clockOn){ clockTap(); return; }
  if (sheetOpen()){ closeSheet(); return; }
  if (editMode){ const o = decoAt(x, y); if (o) openDecoPop(o); return; }
  if (depthAt(x, y) < 0){ dropFood(x, y, 1 + (Math.random()*2 | 0)); return; }
  rings.push({x, y, t:0, s:1}); bloop(1, 0.02);
  const hit = creatureAt(x, y);
  if (hit){
    if (hit.mode === 'sleep' || hit.sleepy > 0.3) hit.awakeT = 25;
    selectCreature(hit); petCreature(hit); return;
  }
  const c = sel && SPECIES[sel.d.sp].kind !== 'crawler' ? sel : creatures.find(q => SPECIES[q.d.sp].kind !== 'crawler');
  if (!c) return;
  const l = fishLen(c);
  if (c.mode === 'sleep' || c.sleepy > 0.3) c.awakeT = 25;
  if (inWater(x, y, l*0.25)){ setTarget(c, x, y, 0.5); c.mode = 'call'; c.timer = 8; }
}
window.addEventListener('keydown', e => {
  if (e.target && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return;
  if (e.key === 'ArrowUp'){ setFill(G.set.fill*100 + 5); return; }
  if (e.key === 'ArrowDown'){ setFill(G.set.fill*100 - 5); return; }
  if (e.key === 'ArrowLeft') psiT += 0.25;
  else if (e.key === 'ArrowRight') psiT -= 0.25;
  else if (e.key === 's' || e.key === 'S') shake(true);
  else if (e.key === 'f' || e.key === 'F') feed();
  else if (e.key === 't' || e.key === 'T') setOpt('tod', (G.set.tod + 1) % TOD_NAMES.length);
  else if (e.key === 'r' || e.key === 'R') setOpt('rain', G.set.rain ? 0 : 1);
  else if (e.key === 'e' || e.key === 'E'){ triggerEvent(EVENTS[eventIdx % 3]); eventIdx++; }
  else if (e.key === 'Escape'){ if (sheetOpen()) closeSheet(); else if (editMode) setEdit(false); else if (clockOn) setClock(false); }
});

/* ================= UI ================= */
const $ = id => document.getElementById(id);
const ui = $('ui'), hint = $('hint'), sheet = $('sheet'), sheetBody = $('sheetBody'), modalEl = $('modal');
const PEARL = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8.5" r="5.6" fill="#f3ecf6"/><circle cx="6.2" cy="6.6" r="1.8" fill="#fff"/><circle cx="8" cy="8.5" r="5.6" fill="none" stroke="#c9b8d6" stroke-width="1"/></svg>';
let uiTimer = 0;
function showUI(){
  ui.classList.remove('idle'); clearTimeout(uiTimer);
  uiTimer = setTimeout(function idle(){ if (sheetOpen() || editMode || !modalEl.hidden){ uiTimer = setTimeout(idle, 3000); return; } ui.classList.add('idle'); }, 6000);
}
function say(text, ms){ hint.textContent = text; hint.classList.remove('off'); clearTimeout(say.t); say.t = setTimeout(() => hint.classList.add('off'), ms); }
function toast(text){ const t = $('toast'); t.textContent = text; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); }
const stage = g => g < 0.25 ? '아기' : g < 0.6 ? '어린이' : '어른';
const hearts5 = a => { const n = Math.round(a*5); return '♥'.repeat(n) + '♡'.repeat(5 - n); };
const cDays = d => Math.max(1, todayN() - d.born + 1);

/* ---- 상태 표시 ---- */
let shownPearls = G.pearls;
const sndBtn = $('snd'), sndWave = $('wave');
function updateMeta(){
  if (shownPearls !== G.pearls) shownPearls = Math.abs(G.pearls - shownPearls) < 2 ? G.pearls : shownPearls + (G.pearls - shownPearls)*0.35;
  $('pearls').textContent = fmt(shownPearls); $('pearls2').textContent = fmt(G.pearls);
  const fu = Math.round(tank.full*100), cl = Math.round(cleanliness()*100);
  $('fullV').textContent = fu + '%'; $('fullV').classList.toggle('low', fu < 30);
  $('cleanV').textContent = cl + '%'; $('cleanV').classList.toggle('low', cl < 70);
  refreshChip();
}
function refreshChip(){
  const c = sel;
  $('chip').hidden = !c;
  if (!c) return;
  $('fname').textContent = c.d.name;
  $('fsp').textContent = `${SPECIES[c.d.sp].name} · ${stage(c.d.growth)}`;
  $('fday').textContent = `함께한 지 ${cDays(c.d)}일째`;
  $('fheart').textContent = hearts5(c.d.aff);
  $('fheart').setAttribute('aria-label', `친밀도 5칸 중 ${Math.round(c.d.aff*5)}칸`);
}
setInterval(() => { if (shownPearls !== G.pearls && tank) updateMeta(); }, 80);

/* ---- 위쪽 버튼 ---- */
$('feed').addEventListener('click', () => { feed(); showUI(); });
sndBtn.addEventListener('click', () => { setSound(!soundOn); showUI(); });
$('menuBtn').addEventListener('click', () => { openSheet(); showUI(); });
$('chip').addEventListener('click', () => { openSheet('tank'); showUI(); });

/* ---- 모달 ---- */
let modalFns = [];
function openModal(title, html, btns){
  $('mTitle').textContent = title; $('mBody').innerHTML = html;
  modalFns = btns.map(b => b.fn);
  $('mBtns').innerHTML = btns.map((b, i) => `<button class="${b.cls || 'ghost'}" data-i="${i}">${esc(b.label)}</button>`).join('');
  modalEl.hidden = false; showUI();
  const f = modalEl.querySelector('input,textarea') || modalEl.querySelector('.mbtns .solid'); if (f) setTimeout(() => f.focus(), 50);
}
function closeModal(){ modalEl.hidden = true; modalFns = []; setTimeout(showReward, 350); }
$('mBtns').addEventListener('click', e => { const b = e.target.closest('button'); if (b && modalFns[+b.dataset.i]) modalFns[+b.dataset.i](); });
modalEl.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT'){ const s = modalEl.querySelector('.mbtns .solid'); if (s) s.click(); } });
function confirmBox(title, html, okLabel, fn){ openModal(title, html, [{label:'그만두기', fn:closeModal}, {label:okLabel, cls:'solid', fn:() => { closeModal(); fn(); }}]); }

/* ---- 보상 카드 ---- */
function showReward(){
  if (!started || !modalEl.hidden || sheetOpen() || clockOn || !G.queue.length) return;
  const r = G.queue[0];
  openModal(r.t, `${r.d ? `<p>${esc(r.d)}</p>` : ''}<div class="big">${PEARL}<span>+${fmt(r.p)}</span></div>`, [{label:'받기', cls:'solid', fn:() => {
    G.queue.shift(); G.pearls += r.p; chime(); dirty = true; persist(); updateMeta(); closeModal(); setTimeout(showReward, 380);
  }}]);
}
function dailyVisit(){
  if (G.daily.visit) return;
  G.daily.visit = true;
  const bonus = G.streak > 1 && G.streak % 7 === 0 ? REWARD.streak7 : 0;
  reward('오늘도 와 주셨네요', G.streak > 1 ? `${G.streak}일 연속으로 찾아왔습니다.${bonus ? ' 일주일 보너스까지 드립니다.' : ''}` : '하루에 한 번 먹이를 주고 유리를 닦아 주면 진주를 받습니다.', REWARD.visit + bonus);
}
function showIntro(){
  openModal('어항멍 돌보는 법', `<ol>
    <li><b>먹이</b> 버튼이나 물 위를 톡 치면 먹이가 떨어집니다.</li>
    <li>유리에 이끼가 끼면 <b>손가락으로 문질러</b> 닦아 주세요.</li>
    <li>모은 <b>진주</b>로 친구를 들이고 어항을 꾸밉니다.</li>
  </ol><p>물고기는 아프거나 죽지 않습니다. 바라보기만 해도 됩니다.</p>`, [{label:'시작하기', cls:'solid', fn:() => { G.intro = true; dirty = true; closeModal(); dailyVisit(); showReward(); }}]);
}

/* ---- 메뉴 시트 ---- */
let curTab = 'shop';
const sheetOpen = () => !sheet.hidden;
function openSheet(tab){ setEdit(false); sheet.hidden = false; setTab(tab || curTab); }
function closeSheet(){ if (sheet.hidden) return; sheet.hidden = true; setTimeout(showReward, 350); }
function setTab(t){
  curTab = t;
  sheet.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === t));
  renderSheet();
}
sheet.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTab(b.dataset.tab); });
$('sheetClose').addEventListener('click', closeSheet);
function renderSheet(){
  if (!sheetOpen()) return;
  const top = sheetBody.scrollTop;
  sheetBody.innerHTML = ({shop:renderShop, deco:renderDeco, tank:renderTanks, dex:renderDex, set:renderSettings})[curTab]();
  sheetBody.scrollTop = top;
  sheetBody.querySelectorAll('canvas[data-th]').forEach(drawThumbCanvas);
  $('pearls2').textContent = fmt(G.pearls);
}
const priceBtn = (t, k, p, extra) => `<button class="price" data-act="buy" data-t="${t}" data-k="${k}" ${G.pearls < p || extra ? 'disabled' : ''}>${PEARL}${fmt(p)}</button>`;
const th = (key, w, h) => `<canvas data-th="${key}" width="${(w || 72)*2}" height="${(h || 56)*2}"></canvas>`;

function renderShop(){
  const full = creatures.length >= LIMITS.creatures;
  const spCard = k => { const S = SPECIES[k]; return `<div class="card3">${th('sp:' + k)}<div class="nm">${S.name}</div><div class="ds">${S.desc}</div>${priceBtn('sp', k, S.price, full)}</div>`; };
  const fish = SPECIES_ORDER.filter(k => SPECIES[k].kind === 'fish'), pals = SPECIES_ORDER.filter(k => SPECIES[k].kind !== 'fish');
  let h = `<div class="sec"><span>물고기</span><span>${creatures.length}/${LIMITS.creatures}마리</span></div><div class="grid">${fish.map(spCard).join('')}</div>`;
  h += `<div class="sec"><span>친구들</span><span>새우·달팽이는 이끼를 먹어 줍니다</span></div><div class="grid">${pals.map(spCard).join('')}</div>`;
  h += `<div class="sec"><span>장식</span><span>${tank.decor.length}/${LIMITS.decor}개 놓임</span></div><div class="grid">${DECOR_ORDER.map(k => `<div class="card3">${th('deco:' + k)}<div class="nm">${DECOR[k].name}</div>${G.inv[k] ? `<div class="ds">보관함 ${G.inv[k]}개</div>` : ''}${priceBtn('deco', k, DECOR[k].price)}</div>`).join('')}</div>`;
  h += `<div class="sec"><span>바닥</span></div><div class="grid">${FLOOR_ORDER.filter(k => FLOORS[k].price).map(k => `<div class="card3">${th('floor:' + k)}<div class="nm">${FLOORS[k].name}</div>${G.owned.floor.includes(k) ? '<div class="ds">가지고 있음</div>' : priceBtn('floor', k, FLOORS[k].price)}</div>`).join('')}</div>`;
  h += `<div class="sec"><span>창밖 풍경</span></div><div class="grid">${BG_ORDER.filter(k => BACKGROUNDS[k].price).map(k => `<div class="card3">${th('bg:' + k)}<div class="nm">${BACKGROUNDS[k].name}</div><div class="ds">${BACKGROUNDS[k].desc}</div>${G.owned.bg.includes(k) ? '<div class="ds">가지고 있음</div>' : priceBtn('bg', k, BACKGROUNDS[k].price)}</div>`).join('')}</div>`;
  h += `<div class="sec"><span>도구</span></div><div class="grid">${ITEM_ORDER.map(k => { const I = ITEMS[k], own = G.owned.items.includes(k), lock = I.needs && !G.owned.items.includes(I.needs);
    return `<div class="card3">${th('item:' + k)}<div class="nm">${I.name}</div><div class="ds">${I.desc}</div>${own ? '<div class="ds">가지고 있음</div>' : priceBtn('item', k, I.price, lock)}</div>`; }).join('')}</div>`;
  return h;
}
function renderDeco(){
  let h = `<div class="sec"><span>창밖 풍경</span></div><div class="grid">${G.owned.bg.map(k => `<button class="card3 ${tank.bg === k ? 'on' : ''}" data-act="bg" data-k="${k}">${th('bg:' + k)}<span class="nm">${BACKGROUNDS[k].name}</span></button>`).join('')}</div>`;
  h += `<div class="sec"><span>바닥</span></div><div class="grid">${G.owned.floor.map(k => `<button class="card3 ${tank.floor === k ? 'on' : ''}" data-act="floor" data-k="${k}">${th('floor:' + k)}<span class="nm">${FLOORS[k].name}</span></button>`).join('')}</div>`;
  h += `<div class="sec"><span>놓인 장식 ${tank.decor.length}/${LIMITS.decor}</span>${tank.decor.length ? '<button class="price ghost" data-act="edit">끌어서 옮기기</button>' : ''}</div>`;
  h += tank.decor.length ? tank.decor.map((d, i) => `<div class="row">${th('deco:' + d.k, 56, 44)}<div class="grow"><div class="nm">${DECOR[d.k].name}</div></div><div class="btns"><button class="price ghost" data-act="unplace" data-i="${i}">보관함으로</button></div></div>`).join('')
    : '<p class="note2">상점에서 장식을 사면 어항 바닥에 놓입니다.</p>';
  const inv = Object.keys(G.inv).filter(k => G.inv[k] > 0);
  if (inv.length) h += `<div class="sec"><span>보관함</span></div>` + inv.map(k => `<div class="row">${th('deco:' + k, 56, 44)}<div class="grow"><div class="nm">${DECOR[k].name} <span class="ds">${G.inv[k]}개</span></div></div><div class="btns"><button class="price" data-act="place" data-k="${k}" ${tank.decor.length >= LIMITS.decor ? 'disabled' : ''}>놓기</button></div></div>`).join('');
  return h;
}
function renderTanks(){
  let h = '';
  if (G.tanks.length > 1){
    h += `<div class="sec"><span>내 어항</span></div>` + G.tanks.map((t, i) => `<div class="row ${i === G.cur ? 'cur' : ''}"><div class="grow"><div class="nm">${esc(t.name)}${i === G.cur ? ' <span class="ds">보는 중</span>' : ''}</div><div class="ds">생물 ${t.creatures.length} · 장식 ${t.decor.length} · ${BACKGROUNDS[t.bg].name}</div></div><div class="btns">${i === G.cur ? '' : `<button class="price" data-act="goTank" data-i="${i}">보기</button>`}<button class="price ghost" data-act="renameTank" data-i="${i}">이름</button></div></div>`).join('');
  }
  h += `<div class="sec"><span>${esc(tank.name)}의 생물 ${creatures.length}/${LIMITS.creatures}</span></div>`;
  if (!creatures.length) h += '<p class="note2">아직 아무도 없습니다. 상점에서 친구를 들여 주세요.</p>';
  h += creatures.map((c, i) => { const d = c.d, S = SPECIES[d.sp];
    return `<div class="row ${c === sel ? 'cur' : ''}">${th('sp:' + d.sp + ':' + d.variant, 56, 44)}<div class="grow"><div class="nm">${esc(d.name)} <span class="ds">${S.name} · ${stage(d.growth)}</span></div>
      <div class="ds">함께한 지 ${cDays(d)}일 · <span class="hearts">${hearts5(d.aff)}</span></div><div class="bar2" title="자란 정도"><i style="width:${Math.round(d.growth*100)}%"></i></div></div>
      <div class="btns">${c === sel ? '' : `<button class="price" data-act="sel" data-i="${i}">고르기</button>`}<button class="price ghost" data-act="rename" data-i="${i}">이름</button>${G.tanks.length > 1 ? `<button class="price ghost" data-act="move" data-i="${i}">옮기기</button>` : ''}<button class="price ghost" data-act="sell" data-i="${i}">분양</button></div></div>`; }).join('');
  h += '<p class="note2" style="margin-top:12px">다 자란 같은 종이 둘 이상이고, 어항이 깨끗하고 배부르면 가끔 새끼가 태어납니다. 분양을 보내면 자란 만큼 진주를 받습니다.</p>';
  return h;
}
function renderDex(){
  const count = {}; for (const t of G.tanks) for (const c of t.creatures) count[c.sp] = (count[c.sp] || 0) + 1;
  let h = `<div class="sec"><span>생물 도감</span><span>${Object.keys(G.dex).length}/${SPECIES_ORDER.length}종</span></div><div class="grid">${SPECIES_ORDER.map(k => { const seen = G.dex[k];
    return `<div class="card3 ${seen ? '' : 'dim'}">${th('sp:' + k)}<div class="nm">${seen ? SPECIES[k].name : '???'}</div><div class="ds">${seen ? `${count[k] || 0}마리 함께 사는 중` : '아직 만나지 못했습니다'}</div></div>`; }).join('')}</div>`;
  h += `<div class="sec"><span>기록</span></div><div class="ach"><span class="grow">함께한 날</span><span>${fmt(statOf('days'))}일</span></div><div class="ach"><span class="grow">먹은 먹이</span><span>${fmt(G.stats.eaten)}알</span></div><div class="ach"><span class="grow">닦은 날</span><span>${fmt(G.stats.cleans)}번</span></div><div class="ach"><span class="grow">태어난 새끼</span><span>${fmt(G.stats.babies)}마리</span></div><div class="ach"><span class="grow">연속 방문</span><span>${G.streak}일</span></div>`;
  h += `<div class="sec"><span>업적</span><span>${Object.keys(G.ach).length}/${ACHIEVEMENTS.length}</span></div>` + ACHIEVEMENTS.map(a => { const v = Math.min(a.goal, statOf(a.stat)), ok = G.ach[a.id];
    return `<div class="ach"><span class="${ok ? 'ok' : ''}">${ok ? '✓' : '·'}</span><span class="grow">${a.name}<br><small>${ok ? '달성' : `${fmt(v)} / ${fmt(a.goal)}`}</small></span><span class="price ghost">${PEARL}${fmt(a.reward)}</span></div>`; }).join('');
  return h;
}
const seg = (k, opts) => `<div class="pseg" data-k="${k}">${opts.map(([v, l]) => `<button data-act="opt" data-k="${k}" data-v="${v}" class="${String(G.set[k]) === String(v) ? 'on' : ''}" aria-pressed="${String(G.set[k]) === String(v)}">${l}</button>`).join('')}</div>`;
function renderSettings(){
  const zi = ZOOMS.reduce((b, z, i) => Math.abs(z - G.set.zoom) < Math.abs(ZOOMS[b] - G.set.zoom) ? i : b, 0);
  let h = `<div class="set">
    <div class="prow"><span class="plabel">어항 크기 (두 손가락으로 벌리고 오므려도 됩니다)</span><div class="pseg" id="zoomSeg">${ZOOMS.map((z, i) => `<button data-act="opt" data-k="zoom" data-v="${z}" class="${i === zi ? 'on' : ''}">${['넓게', '보통', '가까이'][i]}</button>`).join('')}</div></div>
    <div class="prow"><span class="plabel">물 높이</span><div class="prange"><input id="fill" type="range" min="50" max="90" step="1" value="${Math.round(G.set.fill*100)}" aria-label="물 높이 (퍼센트, 최소 50)"><span id="fillVal">${Math.round(G.set.fill*100)}%</span></div></div>
    <div class="prow"><span class="plabel">시간대</span>${seg('tod', TOD_NAMES.map((n, i) => [i, n]))}</div>
    <div class="prow"><span class="plabel">날씨</span>${seg('rain', [[0, '맑음'], [1, '비']])}</div>
    <div class="prow"><span class="plabel">음악</span>${seg('music', MUSIC_KINDS)}</div>
    <div class="prow"><span class="plabel">움직임</span>${seg('smooth', [[0, '배터리 절약'], [1, '부드럽게']])}</div>
    <div class="prow"><span class="plabel">화면 방향</span>${seg('orient', [['portrait', '세로 고정'], ['any', '자동 회전']])}</div>
    <div class="prow"><span class="plabel">어항을 보는 동안 화면 켜 두기</span>${seg('awake', [[0, '끔'], [1, '켬']])}</div>
    <div class="prow"><span class="plabel">시계 모드</span><div class="btnrow"><button class="price" data-act="clock">시계 켜기</button></div><p class="note2">책상이나 머리맡에 세워 두고 시계처럼 쓸 수 있습니다.</p></div>`;
  if (!standalone()){
    h += `<div class="prow"><span class="plabel">앱으로 쓰기</span>${installEvt ? '<div class="btnrow"><button class="price" data-act="install">홈 화면에 설치</button></div>' : sens.isIOS ? '<p class="note2">Safari 아래쪽 공유 버튼 → ‘홈 화면에 추가’를 누르면 앱처럼 열 수 있습니다.</p>' : '<p class="note2">브라우저 메뉴에서 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 누르면 앱처럼 열 수 있습니다.</p>'}</div>`;
  }
  h += `<div class="prow"><span class="plabel">기록 옮기기 (폰을 바꾸거나 PC에서 이어 하기)</span><div class="btnrow"><button class="price" data-act="exportFile">백업 파일 저장</button><button class="price ghost" data-act="importFile">파일 불러오기</button><button class="price ghost" data-act="copyCode">코드 복사</button><button class="price ghost" data-act="pasteCode">코드 붙여넣기</button></div></div>
    <div class="prow info"><button class="linkbtn" data-act="reset">처음부터 다시</button><a class="linkbtn" href="privacy.html">개인정보</a><span class="ver">v${VERSION}</span></div>
  </div>`;
  return h;
}
function refreshZoomSeg(){
  const z = $('zoomSeg'); if (!z) return;
  const zi = ZOOMS.reduce((b, v, i) => Math.abs(v - G.set.zoom) < Math.abs(ZOOMS[b] - G.set.zoom) ? i : b, 0);
  z.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', i === zi));
}
sheetBody.addEventListener('input', e => { if (e.target.id === 'fill') setFill(+e.target.value); });
function setFill(p){
  p = clamp(Math.round(p), FILL_MIN*100, FILL_MAX*100);
  G.set.fill = p / 100; dirty = true;
  const f = $('fill'), v = $('fillVal'); if (f) f.value = p; if (v) v.textContent = p + '%';
}
function setOpt(k, v){
  G.set[k] = v; dirty = true;
  if (k === 'rain') setRainAudio();
  else if (k === 'tod'){ if (!isNight()) for (const c of creatures) c.awakeT = 0; }
  else if (k === 'zoom') zoomT = v;
  else if (k === 'music') setMusic(v);
  else if (k === 'orient') applyOrient();
  else if (k === 'awake') v ? wake() : releaseWake();
  if (curTab === 'set') renderSheet();
}

/* ---- 시트 안의 버튼 ---- */
sheetBody.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
  const a = b.dataset.act, k = b.dataset.k, i = +b.dataset.i;
  if (a === 'buy') buy(b.dataset.t, k);
  else if (a === 'opt'){ const v = b.dataset.v; setOpt(k, /^-?[\d.]+$/.test(v) ? +v : v); }
  else if (a === 'bg'){ tank.bg = k; genBokeh(); dirty = true; renderSheet(); }
  else if (a === 'floor') setFloor(k);
  else if (a === 'edit') setEdit(true);
  else if (a === 'unplace'){ removeDecor(tank.decor[i]); renderSheet(); }
  else if (a === 'place'){ if (placeDecor(k)){ G.inv[k]--; setEdit(true); } }
  else if (a === 'sel'){ selectCreature(creatures[i]); renderSheet(); }
  else if (a === 'rename') renameCreature(creatures[i]);
  else if (a === 'sell') sellCreature(creatures[i]);
  else if (a === 'move') moveCreature(creatures[i]);
  else if (a === 'goTank'){ loadTank(i); closeSheet(); toast(tank.name); }
  else if (a === 'renameTank') renameTank(G.tanks[i]);
  else if (a === 'clock') setClock(true);
  else if (a === 'install') doInstall();
  else if (a === 'exportFile') exportFile();
  else if (a === 'importFile') importFile();
  else if (a === 'copyCode') copyCode();
  else if (a === 'pasteCode') pasteCode();
  else if (a === 'reset') confirmBox('처음부터 다시', '<p>모든 어항, 생물, 진주, 기록이 지워집니다. 되돌릴 수 없습니다.</p>', '지우기', () => { resetting = true; try { localStorage.removeItem(KEY); localStorage.removeItem(OLD_KEY); } catch(e){} location.reload(); });
  showUI();
});

/* ---- 사기 ---- */
function buy(t, k){
  const price = t === 'sp' ? SPECIES[k].price : t === 'deco' ? DECOR[k].price : t === 'floor' ? FLOORS[k].price : t === 'bg' ? BACKGROUNDS[k].price : ITEMS[k].price;
  if (G.pearls < price){ toast('진주가 모자랍니다'); return; }
  if (t === 'sp'){
    if (creatures.length >= LIMITS.creatures){ toast('이 어항은 가득 찼습니다'); return; }
    G.pearls -= price; const c = addCreature(k); closeSheet();
    toast(`${josa(c.d.name, '이', '가')} 들어왔습니다 (${SPECIES[k].name})`);
  } else if (t === 'deco'){
    G.pearls -= price;
    if (placeDecor(k)){ setEdit(true); toast(`${DECOR[k].name}${josa(DECOR[k].name, '을', '를').slice(DECOR[k].name.length)} 놓았습니다`); }
    else { G.inv[k] = (G.inv[k] || 0) + 1; toast('바닥이 가득 차서 보관함에 넣었습니다'); renderSheet(); }
  } else if (t === 'floor'){ G.pearls -= price; G.owned.floor.push(k); setFloor(k); }
  else if (t === 'bg'){ G.pearls -= price; G.owned.bg.push(k); tank.bg = k; genBokeh(); renderSheet(); toast(`${BACKGROUNDS[k].name}${josa(BACKGROUNDS[k].name, '으로', '로').slice(BACKGROUNDS[k].name.length)} 바꿨습니다`); }
  else if (t === 'item'){
    G.pearls -= price; G.owned.items.push(k);
    if (k === 'tank2' || k === 'tank3'){
      const nt = newTank(`${['첫', '두', '세'][G.tanks.length] || '새'} 번째 어항`); seedMoss(nt, 0.15); G.tanks.push(nt);
      loadTank(G.tanks.length - 1); closeSheet(); toast('새 어항으로 왔습니다. 친구를 들여 주세요.');
    } else { renderSheet(); toast(`${ITEMS[k].name}${josa(ITEMS[k].name, '을', '를').slice(ITEMS[k].name.length)} 들였습니다`); }
  }
  dirty = true; persist(); updateMeta(); checkAch();
}
function setFloor(k){
  tank.floor = k; floorH = k !== 'none' ? Math.round(30 * SK) : 0; dirty = true; renderSheet();
}
function seedMoss(t, m){ const r = mossRates(t), a = new Float32Array(MW*MH); for (let i = 0; i < a.length; i++) a[i] = Math.min(1, r[i]*m); t.moss = packMoss(a); }

/* ---- 생물 관리 ---- */
function renameCreature(c){
  openModal('이름 바꾸기', `<input class="txt" id="nameIn" maxlength="10" value="${esc(c.d.name)}" aria-label="새 이름">`, [{label:'그만두기', fn:closeModal}, {label:'바꾸기', cls:'solid', fn:() => {
    const v = $('nameIn').value.replace(/\s+/g, ' ').trim().slice(0, 10); if (v){ c.d.name = v; dirty = true; refreshChip(); }
    closeModal(); renderSheet();
  }}]);
}
function renameTank(t){
  openModal('어항 이름', `<input class="txt" id="nameIn" maxlength="12" value="${esc(t.name)}" aria-label="새 어항 이름">`, [{label:'그만두기', fn:closeModal}, {label:'바꾸기', cls:'solid', fn:() => {
    const v = $('nameIn').value.replace(/\s+/g, ' ').trim().slice(0, 12); if (v){ t.name = v; dirty = true; }
    closeModal(); renderSheet();
  }}]);
}
function sellValue(d){ return Math.round(SPECIES[d.sp].price * (0.3 + 0.4*d.growth)); }
function sellCreature(c){
  const v = sellValue(c.d);
  confirmBox('분양 보내기', `<p>${esc(josa(c.d.name, '을', '를'))} 좋은 곳으로 분양 보낼까요?</p><div class="big">${PEARL}<span>+${fmt(v)}</span></div>`, '보내기', () => {
    tank.creatures.splice(tank.creatures.indexOf(c.d), 1); creatures.splice(creatures.indexOf(c), 1);
    if (sel === c) selectCreature(creatures[0] || null);
    G.pearls += v; chime(); dirty = true; persist(); updateMeta(); renderSheet();
    toast(`${josa(c.d.name, '이', '가')} 새 집으로 떠났습니다`);
  });
}
function moveCreature(c){
  const others = G.tanks.map((t, i) => [t, i]).filter(([t, i]) => i !== G.cur);
  openModal('다른 어항으로 옮기기', `<p>${esc(josa(c.d.name, '을', '를'))} 어느 어항으로 옮길까요?</p>`, [{label:'그만두기', fn:closeModal}, ...others.map(([t]) => ({label:t.name, cls:'solid', fn:() => {
    closeModal();
    if (t.creatures.length >= LIMITS.creatures){ toast('그 어항은 가득 찼습니다'); return; }
    tank.creatures.splice(tank.creatures.indexOf(c.d), 1); creatures.splice(creatures.indexOf(c), 1); t.creatures.push(c.d);
    if (sel === c) selectCreature(creatures[0] || null);
    dirty = true; renderSheet(); toast(`${t.name}${josa(t.name, '으로', '로').slice(t.name.length)} 옮겼습니다`);
  }}))]);
}

/* ---- 꾸미기 ---- */
function setEdit(on){
  editMode = on; $('editBar').hidden = !on; $('decoPop').hidden = true;
  if (on){ sheet.hidden = true; showUI(); } else { dirty = true; setTimeout(showReward, 350); }
}
$('editDone').addEventListener('click', () => { setEdit(false); persist(); });
function openDecoPop(o){
  const p = $('decoPop');
  p.innerHTML = `<span>${DECOR[o.d.k].name}</span><button class="price ghost" data-a="z">${(o.d.z || 0) < 0.5 ? '앞으로' : '뒤로'}</button><button class="price ghost" data-a="rm">보관함으로</button><button class="price" data-a="x">닫기</button>`;
  p.hidden = false; p.onclick = e => {
    const a = e.target.closest('button'); if (!a) return;
    if (a.dataset.a === 'z'){ o.d.z = (o.d.z || 0) < 0.5 ? 0.75 : 0.25; dirty = true; }
    else if (a.dataset.a === 'rm') removeDecor(o.d);
    p.hidden = true;
  };
}

/* ---- 썸네일 ---- */
const fakeFish = (sp, v) => ({d:{sp, growth:0.85, variant:v || 0}, phi:0.28, pitch:0, phase:1.2, effort:0.5, dizzy:0, act:null, sleepy:0, hic:0, blush:0.6, mouth:0.3, kiss:0, mode:'wander', seed:1});
function drawThumbCanvas(cvs){
  const g = cvs.getContext('2d'), w = cvs.width, h = cvs.height, [kind, k, v] = cvs.dataset.th.split(':');
  g.clearRect(0, 0, w, h);
  try {
    if (kind === 'sp'){
      const S = SPECIES[k];
      if (S.kind === 'fish'){
        const L = h*0.62/DPR*(S.bodyH > 1.2 ? 0.75 : 1), F = fakeFish(k, +v || 0), sz = renderFish(F, L), src = sz*DPR;
        const cw = Math.min(src, L*2.1*DPR), ch = cw*h/w;
        g.drawImage(fc, (src - cw)/2 - L*0.12*DPR, (src - ch)/2, cw, ch, 0, 0, w, h);
      } else if (k === 'snail'){
        g.save(); g.scale(w/72, h/56); drawSnail({x:38, y:36, ang:0, dir:1, t:1, trail:[]}, 72/(MIN*1.3/390)/40, g); g.restore();
      } else { g.save(); g.scale(w/72, h/56); drawThumb(g, k, 72, 56); g.restore(); }
    } else if (kind === 'deco'){ g.save(); g.scale(w/72, h/56); drawThumb(g, k, 72, 56); g.restore(); }
    else if (kind === 'floor'){ g.save(); g.scale(w/72, h/56); drawThumb(g, 'floor:' + k, 72, 56); g.restore(); }
    else if (kind === 'bg') drawBgThumb(g, k, w, h);
    else if (kind === 'item') drawItemThumb(g, k, w, h);
  } catch(e){}
}
function drawBgThumb(g, k, w, h){
  const P = {city:['#1a2238', '#3a2f4a', [[255,178,102],[130,170,255],[255,196,130]]], forest:['#16301f', '#2c4a26', [[200,235,140],[170,220,120],[255,236,160]]],
    sea:['#7fb0d8', '#1d4f78', [[255,240,210]]], cafe:['#3a2418', '#5a3622', [[255,200,120],[255,214,150],[255,170,90]]], space:['#06061a', '#24104a', [[150,130,255],[120,230,230]]]}[k];
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, P[0]); gr.addColorStop(1, P[1]);
  g.fillStyle = gr; g.beginPath(); g.roundRect ? g.roundRect(4, 4, w - 8, h - 8, 14) : g.rect(4, 4, w - 8, h - 8); g.fill();
  const r = rng(strSeed(k));
  for (let i = 0; i < 10; i++){ const c = P[2][i % P[2].length], x = 10 + r()*(w - 20), y = 10 + r()*(h*0.6), rr = 4 + r()*10; const gg = g.createRadialGradient(x, y, 0, x, y, rr); gg.addColorStop(0, rgb(c, .8)); gg.addColorStop(1, rgb(c, 0)); g.fillStyle = gg; g.beginPath(); g.arc(x, y, rr, 0, PI*2); g.fill(); }
  if (k === 'sea'){ g.fillStyle = 'rgba(20,70,110,.9)'; g.fillRect(4, h*0.55, w - 8, h*0.45 - 4); }
  if (k === 'space'){ g.fillStyle = '#d98a52'; g.beginPath(); g.arc(w*0.7, h*0.35, h*0.16, 0, PI*2); g.fill(); }
}
function drawItemThumb(g, k, w, h){
  g.save(); g.translate(w/2, h/2); const s = h/56; g.scale(s, s);
  if (k === 'feeder'){
    g.fillStyle = '#d9e4ea'; g.fillRect(-14, -18, 28, 26); g.fillStyle = '#8fa6b4'; g.fillRect(-16, -21, 32, 6);
    g.fillStyle = '#c9733a'; for (const [x, y] of [[-5, 14], [3, 18], [-1, 22], [7, 12]]) { g.beginPath(); g.arc(x, y, 2.4, 0, PI*2); g.fill(); }
  } else if (k === 'cleaner'){
    g.fillStyle = '#7fd0c8'; g.beginPath(); g.ellipse(0, 4, 18, 11, -0.3, 0, PI*2); g.fill();
    g.fillStyle = '#e6fffa'; for (const [x, y] of [[-14, -14], [12, -16], [18, -4]]){ g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 1.5, y - 1.5); g.lineTo(x + 5, y); g.lineTo(x + 1.5, y + 1.5); g.lineTo(x, y + 5); g.lineTo(x - 1.5, y + 1.5); g.lineTo(x - 5, y); g.lineTo(x - 1.5, y - 1.5); g.fill(); }
  } else {
    g.strokeStyle = '#d6f4f0'; g.lineWidth = 2.5; g.strokeRect(-20, -16, 40, 34);
    g.fillStyle = 'rgba(60,170,180,.8)'; g.fillRect(-18.5, -4, 37, 20.5);
    g.fillStyle = '#ff8a40'; g.beginPath(); g.ellipse(-2, 6, 6, 4, 0, 0, PI*2); g.fill(); g.beginPath(); g.moveTo(3, 6); g.lineTo(9, 2); g.lineTo(9, 10); g.fill();
    g.fillStyle = '#fff'; g.font = 'bold 12px sans-serif'; g.textAlign = 'center'; g.fillText(k === 'tank2' ? '+2' : '+3', 12, -6);
  }
  g.restore();
}

/* ---- 시계 모드 ---- */
let clockOn = false, clockTO = 0;
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
function setClock(on){
  clockOn = on; $('clock').hidden = !on; document.body.classList.toggle('clock', on);
  if (on){ sheet.hidden = true; setEdit(false); tickClock(); toast('화면을 톡 치면 끄기 버튼이 보입니다'); }
  else { clearTimeout(clockTO); setTimeout(showReward, 300); }
}
function tickClock(){
  if (!clockOn) return;
  const d = new Date();
  $('cDate').textContent = `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
  $('cTime').textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (navigator.getBattery) navigator.getBattery().then(b => { $('cBat').textContent = `배터리 ${Math.round(b.level*100)}%${b.charging ? ' · 충전 중' : ''}`; }).catch(() => {});
  clockTO = setTimeout(tickClock, 1000 - d.getMilliseconds() + 20);
}
function clockTap(){ const c = $('clock'); c.classList.add('show'); clearTimeout(clockTap.t); clockTap.t = setTimeout(() => c.classList.remove('show'), 3000); }
$('clockExit').addEventListener('click', () => setClock(false));

/* ---- 기록 옮기기 ---- */
function exportCode(){ persist(); return btoa(unescape(encodeURIComponent(JSON.stringify(G)))); }
function applyBackup(o){
  if (!o || o.v !== 2 || !Array.isArray(o.tanks) || !o.tanks.length) throw new Error('bad');
  const n = o.tanks.reduce((a, t) => a + t.creatures.length, 0);
  confirmBox('기록 불러오기', `<p>어항 ${o.tanks.length}개, 생물 ${n}마리, 진주 ${fmt(o.pearls | 0)}개가 담긴 기록입니다.<br>지금 어항은 이 기록으로 바뀝니다.</p>`, '불러오기', () => {
    resetting = true; localStorage.setItem(KEY, JSON.stringify(sanitize(o))); try { localStorage.removeItem(OLD_KEY); } catch(e){} location.reload();
  });
}
function exportFile(){
  const d = new Date(), name = `eohangmeong-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  persist();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(G)], {type:'application/json'})); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('백업 파일을 저장했습니다');
}
function importFile(){
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = () => { const f = inp.files[0]; if (!f) return; f.text().then(t => applyBackup(JSON.parse(t))).catch(() => toast('어항멍 백업 파일이 아닙니다')); };
  inp.click();
}
function copyCode(){
  const c = exportCode();
  (navigator.clipboard ? navigator.clipboard.writeText(c) : Promise.reject()).then(() => toast('코드를 복사했습니다. 다른 기기에서 붙여넣으세요.'))
    .catch(() => openModal('기록 코드', `<textarea class="txt" rows="5" readonly>${c}</textarea>`, [{label:'닫기', cls:'solid', fn:closeModal}]));
}
function pasteCode(){
  openModal('코드 붙여넣기', '<textarea class="txt" id="codeIn" rows="5" aria-label="기록 코드"></textarea>', [{label:'그만두기', fn:closeModal}, {label:'불러오기', cls:'solid', fn:() => {
    const v = $('codeIn').value.trim(); closeModal();
    try { applyBackup(JSON.parse(decodeURIComponent(escape(atob(v))))); } catch(e){ toast('코드가 올바르지 않습니다'); }
  }}]);
}

/* ---- 설치 (PWA) ---- */
const standalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (curTab === 'set') renderSheet(); });
window.addEventListener('appinstalled', () => { installEvt = null; toast('홈 화면에 어항이 생겼습니다'); });
async function doInstall(){ if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch(e){} installEvt = null; renderSheet(); }

/* ---- 화면 방향, 켜짐 유지 ---- */
function applyOrient(){ try { if (G.set.orient === 'portrait') screen.orientation.lock('portrait').catch(() => {}); else screen.orientation.unlock(); } catch(e){} }
let wakeLock = null;
async function wake(){ if (!G.set.awake) return; try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch(e){} }
function releaseWake(){ try { if (wakeLock) wakeLock.release(); } catch(e){} wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (resetting) return;
  if (document.visibilityState === 'visible'){
    if (started) wake(); if (music && soundOn) music.resume();
    // 백그라운드에 있던 동안도 배고파지고 이끼가 낌
    const now = Date.now(); tank.moss = packMoss();
    for (const t of G.tanks) catchUp(t, now);
    mossA = unpackMoss(tank.moss); mossDirty = true; rollDay();
  }
  else { if (music) music.suspend(); persist(); }
});
window.addEventListener('pagehide', () => { if (!resetting) persist(); });

/* ---- 시작 ---- */
if (!isNew){
  const c = G.tanks[G.cur].creatures.find(q => q.id === G.tanks[G.cur].sel) || G.tanks[G.cur].creatures[0];
  if (c) $('startMsg').innerHTML = `${esc(josa(c.name, '이', '가'))} 기다리고 있었습니다.<br>함께한 지 ${todayN() - G.born + 1}일째입니다.`;
  $('go').textContent = '어항 보러 가기';
}
$('go').addEventListener('click', async () => {
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
  $('start').classList.add('gone');
  wake(); applyOrient(); showUI();
  if (G.set.music !== 'off') setSound(true);
  if (!G.intro) showIntro(); else { dailyVisit(); showReward(); }
  setTimeout(() => {
    if (tank.full < 0.3) say('배가 고파 보입니다. 먹이를 주세요.', 7000);
    else if (cleanliness() < 0.85) say('유리에 이끼가 끼었습니다. 손가락으로 문질러 닦아 주세요.', 8000);
  }, 4500);
  setTimeout(() => {
    if (hasSensor) return;
    const fine = matchMedia('(pointer: fine)').matches;
    if (sens.perm === 'denied') say('기울기 권한이 꺼져 있어 화면을 좌우로 끌어 기울입니다. 어항을 다시 열면 권한을 다시 물어봅니다.', 9000);
    else say(fine
      ? '기울기 센서가 없어 좌우로 끌어 기울입니다. 휠로 확대, 키보드: ←→ 기울기, ↑↓ 물 높이, F 먹이, S 흔들기, R 비, T 시간대.'
      : '기울기 신호가 없어 대신 화면을 좌우로 끌면 기울어집니다.', 9000);
  }, 12000);
});

/* ================= 처음 ================= */
window.addEventListener('resize', () => { resize(); floorH = tank && tank.floor !== 'none' ? Math.round(30 * SK) : 0; });
rainK = G.set.rain ? 1 : 0; fillCur = G.set.fill; zoom = zoomT = clamp(+G.set.zoom || 1, ZOOM_MIN, ZOOM_MAX);
if (isNew || !G.intro) for (const t of G.tanks) if (!t.moss) seedMoss(t, 0.28);
resize(); finishWaves();
loadTank(G.cur);
for (let i = 0; i < 55; i++){ const p = pickWaterPoint(4); particles.push({x:p.x, y:p.y, z:rand(.55,1), r:rand(.5,1.4), a:rand(.1,.35), vx:rand(-3,3), vy:rand(-3,3), ph:rand(0,6)}); }
updateMeta(); persist();
requestAnimationFrame(t => { last = t; loop(t); });

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost'))
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

// 테스트용 (주소에 ?debug 가 있을 때만)
if (/[?&]debug\b/.test(location.search)) window.__eh = {get G(){ return G; }, get creatures(){ return creatures; }, get tank(){ return tank; }, addCreature, placeDecor, loadTank, setOpt, reward, rub, cleanliness, setClock, openSheet, setTab, setEdit, feed, shake, get psiT(){ return psiT; }, set psiT(v){ psiT = v; }, renderSheet, PERF, renderFish, drawCreature, drawBackdrop, draw, fakeFish};
