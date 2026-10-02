/* 어항 친구들과 장식 — 캔버스 2D로만 그림 (이미지·라이브러리 없음)
   drawCritter / drawDecor / decorSize / drawFloor / drawThumb */

const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const wrap = a => { a %= TAU; return a > PI ? a - TAU : a < -PI ? a + TAU : a; };
const UP = {x: 0, y: -1};
const WET_ALL = () => true;

// 작은 시드 난수 (깜빡임 없이 매번 같은 모양)
function rng(seed){
  let a = ((seed | 0) * 2654435761 + 0x9e3779b9) | 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hex = (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`;
const mix = (c1, c2, t) => hex(lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t));

// 오프스크린 캔버스
function mkCanvas(w, h){
  if (typeof document !== 'undefined'){ const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  return new OffscreenCanvas(w, h);
}
// 기기 배율 (캐시 해상도)
function devScale(ctx){
  let k = 2;
  if (ctx.getTransform){ const m = ctx.getTransform(); k = Math.hypot(m.a, m.b) || 1; }
  return clamp(Math.round(k * 2) / 2, 1, 4);
}

let K = 1;                                   // 현재 배율 (단위 → px)
const lw = v => Math.max(v, 0.6 / K);        // 너무 가는 선 방지

/* ================= 생물 ================= */
const S = {t: 0, ph: 0, e: 0, mode: 'swim', sl: 0, mo: 0, bl: 0.5, v: 0};
function norm(o){
  S.t = +o.t || 0; S.ph = +o.phase || 0; S.e = clamp(+o.effort || 0, 0, 1.4);
  S.mode = o.mode || 'swim'; S.sl = clamp(+o.sleepy || 0, 0, 1); S.mo = clamp(+o.mouth || 0, 0, 1);
  S.bl = o.blush == null ? 0.5 : clamp(+o.blush || 0, 0, 1); S.v = (((o.variant | 0) % 3) + 3) % 3;
  return S;
}

// 눈: 까만 눈동자 + 하얀 반짝임, 졸리면 눈꺼풀
function eye(c, x, y, r, sl, lid, iris){
  c.fillStyle = iris || '#1c0f0a'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(x - 0.3*r, y - 0.34*r, 0.36*r, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(x + 0.32*r, y + 0.3*r, 0.15*r, 0, TAU); c.fill();
  if (sl > 0.02){
    c.save(); c.beginPath(); c.arc(x, y, r*1.1, 0, TAU); c.clip();
    const ly = y - r*1.15 + 2.1*r*sl;
    c.fillStyle = lid; c.fillRect(x - r*1.3, y - r*1.3, r*2.6, ly - (y - r*1.3));
    c.strokeStyle = 'rgba(50,24,14,.65)'; c.lineWidth = lw(r*0.2);
    c.beginPath(); c.moveTo(x - r*1.05, ly); c.quadraticCurveTo(x, ly + r*0.35*sl, x + r*1.05, ly); c.stroke();
    c.restore();
  }
}
function blush(c, x, y, rx, ry, b){
  if (b < 0.02) return;
  c.fillStyle = `rgba(255,105,125,${0.5*b})`; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU); c.fill();
}

/* ---------- 거북이 ---------- */
const TURTLE = [
  {s1:'#a4d270', s2:'#4f8c3a', plate:'rgba(206,240,150,.38)', seam:'rgba(40,84,32,.6)', rim:'#5e9442', rimL:'rgba(226,246,176,.55)', skin:'#acd47e', skinD:'#7aa256', belly:'#f3e4a8', lid:'#98c26c', stripe:null, ear:null},
  {s1:'#a0b05c', s2:'#4c6230', plate:'rgba(232,232,150,.32)', seam:'rgba(50,60,22,.62)', rim:'#5a6c30', rimL:'rgba(244,228,140,.6)', skin:'#86a45a', skinD:'#5f7c3c', belly:'#f6de7c', lid:'#7c9a52', stripe:'rgba(250,222,96,.9)', ear:'#ffcf38'},
  {s1:'#94826c', s2:'#43362a', plate:'rgba(230,206,170,.26)', seam:'rgba(36,26,16,.62)', rim:'#584838', rimL:'rgba(236,212,176,.45)', skin:'#ac9e86', skinD:'#7c6f5a', belly:'#ead8b0', lid:'#9c8e76', stripe:null, ear:null},
];
function flipper(c, x, y, a, len, wid, col){
  c.save(); c.translate(x, y); c.rotate(a);
  c.fillStyle = col; c.beginPath();
  c.moveTo(-1, -wid*0.5); c.bezierCurveTo(len*0.4, -wid*0.95, len*0.92, -wid*0.4, len, 0);
  c.bezierCurveTo(len*0.88, wid*0.38, len*0.35, wid*0.62, -1, wid*0.5); c.closePath(); c.fill();
  c.restore();
}
function hexPath(c, x, y, rx, ry){
  c.moveTo(x + rx, y);
  for (let k = 1; k < 6; k++){ const a = k*PI/3; c.lineTo(x + rx*Math.cos(a), y + ry*Math.sin(a)); }
  c.closePath();
}
function shellPath(c){
  c.beginPath(); c.moveTo(-37, 7);
  c.bezierCurveTo(-37, -18, -20, -29, -3, -29); c.bezierCurveTo(14, -29, 31, -18, 31, 7);
  c.quadraticCurveTo(-3, 12, -37, 7); c.closePath();
}
function turtle(c, o){
  const P = TURTLE[o.v], t = o.t, m = o.mode;
  let amp, fa = 1.75, ba = 2.35, fl = 1, wph = o.ph;
  if (m === 'swim') amp = 0.35 + 0.55*Math.min(1, o.e);
  else if (m === 'surface') amp = 0.32;
  else if (m === 'walk'){ amp = 0.45; fa = 1.4; ba = 1.75; fl = 0.85; }
  else { amp = 0.07; fa = 2.2; ba = 2.55; fl = 0.72; wph = t*1.1; }
  // 머리 위치
  let hx = 41, hy = -2 + Math.sin(o.ph)*0.6*Math.min(1, o.e), ha = 0;
  if (m === 'rest'){ hx = 35; hy = 2 + Math.sin(t*0.9)*0.7; ha = 0.1; }
  else if (m === 'surface'){ hx = 37; hy = -15 + Math.sin(t*1.3)*0.6; ha = -0.5; }
  else if (m === 'walk'){ hy = -1 + Math.sin(o.ph*2)*0.8; }

  // 먼 쪽 지느러미
  flipper(c, 13, 4, fa + amp*Math.sin(wph + PI), 25*fl, 9, P.skinD);
  flipper(c, -27, 5, ba + amp*0.6*Math.sin(wph), 15*fl, 8, P.skinD);
  // 꼬리
  c.fillStyle = P.skinD; c.beginPath(); c.moveTo(-33, 4); c.quadraticCurveTo(-44, 5, -50, 10 + Math.sin(t*2)*0.6); c.quadraticCurveTo(-42, 12, -31, 10); c.closePath(); c.fill();
  // 목과 머리
  c.strokeStyle = P.skin; c.lineWidth = 12.5; c.beginPath(); c.moveTo(19, 4); c.quadraticCurveTo(hx - 9, hy + 4, hx - 3, hy + 1); c.stroke();
  if (P.stripe){
    c.strokeStyle = P.stripe; c.lineWidth = lw(1.3); c.beginPath();
    c.moveTo(20, 2); c.quadraticCurveTo(hx - 10, hy + 1, hx - 4, hy - 1); c.moveTo(21, 7); c.quadraticCurveTo(hx - 9, hy + 6, hx - 2, hy + 5); c.stroke();
  }
  c.save(); c.translate(hx, hy); c.rotate(ha);
  c.fillStyle = P.skin; c.beginPath(); c.ellipse(0, 0, 14, 11.8, 0, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,230,.28)'; c.beginPath(); c.ellipse(-1, -6, 8, 3.2, -0.1, 0, TAU); c.fill();
  if (P.ear){ c.fillStyle = P.ear; c.beginPath(); c.ellipse(-5.5, -1, 3.8, 2.6, -0.2, 0, TAU); c.fill(); }
  if (P.stripe){ c.strokeStyle = P.stripe; c.lineWidth = lw(1.2); c.beginPath(); c.moveTo(-10, 4); c.quadraticCurveTo(0, 8.5, 9, 6.5); c.stroke(); }
  blush(c, 3, 4.6, 4, 2.4, o.bl);
  eye(c, 5, -2.8, 5, o.sl, P.lid);
  c.fillStyle = 'rgba(40,30,20,.5)'; c.beginPath(); c.arc(13, -2.5, 0.8, 0, TAU); c.fill();
  if (o.mo > 0.05){
    c.fillStyle = '#7a2a22'; c.beginPath(); c.ellipse(10.5, 5.2, 2.7, 0.8 + 2.7*o.mo, 0, 0, TAU); c.fill();
  } else {
    c.strokeStyle = 'rgba(50,40,20,.7)'; c.lineWidth = lw(1); c.beginPath(); c.moveTo(7.5, 5); c.quadraticCurveTo(10.8, 7.2, 13.2, 3.8); c.stroke();
  }
  c.restore();
  // 배딱지
  c.fillStyle = P.belly; c.beginPath(); c.moveTo(-34, 6); c.quadraticCurveTo(-3, 21, 28, 6); c.closePath(); c.fill();
  // 등딱지
  shellPath(c);
  const g = c.createLinearGradient(0, -29, 0, 10); g.addColorStop(0, P.s1); g.addColorStop(1, P.s2);
  c.fillStyle = g; c.fill();
  // 등딱지 무늬 (클립 없이 안쪽에만)
  c.fillStyle = P.plate; c.strokeStyle = P.seam; c.lineWidth = lw(1.6);
  c.beginPath();
  hexPath(c, -20, -18.3, 8.5, 6.5); hexPath(c, -3, -21.8, 9, 6.7); hexPath(c, 14, -17.8, 8.5, 6.5);
  hexPath(c, -27.5, -4, 7.5, 7.8); hexPath(c, -11.5, -7.5, 8.5, 8); hexPath(c, 5.5, -7.5, 8.5, 8); hexPath(c, 21.5, -3, 7.2, 7.8);
  c.fill(); c.stroke();
  const hg = c.createRadialGradient(-12, -21, 0, -12, -21, 22);
  hg.addColorStop(0, 'rgba(255,255,235,.42)'); hg.addColorStop(1, 'rgba(255,255,235,0)');
  shellPath(c); c.fillStyle = hg; c.fill();
  // 테두리 (가장자리 판)
  c.strokeStyle = P.rim; c.lineWidth = 5; c.beginPath(); c.moveTo(-36, 5); c.quadraticCurveTo(-3, 10.5, 30, 5); c.stroke();
  c.strokeStyle = P.rimL; c.lineWidth = lw(1); c.beginPath(); c.moveTo(-34, 2.6); c.quadraticCurveTo(-3, 7.8, 28, 2.6); c.stroke();
  shellPath(c);
  for (let k = 1; k < 8; k++){
    const u = k/8, x = (1-u)*(1-u)*-36 + 2*u*(1-u)*-3 + u*u*30, y = (1-u)*(1-u)*5 + 2*u*(1-u)*10.5 + u*u*5;
    c.moveTo(x, y - 2.3); c.lineTo(x, y + 2.3);
  }
  c.strokeStyle = P.seam; c.lineWidth = lw(1.15); c.stroke();
  // 가까운 쪽 지느러미
  flipper(c, -24, 8, ba + amp*0.6*Math.sin(wph + PI), 15.5*fl, 8.5, P.skin);
  flipper(c, 17, 7, fa + amp*Math.sin(wph), 26*fl, 9.5, P.skin);
  if (fl > 0.8){
    c.fillStyle = 'rgba(255,255,230,.3)';
    const a = fa + amp*Math.sin(wph);
    c.beginPath(); c.arc(17 + Math.cos(a)*9, 7 + Math.sin(a)*9, 1.4, 0, TAU); c.moveTo(18.1 + Math.cos(a)*15, 7 + Math.sin(a)*15); c.arc(17 + Math.cos(a)*15, 7 + Math.sin(a)*15, 1.1, 0, TAU); c.fill();
  }
}

/* ---------- 개구리 (아프리카 난쟁이 개구리) ---------- */
const FROG = [
  {top:'#6f7f48', body:'#9cad6c', belly:'#e6e6bc', spot:'rgba(52,62,30,.45)', limb:'#90a062', limbD:'#66743f', web:'rgba(176,192,124,.8)', lid:'#8a9b5c', iris:'#1c140c'},
  {top:'#7a5a3a', body:'#ad8c62', belly:'#efdfbf', spot:'rgba(70,44,22,.45)', limb:'#a08058', limbD:'#735a3a', web:'rgba(204,174,134,.8)', lid:'#9a7a52', iris:'#1c120a'},
  {top:'#eeb9a2', body:'#f8dccb', belly:'#fff5ec', spot:'rgba(236,150,130,.35)', limb:'#f4cdb8', limbD:'#dca690', web:'rgba(255,218,204,.85)', lid:'#f0c2ac', iris:'#5a1620'},
];
const FSPOT = [[-20,-8,3.4,2.2],[-5,-11.5,2.6,1.8],[9,-10,2,1.5],[-30,-1,2.5,1.8],[-13,-2,2,1.5],[1,-4,1.6,1.2],[-26,8,1.6,1.2]];
function frogLeg(c, P, x, y, a1, a2, a3, sp, col){
  const kx = x + Math.cos(a1)*25, ky = y + Math.sin(a1)*25;
  const ax = kx + Math.cos(a2)*23, ay = ky + Math.sin(a2)*23;
  const tl = 16, s3 = 0.3*sp;
  const t1x = ax + Math.cos(a3 - s3)*tl, t1y = ay + Math.sin(a3 - s3)*tl;
  const t2x = ax + Math.cos(a3)*tl*1.1, t2y = ay + Math.sin(a3)*tl*1.1;
  const t3x = ax + Math.cos(a3 + s3)*tl, t3y = ay + Math.sin(a3 + s3)*tl;
  const ix = ax + Math.cos(a3)*tl*0.55, iy = ay + Math.sin(a3)*tl*0.55;
  c.fillStyle = P.web; c.beginPath(); c.moveTo(ax, ay); c.lineTo(t1x, t1y);
  c.quadraticCurveTo((t1x + t2x)/2*0.6 + ix*0.4, (t1y + t2y)/2*0.6 + iy*0.4, t2x, t2y);
  c.quadraticCurveTo((t2x + t3x)/2*0.6 + ix*0.4, (t2y + t3y)/2*0.6 + iy*0.4, t3x, t3y); c.closePath(); c.fill();
  c.strokeStyle = col; c.lineWidth = lw(2.4); c.beginPath();
  c.moveTo(ax, ay); c.lineTo(t1x, t1y); c.moveTo(ax, ay); c.lineTo(t2x, t2y); c.moveTo(ax, ay); c.lineTo(t3x, t3y); c.stroke();
  c.lineWidth = 7; c.beginPath(); c.moveTo(kx, ky); c.lineTo(ax, ay); c.stroke();
  c.fillStyle = col; c.beginPath(); c.ellipse((x + kx)/2, (y + ky)/2, 15.5, 8.2, a1, 0, TAU); c.fill();
}
function frogArm(c, x, y, b1, b2, col){
  const ex = x + Math.cos(b1)*11, ey = y + Math.sin(b1)*11, hx = ex + Math.cos(b2)*10, hy = ey + Math.sin(b2)*10;
  c.strokeStyle = col; c.lineWidth = 5.5; c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
  c.lineWidth = 4.2; c.beginPath(); c.moveTo(ex, ey); c.lineTo(hx, hy); c.stroke();
  c.lineWidth = lw(1.7); c.beginPath();
  for (let k = -1; k <= 1; k++){ const a = b2 + k*0.55; c.moveTo(hx, hy); c.lineTo(hx + Math.cos(a)*4.2, hy + Math.sin(a)*4.2); }
  c.stroke();
}
function frogBody(c){
  c.beginPath(); c.moveTo(47, 3);
  c.bezierCurveTo(47, -10, 36, -16, 20, -16); c.bezierCurveTo(2, -16, -30, -15, -40, -2);
  c.bezierCurveTo(-46, 8, -34, 18, -14, 18); c.bezierCurveTo(10, 18, 46, 16, 47, 3); c.closePath();
}
function frog(c, o){
  const P = FROG[o.v], t = o.t, m = o.mode;
  let n1, n2, n3, f1, f2, f3, sp = 1, b1, b2, fb1, fb2;
  if (m === 'swim'){
    const amp = clamp(0.3 + 0.7*o.e, 0, 1), s = 0.5 + 0.5*Math.sin(o.ph);
    const k = (1 - amp)*0.3 + amp*Math.pow(s, 0.6);
    n1 = f1 = lerp(0.75, PI - 0.22, k); n2 = f2 = lerp(PI + 0.08, PI - 0.08, k); n3 = f3 = lerp(PI - 0.65, PI - 0.02, k); sp = 0.7 + 0.6*k;
    b1 = fb1 = 0.55 + 0.25*(1 - k); b2 = fb2 = 0.2 + 0.3*(1 - k);
  } else if (m === 'surface'){
    const d = Math.sin(t*0.9)*0.07;
    n1 = 2.55 + d; n2 = 2.75 + d; n3 = 2.9; f1 = 2.2 - d; f2 = 2.35 - d; f3 = 2.5; sp = 1.4;
    b1 = 0.7 + d; b2 = 0.95; fb1 = 0.35 - d; fb2 = 0.6;
  } else if (m === 'walk'){
    const p = o.ph, l1 = Math.max(0, Math.sin(p)), l2 = Math.max(0, Math.sin(p + PI));
    n1 = 0.72 - 0.25*Math.cos(p); n2 = PI - 0.35 - 0.3*l1; n3 = 0.05 - 0.3*l1;
    f1 = 0.72 + 0.25*Math.cos(p); f2 = PI - 0.35 - 0.3*l2; f3 = 0.05 - 0.3*l2;
    b1 = 1.35 + 0.3*Math.cos(p + PI); b2 = 1.55 - 0.3*l2; fb1 = 1.35 + 0.3*Math.cos(p); fb2 = 1.55 - 0.3*l1;
  } else {   // 앉은 자세
    n1 = f1 = 0.72; n2 = f2 = PI - 0.36; n3 = f3 = 0.06; sp = 0.8;
    b1 = fb1 = 1.38; b2 = fb2 = 1.62;
  }
  const br = 1 + 0.025*Math.sin(t*2.2);
  // 먼 쪽 다리·눈
  frogLeg(c, P, -26, 4, f1, f2, f3, sp, P.limbD);
  frogArm(c, 20, 8, fb1, fb2, P.limbD);
  c.fillStyle = P.top; c.beginPath(); c.arc(21, -15.5, 8.4, 0, TAU); c.fill();
  eye(c, 21.5, -16.5, 5.6, o.sl, P.lid, P.iris);
  // 몸통
  c.save(); c.scale(1, br);
  const g = c.createLinearGradient(0, -18, 0, 18);
  g.addColorStop(0, P.top); g.addColorStop(0.45, P.body); g.addColorStop(1, P.belly);
  c.fillStyle = g; frogBody(c); c.fill(); c.beginPath(); c.arc(29, -12, 9.6, 0, TAU); c.fill();
  c.fillStyle = P.spot; c.beginPath();
  for (const s of FSPOT){ c.moveTo(s[0] + s[2], s[1]); c.ellipse(s[0], s[1], s[2], s[3], 0, 0, TAU); }
  c.fill();
  c.fillStyle = 'rgba(255,255,240,.25)'; c.beginPath(); c.ellipse(-6, -10.5, 15, 3.4, -0.06, 0, TAU); c.fill();
  c.restore();
  // 얼굴
  blush(c, 34, 4.5, 5.2, 3, o.bl);
  eye(c, 29.5, -13, 7, o.sl, P.lid, P.iris);
  c.fillStyle = 'rgba(40,30,20,.45)'; c.beginPath(); c.arc(45, -2.5, 0.9, 0, TAU); c.fill();
  if (o.mo > 0.05){
    c.fillStyle = '#6e2a26'; c.beginPath(); c.ellipse(42, 7, 4, 0.8 + 3.2*o.mo, 0, 0, TAU); c.fill();
  } else {
    c.strokeStyle = 'rgba(60,40,24,.65)'; c.lineWidth = lw(1.2); c.beginPath(); c.moveTo(46.5, 4.5); c.quadraticCurveTo(41, 9, 33, 7.2); c.stroke();
  }
  // 가까운 쪽 다리
  frogLeg(c, P, -27, 7, n1, n2, n3, sp, P.limb);
  frogArm(c, 23, 11, b1, b2, P.limb);
}

/* ---------- 우파루파 ---------- */
const AXO = [
  {top:'#ffbccb', body:'#ffd6df', belly:'#fff2f5', fin:'rgba(255,212,224,.9)', finE:'rgba(255,170,192,.55)', gill:'#ff6f93', gillD:'#e2577b', limb:'#ffc8d4', limbD:'#f0a6b8', lid:'#ffc2cf', mouth:'#c0506a', iris:'#2a1218', spot:null},
  {top:'#f2be4a', body:'#ffd97c', belly:'#fff2c8', fin:'rgba(255,228,150,.9)', finE:'rgba(236,186,86,.55)', gill:'#ff8a5c', gillD:'#e26c44', limb:'#ffd577', limbD:'#e6b456', lid:'#f6cc66', mouth:'#b05c2c', iris:'#2a1a0c', spot:null},
  {top:'#4a463c', body:'#6c6856', belly:'#a29c84', fin:'rgba(116,110,92,.88)', finE:'rgba(64,60,50,.55)', gill:'#9a6286', gillD:'#744c66', limb:'#68644f', limbD:'#4a473a', lid:'#5e5a4a', mouth:'#2a2420', iris:'#0e0a08', spot:'rgba(28,26,20,.42)'},
];
const AN = 12, AX = new Float32Array(AN), AY = new Float32Array(AN), AH = new Float32Array(AN), AT = new Float32Array(AN), AB = new Float32Array(AN);
const OX = new Float32Array(64), OY = new Float32Array(64);
function closedSmooth(c, xs, ys, n){
  c.moveTo((xs[0] + xs[1])/2, (ys[0] + ys[1])/2);
  for (let i = 1; i <= n; i++){ const j = i % n, k = (i + 1) % n; c.quadraticCurveTo(xs[j], ys[j], (xs[j] + xs[k])/2, (ys[j] + ys[k])/2); }
  c.closePath();
}
const GILL_A = [-1.6, -2.28, -2.88], GILL_L = [17.5, 19, 15.5], GILL_R = [[22, -9.5], [19.5, -4.5], [19.5, 0.5]];
// 아가미: 깃털 모양 세 갈래를 한 번에 채움 (톱니 다각형)
function gills(c, col, dx, dy, da, t, sweep){
  const K = 6;
  c.fillStyle = col; c.beginPath();
  for (let j = 0; j < 3; j++){
    const a = GILL_A[j] + da + 0.13*Math.sin(t*1.7 + j*1.2) - sweep*(j === 0 ? 0.7 : 1);
    const L = GILL_L[j], rx = GILL_R[j][0] + dx, ry = GILL_R[j][1] + dy;
    const ca = Math.cos(a), sa = Math.sin(a), tx = rx + ca*L, ty = ry + sa*L;
    const cx = rx + ca*L*0.5 - sa*2.5, cy = ry + sa*L*0.5 + ca*2.5;
    for (let side = -1; side <= 1; side += 2){
      for (let kk = 0; kk <= K; kk++){
        const k = side < 0 ? kk : K - kk, u = k/K;
        const x = (1-u)*(1-u)*rx + 2*u*(1-u)*cx + u*u*tx, y = (1-u)*(1-u)*ry + 2*u*(1-u)*cy + u*u*ty;
        let gx = 2*(1-u)*(cx - rx) + 2*u*(tx - cx), gy = 2*(1-u)*(cy - ry) + 2*u*(ty - cy);
        const gl = Math.hypot(gx, gy) || 1; gx /= gl; gy /= gl;
        const nx = side < 0 ? gy : -gy, ny = side < 0 ? -gx : gx;
        const w = 1.5*(1 - 0.45*u), fl = u < 0.2 ? 0 : 3.9*(1 - 0.3*u)*(1 + 0.12*Math.sin(t*2.3 + k*1.3 + j + side));
        const ix = x + nx*w, iy = y + ny*w;
        if (side < 0 && kk === 0) c.moveTo(ix, iy); else c.lineTo(ix, iy);
        if (fl > 0) c.lineTo(ix + nx*fl*0.8 + gx*fl*0.6, iy + ny*fl*0.8 + gy*fl*0.6);
      }
      if (side < 0) c.lineTo(tx + ca*2.2, ty + sa*2.2);
    }
    c.closePath();
  }
  c.fill();
}
// 다리 두 개를 한 번에 (선 두 번)
function axLegs(c, col, x1, y1, a1, b1, x2, y2, a2, b2){
  const k1x = x1 + Math.cos(a1)*7, k1y = y1 + Math.sin(a1)*7, f1x = k1x + Math.cos(b1)*6.5, f1y = k1y + Math.sin(b1)*6.5;
  const k2x = x2 + Math.cos(a2)*7, k2y = y2 + Math.sin(a2)*7, f2x = k2x + Math.cos(b2)*6.5, f2y = k2y + Math.sin(b2)*6.5;
  c.strokeStyle = col; c.lineWidth = 4.4; c.beginPath();
  c.moveTo(x1, y1); c.lineTo(k1x, k1y); c.lineTo(f1x, f1y); c.moveTo(x2, y2); c.lineTo(k2x, k2y); c.lineTo(f2x, f2y); c.stroke();
  c.lineWidth = lw(1.6); c.beginPath();
  for (let k = 0; k < 4; k++){
    const d1 = b1 - 1.55 + k*0.38, d2 = b2 - 1.55 + k*0.38;
    c.moveTo(f1x, f1y); c.lineTo(f1x + Math.cos(d1)*3.4, f1y + Math.sin(d1)*3.4);
    c.moveTo(f2x, f2y); c.lineTo(f2x + Math.cos(d2)*3.4, f2y + Math.sin(d2)*3.4);
  }
  c.stroke();
}
function axolotl(c, o){
  const P = AXO[o.v], t = o.t, m = o.mode, swim = m === 'swim', e = Math.min(1, o.e);
  const A = swim ? 1.6 + 4.5*e : m === 'surface' ? 1.2 : 0.7, wp = swim ? o.ph : t*1.4;
  for (let i = 0; i < AN; i++){
    const s = i/(AN - 1);
    AX[i] = 20 - 70*s; AY[i] = A*s*s*Math.sin(wp - 4.5*s) + 1.5*s;
    AH[i] = 0.6 + 9.2*Math.pow(1 - s, 0.75);
    AT[i] = s > 0.12 ? 6*Math.pow(Math.sin(PI*(s - 0.12)/0.88), 0.8) : 0;
    AB[i] = s > 0.48 ? 4.2*Math.sin(PI*(s - 0.48)/0.52) : 0;
  }
  // 다리 각도
  let fa, fb, ga, gb, ha, hb, ia, ib;
  if (swim){ fa = ga = ha = ia = 2.45; fb = gb = hb = ib = 2.85; }
  else if (m === 'walk'){
    const p = o.ph, q = p + PI;
    fa = 1.4 + 0.45*Math.sin(p); fb = fa + 0.3 + 0.4*Math.max(0, Math.cos(p));
    ga = 1.4 + 0.45*Math.sin(q); gb = ga + 0.3 + 0.4*Math.max(0, Math.cos(q));
    ha = ga; hb = gb; ia = fa; ib = fb;          // 대각선 짝
  } else if (m === 'surface'){ fa = ga = ha = ia = 1.95 + 0.08*Math.sin(t); fb = gb = hb = ib = 2.3; }
  else { fa = ga = ha = ia = 1.4; fb = gb = hb = ib = 1.68; }
  const bk = 5, sweep = swim ? 0.28*e : 0;
  // 먼 쪽 아가미·다리
  gills(c, P.gillD, 3, -3.5, -0.1, t + 0.7, sweep);
  axLegs(c, P.limbD, 18, 6, ga, gb, AX[bk] + 3, AY[bk] + 5, ia, ib);
  // 지느러미
  for (let i = 0; i < AN; i++){ OX[i] = AX[i]; OY[i] = AY[i] - AH[i] - AT[i]; OX[2*AN - 1 - i] = AX[i]; OY[2*AN - 1 - i] = AY[i] + AH[i] + AB[i]; }
  OX[AN - 1] -= 3; OX[AN] -= 3;
  c.fillStyle = P.fin; c.beginPath(); closedSmooth(c, OX, OY, 2*AN); c.fill();
  c.strokeStyle = P.finE; c.lineWidth = lw(0.9); c.stroke();
  // 몸통
  for (let i = 0; i < AN; i++){ OX[i] = AX[i]; OY[i] = AY[i] - AH[i]; OX[2*AN - 1 - i] = AX[i]; OY[2*AN - 1 - i] = AY[i] + AH[i]; }
  OX[0] += 8; OX[2*AN - 1] += 8;
  const g = c.createLinearGradient(0, -13, 0, 12);
  g.addColorStop(0, P.top); g.addColorStop(0.5, P.body); g.addColorStop(1, P.belly);
  c.fillStyle = g; c.beginPath(); closedSmooth(c, OX, OY, 2*AN); c.fill();
  // 가까운 아가미 (머리 뒤에서 뻗어 나옴)
  gills(c, P.gill, 0, 0, 0, t, sweep);
  // 머리
  c.fillStyle = g; c.beginPath(); c.ellipse(33, -0.5, 17.5, 12.5, 0, 0, TAU); c.fill();
  if (P.spot){
    c.fillStyle = P.spot; c.beginPath();
    for (let i = 1; i < AN - 2; i++) for (let k = 0; k < 2; k++){
      const x = AX[i] + ((i*7 + k*3) % 5 - 2)*1.2, y = AY[i] + AH[i]*(((i*5 + k*11) % 9)/9*1.2 - 0.75), r = 0.8 + ((i + k) % 3)*0.35;
      c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU);
    }
    c.moveTo(29, -7); c.arc(28, -7, 1.2, 0, TAU); c.moveTo(39, -9); c.arc(38, -9, 1, 0, TAU);
    c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.ellipse(31, -8.5, 9.5, 3, -0.05, 0, TAU); c.moveTo(14, -6.5); c.ellipse(4, -6.5, 10, 2, 0, 0, TAU); c.fill();
  // 얼굴
  blush(c, 38.5, 4.2, 4.2, 2.5, o.bl);
  eye(c, 40, -4.2, 3.9, o.sl, P.lid, P.iris);
  if (o.mo > 0.05){
    c.fillStyle = P.mouth; c.beginPath(); c.ellipse(46, 4, 3.6, 0.9 + 3.2*o.mo, 0, 0, TAU); c.fill();
  }
  c.strokeStyle = P.mouth; c.lineWidth = lw(1.3); c.beginPath(); c.moveTo(50, 1.5); c.quadraticCurveTo(46, 7.8, 33, 5.5); c.stroke();
  // 가까운 쪽 다리·아가미
  axLegs(c, P.limb, 15, 8, fa, fb, AX[bk], AY[bk] + 6.5, ha, hb);
}

/* ---------- 체리새우 ---------- */
const SHR = [
  {top:'rgba(222,30,40,.94)', mid:'rgba(244,80,76,.86)', belly:'rgba(255,172,160,.55)', fan:'rgba(232,48,54,.8)', leg:'rgba(246,104,96,.78)', ant:'rgba(210,46,52,.88)', edge:'rgba(255,224,218,.5)', seg:'rgba(150,10,20,.35)', lid:'#dc363c'},
  {top:'rgba(244,178,14,.95)', mid:'rgba(255,208,62,.88)', belly:'rgba(255,240,168,.58)', fan:'rgba(244,182,24,.82)', leg:'rgba(250,196,60,.8)', ant:'rgba(214,150,20,.9)', edge:'rgba(255,250,214,.55)', seg:'rgba(170,110,0,.35)', lid:'#f0b418'},
  {top:'rgba(26,86,210,.93)', mid:'rgba(64,134,238,.84)', belly:'rgba(168,208,255,.52)', fan:'rgba(36,98,220,.8)', leg:'rgba(90,150,240,.78)', ant:'rgba(30,80,190,.88)', edge:'rgba(214,232,255,.55)', seg:'rgba(10,40,130,.35)', lid:'#2c66d6'},
];
const abR = u => 10.2 - 5.8*Math.pow(u, 1.2);   // 배 굵기
function shrimp(c, o){
  const P = SHR[o.v], t = o.t, m = o.mode, swim = m === 'swim', e = Math.min(1, o.e);
  const flick = swim ? Math.sin(o.ph)*(1.2 + 4.5*e) : Math.sin(t*0.8)*0.6;
  const p0x = 12, p0y = -3, p1x = -24, p1y = -17, p2x = -38 + flick*0.35, p2y = 7 + flick;
  const bx = u => (1-u)*(1-u)*p0x + 2*u*(1-u)*p1x + u*u*p2x, by = u => (1-u)*(1-u)*p0y + 2*u*(1-u)*p1y + u*u*p2y;
  const dx = u => 2*(1-u)*(p1x - p0x) + 2*u*(p2x - p1x), dy = u => 2*(1-u)*(p1y - p0y) + 2*u*(p2y - p1y);
  const g = c.createLinearGradient(0, -17, 0, 12);
  g.addColorStop(0, P.top); g.addColorStop(0.5, P.mid); g.addColorStop(1, P.belly);
  // 꼬리부채
  {
    const ex = bx(1), ey = by(1), ta = Math.atan2(dy(1), dx(1));
    c.save(); c.translate(ex, ey); c.rotate(ta);
    const open = 0.28 + (swim ? 0.12*e*(0.5 + 0.5*Math.sin(o.ph + 1)) : 0.04*Math.sin(t*1.3));
    c.fillStyle = P.fan; c.beginPath();
    for (const k of [-1.6, -0.55, 0.55, 1.6]){ const a = k*open; c.moveTo(0, 0); c.ellipse(Math.cos(a)*7, Math.sin(a)*7, 8, 2.9, a, 0, TAU); }
    c.fill();
    c.strokeStyle = P.edge; c.lineWidth = lw(0.7); c.stroke();
    c.restore();
  }
  // 헤엄다리 (파닥파닥) + 걷는다리
  c.strokeStyle = P.leg; c.lineWidth = lw(1.4); c.beginPath();
  for (let i = 0; i < 5; i++){
    const u = 0.1 + i*0.16, x = bx(u), y = by(u), tx = dx(u), ty = dy(u), tl = Math.hypot(tx, ty) || 1;
    const nx = ty/tl, ny = -tx/tl, r = abR(u)*0.85, rx = x + nx*r, ry = y + ny*r;
    const a = Math.atan2(ny, nx) - 0.55 + 0.42*Math.sin(t*10 - i*0.8 + o.ph)*(0.35 + 0.65*e), l = 6.5 - i*0.5;
    const ex = rx + Math.cos(a)*l, ey = ry + Math.sin(a)*l;
    c.moveTo(rx, ry); c.lineTo(ex, ey); c.moveTo(ex, ey); c.lineTo(ex + Math.cos(a - 0.6)*2.2, ey + Math.sin(a - 0.6)*2.2);
  }
  for (let j = 0; j < 5; j++){
    const rx = 31 - j*5.2, ry = 6.5, p = o.ph*1.5 + j*1.3;
    let kx, ky, fx, fy;
    if (swim){ kx = rx + 4; ky = ry + 5; fx = rx + 8; fy = ry + 9; }
    else if (m === 'walk'){ const lift = Math.max(0, Math.sin(p))*3; kx = rx + 3; ky = ry + 7 - lift*0.5; fx = rx - 1 + Math.cos(p)*3; fy = ry + 15 - lift; }
    else { kx = rx + 3 + Math.sin(t*0.7 + j)*0.3; ky = ry + 7; fx = rx - 1; fy = ry + 15; }
    c.moveTo(rx, ry); c.lineTo(kx, ky); c.lineTo(fx, fy);
  }
  c.stroke();
  // 배: 매끈한 관 + 마디 줄
  const NA = 10;
  for (let i = 0; i <= NA; i++){
    const u = i/NA, x = bx(u), y = by(u), tx = dx(u), ty = dy(u), tl = Math.hypot(tx, ty) || 1;
    const r = abR(u), nx = ty/tl, ny = -tx/tl;
    CX[i] = x; CY[i] = y; LX[i] = x - nx*r; LY[i] = y - ny*r; RX[i] = x + nx*r; RY[i] = y + ny*r;
  }
  c.fillStyle = g; c.strokeStyle = P.edge; c.lineWidth = lw(0.8);
  c.beginPath(); smoothLine(c, LX, LY, 0, NA, true); smoothLine(c, RX, RY, NA, 0, false); c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = P.seg; c.lineWidth = lw(1); c.beginPath();
  for (let k = 1; k <= 5; k++){
    const u = k/6, x = bx(u), y = by(u), tx = dx(u), ty = dy(u), tl = Math.hypot(tx, ty) || 1, r = abR(u)*0.96, nx = ty/tl, ny = -tx/tl;
    c.moveTo(x - nx*r, y - ny*r); c.quadraticCurveTo(x + tx/tl*r*0.55, y + ty/tl*r*0.55, x + nx*r, y + ny*r);
  }
  c.stroke();
  // 갑각
  c.strokeStyle = P.edge; c.lineWidth = lw(0.8); c.beginPath(); c.ellipse(21, -3, 20.5, 11.6, -0.05, 0, TAU); c.fill(); c.stroke();
  c.fillStyle = P.top; c.beginPath(); c.moveTo(35, -11); c.lineTo(54, -13.5); c.lineTo(39, -6); c.closePath(); c.fill();
  // 등 반짝임
  c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = lw(1.3); c.beginPath();
  c.ellipse(19, -3, 16, 8.5, -0.05, -2.6, -1.0);
  c.moveTo(lerp(LX[1], CX[1], 0.3), lerp(LY[1], CY[1], 0.3));
  for (let i = 2; i <= 7; i++) c.lineTo(lerp(LX[i], CX[i], 0.3), lerp(LY[i], CY[i], 0.3));
  c.stroke();
  // 더듬이
  const w1 = Math.sin(t*2.1)*4, w2 = Math.sin(t*1.7 + 1)*4;
  c.strokeStyle = P.ant; c.lineWidth = lw(1.1); c.beginPath();
  c.moveTo(40, -7); c.bezierCurveTo(62, -17 + w1*0.3, 42 + w1, -42, -22 + w1*2, -32 + w1);
  c.moveTo(41, -5); c.bezierCurveTo(70, -9, 60 + w2, -30, 2 + w2*2, -24 + w2);
  c.moveTo(42, -8); c.quadraticCurveTo(50, -13, 57 + w1*0.2, -15); c.moveTo(49, -11.5); c.lineTo(57, -9.5 + w2*0.2);
  c.stroke();
  // 눈·볼·입
  c.strokeStyle = P.top; c.lineWidth = 3; c.beginPath(); c.moveTo(33, -5); c.lineTo(36.5, -7); c.stroke();
  blush(c, 32, 1.5, 3.4, 2, o.bl);
  eye(c, 37.5, -7.5, 3.8, o.sl, P.lid);
  if (o.mo > 0.05){ c.fillStyle = 'rgba(110,20,20,.85)'; c.beginPath(); c.ellipse(40.5, 3, 1.8, 0.6 + 1.8*o.mo, 0, 0, TAU); c.fill(); }
  else { c.strokeStyle = 'rgba(90,20,20,.7)'; c.lineWidth = lw(0.9); c.beginPath(); c.moveTo(38, 2.4); c.quadraticCurveTo(40.2, 4.2, 42.4, 2.2); c.stroke(); }
}

const CRITTERS = {turtle, frog, axolotl, shrimp};

export function drawCritter(ctx, kind, o){
  const fn = CRITTERS[kind];
  if (!fn || !o || !ctx) return;
  const L = +o.L;
  if (!(L > 0)) return;
  ctx.save();
  try {
    ctx.translate(+o.x || 0, +o.y || 0);
    if (o.rot) ctx.rotate(+o.rot || 0);
    const f = o.face == null ? 1 : (+o.face || 0), sg = f < 0 ? -1 : 1, k = L/100;
    ctx.scale(sg*Math.max(0.18, Math.min(1, Math.abs(f)))*k, k);
    K = k;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    fn(ctx, norm(o));
  } catch (err) {
    if (globalThis.__crittersDebug) throw err;
  } finally {
    ctx.restore();
  }
}

/* ================= 장식 ================= */
const CX = new Float32Array(48), CY = new Float32Array(48), CA = new Float32Array(48), CW = new Float32Array(48);
const LX = new Float32Array(48), LY = new Float32Array(48), RX = new Float32Array(48), RY = new Float32Array(48);

// 줄기: 물속이면 위(부력)로, 물 밖이면 아래(중력)로 휘어짐
function stem(o, bx, by, n, seg, lean, stiff, ph, sway){
  const up = o.up || UP, ua = Math.atan2(up.y, up.x), da = ua + PI;
  const t = +o.t || 0, flow = clamp(+o.flow || 0, -1, 1), wet = typeof o.wet === 'function' ? o.wet : WET_ALL;
  let a = -PI/2 + lean*0.6, x = bx, y = by;
  CX[0] = x; CY[0] = y; CA[0] = a; CW[0] = wet(x, y - 1) ? 1 : 0;
  const side = lean >= 0 ? 1 : -1, floorY = by - 0.4;
  for (let i = 1; i <= n; i++){
    const u = i/n, sx = Math.cos(a)*seg, sy = Math.sin(a)*seg;
    // 젖은 정도: 마디 위 네 점 평균 (수면을 지날 때 덜 튀게)
    const w = ((wet(x, y) ? 1 : 0) + (wet(x + sx*0.33, y + sy*0.33) ? 1 : 0) + (wet(x + sx*0.66, y + sy*0.66) ? 1 : 0) + (wet(x + sx, y + sy) ? 1 : 0))*0.25;
    let d = 0;
    if (w > 0){
      const tg = ua + lean + sway*Math.sin(t*0.9 + ph - u*2.4)*(0.35 + u) + flow*0.6*(0.3 + u);
      d += w*wrap(tg - a)*Math.min(0.9, stiff*(0.16 + 0.36*u));
    }
    if (w < 1){
      let dd = wrap(da - a);
      if (Math.abs(dd) > PI - 0.4) dd = side*Math.abs(dd);
      d += (1 - w)*dd*(0.2 + 0.28*u);
    }
    a += d;
    x += Math.cos(a)*seg; y += Math.sin(a)*seg;
    if (y > floorY){ y = floorY; a = Math.cos(a) >= 0 ? -0.03 : PI + 0.03; }   // 바닥에 눕기
    CX[i] = x; CY[i] = y; CA[i] = a; CW[i] = w;
  }
}
function smoothLine(c, xs, ys, i0, i1, first){
  if (first) c.moveTo(xs[i0], ys[i0]); else c.lineTo(xs[i0], ys[i0]);
  const st = i1 >= i0 ? 1 : -1;
  if (i0 === i1) return;
  for (let i = i0 + st; i !== i1; i += st){ c.quadraticCurveTo(xs[i], ys[i], (xs[i] + xs[i + st])/2, (ys[i] + ys[i + st])/2); }
  c.lineTo(xs[i1], ys[i1]);
}

// 시드별 모양 (한 번만 계산)
const PLANT = new Map();
function plantParams(kind, seed){
  const key = kind + '|' + seed;
  let p = PLANT.get(key);
  if (p) return p;
  if (PLANT.size > 200) PLANT.clear();
  const r = rng(seed*7 + kind.length*131);
  if (kind === 'vallis'){
    const n = 6 + Math.floor(r()*5), leaves = [];
    for (let i = 0; i < n; i++){
      const back = r() < 0.45, sh = r();
      const col = back ? mix([52, 118, 54], [76, 146, 62], sh) : mix([96, 176, 74], [146, 206, 98], sh);
      leaves.push({dx: (r() - 0.5)*24, len: 120 + r()*75, w: 5 + r()*2.2, lean: (r() - 0.5)*0.5, ph: r()*TAU, back, col});
    }
    leaves.sort((a, b) => (b.back - a.back) || (b.len - a.len));
    p = {leaves};
  } else if (kind === 'cabomba'){
    const n = 3 + Math.floor(r()*3), stems = [];
    for (let i = 0; i < n; i++){
      const sh = r();
      stems.push({dx: (r() - 0.5)*30, len: 95 + r()*55, lean: (r() - 0.5)*0.5, ph: r()*TAU, pal: Math.floor(sh*CAB_COL.length)});
    }
    stems.sort((a, b) => b.len - a.len);
    p = {stems};
  } else if (kind === 'anubias'){
    const n = 5 + Math.floor(r()*3), leaves = [];
    for (let i = 0; i < n; i++){
      const u = n > 1 ? i/(n - 1) : 0.5, back = i % 2 === 1, sh = r();
      leaves.push({dx: (u - 0.5)*44 + (r() - 0.5)*6, lean: (u - 0.5)*2.1 + (r() - 0.5)*0.3, pl: 5 + r()*3, bl: 24 + r()*11, bw: 12 + r()*5, ph: r()*TAU, back,
        dark: back ? mix([30, 82, 40], [40, 96, 46], sh) : mix([44, 112, 52], [58, 130, 60], sh),
        light: back ? mix([46, 104, 52], [56, 118, 58], sh) : mix([74, 148, 74], [92, 166, 84], sh)});
    }
    leaves.sort((a, b) => b.back - a.back);
    p = {leaves};
  }
  PLANT.set(key, p);
  return p;
}

function vallis(c, o){
  const s = o.s, P = plantParams('vallis', o.seed | 0), n = 12, t = +o.t || 0;
  for (const lf of P.leaves){
    stem(o, o.x + lf.dx*s, o.y + 1, n, lf.len*s/n, lf.lean, 1, lf.ph, 0.16);
    for (let i = 0; i <= n; i++){
      const u = i/n, tw = 0.55 + 0.45*Math.abs(Math.cos(u*3.2 + lf.ph + t*0.35));
      const hw = lf.w*s*0.5*(1 - 0.72*u*u)*tw*(i === n ? 0 : 1), a = CA[i], nx = -Math.sin(a), ny = Math.cos(a);
      LX[i] = CX[i] + nx*hw; LY[i] = CY[i] + ny*hw; RX[i] = CX[i] - nx*hw; RY[i] = CY[i] - ny*hw;
    }
    c.fillStyle = lf.col; c.beginPath(); smoothLine(c, LX, LY, 0, n, true); smoothLine(c, RX, RY, n, 0, false); c.closePath(); c.fill();
  }
}

// 붕어마름 색 (잎, 윗잎, 줄기)
const CAB_COL = [['#5aa040', '#9cd86e', '#4a7a30'], ['#4c9438', '#86cc5c', '#3f6e2a'], ['#68b04a', '#acdf7c', '#587f34']];
function cabomba(c, o){
  const s = o.s, P = plantParams('cabomba', o.seed | 0), n = 12;
  for (const st of P.stems){
    const pal = CAB_COL[st.pal];
    stem(o, o.x + st.dx*s, o.y + 1, n, st.len*s/n, st.lean, 0.9, st.ph, 0.12);
    c.strokeStyle = pal[2]; c.lineWidth = Math.max(0.8, 1.5*s); c.beginPath(); smoothLine(c, CX, CY, 0, n, true); c.stroke();
    // 부채꼴 잎: 톱니 모양 부채 (아래 마디 / 위 마디)
    const mid = Math.ceil(n*0.6);
    for (let pass = 0; pass < 2; pass++){
      c.fillStyle = pal[pass]; c.beginPath();
      for (let i = pass ? mid + 1 : 1; i <= (pass ? n : mid); i++){
        const u = i/n, R = (13 - 5.5*u)*s, a = CA[i], th = lerp(0.4, 1.12, CW[i]), x = CX[i], y = CY[i];
        for (let sd = -1; sd <= 1; sd += 2){
          c.moveTo(x, y);
          for (let k = 0; k <= 8; k++){
            const fa = a + sd*(th - 0.6 + k*0.15), rr = (k & 1 ? 0.5 : 1)*R*(1 - 0.016*(k - 4)*(k - 4));
            c.lineTo(x + Math.cos(fa)*rr, y + Math.sin(fa)*rr);
          }
          c.closePath();
        }
      }
      c.fill();
    }
  }
}

function anubias(c, o){
  const s = o.s, P = plantParams('anubias', o.seed | 0), x0 = o.x, y0 = o.y;
  // 뿌리줄기
  c.lineCap = 'round';
  c.strokeStyle = '#6a6436'; c.lineWidth = 5.5*s; c.beginPath(); c.moveTo(x0 - 26*s, y0 - 3*s); c.quadraticCurveTo(x0, y0 - 6*s, x0 + 26*s, y0 - 3.5*s); c.stroke();
  c.strokeStyle = 'rgba(200,190,130,.35)'; c.lineWidth = 1.4*s; c.beginPath(); c.moveTo(x0 - 24*s, y0 - 5*s); c.quadraticCurveTo(x0, y0 - 8*s, x0 + 24*s, y0 - 5.5*s); c.stroke();
  c.strokeStyle = 'rgba(130,118,70,.75)'; c.lineWidth = Math.max(0.6, 0.9*s); c.beginPath();
  for (let k = -3; k <= 3; k++){ const x = x0 + k*8*s; c.moveTo(x, y0 - 2*s); c.quadraticCurveTo(x + 2*s, y0 + 1*s, x + (k % 2 ? 5 : -4)*s, y0 + 0.5*s); }
  c.stroke();
  for (const lf of P.leaves){
    const bx = x0 + lf.dx*s, by = y0 - 4*s;
    stem(o, bx, by, 4, lf.pl*s, lf.lean, 1.5, lf.ph, 0.06);
    c.strokeStyle = '#4c7c3a'; c.lineWidth = Math.max(0.8, 2.2*s); c.beginPath(); smoothLine(c, CX, CY, 0, 3, true); c.stroke();
    const L = lf.bl*s, W = lf.bw*s;
    c.save(); c.translate(CX[3], CY[3]); c.rotate(CA[4]);
    c.fillStyle = lf.dark; c.beginPath(); c.moveTo(0, 0);
    c.bezierCurveTo(L*0.22, -W*0.78, L*0.78, -W*0.58, L, 0); c.bezierCurveTo(L*0.78, W*0.58, L*0.22, W*0.78, 0, 0); c.fill();
    c.fillStyle = lf.light; c.beginPath(); c.moveTo(0, 0);
    c.bezierCurveTo(L*0.22, -W*0.78, L*0.78, -W*0.58, L, 0); c.quadraticCurveTo(L*0.5, -W*0.05, 0, 0); c.fill();
    c.strokeStyle = 'rgba(200,236,170,.5)'; c.lineWidth = Math.max(0.5, 0.8*s); c.beginPath();
    c.moveTo(0, 0); c.quadraticCurveTo(L*0.5, -W*0.04, L*0.94, 0);
    for (let k = 1; k <= 3; k++){ const u = k*0.22; c.moveTo(L*u, -W*0.02); c.quadraticCurveTo(L*(u + 0.08), -W*0.25, L*(u + 0.2), -W*0.36*(1.1 - u*0.6)); c.moveTo(L*u, W*0.02); c.quadraticCurveTo(L*(u + 0.08), W*0.25, L*(u + 0.2), W*0.36*(1.1 - u*0.6)); }
    c.stroke();
    c.fillStyle = 'rgba(255,255,240,.16)'; c.beginPath(); c.ellipse(L*0.4, -W*0.28, L*0.2, W*0.1, -0.15, 0, TAU); c.fill();
    c.restore();
  }
}

/* ---------- 고정 장식 (캐시 스프라이트) ---------- */
const SPR = new Map();
function sprite(key, bw, bh, ax, ay, s, dev, fn){
  let cv = SPR.get(key);
  if (!cv){
    if (SPR.size > 96) SPR.delete(SPR.keys().next().value);
    const sc = s*dev;
    cv = mkCanvas(Math.max(2, Math.ceil(bw*sc)), Math.max(2, Math.ceil(bh*sc)));
    const g = cv.getContext('2d');
    g.scale(sc, sc); g.translate(ax, ay); g.lineCap = 'round'; g.lineJoin = 'round';
    fn(g);
    SPR.set(key, cv);
  }
  return cv;
}
function blob(g, cx, cy, rx, ry, r, flat){
  const n = 9, xs = OX, ys = OY;
  for (let i = 0; i < n; i++){
    const a = i/n*TAU, j = 1 + (r() - 0.5)*0.16;
    xs[i] = cx + Math.cos(a)*rx*j; ys[i] = cy + Math.sin(a)*ry*j;
    if (flat != null && ys[i] > flat) ys[i] = flat;
  }
  g.beginPath(); closedSmooth(g, xs, ys, n);
}
const STONE_COL = [[190,184,172],[150,144,134],[204,188,160],[128,142,148],[168,150,132],[218,212,200],[120,124,118]];
function stonesArt(g, seed){
  const r = rng(seed*13 + 5);
  g.fillStyle = 'rgba(20,30,30,.28)'; g.beginPath(); g.ellipse(0, 1, 40, 5, 0, 0, TAU); g.fill();
  const list = [], nb = 2 + Math.floor(r()*2);
  let x = -36 + r()*6;
  for (let i = 0; i < nb; i++){
    const w = 15 + r()*8, h = 9 + r()*5;
    list.push([x + w, -h + 1.5, w, h]); x += w*1.6 + r()*3;
    if (x > 20) break;
  }
  const nt = 1 + Math.floor(r()*2);
  for (let i = 0; i < nt; i++){
    const b = list[Math.floor(r()*list.length)], w = 10 + r()*6, h = 7 + r()*3;
    list.push([b[0] + (r() - 0.5)*b[2]*0.7, b[1] - b[3]*0.75 - h*0.5, w, h]);
  }
  for (const st of list){
    const [cx, cy, rx, ry] = st, col = STONE_COL[Math.floor(r()*STONE_COL.length)];
    blob(g, cx, cy, rx, ry, r, 1.5);
    const gr = g.createRadialGradient(cx - rx*0.35, cy - ry*0.55, 0, cx, cy, Math.max(rx, ry)*1.25);
    gr.addColorStop(0, hex(col[0]*1.18 + 12, col[1]*1.18 + 12, col[2]*1.18 + 12)); gr.addColorStop(0.55, hex(...col)); gr.addColorStop(1, hex(col[0]*0.62, col[1]*0.62, col[2]*0.62));
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(40,40,36,.25)'; g.lineWidth = 0.8; g.stroke();
    g.fillStyle = 'rgba(60,56,50,.22)'; g.beginPath();
    for (let k = 0; k < 6; k++){ const px = cx + (r() - 0.5)*rx*1.3, py = cy + (r() - 0.3)*ry*0.9; g.moveTo(px + 0.7, py); g.arc(px, py, 0.4 + r()*0.6, 0, TAU); }
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.ellipse(cx - rx*0.35, cy - ry*0.55, rx*0.28, ry*0.16, -0.25, 0, TAU); g.fill();
  }
}
function branch(g, r, x0, y0, cx, cy, x1, y1, w0, w1){
  const n = 12;
  for (let i = 0; i <= n; i++){
    const u = i/n, x = (1-u)*(1-u)*x0 + 2*u*(1-u)*cx + u*u*x1, y = (1-u)*(1-u)*y0 + 2*u*(1-u)*cy + u*u*y1;
    const tx = 2*(1-u)*(cx - x0) + 2*u*(x1 - cx), ty = 2*(1-u)*(cy - y0) + 2*u*(y1 - cy), tl = Math.hypot(tx, ty) || 1;
    const w = lerp(w0, w1, u)*(1 + (r() - 0.5)*0.12)*0.5;
    CX[i] = x; CY[i] = y; LX[i] = x - ty/tl*w; LY[i] = y + tx/tl*w; RX[i] = x + ty/tl*w; RY[i] = y - tx/tl*w;
  }
  g.beginPath(); smoothLine(g, LX, LY, 0, n, true); smoothLine(g, RX, RY, n, 0, false); g.closePath();
  g.fillStyle = '#86562f'; g.fill(); g.strokeStyle = 'rgba(54,30,14,.55)'; g.lineWidth = 0.9; g.stroke();
  // 나뭇결
  g.strokeStyle = 'rgba(60,34,16,.35)'; g.lineWidth = 0.7; g.beginPath();
  for (const f of [-0.25, 0.1, 0.35]){
    for (let i = 0; i <= n; i++){ const x = lerp(CX[i], LX[i], f), y = lerp(CY[i], LY[i], f); i ? g.lineTo(x, y) : g.moveTo(x, y); }
  }
  g.stroke();
  g.strokeStyle = 'rgba(255,214,160,.32)'; g.lineWidth = 1.2; g.beginPath();
  for (let i = 1; i < n; i++){ const x = lerp(CX[i], RX[i], 0.55), y = lerp(CY[i], RY[i], 0.55); i > 1 ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  // 잘린 끝
  const ex = CX[n], ey = CY[n], ta = Math.atan2(CY[n] - CY[n-1], CX[n] - CX[n-1]);
  g.fillStyle = '#d0a273'; g.beginPath(); g.ellipse(ex, ey, w1*0.5, w1*0.24, ta + PI/2, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(120,76,40,.6)'; g.lineWidth = 0.6; g.stroke();
}
function driftArt(g, seed){
  const r = rng(seed*31 + 9), fx = r() < 0.5 ? -1 : 1, hk = 0.85 + r()*0.3;
  g.fillStyle = 'rgba(20,24,20,.3)'; g.beginPath(); g.ellipse(0, 1, 58, 5, 0, 0, TAU); g.fill();
  g.scale(fx, 1);
  branch(g, r, 8, -12, 2, -44*hk, 26, -80*hk, 12, 4.2);
  branch(g, r, -18, -12, -36, -30*hk, -42, -60*hk, 10.5, 3.8);
  branch(g, r, -36, -42*hk, -46, -52*hk, -54, -64*hk, 4.6, 2.4);
  branch(g, r, 18, -58*hk, 30, -60*hk, 38, -54*hk, 4, 2.2);
  branch(g, r, -58, -7, -6, -24, 56, -9, 17, 11);
  g.fillStyle = 'rgba(56,30,14,.55)'; g.beginPath();
  g.moveTo(-17.4, -12); g.ellipse(-20, -12, 2.6, 1.6, 0.2, 0, TAU); g.moveTo(20, -13); g.ellipse(18, -13, 2, 1.3, -0.3, 0, TAU);
  g.fill();
}
function caveArt(g){
  g.fillStyle = 'rgba(20,24,20,.3)'; g.beginPath(); g.ellipse(-2, 1, 36, 4.5, 0, 0, TAU); g.fill();
  const bodyP = () => {
    g.beginPath(); g.moveTo(14, -36);
    g.bezierCurveTo(4, -46, -30, -46, -34, -24); g.bezierCurveTo(-36, -6, -18, 0, -2, 0);
    g.bezierCurveTo(10, 0, 16, -6, 20, -10); g.lineTo(20, -34); g.closePath();
  };
  bodyP();
  const gr = g.createRadialGradient(-14, -32, 2, -6, -22, 34);
  gr.addColorStop(0, '#f6b88a'); gr.addColorStop(0.6, '#d0754a'); gr.addColorStop(1, '#9c4c2c');
  g.fillStyle = gr; g.fill();
  // 유약 (위쪽, 흘러내린 무늬)
  g.save(); bodyP(); g.clip();
  g.fillStyle = '#5fb3a6'; g.beginPath(); g.moveTo(-40, -50); g.lineTo(30, -50);
  g.lineTo(30, -26);
  for (let x = 30; x >= -40; x -= 5){ const y = -26 + Math.sin(x*0.45)*2.5 + ((x/5) % 2 ? 3.5 : 0); g.quadraticCurveTo(x + 2.5, y + 3, x, y); }
  g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,240,.55)'; g.beginPath();
  for (const [x, y] of [[-22, -38], [-10, -40], [2, -36], [-28, -28], [-16, -31], [8, -30]]){ g.moveTo(x + 1.6, y); g.arc(x, y, 1.6, 0, TAU); }
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.ellipse(-16, -36, 10, 3.2, -0.35, 0, TAU); g.fill();
  g.restore();
  bodyP(); g.strokeStyle = 'rgba(90,40,20,.45)'; g.lineWidth = 0.9; g.stroke();
  // 입구
  g.fillStyle = '#e6a07a'; g.beginPath(); g.ellipse(21, -22, 10, 15.5, 0, 0, TAU); g.fill();
  g.fillStyle = '#5fb3a6'; g.beginPath(); g.ellipse(21, -22, 10, 15.5, 0, PI, TAU); g.ellipse(21, -22, 7, 12, 0, TAU, PI, true); g.fill();
  const ig = g.createRadialGradient(22, -21, 1, 21, -22, 11);
  ig.addColorStop(0, '#120c0a'); ig.addColorStop(1, '#4a2a1c');
  g.fillStyle = ig; g.beginPath(); g.ellipse(21.5, -22, 7, 12, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,240,220,.55)'; g.lineWidth = 1; g.beginPath(); g.ellipse(21, -22, 9, 14.5, 0, -2.6, -1.2); g.stroke();
}
function marimoArt(g, R){
  const r = rng(77);
  g.fillStyle = '#3c7a2c'; g.beginPath(); g.arc(0, 0, R*0.92, 0, TAU); g.fill();
  const cols = ['#5c9e3e', '#2e6824', '#78b852', '#4a8c34'];
  g.lineWidth = Math.max(0.5, R*0.06);
  for (let ci = 0; ci < 4; ci++){
    g.strokeStyle = cols[ci]; g.beginPath();
    for (let k = 0; k < 40; k++){
      const a = r()*TAU, d = R*(0.15 + 0.8*Math.sqrt(r())), x = Math.cos(a)*d, y = Math.sin(a)*d, b = a + (r() - 0.5)*1.2, l = R*(0.1 + r()*0.12);
      g.moveTo(x, y); g.lineTo(x + Math.cos(b)*l, y + Math.sin(b)*l);
    }
    for (let k = 0; k < 26; k++){
      const a = r()*TAU, d0 = R*0.82, l = R*(0.12 + r()*0.16), b = a + (r() - 0.5)*0.8;
      g.moveTo(Math.cos(a)*d0, Math.sin(a)*d0); g.lineTo(Math.cos(a)*d0 + Math.cos(b)*l, Math.sin(a)*d0 + Math.sin(b)*l);
    }
    g.stroke();
  }
}
function marimoShade(g, R){
  const hl = g.createRadialGradient(-R*0.35, -R*0.4, 0, -R*0.35, -R*0.4, R*0.9);
  hl.addColorStop(0, 'rgba(230,255,200,.42)'); hl.addColorStop(1, 'rgba(230,255,200,0)');
  g.fillStyle = hl; g.beginPath(); g.arc(0, 0, R*1.02, 0, TAU); g.fill();
  const sh = g.createRadialGradient(-R*0.2, -R*0.25, R*0.5, 0, 0, R*1.08);
  sh.addColorStop(0, 'rgba(10,40,10,0)'); sh.addColorStop(1, 'rgba(10,40,10,.45)');
  g.fillStyle = sh; g.beginPath(); g.arc(0, 0, R*1.08, 0, TAU); g.fill();
}
function marimo(c, o){
  const s = o.s, R = 13*s, dev = devScale(c), q = Math.max(0.25, Math.round(s*8)/8), t = +o.t || 0;
  const cx = o.x, cy = o.y - R;
  c.fillStyle = 'rgba(10,30,20,.25)'; c.beginPath(); c.ellipse(cx, o.y + 0.5, R*0.85, R*0.2, 0, 0, TAU); c.fill();
  const A = sprite('marimo|' + q + '|' + dev, 34, 34, 17, 17, q, dev, g => marimoArt(g, 13));
  const B = sprite('marimoS|' + q + '|' + dev, 34, 34, 17, 17, q, dev, g => marimoShade(g, 13));
  c.save(); c.translate(cx, cy); c.rotate(t*0.25);
  c.drawImage(A, -17*s, -17*s, 34*s, 34*s);
  c.restore();
  c.drawImage(B, cx - 17*s, cy - 17*s, 34*s, 34*s);
}
function shell(c, o){
  const s = o.s, t = +o.t || 0;
  c.save(); c.translate(o.x, o.y); c.scale(s*1.25, s*1.25);
  c.fillStyle = 'rgba(20,24,20,.25)'; c.beginPath(); c.ellipse(0, 1, 22, 3, 0, 0, TAU); c.fill();
  // 위 껍데기 (안쪽이 보이게 열림)
  const open = 0.86 + 0.08*Math.sin(t*0.6);
  c.save(); c.translate(0, -5); c.scale(1, open);
  c.beginPath(); c.moveTo(-5, 0);
  for (let k = 0; k <= 14; k++){ const a = PI + 0.22 + (PI - 0.44)*k/14, rr = 21 + 1.3*Math.abs(Math.sin(k*PI/2 + 0.6)); c.lineTo(Math.cos(a)*rr, Math.sin(a)*rr*1.05); }
  c.lineTo(5, 0); c.closePath();
  c.fillStyle = '#eba59a'; c.fill();
  c.beginPath(); c.moveTo(-3, -1); c.ellipse(0, -1, 17, 17.5, 0, PI + 0.3, TAU - 0.3); c.lineTo(3, -1); c.closePath();
  const ng = c.createLinearGradient(0, -18, 0, 0); ng.addColorStop(0, '#fff6f4'); ng.addColorStop(1, '#f6d2dc');
  c.fillStyle = ng; c.fill();
  c.restore();
  // 진주
  const pg = c.createRadialGradient(-2, -11.5, 0.5, 0, -9, 6.5);
  pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.6, '#f2ecf6'); pg.addColorStop(1, '#c8bcd8');
  c.fillStyle = pg; c.beginPath(); c.arc(0, -9, 6, 0, TAU); c.fill();
  c.fillStyle = 'rgba(255,255,255,.95)'; c.beginPath(); c.arc(-2, -11.2, 1.6, 0, TAU); c.fill();
  // 아래 껍데기
  c.beginPath(); c.moveTo(-22, -9);
  for (let k = 1; k <= 8; k++){ const x = -22 + k*5.5; c.quadraticCurveTo(x - 2.75, -6.2 + Math.abs(x)*0.04, x, -9 + Math.abs(x)*0.03); }
  c.bezierCurveTo(20, -2, 9, 0.8, 0, 0.8); c.bezierCurveTo(-9, 0.8, -20, -2, -22, -9); c.closePath();
  const bg = c.createLinearGradient(0, -10, 0, 1); bg.addColorStop(0, '#fbcfc2'); bg.addColorStop(1, '#e48c84');
  c.fillStyle = bg; c.fill();
  c.strokeStyle = 'rgba(190,96,90,.45)'; c.lineWidth = 0.8; c.beginPath();
  for (let k = 1; k < 8; k++){ const x = -22 + k*5.5; c.moveTo(0, 0.2); c.quadraticCurveTo(x*0.5, -3, x, -7.6 + Math.abs(x)*0.03); }
  c.stroke();
  c.strokeStyle = 'rgba(255,240,236,.7)'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(-19, -8.6); c.quadraticCurveTo(0, -6.5, 19, -8.6); c.stroke();
  c.restore();
}

// 바닥 기준점(ax, ay)과 상자 (s=1)
const RIGID = {
  stones:   {w: 100, h: 56, ax: 50, ay: 48, art: stonesArt},
  driftwood:{w: 140, h: 100, ax: 70, ay: 92, art: driftArt},
  cave:     {w: 82, h: 56, ax: 42, ay: 50, art: caveArt},
};
function rigid(c, kind, o){
  const R = RIGID[kind], s = o.s, dev = devScale(c), q = Math.max(0.25, Math.round(s*8)/8), seed = o.seed | 0;
  const cv = sprite(kind + '|' + seed + '|' + q + '|' + dev, R.w, R.h, R.ax, R.ay, q, dev, g => R.art(g, seed));
  c.drawImage(cv, o.x - R.ax*s, o.y - R.ay*s, R.w*s, R.h*s);
}

const DECOR = {
  vallis, cabomba, anubias, marimo, shell,
  stones: (c, o) => rigid(c, 'stones', o), driftwood: (c, o) => rigid(c, 'driftwood', o), cave: (c, o) => rigid(c, 'cave', o),
};
const SIZES = {
  vallis: {w: 80, h: 190}, cabomba: {w: 76, h: 156}, anubias: {w: 124, h: 60}, marimo: {w: 26, h: 26},
  stones: {w: 82, h: 40}, driftwood: {w: 124, h: 88}, cave: {w: 72, h: 48}, shell: {w: 56, h: 40},
};
export function decorSize(kind){ const z = SIZES[kind]; return z ? {w: z.w, h: z.h} : {w: 0, h: 0}; }

const DO = {x: 0, y: 0, s: 1, t: 0, up: UP, wet: WET_ALL, flow: 0, seed: 0};
export function drawDecor(ctx, kind, o){
  const fn = DECOR[kind];
  if (!fn || !o || !ctx) return;
  DO.x = +o.x || 0; DO.y = +o.y || 0; DO.s = +o.s > 0 ? +o.s : 1; DO.t = +o.t || 0;
  DO.up = o.up && isFinite(o.up.x) && isFinite(o.up.y) && (o.up.x || o.up.y) ? o.up : UP;
  DO.wet = typeof o.wet === 'function' ? o.wet : WET_ALL; DO.flow = +o.flow || 0; DO.seed = o.seed | 0;
  ctx.save();
  try {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    fn(ctx, DO);
  } catch (err) {
    if (globalThis.__crittersDebug) throw err;
  } finally {
    ctx.restore();
  }
}

/* ================= 바닥 ================= */
const FLOORS = new Map();
const FLOOR_KINDS = {sand: 1, gravel: 1, soil: 1};
function renderFloor(kind, W, h, s, seed, dev, pad){
  const H2 = h + pad, cv = mkCanvas(Math.max(2, Math.ceil(W*dev)), Math.max(2, Math.ceil(H2*dev)));
  const g = cv.getContext('2d'); g.scale(dev, dev);
  const r = rng(seed*17 + kind.length);
  const p1 = r()*TAU, p2 = r()*TAU, p3 = r()*TAU;
  const edge = x => pad + 2.2*s*Math.sin(x*0.012/s + p1) + 1.3*s*Math.sin(x*0.037/s + p2) + 0.6*s*Math.sin(x*0.11/s + p3);
  const band = () => {
    g.beginPath(); g.moveTo(0, edge(0));
    for (let x = 4; x < W + 4; x += 4) g.lineTo(Math.min(x, W), edge(Math.min(x, W)));
    g.lineTo(W, H2); g.lineTo(0, H2); g.closePath();
  };
  const top = pad - 4*s;
  if (kind === 'sand'){
    band();
    const gr = g.createLinearGradient(0, top, 0, H2);
    gr.addColorStop(0, '#f6eedc'); gr.addColorStop(0.35, '#e8dabd'); gr.addColorStop(1, '#c4b08a');
    g.fillStyle = gr; g.fill();
    g.save(); band(); g.clip();
    const cols = ['rgba(255,252,240,.85)', 'rgba(214,196,156,.55)', 'rgba(196,174,134,.45)', 'rgba(240,230,204,.8)', 'rgba(176,156,122,.4)', 'rgba(150,160,170,.3)'];
    const n = Math.floor(W*h/(6*s*s));
    for (let k = 0; k < n; k++){
      const x = r()*W, y = top + r()*(H2 - top), z = (0.5 + r()*0.8)*s;
      g.fillStyle = cols[(r()*cols.length) | 0]; g.fillRect(x, y, z, z);
    }
    // 모래 물결
    g.strokeStyle = 'rgba(255,252,240,.35)'; g.lineWidth = 1.1*s;
    for (let k = 0; k < W*h/(2600*s*s); k++){
      const x = r()*W, y = pad + 6*s + r()*(h - 10*s), l = (14 + r()*26)*s;
      g.beginPath(); g.moveTo(x - l/2, y); g.quadraticCurveTo(x, y - 2.5*s, x + l/2, y); g.stroke();
    }
    // 작은 조개 조각·자갈
    for (let k = 0; k < W/(30*s); k++){
      const x = r()*W, y = pad + 4*s + r()*(h - 6*s);
      g.fillStyle = r() < 0.5 ? 'rgba(250,236,230,.95)' : 'rgba(176,164,150,.9)';
      g.beginPath(); g.ellipse(x, y, (1.2 + r()*1.6)*s, (0.8 + r())*s, r()*PI, 0, TAU); g.fill();
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,248,.75)'; g.lineWidth = 1.3*s; g.beginPath();
    for (let x = 0; x <= W; x += 4) x ? g.lineTo(x, edge(x) + 0.6*s) : g.moveTo(x, edge(x) + 0.6*s);
    g.stroke();
  } else if (kind === 'gravel'){
    band();
    g.fillStyle = '#5e574f'; g.fill();
    const cols = [[168,162,154],[140,133,124],[196,184,166],[111,122,128],[181,154,128],[216,210,198],[125,106,92],[154,164,160],[200,170,140]];
    const sp = 6.5*s, rows = Math.ceil((h + 4*s)/(sp*0.75));
    for (let ri = 0; ri <= rows; ri++){
      for (let x = -sp + r()*sp; x < W + sp; x += sp*(0.75 + r()*0.5)){
        const y = edge(x) + 1.5*s + ri*sp*0.72 + (r() - 0.5)*2*s;
        if (y > H2 + 4*s) continue;
        const rx = (2.8 + r()*2.6)*s, ry = rx*(0.62 + r()*0.25), a = (r() - 0.5)*0.8, col = cols[(r()*cols.length) | 0];
        g.fillStyle = hex(col[0]*0.55, col[1]*0.55, col[2]*0.55); g.beginPath(); g.ellipse(x, y + 0.5*s, rx, ry, a, 0, TAU); g.fill();
        g.fillStyle = hex(...col); g.beginPath(); g.ellipse(x - 0.2*s, y - 0.25*s, rx*0.92, ry*0.86, a, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,.32)'; g.beginPath(); g.ellipse(x - rx*0.35, y - ry*0.4, rx*0.35, ry*0.22, a - 0.2, 0, TAU); g.fill();
      }
    }
    const sh = g.createLinearGradient(0, pad, 0, H2);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(10,14,18,.3)');
    g.fillStyle = sh; g.fillRect(0, 0, W, H2);
  } else {
    band();
    const gr = g.createLinearGradient(0, top, 0, H2);
    gr.addColorStop(0, '#5e4434'); gr.addColorStop(0.4, '#43301f'); gr.addColorStop(1, '#2c1f15');
    g.fillStyle = gr; g.fill();
    const sp = 3.6*s, rows = Math.ceil((h + 2*s)/(sp*0.8));
    for (let ri = 0; ri <= rows; ri++){
      for (let x = r()*sp; x < W + sp; x += sp*(0.8 + r()*0.45)){
        const y = edge(x) + 0.8*s + ri*sp*0.78 + (r() - 0.5)*1.4*s;
        if (y > H2 + 2*s) continue;
        const rr = (1.3 + r()*1.1)*s, v = 0.75 + r()*0.5;
        g.fillStyle = hex(62*v, 44*v, 30*v); g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
        if (r() < 0.75){ g.fillStyle = 'rgba(255,230,200,.16)'; g.beginPath(); g.arc(x - rr*0.35, y - rr*0.4, rr*0.4, 0, TAU); g.fill(); }
      }
    }
    for (let k = 0; k < W*h/(220*s*s); k++){
      const x = r()*W, y = pad + r()*h;
      g.fillStyle = r() < 0.6 ? 'rgba(236,228,210,.75)' : 'rgba(170,120,70,.7)';
      g.beginPath(); g.arc(x, y, (0.5 + r()*0.7)*s, 0, TAU); g.fill();
    }
    const sh = g.createLinearGradient(0, pad, 0, H2);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(8,4,2,.35)');
    g.fillStyle = sh; g.fillRect(0, 0, W, H2);
  }
  return cv;
}
export function drawFloor(ctx, kind, o){
  if (!FLOOR_KINDS[kind] || !o || !ctx) return;
  const W = Math.round(+o.W || 0), H = +o.H || 0, h = +o.h || 0, seed = o.seed | 0;
  if (W < 2 || h < 2) return;
  // 크기가 조금씩 변해도 다시 그리지 않도록 높이·배율을 묶어서 캐시 (위쪽을 잘라 씀)
  const s = Math.max(0.25, Math.round((+o.s > 0 ? +o.s : 1)*16)/16), hb = Math.ceil(h/32)*32;
  const dev = devScale(ctx), pad = Math.ceil(9*s);
  const key = kind + '|' + W + '|' + hb + '|' + s + '|' + seed + '|' + dev;
  let cv = FLOORS.get(key);
  if (!cv){
    if (FLOORS.size > 8) FLOORS.delete(FLOORS.keys().next().value);
    try { cv = renderFloor(kind, W, hb, s, seed, dev, pad); } catch (err) { if (globalThis.__crittersDebug) throw err; return; }
    FLOORS.set(key, cv);
  } else { FLOORS.delete(key); FLOORS.set(key, cv); }
  const sh = Math.min(cv.height, (h + pad)*dev);
  ctx.drawImage(cv, 0, 0, cv.width, sh, 0, H - h - pad, W, sh/dev);
}

/* ================= 상점 아이콘 ================= */
// 생물 아이콘: 자세와 L 기준 범위 (단위 100 = L)
const THUMB_C = {
  turtle: {mode: 'swim', x0: -52, x1: 54, y0: -32, y1: 28},
  frog: {mode: 'rest', x0: -46, x1: 50, y0: -26, y1: 32},
  axolotl: {mode: 'rest', x0: -52, x1: 52, y0: -30, y1: 22},
  shrimp: {mode: 'rest', x0: -52, x1: 70, y0: -52, y1: 24},
};
export function drawThumb(ctx, kind, w, h){
  if (!ctx || typeof kind !== 'string' || !(w > 0) || !(h > 0)) return;
  ctx.save();
  try {
    if (kind.startsWith('floor:')){
      const fk = kind.slice(6);
      if (!FLOOR_KINDS[fk]) return;
      const r = Math.min(w, h)*0.2;
      ctx.beginPath(); ctx.moveTo(r, 0); ctx.arcTo(w, 0, w, h, r); ctx.arcTo(w, h, 0, h, r); ctx.arcTo(0, h, 0, 0, r); ctx.arcTo(0, 0, w, 0, r); ctx.closePath(); ctx.clip();
      drawFloor(ctx, fk, {W: w, H: h, h: h*0.62, s: Math.max(0.6, Math.min(w, h)/64), seed: 7});
    } else if (CRITTERS[kind]){
      const b = THUMB_C[kind], L = Math.min(w*0.9/((b.x1 - b.x0)/100), h*0.9/((b.y1 - b.y0)/100));
      drawCritter(ctx, kind, {x: w/2 - (b.x0 + b.x1)/200*L, y: h/2 - (b.y0 + b.y1)/200*L, L, face: 1, rot: 0, t: 0, phase: 0.6, effort: 0.4,
        mode: b.mode, sleepy: 0, mouth: 0, blush: 0.7, variant: 0});
    } else if (DECOR[kind]){
      const z = SIZES[kind], f = kind === 'marimo' ? 0.66 : 0.88, s = Math.min(w*f/z.w, h*f/z.h);
      drawDecor(ctx, kind, {x: w/2, y: h/2 + z.h*s/2, s, t: 0, up: UP, wet: WET_ALL, flow: 0, seed: 3});
    }
  } catch (err) {
    if (globalThis.__crittersDebug) throw err;
  } finally {
    ctx.restore();
  }
}
